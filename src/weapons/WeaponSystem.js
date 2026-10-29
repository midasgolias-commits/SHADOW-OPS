import * as THREE from 'three';
import { WEAPONS, ORDER } from './Weapons.js';
import { Effects } from './Effects.js';
import { vfov } from '../core/Fov.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FWD = new THREE.Vector3(), RIGHT = new THREE.Vector3(), UP = new THREE.Vector3(), ORG = new THREE.Vector3(), DIR = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0), _m = new THREE.Vector3(), _seg = new THREE.Vector3();

/**
 * Ajustes gerais da mira e do tiro (os de cada arma ficam em Weapons.js: recoil, spread...).
 *  recoilFollow: rapidez (1/s) com que a câmera chega ao recuo de cada tiro (alto = tranco seco, baixo = sobe macio)
 *  recoilRecover: rapidez (1/s) com que o recuo volta a zero quando você para de atirar
 *  recoilMaxP / recoilMaxY: recuo máximo acumulado (rad) para cima / para o lado
 *  adsRecoil / scopeRecoil: fração do recuo mirando pela arma / na luneta
 *  muzzleCheck: 3ª pessoa: testa obstáculo entre o CANO da arma e o ponto mirado (o tiro não atravessa parede perto do personagem)
 *  tracerLife / tracerWidth: rastro visual (s / m). Só visual: não muda acerto nem dano.
 *  fpMuzzleDepth: 1ª pessoa: distância (m) da câmera onde o rastro começa, na direção do cano que aparece na tela
 *  debug: desenha raio da câmera (amarelo), cano (azul), caminho final (vermelho) e obstáculo (rosa). Liga com ?debugShots=1 na URL.
 */
/** Tempos da troca de arma (s): guardar a arma antiga (até o ombro/costas) e sacar a nova. */
/** Golpe de faca (s / radianos): janela em que a lâmina corta e o arco que ela varre (direita/cima → esquerda/baixo). */
export const MELEE = { start: .07, end: .23, yaw0: .38, yaw1: -.3, pitch0: .12, pitch1: -.16, steps: 3 };
export const SWITCH = { out: .12, in: .2, inMelee: .16 };   // troca rápida (estilo Point Blank)
export const AIM = {
  recoilFollow: 22, recoilRecover: 7, recoilMaxP: .035, recoilMaxY: .015, adsRecoil: .7, scopeRecoil: .7,
  muzzleCheck: true, tracerLife: .07, tracerWidth: .012, fpMuzzleDepth: .6,
  debug: typeof location !== 'undefined' && /[?&]debugShots=1/.test(location.search)
};

/**
 * Armas: troca, tiro (hitscan com dispersão), recuo, munição e recarga.
 * Tiro (para cada bala): 1) raio pelo centro da tela (câmera, já com o recuo) + dispersão acha o ponto mirado;
 * 2) em 3ª pessoa, o caminho final sai do cano da arma até esse ponto (obstáculo no caminho leva o tiro);
 * 3) o dano é aplicado uma vez, no primeiro alvo do caminho final; 4) impacto e rastro são só visuais.
 * A mira (HUD) fica sempre no centro: o recuo mexe a CÂMERA (player.recoil), não a mira.
 * Alvos (bots, dummies) entram por addHitTester(fn), fn(origem, dir, maxDist) => { dist, zone: 'head'|'body'|'limb', damage(n, info) } | null.
 */
