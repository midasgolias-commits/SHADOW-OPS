import { BodyKit, rayBody } from './BotBody.js';
import { Bot } from './Bot.js';
import { DIFFS, AGENT_COLOR, TEAM_COLOR, NOISE, pickWeapon } from './BotConfig.js';

const TAU = Math.PI * 2;
const wrap = a => a - Math.round(a / TAU) * TAU;
const rnd = (a, b) => a + Math.random() * (b - a);

/** O jogador visto como "alvo" pelos bots (mesma interface dos bots). */
class PlayerActor {
  constructor(mgr, player, me) {
    this.mgr = mgr; this.p = player; this.isPlayer = true; this.id = 'player'; this.name = me?.name || 'Jogador';
    this.team = me?.team || 'ffa'; this.slot = me?.slot ?? 0;
  }
  get pos() { return this.p.pos; }
  get alive() { return this.p.health > 0 && !this.p.dead; }
  get height() { return this.p.height; }
  get speed() { return this.p.speed; }
  rayTest(o, d, max) {
    const p = this.p.pos, h = this.p.height, r = .35, mn = [p.x - r, p.y, p.z - r], mx = [p.x + r, p.y + h, p.z + r];
    const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z]; let t0 = 0, t1 = max;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(D[a]) < 1e-9) { if (O[a] < mn[a] || O[a] > mx[a]) return null; continue; }
      let ta = (mn[a] - O[a]) / D[a], tb = (mx[a] - O[a]) / D[a]; if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return null;
    }
    const y = o.y + d.y * t0 - p.y;
    return { dist: t0, zone: y > h - .3 ? 'head' : y < h * .45 ? 'limb' : 'body' };
  }
  receiveHit(n, src) { return this.mgr.hurtPlayer(n, src); }
}

/**
 * Cria e atualiza os bots de uma partida. Também registra o alvo na arma do jogador (addHitTester).
 * opts: { scene, world, nav, map, player, weapons, audio, camera, hooks, cfg, onPlayerDeath, respawnDelay }
 *  - cfg: o objeto da sala ({ mode, diff, me, players[] }).
 *  - respawnDelay: segundos para bots reaparecerem (null = não reaparecem; o competitivo controla isso por rodada).
 */
export class BotManager {
  constructor(o) {
    Object.assign(this, { scene: o.scene, world: o.world, nav: o.nav, map: o.map, player: o.player, weapons: o.weapons,
      audio: o.audio, camera: o.camera, hooks: o.hooks || {}, cfg: o.cfg, cb: { onPlayerDeath: o.onPlayerDeath }, assets: o.assets || null });
    this.mode = o.cfg.mode; this.fx = o.weapons?.fx; this.kit = new BodyKit(); this.t = 0; this.budget = 0;
    this.respawnDelay = o.respawnDelay !== undefined ? o.respawnDelay : (this.mode === 'deathmatch' ? 3 : null);
    this.diff = DIFFS[o.cfg.diff] || DIFFS.normal;
    this.sites = Object.fromEntries(o.map.sites.map(s => [s.id, s]));
    this.me = new PlayerActor(this, o.player, o.cfg.me);
    this.bots = []; this.scores = { player: { name: this.me.name, team: this.me.team, kills: 0, deaths: 0 } };

    for (const p of o.cfg.players || []) {
      if (!p.bot) continue;
      const color = this.mode === 'competitive' ? TEAM_COLOR[p.team] : (AGENT_COLOR[p.agent] ?? 0x888888);
      const b = new Bot(this, { id: `${p.team}${p.slot}`, name: p.name, team: p.team, slot: p.slot, agent: p.agent }, this.diff, pickWeapon(this.mode), color);
      this.bots.push(b); this.scores[b.id] = { name: b.name, team: b.team, kills: 0, deaths: 0 };
    }
    this.actors = [this.me, ...this.bots];
    for (const b of this.bots) b.enemies = this.actors.filter(a => this.isEnemy(b, a));
    this._plan();
    this.weapons?.addHitTester((org, dir, max) => this._playerShot(org, dir, max));
  }

  isEnemy(a, b) { return a !== b && (a.team === 'ffa' || a.team !== b.team); }

