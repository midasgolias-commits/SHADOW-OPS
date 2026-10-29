import * as THREE from 'three';
import { CharacterAnimator } from '../player/CharacterAnimator.js';
import { HeldWeapon } from '../weapons/WeaponModels.js';
import { rayBody } from '../bots/BotBody.js';
import { WEAPONS, ORDER } from '../weapons/Weapons.js';

/**
 * TREINO no stand de tiro (mapa assets/maps/shooting_range):
 *  - botão no balcão da baia (o controle): chegue perto e aperte E → menu do treino (bots e armas);
 *  - bot PARADO no fundo do corredor de tiro e bot ANDANDO de um lado para o outro (só para os lados, nunca para a frente);
 *  - os bots têm vida infinita (levam o tiro, mostram o dano, nunca morrem) e não atiram;
 *  - todas as armas pelo menu; munição infinita (WeaponSystem.infiniteAmmo).
 * Ganchos para a tela (main.js): onRangePrompt(bool), onRangeMenu(aberto, estado), onRangeHit({ bot, damage, zone, total }).
 */
export const RANGE_CFG = {
  useDist: 1.7,      // m: distância até o botão para o E funcionar
  walkSpeed: 2.2,    // m/s do bot andando
  turnPause: .35,    // s parado na ponta antes de voltar
  botWeapon: 'rifle' // arma (só visual) na mão dos bots
};
const _v = new THREE.Vector3();

class Dummy {
  constructor(game, id, name, x, z) {
    this.game = game; this.id = id; this.name = name; this.pos = new THREE.Vector3(x, 0, z); this.vel = new THREE.Vector3();
    this.yaw = 0;   // yaw 0 = olhando para -z: de frente para as baias
    this.on = false; this.total = 0; this.hits = 0; this.flash = 0;
    const { obj, clips } = game.assets.instance('bot'); obj.scale.setScalar(.01);
    this.obj = obj; this.anim = new CharacterAnimator(obj, clips);
    this.held = new HeldWeapon(obj, game.assets.weapons, 'bot'); this.held.attachTo(game.scene); this.held.set(RANGE_CFG.botWeapon);
    this.anim.withPose('fire', () => this.held.calibrate());
    obj.visible = false; this.held.holder.visible = false; game.scene.add(obj);
    this.mats = []; obj.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.emissive && !this.mats.includes(m)) this.mats.push(m); });
  }
  setOn(on) { this.on = on; this.obj.visible = on; if (!on) this.held.holder.visible = false; }
  /** Leva um tiro: vida infinita — só conta o dano e pisca. */
  hit(n, zone) { this.total += n; this.hits++; this.flash = .12; return { kill: false }; }
  update(dt) {
    if (!this.on) return;
    const sp = Math.hypot(this.vel.x, this.vel.z), s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.obj.position.copy(this.pos); this.obj.rotation.y = this.yaw + Math.PI;
    this.anim.update(dt, { speed: sp, fwd: -s * this.vel.x - c * this.vel.z, side: c * this.vel.x - s * this.vel.z, crouch: false, air: false,
      melee: false, pistol: false, dead: false, pitch: 0 });
    this.held.scene = this.anim.scene; this.held.update(true, null, dt); this.held.leftHandIK(true, dt);
    // pisca vermelho ao levar tiro
    this.flash = Math.max(0, this.flash - dt); const k = this.flash > 0 ? .5 : 0;
    for (const m of this.mats) m.emissive.setRGB(k, 0, 0);
  }
  dispose() { this.anim.dispose(); this.held.dispose(); this.game.scene.remove(this.obj); for (const m of this.mats) m.emissive.setRGB(0, 0, 0); }
}

/** Bot andando: vai e volta no eixo x (de lado), sempre de frente para as baias. */
class Walker extends Dummy {
  constructor(game, id, name, cfg) { super(game, id, name, 0, cfg.z); this.cfg = cfg; this.dir = 1; this.wait = 0; }
  update(dt) {
    if (!this.on) return;
    const C = this.cfg, V = RANGE_CFG.walkSpeed;
    if (this.wait > 0) { this.wait -= dt; this.vel.x *= Math.exp(-14 * dt); }
    else {
      const target = this.dir * V, edge = this.dir > 0 ? C.x1 - this.pos.x : this.pos.x - C.x0;
      const want = edge < .9 ? target * Math.max(.15, edge / .9) : target;   // desacelera chegando na ponta
      this.vel.x += (want - this.vel.x) * (1 - Math.exp(-8 * dt));
      if (edge <= .05) { this.dir = -this.dir; this.wait = RANGE_CFG.turnPause; }
    }
    this.vel.z = 0; this.pos.x = THREE.MathUtils.clamp(this.pos.x + this.vel.x * dt, C.x0, C.x1); this.pos.z = C.z;   // nunca vem para a frente
    super.update(dt);
  }
}

