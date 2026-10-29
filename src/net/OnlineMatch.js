import * as THREE from 'three';
import { CharacterAnimator } from '../player/CharacterAnimator.js';
import { HeldWeapon } from '../weapons/WeaponModels.js';
import { rayBody } from '../bots/BotBody.js';
import { WEAPONS } from '../weapons/Weapons.js';

/**
 * Partida ONLINE (mata-mata entre amigos, sem bots): cada navegador roda o próprio jogo e controla o próprio personagem.
 *  - 20x por segundo cada um manda o seu estado (posição, olhar, animação, arma) — os outros desenham o personagem dele (RemotePlayer).
 *  - Tiro: quem atira testa o acerto na própria tela (como no Point Blank entre amigos) e manda "acertei X com N de dano".
 *  - Quem leva o tiro tira a vida, e se morrer avisa todo mundo (feed de abates e placar). Renasce sozinho depois de alguns segundos.
 * O anfitrião só repassa as mensagens (Net.js). Gratuito: nada passa por servidor nosso.
 */
export const ONLINE = { sendHz: 20, smooth: 14, respawn: 3.2 };
const TAU = Math.PI * 2, wrap = a => a - Math.round(a / TAU) * TAU;
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

class RemotePlayer {
  constructor(game, info) {
    this.game = game; this.id = info.id; this.name = info.name || 'Amigo'; this.skin = info.skin === 'bot' ? 'bot' : 'izzy';
    this.pos = new THREE.Vector3(0, -50, 0); this.target = this.pos.clone(); this.yaw = 0; this.tYaw = 0; this.pitch = 0;
    this.s = null; this.alive = false; this.seen = false; this.fireT = 0; this.height = 1.8;
    const { obj, clips } = game.assets.instance(this.skin); obj.scale.setScalar(.01); obj.visible = false;
    this.obj = obj; this.anim = new CharacterAnimator(obj, clips); game.scene.add(obj);
    this.held = new HeldWeapon(obj, game.assets.weapons, this.skin, { flashLight: true }); this.held.attachTo(game.scene);
    this.anim.withPose('fire', () => this.held.calibrate());
    // nome em cima da cabeça
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; const x = cv.getContext('2d');
    x.font = 'bold 30px Bahnschrift, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.85)';
    x.strokeText(this.name, 128, 25); x.fillStyle = '#ffd36b'; x.fillText(this.name, 128, 25);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true })); this.tag.scale.set(1.1, .2, 1); game.scene.add(this.tag); this.tag.visible = false;
  }
  get speed() { return this.s?.sp || 0; }
  /** Estado recebido (20x/s). */
  state(s) {
    const first = !this.seen; this.s = s; this.seen = true;
    this.target.set(s.p[0], s.p[1], s.p[2]); this.tYaw = s.y; this.pitch = s.pi;
    if (first || this.pos.distanceTo(this.target) > 4) { this.pos.copy(this.target); this.yaw = s.y; }   // primeira vez / renasceu: pula direto
    if (!s.dead && !this.alive) this.anim.update(0, { dead: false });
    this.alive = !s.dead;
  }
  update(dt) {
    const s = this.s; if (!s) return;
    const k = 1 - Math.exp(-ONLINE.smooth * dt);
    this.pos.lerp(this.target, k); this.yaw = wrap(this.yaw + wrap(this.tYaw - this.yaw) * k);
    this.fireT = Math.max(0, this.fireT - dt);
    const o = this.obj; o.visible = true; o.position.copy(this.pos); o.rotation.y = this.yaw + Math.PI;
    if (s.dead) { this.anim.update(dt, { dead: true, deadCrouch: !!s.c }); this.held.update(false); this.tag.visible = false; return; }
    if (this.fireT > 0 || s.aim) this.anim.aimHold(!!s.c);
    this.held.set(s.sw ? null : s.w);
    this.anim.update(dt, { speed: s.sp, fwd: s.f, side: s.sd, crouch: !!s.c, air: !!s.a, melee: !!WEAPONS[s.w]?.melee, pistol: s.w === 'pistol', dead: false, pitch: (this.anim.aiming ? s.pi : s.pi * .5) });
    this.held.scene = this.anim.scene; this.held.update(true, null, dt);
    if (!WEAPONS[s.w]?.melee && s.st !== 'reload') this.held.leftHandIK(true, dt);
    this.tag.visible = true; this.tag.position.set(this.pos.x, this.pos.y + (s.c ? 1.55 : 2.05), this.pos.z);
  }
  dispose() { this.anim.dispose(); this.held.dispose(); this.game.scene.remove(this.obj); this.game.scene.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
}