  /* ---------- plano do competitivo ---------- */
  _plan() {
    if (this.mode !== 'competitive') return;
    const main = Math.random() < .5 ? 'A' : 'B', other = main === 'A' ? 'B' : 'A';
    this.plan = { att: main };
    const att = this.bots.filter(b => b.team === 'att'), def = this.bots.filter(b => b.team === 'def');
    att.forEach((b, i) => { b.site = i < 3 ? main : other; });
    def.forEach(b => { b.site = b.slot <= 1 ? 'A' : b.slot <= 3 ? 'B' : (Math.random() < .5 ? 'A' : 'B'); });
  }
  goalFor(bot) {
    const nav = this.nav;
    if (this.mode === 'competitive' && bot.site) {
      const s = this.sites[bot.site], pad = bot.team === 'att' ? -1 : 5;
      for (let i = 0; i < 12; i++) {
        const x = s.x + rnd(-1, 1) * (s.w / 2 + pad), z = s.z + rnd(-1, 1) * (s.d / 2 + pad);
        if (nav.walkable(x, z) && nav.isReachable(x, z)) return { x, z };
      }
    }
    for (let i = 0; i < 10; i++) { const p = nav.randomPoint(); if (p && Math.hypot(p.x - bot.pos.x, p.z - bot.pos.z) > 12) return p; }
    return nav.randomPoint();
  }
  holdTime() { return this.mode === 'competitive' ? rnd(2.5, 6) : rnd(.2, 1.2); }
  lookBase(bot) { return this.mode === 'competitive' ? (bot.team === 'att' ? -Math.PI / 2 : Math.PI / 2) : rnd(-Math.PI, Math.PI); }
  lookSweep() { return this.mode === 'competitive' ? 1 : 0.3; }

  /* ---------- nascer ---------- */
  spawnPointFor(a) {
    const sp = this.map.spawns;
    if (this.mode === 'competitive' && (a.team === 'att' || a.team === 'def')) {
      const list = a.team === 'att' ? sp.attackers : sp.defenders; return list[a.slot % list.length];
    }
    const foes = this.actors.filter(x => x !== a && x.alive), ranked = sp.dm.map(p => ({
      p, s: (foes.length ? Math.min(...foes.map(f => Math.hypot(f.pos.x - p.x, f.pos.z - p.z))) : 50) + Math.random() * 8
    })).sort((x, y) => y.s - x.s);
    const c = ranked[Math.floor(Math.random() * Math.min(3, ranked.length))].p;
    return { x: c.x, z: c.z, yaw: Math.random() * TAU - Math.PI };
  }
  spawnAll() { for (const b of this.bots) { const p = this.spawnPointFor(b); b.spawn(p, p.yaw); } }
  respawn(b) { const p = this.spawnPointFor(b); b.spawn(p, p.yaw); }

  /* ---------- ciclo ---------- */
  update(dt) {
    dt = Math.min(dt, 1 / 30); this.t += dt; this.budget = 2;
    for (const b of this.bots) {
      if (!b.alive && this.respawnDelay != null && this.t >= b.respawnAt) { this.respawn(b); continue; }
      b.update(dt);
    }
  }