export class WeaponSystem {
  constructor({ camera, scene, world, player, audio, settings, hooks = {}, active = () => true, loadout = ORDER, infiniteAmmo = false }) {
    Object.assign(this, { camera, world, player, audio, settings, hooks, active });
    this.infiniteAmmo = infiniteAmmo;   // treino: a reserva nunca acaba (o pente ainda esvazia e recarrega)
    this.fx = new Effects(scene); this.testers = [];
    this.t = 0; this.fireDown = false; this.clicked = false; this.scoped = false;
    this.rc = { p: 0, y: 0 };   // recuo-alvo (rad): cada tiro soma; volta a 0 ao parar. A câmera segue em player.recoil.
    this.burst = 0; this.lastShot = -9; this.nextFire = 0;
    this.state = 'ready'; this.until = 0; this.reloadStart = 0; this.switchStart = 0; this.swapAt = 0; this.pending = null;
    this.loadout = loadout.slice();   // ordem das teclas: com mochila = [principal, secundária, arma branca] (1, 2, 3)
    this.owned = new Set(loadout); this.ammo = {}; this.last = null; this.scopeOn = false;
    this.onShot = null;   // callback(w) a cada tiro do jogador (os bots usam para ouvir)
    this.onAction = null; // callback(tipo, w, extra): 'shot' | 'melee' | 'reload' (animação do personagem)
    this.muzzle = null;        // () => {x,y,z} do cano no MUNDO (arma visível no mapa) ou null: usado no caminho do tiro
    this.visualMuzzle = null;  // () => {x,y,z} de onde o rastro começa na tela (1ª pessoa: cano dos braços) ou null
    for (const id of loadout) this.ammo[id] = { mag: WEAPONS[id].mag ?? 0, reserve: WEAPONS[id].reserve ?? 0 };
    this._equip(loadout[0]);

    this._md = e => { if (!this.active()) return; if (e.button === 0) { this.fireDown = true; this.clicked = true; } else if (e.button === 2) this._toggleScope(); };
    this._mu = e => { if (e.button === 0) this.fireDown = false; };
    this._kd = e => {
      if (!this.active() || e.repeat) return;
      const i = this.loadout.findIndex((_, k) => e.code === 'Digit' + (k + 1));
      if (i >= 0) this.switchTo(this.loadout[i]); else if (e.code === 'KeyR') this.reload(); else if (e.code === 'KeyQ' && this.last) this.switchTo(this.last);
    };
    this._wh = e => { if (this.active()) this.cycle(e.deltaY > 0 ? 1 : -1); };
    this._cm = e => e.preventDefault();
    this._pl = () => { if (!document.pointerLockElement) this.fireDown = false; };
    document.addEventListener('mousedown', this._md); document.addEventListener('mouseup', this._mu);
    document.addEventListener('keydown', this._kd); document.addEventListener('wheel', this._wh, { passive: true });
    document.addEventListener('contextmenu', this._cm); document.addEventListener('pointerlockchange', this._pl);
  }

  get w() { return WEAPONS[this.cur]; }
  addHitTester(fn) { this.testers.push(fn); }

  _equip(id) {
    this.cur = id; this.scoped = false;
    this.player.speedMul = WEAPONS[id].speedMul ?? 1;
  }

  /** Botão direito: luneta (sniper, câmera nos olhos) ou mira pela arma (armas com `ads`, câmera colada atrás da arma). */
  _toggleScope() { if ((this.w.zoomFov || this.w.ads) && this.state === 'ready') this.scoped = !this.scoped; }

  switchTo(id) {
    if (!this.owned.has(id)) return;
    if (this.state === 'switch' && this.pending) { this.pending = id === this.cur ? null : id; return; }
    if (id === this.cur) return;
    this.last = this.cur; this.scoped = false; this.state = 'switch'; this.pending = id; this.swing = null;
    this.switchStart = this.t; this.swapAt = this.t + SWITCH.out; this.until = this.swapAt + (WEAPONS[id].melee ? SWITCH.inMelee : SWITCH.in);
  }
  /**
   * Põe uma arma na mão no lugar da que ocupa a mesma vaga (1 principal, 2 secundária/pistola, 3 arma branca) e saca ela.
   * Usado no treino (menu do E: todas as armas liberadas).
   */
  give(id) {
    const W = WEAPONS[id]; if (!W) return;
    const i = W.melee ? 2 : id === 'pistol' ? 1 : 0, slot = Math.min(i, this.loadout.length - 1);
    if (this.loadout[slot] !== id) { this.loadout[slot] = id; this.owned = new Set(this.loadout); }
    this.ammo[id] ??= { mag: W.mag ?? 0, reserve: W.reserve ?? 0 };
    if (this.cur !== id) this.switchTo(id);
  }
  cycle(dir) {
    const list = this.loadout, i = list.indexOf(this.pending || this.cur);
    this.switchTo(list[(i + dir + list.length) % list.length]);
  }