export class OnlineMatch {
  /** cfg = { net, roster: [{id,name,skin}] } */
  constructor(game, cfg) {
    this.game = game; this.net = cfg.net; this.me = this.net.id; this.t = 0; this.sendT = 0;
    this.remotes = new Map(); this.scores = {};
    for (const p of cfg.roster || []) { this.scores[p.id] = { name: p.name, kills: 0, deaths: 0 }; if (p.id !== this.me) this.remotes.set(p.id, new RemotePlayer(game, p)); }
    this.scores[this.me] ??= { name: this.net.name, kills: 0, deaths: 0 };
    this.lastHit = null;
    // tiros do jogador nos outros jogadores (o acerto é decidido na tela de quem atira)
    game.weapons.addHitTester((o, d, max) => {
      let best = null, bd = max;
      for (const r of this.remotes.values()) { if (!r.alive || !r.seen) continue; const h = rayBody(r.pos, r.yaw, o, d, bd); if (h && h.dist < bd) { bd = h.dist; best = { r, h }; } }
      if (!best) return null;
      return { dist: best.h.dist, zone: best.h.zone, who: best.r,
        damage: (n, info) => { this.net.sendGame({ t: 'ev', e: 'hit', to: best.r.id, dmg: n, zone: info.zone, w: info.weapon }); return { kill: false }; } };
    });
    this.off = this.net.on('game', m => this._msg(m));
  }
  get myScore() { const s = this.scores[this.me]; return s ? { kills: s.kills, deaths: s.deaths } : null; }

  /** Ações do jogador local (Game chama): tiro, recarga, golpe — os outros veem a animação e ouvem o som. */
  localAction(type, w, extra) { this.net.sendGame({ t: 'ev', e: type, w: w.id, x: extra || 0 }); }

  /** Onde renascer: o ponto do mapa mais longe dos outros jogadores vivos. */
  spawnPoint() {
    const dm = this.game.mapData.spawns.dm, foes = [...this.remotes.values()].filter(r => r.alive && r.seen);
    const ranked = dm.map(p => ({ p, s: (foes.length ? Math.min(...foes.map(f => Math.hypot(f.pos.x - p.x, f.pos.z - p.z))) : 50) + Math.random() * 6 })).sort((a, b) => b.s - a.s);
    const c = ranked[Math.floor(Math.random() * Math.min(3, ranked.length))].p;
    return { x: c.x, z: c.z, yaw: Math.random() * TAU - Math.PI };
  }

  update(dt) {
    this.t += dt;
    for (const r of this.remotes.values()) r.update(dt);
    // manda o meu estado
    this.sendT -= dt; if (this.sendT > 0) return; this.sendT = 1 / ONLINE.sendHz;
    const g = this.game, p = g.player, w = g.weapons.hud(), r = n => Math.round(n * 100) / 100;
    this.net.sendGame({ t: 'st', s: { p: [r(p.pos.x), r(p.pos.y), r(p.pos.z)], y: r(p.yaw), pi: r(p.pitch), sp: r(p.grounded ? p.speed : Math.min(p.speed, 2)),
      f: r(p.localVel.fwd), sd: r(p.localVel.side), c: p.crouch ? 1 : 0, a: p.grounded ? 0 : 1, w: w.id, sw: w.state === 'switch' && w.pending ? 1 : 0,
      st: w.state, aim: w.aiming ? 1 : 0, dead: p.dead ? 1 : 0, hp: Math.round(p.health) } });
  }