  /* ---------- sons e ruído ---------- */
  _audio(pos, name, gain) {
    if (!this.audio) return;
    const dx = pos.x - this.camera.position.x, dz = pos.z - this.camera.position.z, dist = Math.hypot(dx, dz);
    const yaw = this.player.yaw, pan = dist > .1 ? Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist)) * .8 : 0;
    this.audio.play(name, { gain, pan, dist });
  }
  stepSound(b) { if (Math.hypot(b.pos.x - this.player.pos.x, b.pos.z - this.player.pos.z) < 28) this._audio(b.pos, 'step', .5); }
  botFired(b) { this._audio(b.pos, b.w.id, .9); this.noise(b.pos, NOISE[b.w.id] || 40, b); }
  /** Tiro do jogador: acorda bots inimigos por perto. */
  playerShot(w) { this.noise(this.player.pos, NOISE[w.id] || 40, this.me); }
  noise(pos, radius, src) {
    for (const b of this.bots) {
      if (!b.alive || !this.isEnemy(src, b) || b === src) continue;
      if (Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) < radius) b.hear(pos);
    }
  }

  /* ---------- tiros ---------- */
  botShot(bot, o, d, w, idx) {
    const wh = this.world.raycast(o, d, w.range); let bd = wh ? wh.dist : Math.min(w.range, 90), hit = null;
    for (const e of bot.enemies) {
      if (!e.alive) continue;
      const r = e.isPlayer ? e.rayTest(o, d, bd) : rayBody(e.pos, e.yaw, o, d, bd);
      if (r && r.dist < bd) { bd = r.dist; hit = { e, r }; }
    }
    const end = { x: o.x + d.x * bd, y: o.y + d.y * bd, z: o.z + d.z * bd };
    if (hit) {
      const z = hit.r.zone, mul = z === 'head' ? w.head : z === 'limb' ? w.limb : 1;
      const dmg = Math.max(1, Math.round(w.dmg * mul * Math.pow(w.falloff, bd / 20) * bot.diff.dmgMul));
      hit.e.receiveHit(dmg, { from: bot, zone: z, weapon: w.id, dist: bd });
      if (!hit.e.isPlayer) this.fx?.impact(end, null, 'flesh', d);
    } else if (wh) this.fx?.impact(wh.point, wh.normal, wh.tag, d);
    if (idx < 2 && this.fx && Math.hypot(bot.pos.x - this.player.pos.x, bot.pos.z - this.player.pos.z) < 70) {
      const m = bot.held?.cur && bot.held.holder.visible ? bot.held.muzzleWorld : null;   // rastro sai do cano da arma do bot (só visual)
      this.fx.tracer(m || { x: o.x + d.x * .6, y: o.y - .1 + d.y * .6, z: o.z + d.z * .6 }, end);
    }
  }

  /** Arma do jogador: devolve o bot inimigo mais próximo no raio, com zona e callback de dano. */
  _playerShot(o, d, max) {
    let best = null, bd = max;
    for (const b of this.bots) {
      if (!b.alive || !this.isEnemy(this.me, b)) continue;
      const r = rayBody(b.pos, b.yaw, o, d, bd);
      if (r && r.dist < bd) { bd = r.dist; best = { b, r }; }
    }
    if (!best) return null;
    return { dist: best.r.dist, zone: best.r.zone, who: best.b,   // who: quem é (a faca só acerta cada um uma vez por golpe)
      damage: (n, info) => best.b.takeDamage(n, { from: this.me, zone: info.zone, weapon: info.weapon, dist: info.dist }) };
  }

  /* ---------- dano e mortes ---------- */
  hurtPlayer(n, src) {
    const p = this.player; if (!this.me.alive) return { kill: false };
    p.health = Math.max(0, p.health - n);
    const bearing = wrap(Math.atan2(-(src.from.pos.x - p.pos.x), -(src.from.pos.z - p.pos.z)) - p.yaw);
    this.hooks.onDamage?.({ damage: n, angle: -bearing, from: src.from.name, health: p.health });
    if (p.health > 0) return { kill: false };
    this._score(src.from.id, 'kills'); this._score('player', 'deaths');
    this.hooks.onKill?.({ killer: src.from.name, victim: this.me.name, killerTeam: src.from.team, victimTeam: this.me.team,
      weapon: src.weapon, head: src.zone === 'head', killerIsMe: false, victimIsMe: true });
    this.cb.onPlayerDeath?.(src);
    return { kill: true };
  }
  botKilled(b, src) {
    b.respawnAt = this.t + (this.respawnDelay ?? 1e9);
    const k = src.from; if (k) this._score(k.id, 'kills'); this._score(b.id, 'deaths');
    this.hooks.onKill?.({ killer: k?.name || '?', victim: b.name, killerTeam: k?.team, victimTeam: b.team, weapon: src.weapon,
      head: src.zone === 'head', killerIsMe: !!k?.isPlayer, victimIsMe: false });
  }
  _score(id, field) { const s = this.scores[id]; if (s) s[field]++; }

  dispose() {
    for (const b of this.bots) b.dispose();
    this.kit.dispose(); this.bots.length = 0; this.actors.length = 0;
  }
}