  reload() {
    const w = this.w, a = this.ammo[this.cur];
    if (w.melee || this.state !== 'ready' || a.mag >= w.mag || a.reserve <= 0) return;
    this.state = 'reload'; this.scoped = false; this.reloadStart = this.t; this.until = this.t + w.reload;
    this.reloadTotal = w.shell ? w.reload * (w.mag - a.mag) : w.reload;   // tempo da recarga inteira (escopeta: todos os cartuchos)
    this.onAction?.('reload', w, w.shell ? w.reload * (w.mag - this.ammo[this.cur].mag) : w.reload);
    const rs = 'reload_' + (w.shell ? 'shell' : w.id);   // som de recarga de cada arma (escopeta: um por cartucho)
    this.audio.play(this.audio.has?.(rs) ? rs : (w.shell ? 'beep' : 'reload'), { gain: w.shell ? .5 : .8 });
  }

  _spread(w) {
    const p = this.player, mf = clamp(p.speed / 5.2, 0, 1.5);
    let s = this.scoped && w.zoomSpread !== undefined ? w.zoomSpread : w.spread;
    s += w.moveSpread * mf;
    if (!p.grounded) s += w.airSpread;
    s += w.burstSpread * this.burst;
    if (this.scoped && w.ads) s *= w.ads.spreadMul ?? .6;   // mirando pela arma: toda a dispersão encolhe (o ponto vermelho é onde o tiro vai)
    if (p.crouch) s *= .75;
    return s;
  }

  _basis() {
    FWD.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    RIGHT.crossVectors(FWD, WORLD_UP).normalize(); UP.crossVectors(RIGHT, FWD).normalize();
    ORG.copy(this.camera.position);
    // 3ª pessoa: o raio sai do centro da tela, mas começa na altura do jogador (não acerta o que está entre a câmera e o corpo)
    const p = this.player.pos, ahead = (p.x - ORG.x) * FWD.x + (p.y + 1.4 - ORG.y) * FWD.y + (p.z - ORG.z) * FWD.z;
    if (ahead > 0) ORG.addScaledVector(FWD, ahead);
  }

  _shoot(w, a) {
    const t = this.t, sp = this._spread(w);
    a.mag--; this.nextFire = t + 60 / w.rpm; this._basis();
    this.audio.play(w.id, { gain: .9 }); this.onShot?.(w); this.onAction?.('shot', w);
    for (let i = 0; i < w.pellets; i++) {
      // dispersão: cone sorteado em volta do centro da tela (a câmera já inclui o recuo)
      const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * sp;
      DIR.copy(FWD).addScaledVector(RIGHT, Math.cos(ang) * rad).addScaledVector(UP, Math.sin(ang) * rad).normalize();
      this._fireRay(w, i < 3, true);
    }
    // recuo da câmera: sobe e desvia para o lado (sorteado); o tiro rápido acumula até o limite; volta sozinho (update)
    const R = w.recoil, f = (1 + R.ramp * this.burst) * (this.player.crouch ? .8 : 1) * (this.scopeOn ? AIM.scopeRecoil : this.scoped ? AIM.adsRecoil : 1);
    const kp = R.p * f * .5, ky = (Math.random() - .5) * 2 * R.y * f * .5;
    this.rc.p = Math.min(this.rc.p + kp, AIM.recoilMaxP); this.rc.y = clamp(this.rc.y + ky, -AIM.recoilMaxY, AIM.recoilMaxY);
    this.burst = Math.min(this.burst + 1, R.cap); this.lastShot = t;
  }