  _msg(m) {
    const r = this.remotes.get(m.from);
    if (m.t === 'st') { r?.state(m.s); return; }
    if (m.t !== 'ev') return;
    const g = this.game;
    switch (m.e) {
      case 'shot': if (r) { r.fireT = .6; r.anim.fire(!!r.s?.c); r.held.muzzleFlash(!!WEAPONS[m.w]?.auto); this._sound(r.pos, m.w, .9); this._tracer(r); } break;
      case 'reload': if (r) { r.anim.reload(m.x || WEAPONS[m.w]?.reload || 2, !!r.s?.c); this._sound(r.pos, 'reload', .5); } break;
      case 'melee': if (r) { r.anim.hit(); this._sound(r.pos, 'knife', .7); } break;
      case 'hit': if (m.to === this.me) this._hurt(m); break;
      case 'nade': g.nades?.spawnRemote(m); break;   // granada de um amigo: só visual aqui (o dano vem de quem jogou)
      case 'death': {
        const v = this.scores[m.victim] ??= { name: m.vName, kills: 0, deaths: 0 }; v.deaths++;
        const k = this.scores[m.killer] ??= { name: m.kName, kills: 0, deaths: 0 }; if (m.killer !== m.victim) k.kills++;
        g.hooks.onKill?.({ killer: m.kName, victim: m.vName, weapon: m.w, head: !!m.head, killerIsMe: m.killer === this.me, victimIsMe: false });
        break;
      }
    }
  }
  /** Levei um tiro de outro jogador. */
  _hurt(m) {
    const g = this.game, p = g.player; if (p.dead || p.health <= 0) return;
    const from = this.remotes.get(m.from), name = from?.name || 'Amigo';
    p.health = Math.max(0, p.health - m.dmg);
    const ang = from ? wrap(Math.atan2(-(from.pos.x - p.pos.x), -(from.pos.z - p.pos.z)) - p.yaw) : 0;
    g.hooks.onDamage?.({ damage: m.dmg, angle: -ang, from: name, health: p.health });
    if (p.health > 0) return;
    const me = this.scores[this.me]; me.deaths++; const k = this.scores[m.from] ??= { name, kills: 0, deaths: 0 }; k.kills++;
    this.net.sendGame({ t: 'ev', e: 'death', victim: this.me, vName: this.net.name, killer: m.from, kName: name, w: m.w, head: m.zone === 'head' });
    g.hooks.onKill?.({ killer: name, victim: this.net.name, weapon: m.w, head: m.zone === 'head', killerIsMe: false, victimIsMe: true });
    g._playerDied({ from: { name }, weapon: m.w, zone: m.zone });
  }
  _sound(pos, name, gain) {
    const g = this.game, cam = g.camera, dx = pos.x - cam.position.x, dz = pos.z - cam.position.z, dist = Math.hypot(dx, dz), yaw = g.player.yaw;
    const pan = dist > .1 ? Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist)) * .8 : 0;
    g.audio.play(g.audio.has?.(name) || name === 'reload' || name === 'knife' ? name : 'rifle', { gain, pan, dist });
  }
  /** Rastro do tiro do outro jogador: do cano dele até onde o olhar dele bate no mapa. */
  _tracer(r) {
    const fx = this.game.weapons?.fx; if (!fx || !r.s) return;
    const m = r.held.cur && r.held.holder.visible ? r.held.muzzleWorld : _v.set(r.pos.x, r.pos.y + 1.4, r.pos.z);
    const yaw = r.s.y, pi = r.s.pi; _d.set(-Math.sin(yaw) * Math.cos(pi), Math.sin(pi), -Math.cos(yaw) * Math.cos(pi));
    const o = { x: r.pos.x, y: r.pos.y + 1.55, z: r.pos.z }, hit = this.game.world.raycast(o, _d, 120), L = hit ? hit.dist : 60;
    fx.tracer({ x: m.x, y: m.y, z: m.z }, { x: o.x + _d.x * L, y: o.y + _d.y * L, z: o.z + _d.z * L });
  }
  dispose() { this.off?.(); for (const r of this.remotes.values()) r.dispose(); this.remotes.clear(); }
}
