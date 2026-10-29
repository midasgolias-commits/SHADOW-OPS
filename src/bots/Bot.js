import * as THREE from 'three';
import { WEAPONS } from '../weapons/Weapons.js';
import { buildBody, rayBody, EYE } from './BotBody.js';
import { IDEAL } from './BotConfig.js';
import { CharacterAnimator } from '../player/CharacterAnimator.js';
import { HeldWeapon } from '../weapons/WeaponModels.js';

const R = .35, H = 1.8, TAU = Math.PI * 2;
const wrap = a => a - Math.round(a / TAU) * TAU;
const rnd = (a, b) => a + Math.random() * (b - a);
const tri = () => Math.random() + Math.random() - 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, t, s) => v < t ? Math.min(v + s, t) : Math.max(v - s, t);
const fwd = (yaw, pitch) => ({ x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });

/**
 * Bot: corpo + cérebro. Estados: roam (vai a um objetivo), search (vai ao último ponto suspeito),
 * combat (vê um inimigo), dead. Tudo o que depende do mundo passa pelo BotManager (mgr).
 */
export class Bot {
  constructor(mgr, info, diff, wid, color) {
    this.mgr = mgr; this.id = info.id; this.name = info.name; this.team = info.team; this.slot = info.slot; this.agent = info.agent;
    this.isPlayer = false; this.diff = diff; this.wid = wid; this.w = WEAPONS[wid]; this.ideal = IDEAL[wid] ?? 20;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.height = H;
    if (mgr.assets?.ready) {   // modelo 3D do bot (Mixamo) com as mesmas animações do jogador
      const { obj, clips } = mgr.assets.instance('bot'); obj.scale.setScalar(.01);
      this.body = { group: obj, model: true }; this.anim = new CharacterAnimator(obj, clips);
      this.held = new HeldWeapon(obj, mgr.assets.weapons, 'bot'); this.held.attachTo(mgr.scene); this.held.set(wid);
      this.anim.withPose('fire', () => this.held.calibrate());
    } else this.body = buildBody(mgr.kit, color);   // sem modelos (testes em Node): boneco de caixas
    mgr.scene.add(this.body.group); this.body.group.visible = false;
    this.alive = false; this.enemies = []; this.site = null; this.respawnAt = 0; this.t = 0; this.eye = { x: 0, y: 0, z: 0 };
  }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }

  spawn(p, yaw) {
    this.pos.set(p.x, 0, p.z); this.vel.set(0, 0, 0);
    this.yaw = yaw ?? rnd(-Math.PI, Math.PI); this.pitch = 0; this.wantYaw = this.yaw; this.wantPitch = 0;
    this.hp = 100; this.alive = true; this.deadT = 0; this.mag = this.w.mag; this.reloadT = 0; this.cool = rnd(0, .3);
    this.burstLeft = 0; this.burstPause = 0; this.burstN = 0; this.aimHead = false;
    this.state = 'roam'; this.path = null; this.pi = 0; this.idleT = rnd(.3, 1.2);
    this.target = null; this.seen = false; this.lastSeen = -9; this.last = null; this.trackT = 0; this.react = 0; this.seenT = 0;
    this.strafeDir = 1; this.strafeT = 0; this.doStrafe = true; this.repathT = 0; this.searchT = 0; this.arrivedT = -1;
    this.stuckT = 0; this.stuckN = 0; this.stuckPos = { x: p.x, z: p.z }; this.stepD = 0; this.phase = 0; this.aimK = 0;
    this.lookYaw = this.yaw; this.lookT = 0; this.pTimer = rnd(0, .15); this.wishX = 0; this.wishZ = 0; this.speedScale = .85;
    const g = this.body.group; g.visible = true; g.rotation.x = 0; g.position.copy(this.pos); g.rotation.y = this.yaw + (this.body.model ? Math.PI : 0);
  }

  /* ---------- dano ---------- */
  takeDamage(n, src) {
    if (!this.alive) return { kill: false };
    this.hp -= n;
    if (src.from && src.from.alive !== false && src.from !== this) this._alert(src.from.pos);
    if (this.hp <= 0) { this.die(src); return { kill: true }; }
    return { kill: false };
  }
  receiveHit(n, src) { return this.takeDamage(n, src); }
  die(src) { this.alive = false; this.hp = 0; this.deadT = 0; this.path = null; this.target = null; this.mgr.botKilled(this, src); }
  _alert(p) {
    this.last = { x: p.x + rnd(-1.5, 1.5), z: p.z + rnd(-1.5, 1.5) };
    if (this.state !== 'combat') { this._enter('search'); this.wantYaw = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z)); }
  }
  hear(p) { if (this.state !== 'combat' && this.alive && Math.random() < this.diff.hear) this._alert(p); }
  _enter(s) { this.state = s; this.path = null; this.searchT = 0; this.arrivedT = -1; this.repathT = 0; }

  /* ---------- ciclo ---------- */
  update(dt) {
    this.t += dt;
    if (!this.alive) { this._deadAnim(dt); return; }
    this._perceive(dt);
    this.wishX = this.wishZ = 0;
    if (this.seen) this.trackT += dt;
    if (this.state === 'combat') this._combat(dt); else if (this.state === 'search') this._search(dt); else this._roam(dt);
    this._stuck(dt);
    this._move(dt);
    this._weapon(dt);
    this._animate(dt);
  }

  _eye() { this.eye.x = this.pos.x; this.eye.y = this.pos.y + EYE; this.eye.z = this.pos.z; return this.eye; }

  _perceive(dt) {
    this.pTimer -= dt;   // percepção a cada ~0,1 s (raios custam caro)
    if (this.pTimer > 0) return;
    this.pTimer = rnd(.08, .16);
    const eye = this._eye(), d = this.diff, half = d.fov * Math.PI / 360;
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
      if (dist > d.vision || dist >= bd) continue;
      if (dist > 5 && this.target !== e && Math.abs(wrap(Math.atan2(-dx, -dz) - this.yaw)) > half) continue;
      const w = this.mgr.world, h = e.height;
      if (w.hasLOS(eye, { x: e.pos.x, y: e.pos.y + h * .65, z: e.pos.z }) || w.hasLOS(eye, { x: e.pos.x, y: e.pos.y + h - .12, z: e.pos.z })) { best = e; bd = dist; }
    }
    if (best) {
      const fresh = !this.seen && this.t - this.lastSeen > 1.5;          // contato novo: precisa de tempo de reação
      if (fresh) { this.seenT = this.t; this.react = rnd(d.react[0], d.react[1]); this.trackT = 0; }
      if (this.target !== best) { if (!fresh) this.trackT = 0; this.target = best; this.aimHead = Math.random() < d.hs; }
      this.seen = true; this.lastSeen = this.t; this.last = { x: best.pos.x, z: best.pos.z };
      if (this.state !== 'combat') this._enter('combat');
    } else this.seen = false;
  }

  /* ---------- comportamentos ---------- */
  _roam(dt) {
    if (this.idleT > 0) { this.idleT -= dt; this._lookAround(dt); return; }
    if (!this.path && !this._plan(this.mgr.goalFor(this))) { this.idleT = .4; return; }
    if (!this._follow()) { this.path = null; this.idleT = this.mgr.holdTime(this); }
  }

  _search(dt) {
    this.searchT += dt;
    if (!this.last || this.searchT > 8) { this._enter('roam'); this.idleT = 0; return; }
    if (this.arrivedT < 0) {
      if (!this.path && !this._plan(this.last)) { this._enter('roam'); return; }
      this.speedScale = .9;
      if (!this._follow()) { this.arrivedT = this.searchT; this.path = null; }
    } else {
      this._lookAround(dt, 3.1);
      if (this.searchT - this.arrivedT > 1.6) { this._enter('roam'); this.idleT = 0; }
    }
  }

  _combat(dt) {
    const e = this.target;
    if (!e || !e.alive) { this.target = null; this._enter('roam'); this.idleT = .3; return; }
    if (!this.seen && this.t - this.lastSeen > .8) { this._enter('search'); return; }
    const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, dist = Math.max(.01, Math.hypot(dx, dz)), ux = dx / dist, uz = dz / dist;
    const ay = e.pos.y + (this.aimHead ? e.height - .12 : e.height * .62);
    this.wantYaw = Math.atan2(-dx, -dz); this.wantPitch = Math.atan2(ay - (this.pos.y + EYE), dist);

    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = rnd(.5, 1.4); this.strafeDir = Math.random() < .5 ? 1 : -1; this.doStrafe = Math.random() < this.diff.strafe; }
    const still = this.wid === 'sniper' && dist > 14;
    if (!still && dist > this.ideal * 1.6) {            // longe demais: aproxima
      this.repathT -= dt;
      if (this.repathT <= 0 && this.mgr.budget > 0) { this.mgr.budget--; this.path = this.mgr.nav.findPath(this.pos, e.pos); this.pi = 0; this.repathT = .9; }
      this.speedScale = 1;
      if (!this.path || !this._follow()) { this.wishX = ux; this.wishZ = uz; }   // sem caminho: vai direto
    } else if (dist < this.ideal * .45) {                // perto demais: recua
      this.path = null; this.speedScale = .8; this.wishX = -ux; this.wishZ = -uz;
    } else if (!still && this.doStrafe) {                // distância boa: gingado
      this.path = null; this.speedScale = .55; this.wishX = -uz * this.strafeDir; this.wishZ = ux * this.strafeDir;
    } else this.path = null;
  }

  _lookAround(dt, sweep = null) {
    this.lookT -= dt;
    if (this.lookT <= 0) { this.lookT = rnd(1, 2.5); this.lookYaw = this.mgr.lookBase(this) + rnd(-1, 1) * (sweep ?? this.mgr.lookSweep(this)); }
    this.wantYaw = this.lookYaw; this.wantPitch = 0;
  }

  /** Calcula caminho até g ({x,z}). Respeita o orçamento de A* por quadro. */
  _plan(g) {
    if (!g || this.mgr.budget <= 0) return false;
    this.mgr.budget--; this.path = this.mgr.nav.findPath(this.pos, g); this.pi = 0; this.speedScale = .85;
    return !!this.path;
  }
  _follow() {
    const p = this.path; if (!p) return false;
    while (this.pi < p.length) {
      const w = p[this.pi], dx = w.x - this.pos.x, dz = w.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < .55) { this.pi++; continue; }
      this.wishX = dx / d; this.wishZ = dz / d;
      if (this.state !== 'combat') { this.wantYaw = Math.atan2(-dx, -dz); this.wantPitch = 0; }
      return true;
    }
    return false;
  }

  _stuck(dt) {
    this.stuckT += dt; if (this.stuckT < .6) return; this.stuckT = 0;
    const moved = Math.hypot(this.pos.x - this.stuckPos.x, this.pos.z - this.stuckPos.z);
    this.stuckPos.x = this.pos.x; this.stuckPos.z = this.pos.z;
    if ((this.wishX || this.wishZ) && moved < .12) this.stuckN++; else this.stuckN = 0;
    if (this.stuckN >= 3) { this.stuckN = 0; this.path = null; this.strafeDir *= -1; if (this.state === 'roam') this.idleT = .1; }
  }

  /* ---------- física ---------- */
  _move(dt) {
    const sp = this.diff.speed * this.speedScale; let wx = this.wishX * sp, wz = this.wishZ * sp;
    for (const o of this.mgr.actors) {                     // separação: não ficar dentro dos outros
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < .81 && d2 > 1e-4) { const d = Math.sqrt(d2), k = (.9 - d) * 4; wx += dx / d * k; wz += dz / d * k; }
    }
    const a = (this.grounded ? 50 : 10) * dt;
    this.vel.x = approach(this.vel.x, wx, a); this.vel.z = approach(this.vel.z, wz, a);
    this.vel.y = Math.max(this.vel.y - 22 * dt, -30);
    this.grounded = this.mgr.world.move(this.pos, this.vel, dt, R, H);

    const dy = wrap(this.wantYaw - this.yaw), rate = this.state === 'combat' ? this.diff.turn : this.diff.turn * .55;
    this.yaw = wrap(this.yaw + clamp(dy * (1 - Math.exp(-12 * dt)), -rate * dt, rate * dt));
    this.pitch += (this.wantPitch - this.pitch) * (1 - Math.exp(-10 * dt));

    this.stepD += this.speed * dt;
    if (this.stepD > 2.1) { this.stepD = 0; if (this.speed > 1.5) this.mgr.stepSound(this); }
  }

  /* ---------- arma ---------- */
  _weapon(dt) {
    const w = this.w;
    if (this.cool > 0) this.cool -= dt;
    if (this.burstPause > 0) this.burstPause -= dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.mag = w.mag; return; }
    if (this.mag <= 0) { this._reload(); return; }
    if (this.state !== 'combat') { if (this.mag < w.mag * .5) this._reload(); return; }
    const e = this.target;
    if (!e || !e.alive || !this.seen || this.t - this.seenT < this.react || this.cool > 0 || this.burstPause > 0) return;
    if (Math.abs(wrap(this.wantYaw - this.yaw)) > .09) return;     // ainda não está apontando
    if (this.burstLeft <= 0) this.burstLeft = w.auto ? Math.round(rnd(this.diff.burst[0], this.diff.burst[1])) : (Math.random() < .3 ? 2 : 1);
    this._fire();
  }
  _reload() { const w = this.w; this.reloadT = w.shell ? w.reload * (w.mag - this.mag) : w.reload; this.burstLeft = 0; this.anim?.reload(this.reloadT, false); }

  _fire() {
    const w = this.w, d = this.diff, still = this.speed < .8;
    this.mag--; this.burstLeft--; this.burstN++;
    this.cool = 60 / w.rpm * (w.auto ? 1 : 1.25) + (w.auto ? 0 : rnd(0, .12));
    if (this.burstLeft <= 0) { this.burstPause = rnd(d.pause[0], d.pause[1]) * (this.wid === 'sniper' ? 3 : 1); this.burstN = 0; this.aimHead = Math.random() < d.hs; }

    let cone = still && w.zoomSpread !== undefined ? w.zoomSpread : w.spread;
    cone += (w.botMoveSpread ?? w.moveSpread) * Math.min(this.speed / 5.2, 1.5) * .6 + w.burstSpread * this.burstN;
    const err = d.err * (1 + this.speed * .15) + .1 * Math.exp(-this.trackT / d.aimTau);   // erro maior logo ao ver o alvo
    const ey = tri() * err, ep = tri() * err, eye = this._eye();
    this.mgr.botFired(this); this.anim?.fire(false); this.held?.muzzleFlash(!!w.auto); this.held?.shotKick();
    for (let i = 0; i < w.pellets; i++) {
      const dir = fwd(this.yaw + ey + tri() * cone, this.pitch + ep + tri() * cone), l = Math.hypot(dir.x, dir.y, dir.z);
      dir.x /= l; dir.y /= l; dir.z /= l;
      this.mgr.botShot(this, eye, dir, w, i);
    }
  }

  /* ---------- visual ---------- */
  _animate(dt) {
    const b = this.body, sp = this.speed;
    if (b.model) {   // modelo animado: velocidade no referencial do corpo escolhe a animação (8 direções)
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      // em combate segura a pose de mira e gira o corpo até o cano apontar para o alvo (igual ao jogador)
      if (this.state === 'combat' && this.seen && this.reloadT <= 0) this.anim.aimHold(false);
      this.aimFix ??= { yaw: 0, pitch: 0 };
      const fix = this.aimFix, aimPose = this.anim.aiming;
      if (aimPose) {
        const e = this.held.aimError(this.yaw, this.pitch);
        const dz = v => Math.abs(v) < .035 ? 0 : v - Math.sign(v) * .035;
        if (e) { e.yaw = dz(e.yaw); e.pitch = dz(e.pitch); const k = Math.min(1, dt * 10); fix.yaw = Math.max(-1.3, Math.min(1.3, fix.yaw + Math.max(-.6, Math.min(.6, e.yaw)) * k)); fix.pitch = Math.max(-.8, Math.min(.8, fix.pitch + Math.max(-.5, Math.min(.5, e.pitch)) * k * .7)); }
      } else { const k = Math.exp(-dt * 5); fix.yaw *= k; fix.pitch *= k; }
      b.group.position.copy(this.pos); b.group.rotation.y = this.yaw + Math.PI + fix.yaw;
      this.anim.update(dt, { speed: sp, fwd: -sy * this.vel.x - cy * this.vel.z, side: cy * this.vel.x - sy * this.vel.z,
        crouch: false, air: !this.grounded, melee: false, pistol: this.wid === 'pistol', dead: false, pitch: aimPose ? fix.pitch : 0 });
      this.held.scene = this.anim.scene; this.held.update(true, null, dt); this.held.leftHandIK(this.reloadT <= 0, dt); return;
    }
    this.phase += sp * dt * 2.3; const sw = Math.sin(this.phase) * Math.min(sp / 4, 1) * .8;
    b.legL.rotation.x = sw; b.legR.rotation.x = -sw;
    this.aimK += ((this.state === 'combat' ? 1 : .35) - this.aimK) * Math.min(1, dt * 8);
    b.armR.rotation.x = .5 + this.aimK * .95 + this.pitch * this.aimK; b.armL.rotation.x = .45 + this.aimK * .85 + this.pitch * this.aimK;
    b.armL.rotation.z = -.2 * this.aimK;
    const g = b.group; g.position.copy(this.pos); g.rotation.y = this.yaw;
  }
  _deadAnim(dt) {
    this.deadT += dt; const g = this.body.group;
    if (this.body.model) { this.anim.update(dt, { dead: true }); this.held.update(this.deadT < .4); if (this.deadT > 6) g.visible = false; return; }
    const k = Math.min(this.deadT / .45, 1);
    g.rotation.x = k * 1.5; g.position.set(this.pos.x, this.pos.y + .1 * k, this.pos.z);
    if (this.deadT > 6) g.visible = false;
  }
  dispose() { this.anim?.dispose(); this.held?.dispose(); this.mgr.scene.remove(this.body.group); }
}