  /**
   * Golpe de faca: o dano não é mais instantâneo no centro da tela. A lâmina VARRE um arco na frente do jogador
   * (da direita/cima para a esquerda/baixo, junto com a animação) durante a janela do golpe; quem a ponta tocar
   * (até w.range metros) leva o dano — uma vez por golpe. Parede no caminho: faísca e para ali.
   */
  _melee(w) {
    this.nextFire = this.t + 60 / w.rpm;
    this.audio.play('knife'); this.onAction?.('melee', w);
    this.swing = { w, t0: this.t, last: 0, hit: new Set(), wall: false };
  }
  _swingUpdate() {
    const s = this.swing; if (!s) return;
    const u = this.t - s.t0, M = MELEE;
    if (u < M.start) return;
    const p1 = clamp((u - M.start) / (M.end - M.start), 0, 1), p0 = s.last; s.last = p1;
    this._basis();
    for (let k = 1; k <= M.steps; k++) {
      const p = p0 + (p1 - p0) * k / M.steps, yaw = M.yaw0 + (M.yaw1 - M.yaw0) * p, pit = M.pitch0 + (M.pitch1 - M.pitch0) * p;
      DIR.copy(FWD).addScaledVector(RIGHT, Math.tan(yaw)).addScaledVector(UP, Math.tan(pit)).normalize();
      const fin = this._cast(ORG, DIR, s.w.range);
      if (fin.target) {
        const b = fin.target, key = b.who || b; if (s.hit.has(key)) continue; s.hit.add(key);
        const mul = b.zone === 'head' ? s.w.head : b.zone === 'limb' ? s.w.limb : 1, dmg = Math.max(1, Math.round(s.w.dmg * mul));
        const res = b.damage?.(dmg, { zone: b.zone, weapon: s.w.id, dist: fin.dist });
        this.fx.impact(fin.point, null, 'flesh', DIR);
        this.hooks.onHit?.({ damage: dmg, zone: b.zone, kill: !!res?.kill, weapon: s.w.id });
      } else if (fin.any && !s.wall) { s.wall = true; this.fx.impact(fin.point, fin.normal, fin.tag, DIR); }
    }
    if (p1 >= 1) this.swing = null;
  }

  /** Primeiro acerto no raio (mundo ou alvo), sem dano. Retorna { dist, point, normal, tag, target } (target = alvo, se for um). */
  _cast(o, d, max) {
    const wh = this.world.raycast(o, d, max);
    let best = null, bd = wh ? wh.dist : max;
    for (const fn of this.testers) { const r = fn(o, d, bd); if (r && r.dist < bd) { best = r; bd = r.dist; } }
    const hit = best || wh;
    return { dist: hit ? bd : max, point: { x: o.x + d.x * bd, y: o.y + d.y * bd, z: o.z + d.z * bd }, normal: !best && wh ? wh.normal : null,
      tag: best ? 'flesh' : wh?.tag, target: best, any: !!hit };
  }

  /**
   * Um tiro (uma bala). ORG/DIR = raio da câmera pelo centro da tela (+ dispersão).
   * fromMuzzle: armas de fogo em 3ª pessoa: o caminho final sai do cano até o ponto mirado.
   */
  _fireRay(w, tracer, fromMuzzle) {
    const range = w.range, aim = this._cast(ORG, DIR, range);        // 1) ponto mirado pela câmera
    let o = ORG, d = DIR, fin = aim;
    const m = fromMuzzle && AIM.muzzleCheck ? this.muzzle?.() : null;  // 2) caminho físico a partir do cano (se a arma está no mapa)
    if (m) {
      _seg.set(aim.point.x - m.x, aim.point.y - m.y, aim.point.z - m.z); const L = _seg.length();
      if (L > .05 && _seg.dot(DIR) > 0) {
        o = _m.set(m.x, m.y, m.z); d = _seg.divideScalar(L);
        fin = this._cast(o, d, L + .05);                                // até um pouco depois do ponto mirado
        if (!fin.any || fin.dist > L) fin = { ...aim, dist: L };        // caminho livre: vale o que a câmera mirou (mesmo alvo, mesmo ponto)
      }
    }
    // 3) dano uma vez, no alvo do caminho final
    if (fin.target) {
      const b = fin.target, mul = b.zone === 'head' ? w.head : b.zone === 'limb' ? w.limb : 1;
      const dist = Math.hypot(fin.point.x - ORG.x, fin.point.y - ORG.y, fin.point.z - ORG.z);   // queda de dano pela distância do atirador
      const dmg = Math.max(1, Math.round(w.dmg * mul * Math.pow(w.falloff, dist / 20)));
      const res = b.damage?.(dmg, { zone: b.zone, weapon: w.id, dist });
      this.fx.impact(fin.point, null, 'flesh', d);
      this.hooks.onHit?.({ damage: dmg, zone: b.zone, kill: !!res?.kill, weapon: w.id });
    } else if (fin.any) this.fx.impact(fin.point, fin.normal, fin.tag, d);
    // 4) visual: rastro do cano até onde o tiro parou (nunca atravessa a parede: termina no ponto resolvido)
    const end = fin.any ? fin.point : { x: o.x + d.x * Math.min(range, 120), y: o.y + d.y * Math.min(range, 120), z: o.z + d.z * Math.min(range, 120) };
    if (tracer && !(this.scoped && w.ads) && !this.scopeOn) {   // mirando: sem rastro cruzando a mira
      const v = this.visualMuzzle?.() || m;
      const s = v || { x: ORG.x + FWD.x * .55 + RIGHT.x * .13 - UP.x * .1, y: ORG.y + FWD.y * .55 + RIGHT.y * .13 - UP.y * .1, z: ORG.z + FWD.z * .55 + RIGHT.z * .13 - UP.z * .1 };
      this.fx.tracer(s, end, AIM.tracerLife, AIM.tracerWidth);
    }
    if (AIM.debug || globalThis.__shotDebug) this.fx.debugShot(ORG, aim.point, m, o, end, fin !== aim && fin.any ? fin.point : null);
  }