export class RangeTraining {
  constructor(game) {
    this.game = game; const R = game.mapData.range; this.R = R; this.menuOpen = false; this.near = false;
    this.still = new Dummy(game, 'still', 'BOT PARADO', R.botStill.x, R.botStill.z);
    this.walker = new Walker(game, 'walk', 'BOT ANDANDO', R.botWalk);
    this.walker.pos.x = R.botWalk.x0 + (R.botWalk.x1 - R.botWalk.x0) * .5;
    this.still.setOn(true);   // começa com o bot parado; o andando liga pelo menu (E)
    this.dummies = [this.still, this.walker];
    // tiros do jogador nos bots (vida infinita)
    game.weapons.addHitTester((o, d, max) => {
      let best = null, bd = max;
      for (const b of this.dummies) {
        if (!b.on) continue;
        const r = rayBody(b.pos, b.yaw, o, d, bd);
        if (r && r.dist < bd) { bd = r.dist; best = { b, r }; }
      }
      if (!best) return null;
      return { dist: best.r.dist, zone: best.r.zone, who: best.b,
        damage: (n, info) => { const res = best.b.hit(n, info.zone); game.hooks.onRangeHit?.({ bot: best.b.name, damage: n, zone: info.zone, total: best.b.total, hits: best.b.hits }); return res; } };
    });
    this._marker();
    this._kd = e => {
      if (e.code !== 'KeyE' || e.repeat || this.menuOpen || !game.running || game.paused || !document.pointerLockElement) return;
      if (this.near) { e.stopPropagation(); this.openMenu(); }   // (sem isso o mesmo E chegava na tela e fechava o menu na hora)
    };
    document.addEventListener('keydown', this._kd);
  }

  /** Botão no balcão: anel pulsando + "E" flutuando em cima do controle da baia. */
  _marker() {
    const B = this.R.button, g = new THREE.Group(); g.position.set(B.x, B.y, B.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.09, .13, 32), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .075; g.add(ring);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
    x.fillStyle = 'rgba(16,20,24,.85)'; x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#ffb547'; x.lineWidth = 8; x.stroke(); x.fillStyle = '#ffb547'; x.font = 'bold 72px Bahnschrift, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('E', 64, 68);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); spr.scale.setScalar(.16); spr.position.y = .32; spr.renderOrder = 10; g.add(spr);
    this.ring = ring; this.sprite = spr; this.markerG = g; this.game.scene.add(g);
  }

  openMenu() {
    this.menuOpen = true; this.game.weapons.fireDown = false;
    this.game.hooks.onRangeMenu?.(true, this.state());
    if (document.pointerLockElement) document.exitPointerLock();   // o Game NÃO mostra a pausa com o menu aberto (pause())
  }
  closeMenu() {
    if (!this.menuOpen) return; this.menuOpen = false;
    this.game.hooks.onRangeMenu?.(false, this.state()); this.game.resume();
  }
  /** Liga/desliga um bot: 'still' (parado no fundo) ou 'walk' (andando de lado). */
  setBot(id, on) { const b = id === 'still' ? this.still : this.walker; b.setOn(!!on); if (on) { b.total = 0; b.hits = 0; } this.game.hooks.onRangeMenu?.(this.menuOpen, this.state()); }
  giveWeapon(id) { this.game.weapons.give(id); this.game.hooks.onRangeMenu?.(this.menuOpen, this.state()); }
  state() {
    const W = this.game.weapons;
    return { still: this.still.on, walk: this.walker.on, weapon: W.pending || W.cur, loadout: W.loadout.slice(),
      weapons: ORDER.filter(id => WEAPONS[id]).map(id => ({ id, name: WEAPONS[id].name, kind: WEAPONS[id].kind })),
      stats: this.dummies.map(b => ({ id: b.id, name: b.name, total: b.total, hits: b.hits })) };
  }

  update(dt) {
    for (const b of this.dummies) b.update(dt);
    const p = this.game.player, B = this.R.button;
    const near = !p.dead && Math.hypot(p.pos.x - B.x, p.pos.z - B.z) < RANGE_CFG.useDist;
    if (near !== this.near) { this.near = near; this.game.hooks.onRangePrompt?.(near); }
    const t = this.game.time; this.ring.material.opacity = .55 + .35 * Math.sin(t * 4); this.ring.scale.setScalar(1 + .12 * Math.sin(t * 4));
    this.sprite.position.y = .32 + .02 * Math.sin(t * 2.2);
  }

  dispose() {
    document.removeEventListener('keydown', this._kd);
    if (this.menuOpen) { this.menuOpen = false; this.game.hooks.onRangeMenu?.(false, null); }
    this.game.hooks.onRangePrompt?.(false);
    for (const b of this.dummies) b.dispose();
    this.game.scene.remove(this.markerG); this.ring.geometry.dispose(); this.ring.material.dispose(); this.sprite.material.map.dispose(); this.sprite.material.dispose();
  }
}