  update(dt) {
    this.t += dt; const t = this.t, w = this.w, a = this.ammo[this.cur], cam = this.camera;
    if (!this.active()) this.fireDown = false;
    if (this.player.dead) this.scoped = false;
    this.player.applyLook();   // a câmera precisa refletir o olhar atual antes do tiro
    this._swingUpdate();   // faca: a lâmina varrendo o arco do golpe

    if (this.state === 'switch') {
      if (this.pending && t >= this.swapAt) { const id = this.pending; this.pending = null; this._equip(id); }
      if (!this.pending && t >= this.until) { this.state = 'ready'; this.nextFire = Math.max(this.nextFire, t); }
    } else if (this.state === 'reload' && t >= this.until) {
      if (w.shell) {
        a.mag++; if (!this.infiniteAmmo) a.reserve--; this.audio.play(this.audio.has?.('reload_shell') ? 'reload_shell' : 'beep', { gain: .45 });
        if (a.mag < w.mag && a.reserve > 0) this.until = t + w.reload;
        else { this.state = 'ready'; this.nextFire = Math.max(this.nextFire, t + .25); }
      } else {
        const n = Math.min(w.mag - a.mag, a.reserve); a.mag += n; if (!this.infiniteAmmo) a.reserve -= n; this.state = 'ready';
      }
    }

    const cw = this.w, ca = this.ammo[this.cur];   // arma já pode ter mudado acima
    if (this.state === 'ready' || (this.state === 'reload' && cw.shell && ca.mag > 0)) {
      const wants = cw.auto ? this.fireDown : this.clicked;
      if (wants && t >= this.nextFire) {
        if (cw.melee) this._melee(cw);
        else if (ca.mag > 0) { this.state = 'ready'; this._shoot(cw, ca); }
        else { if (this.clicked) this.audio.play('beep', { gain: .25 }); this.reload(); }
      } else if (!cw.melee && ca.mag === 0 && ca.reserve > 0 && this.state === 'ready' && t >= this.nextFire + .12) this.reload();
    }
    this.clicked = false;

    // rajada e recuperação do recuo
    const idle = t - this.lastShot > 60 / Math.max(cw.rpm, 1) + .08;
    if (idle) {
      this.burst = Math.max(0, this.burst - dt * 6);
      const k = 1 - Math.exp(-AIM.recoilRecover * dt); this.rc.p -= this.rc.p * k; this.rc.y -= this.rc.y * k;
    }
    // a câmera segue o recuo-alvo suave (sem salto) — camada separada da mira do mouse (PlayerController.recoil)
    const pr = this.player.recoil, kf = 1 - Math.exp(-AIM.recoilFollow * dt);
    pr.p += (this.rc.p - pr.p) * kf; pr.y += (this.rc.y - pr.y) * kf;
    this.player.applyLook();   // inclui o recuo deste quadro

    // zoom da luneta
    // zoom: valores das armas são verticais (iguais em qualquer formato de tela); o normal vem das configurações (horizontal)
    const asp = cam.aspect || 1, base = vfov(this.settings.fov, asp), target = this.scoped && cw.zoomFov ? cw.zoomFov : this.scoped && cw.ads ? cw.ads.fov : base;
    if (Math.abs(cam.fov - target) > .05) { cam.fov += (target - cam.fov) * (1 - Math.exp(-20 * dt)); cam.updateProjectionMatrix(); }
    else if (cam.fov !== target) { cam.fov = target; cam.updateProjectionMatrix(); }
    this._zoomed = Math.abs(cam.fov - target) < .5;
    this.scopeOn = this.scoped && !!cw.zoomFov && cam.fov < base - (base - target) * .6;
    this.player.fp = this.scopeOn;                                  // luneta: câmera vai para os olhos
    this.player.aimTarget = this.scoped && cw.ads ? 1 : 0;
    this.player.melee = !!cw.melee;                                 // faca na mão: libera o salto por cima (Espaço duas vezes)          // mira pela arma: câmera colada atrás da arma
    this.player.sensMul = Math.tan(cam.fov * Math.PI / 360) / Math.tan(base * Math.PI / 360)   // sensibilidade proporcional ao zoom
      * (this.scoped ? (this.settings.adsSens ?? 1) : 1);                                      // mais o ajuste de sensibilidade mirando

    // efeitos de impacto (faíscas, marcas, rastros)
    this.fx.update(dt);
  }

  /** Munição cheia em todas as armas e estado limpo (ao reaparecer). */
  refill() {
    for (const id of this.owned) this.ammo[id] = { mag: WEAPONS[id].mag ?? 0, reserve: WEAPONS[id].reserve ?? 0 };
    this.state = 'ready'; this.pending = null; this.scoped = false; this.burst = 0; this.rc.p = this.rc.y = 0; this.player.recoil.p = this.player.recoil.y = 0; this.nextFire = this.t + .4;
    this.fireDown = false; this.clicked = false;
  }

  /** Dados para o HUD. (A mira fica fixa no centro: não há deslocamento por recuo.) */
  hud() {
    const w = this.w, a = this.ammo[this.cur], t = this.t;
    return {
      id: w.id, name: w.name, kind: w.kind, melee: !!w.melee, mag: a.mag, cap: w.mag ?? 0, reserve: this.infiniteAmmo ? '∞' : a.reserve, state: this.state,
      pending: this.pending, last: this.last,   // usados pelo painel de troca de arma
      // troca de arma: 0 = arma na mão, 1 = guardada nas costas (sobe até 1 guardando a antiga, desce até 0 sacando a nova)
      switchIn: this.state === 'switch' && !this.pending,   // true = sacando a nova (a antiga já foi guardada)
      switchK: this.state !== 'switch' ? 0 : this.pending ? clamp((t - this.switchStart) / Math.max(.01, this.swapAt - this.switchStart), 0, 1) : 1 - clamp((t - this.swapAt) / Math.max(.01, this.until - this.swapAt), 0, 1),
      aiming: this.scoped && !!w.ads, zoomed: this._zoomed,
      reloadTotal: this.reloadTotal || w.reload,
      reloadP: this.state === 'reload' ? clamp((t - this.reloadStart) / (this.until - this.reloadStart), 0, 1) : -1,
      scoped: this.scopeOn, spread: this._spread(w),
      slots: this.loadout.map((id, i) => ({ id, n: i + 1, name: WEAPONS[id].name, owned: true, cur: id === this.cur }))
    };
  }

  dispose() {
    document.removeEventListener('mousedown', this._md); document.removeEventListener('mouseup', this._mu);
    document.removeEventListener('keydown', this._kd); document.removeEventListener('wheel', this._wh);
    document.removeEventListener('contextmenu', this._cm); document.removeEventListener('pointerlockchange', this._pl);
    this.fx.dispose();
    this.player.sensMul = 1; this.player.speedMul = 1; this.player.fp = false; this.player.aimTarget = 0; this.player.recoil.p = this.player.recoil.y = 0;
    this.camera.fov = vfov(this.settings.fov, this.camera.aspect || 1); this.camera.updateProjectionMatrix();
  }
}
