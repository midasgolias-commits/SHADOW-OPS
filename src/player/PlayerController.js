import * as THREE from 'three';

const R = 0.35, H_STAND = 1.8, H_CROUCH = 1.2, EYE_STAND = 1.62, EYE_CROUCH = 1.05;
const NO_KEYS = Object.freeze({});
const approach = (v, target, step) => v < target ? Math.min(v + step, target) : Math.max(v - step, target);

/** Câmera em 3ª pessoa: atrás do ombro direito. aim (0..1) aproxima a câmera ao mirar. */
const TPS = { dist: 2.05, shoulder: .48, up: .16, aimDist: .55, aimShoulder: .3, aimUp: .08 };

export class PlayerController {
  constructor(camera, world, settings, audio) {
    this.camera = camera; this.world = world; this.settings = settings; this.audio = audio;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.eye = EYE_STAND;
    this.crouch = false; this.grounded = false; this.keys = {}; this.stepDist = 0; this.speed = 0;
    this.health = 100; this.spawn = new THREE.Vector3();
    this.dead = false; this.roll = 0;
    this.sensMul = 1;   // multiplicador de sensibilidade (luneta); escrito pelo WeaponSystem
    this.speedMul = 1;  // multiplicador de velocidade (peso da arma); escrito pelo WeaponSystem
    this.fp = false;    // true = câmera nos olhos (luneta da sniper); o WeaponSystem liga/desliga
    // recuo da câmera (rad): camada SEPARADA da mira do mouse (yaw/pitch). O WeaponSystem escreve e faz voltar a 0;
    // aqui só é somado na rotação da câmera. Assim o recuo não briga com o mouse nem se acumula na mira.
    this.recoil = { p: 0, y: 0 };
    this.aim = 0;       // 0..1: câmera de mira (mais perto do ombro); o WeaponSystem controla o alvo
    this.aimTarget = 0;
    this.camDist = TPS.dist;   // distância atual (encolhe na hora ao bater em parede, volta devagar)
    this.localVel = { fwd: 0, side: 0 };
    // salto por cima (faca + Espaço duas vezes correndo): vault = plano em andamento; vaultCurve = caminho do quadril da animação (Game)
    this.melee = false; this.vault = null; this.vaultCurve = null; this.airJump = false; this.lastGroundY = 0; this._spPrev = false;
    camera.rotation.order = 'YXZ';
    this._kd = e => {
      this.keys[e.code] = true; if (e.code === 'Space') e.preventDefault();
      // jogando: Ctrl+tecla não pode virar atalho do navegador (Ctrl+D favorito, Ctrl+S salvar...). Ctrl+W/T/N o navegador não deixa
      // bloquear — para esses, use C para agachar, ou ligue "Tela cheia ao jogar" (aí o jogo segura o teclado inteiro)
      if (document.pointerLockElement && (e.ctrlKey || e.metaKey)) e.preventDefault();
    };
    this._ku = e => { this.keys[e.code] = false; };
    this._mm = e => {
      if (document.pointerLockElement == null) return;
      const k = .0022 * this.settings.sens * this.sensMul;
      this.yaw -= e.movementX * k;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - e.movementY * k));
    };
    document.addEventListener('keydown', this._kd);
    document.addEventListener('keyup', this._ku);
    document.addEventListener('mousemove', this._mm);
    this._piv = new THREE.Vector3(); this._dir = new THREE.Vector3(); this._dst = new THREE.Vector3();
  }

  respawn(p, yaw = 0) {
    this.spawn.copy(p); this.pos.copy(p); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.recoil.p = this.recoil.y = 0; this.crouch = false; this.eye = EYE_STAND; this.health = 100;
    this.dead = false; this.roll = 0; this.aim = this.aimTarget = 0; this.fp = false;
    this.vault = null; this.airJump = false; this.lastGroundY = p.y;
  }

  get height() { return this.crouch ? H_CROUCH : H_STAND; }


  update(dt) {
    const k = this.dead ? NO_KEYS : this.keys, p = this.pos, v = this.vel;
    const spacePress = !!k.Space && !this._spPrev; this._spPrev = !!k.Space;
    if (this.vault) { this._vaultStep(dt); this._after(dt, k); return; }
    const wantCrouch = !!(k.ControlLeft || k.KeyC);
    if (wantCrouch) this.crouch = true;
    else if (this.crouch && !this.world.anyHit(p.x, p.y, p.z, R, H_STAND)) this.crouch = false;

    const fw = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), st = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * fw + cy * st, wz = -cy * fw - sy * st;
    const len = Math.hypot(wx, wz); if (len > 0) { wx /= len; wz /= len; }
    const aimSlow = 1 - .35 * this.aim;
    const speed = (this.crouch ? 2.6 : (k.ShiftLeft && !this.aimTarget ? 7.6 : 5.2)) * this.speedMul * aimSlow;
    const accel = (this.grounded ? (len > 0 ? 55 : 45) : 12) * dt;
    v.x = approach(v.x, wx * speed, accel); v.z = approach(v.z, wz * speed, accel);

    if (k.Space && this.grounded && !this.crouch) { v.y = 7.2; this.grounded = false; this.airJump = true; this.audio.play('jump', { gain: .7 }); }
    else if (spacePress && !this.grounded && this.airJump && this.melee && !this.dead) {   // 2º Espaço no ar com a faca: salto por cima
      const plan = this._vaultPlan(); if (plan) { this.airJump = false; this.vault = plan; this.audio.play('jump', { gain: .9, rate: .85 }); this._vaultStep(0); this._after(dt, k); return; }
    }
    v.y = Math.max(v.y - 22 * dt, -50);

    const wasAir = !this.grounded, fallV = v.y;
    this.grounded = this.world.move(p, v, dt, R, this.height);
    if (wasAir && this.grounded && fallV < -6) this.audio.play('land', { gain: Math.min(1, -fallV / 14) });
    if (p.y < -30) this.respawn(this.spawn);
    if (this.grounded) { this.lastGroundY = p.y; this.airJump = false; }
    this._after(dt, k);
  }

  /** Parte comum depois do movimento: velocidade local, passos, olhos, câmera. */
  _after(dt, k) {
    const v = this.vel, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    this.speed = Math.hypot(v.x, v.z);
    this.localVel.fwd = -sy * v.x - cy * v.z; this.localVel.side = cy * v.x - sy * v.z;   // velocidade no referencial do corpo
    // passos: som gravado em laço (mais rápido correndo, mais baixo agachado); sem o arquivo, volta ao passo procedural
    const moving = this.grounded && this.speed > 1 && !this.dead;
    const looped = this.audio.loop?.('walk_loop', moving, { rate: this.crouch ? .78 : this.speed > 6 ? 1.42 : this.speed > 3.4 ? 1.18 : .95, gain: this.crouch ? .3 : .6 });
    if (!looped && moving && !this.crouch) {
      this.stepDist += this.speed * dt;
      if (this.stepDist > (k.ShiftLeft ? 2.4 : 1.9)) { this.stepDist = 0; this.audio.play('step', { gain: .6 }); }
    }
    this.eye += ((this.crouch ? EYE_CROUCH : EYE_STAND) - this.eye) * Math.min(1, dt * 14);
    this.aim += (this.aimTarget - this.aim) * Math.min(1, dt * 14);
    this.applyLook(dt);
  }

  /* ---------- salto por cima de obstáculo (faca) ---------- */
  /**
   * Procura um obstáculo pulável à frente (na direção da corrida): altura 0,3–1,3 m, até 2,6 m de fundo,
   * espaço livre por cima e chão livre do outro lado. Retorna o plano do salto ou null.
   */
  _vaultPlan() {
    const W = this.world, v = this.vel, p = this.pos, sp = Math.hypot(v.x, v.z);
    if (sp < 3) return null;                                   // só correndo
    const dx = v.x / sp, dz = v.z / sp, fy = this.lastGroundY;
    const down = d => { const h = W.raycast({ x: p.x + dx * d, y: fy + 2.6, z: p.z + dz * d }, { x: 0, y: -1, z: 0 }, 5); return h ? h.point.y : -99; };
    let front = null;
    for (const hy of [.45, .85]) { const h = W.raycast({ x: p.x, y: fy + hy, z: p.z }, { x: dx, y: 0, z: dz }, 2.6); if (h && (!front || h.dist < front.dist)) front = h; }
    if (!front) return null;
    const d1 = front.dist;
    let top = -99, land = null, landY = 0;
    for (let d = d1 + .05; d <= d1 + 2.7; d += .1) {
      const y = down(d);
      if (top > -99 && y < top - .3 && Math.abs(y - fy) < .7) { land = d; landY = y; break; }   // o topo acabou: chão do outro lado
      top = Math.max(top, y);
    }
    const rel = top - fy;
    if (land === null || rel < .3 || rel > 1.3) return null;
    for (let d = d1; d <= land; d += .2) if (W.anyHit(p.x + dx * d, top + .05, p.z + dz * d, .2, .9)) return null;   // sem teto por cima
    const L = land + R + .35, gy = down(L);
    if (Math.abs(gy - fy) > .7 || W.anyHit(p.x + dx * L, gy + .05, p.z + dz * L, R, H_STAND - .1)) return null;      // pouso livre
    const c = this.vaultCurve, U0 = .45, UL = 1.45, U1 = c ? c.t[c.t.length - 1] : 2.3;
    const ts = Math.min(1.8, Math.max(1, sp * (UL - U0) / L));   // a animação acompanha a velocidade da corrida
    // altura extra: a animação sobe ~0,8 m; obstáculos mais altos esticam o arco para os pés passarem por cima
    const plan = { u: U0, U0, UL, U1, ts, sx: p.x, sy: p.y, sz: p.z, dx, dz, L, landY: gy, ks: 1, yaw: Math.atan2(-dx, -dz) };
    // escala do arco pelo ponto mais alto da animação: os pés passam ~15 cm acima do topo (pode ficar mais baixo que a animação)
    let uPk = U0, rPk = 0; for (let u = U0; u <= UL; u += .02) { const r = this._vaultRise(u); if (r > rPk) { rPk = r; uPk = u; } }
    const fPk = this._vaultFrac(plan, uPk), basePk = plan.sy + (gy - plan.sy) * Math.min(1, fPk);
    plan.ks = rPk > .05 ? Math.min(1.8, Math.max(.4, (top + .15 - basePk) / rPk)) : 1;
    Object.assign(plan, { d1, land, top });
    return plan;
  }
  _curveAt(arr, u) {
    const c = this.vaultCurve; if (!c) return 0;
    const t = c.t; let i = 1; while (i < t.length - 1 && t[i] < u) i++;
    const a = (u - t[i - 1]) / ((t[i] - t[i - 1]) || 1); return arr[i - 1] + (arr[i] - arr[i - 1]) * Math.max(0, Math.min(1, a));
  }
  /** Fração do caminho (0 = decolagem, 1 = pouso) no tempo u da animação. Sem a animação: linear. */
  _vaultFrac(pl, u) {
    const c = this.vaultCurve; if (!c) return (u - pl.U0) / (pl.UL - pl.U0);
    const z0 = this._curveAt(c.z, pl.U0); return (this._curveAt(c.z, u) - z0) / ((this._curveAt(c.z, pl.UL) - z0) || 1);
  }
  /** Quanto o quadril sobe (m) acima da decolagem no tempo u. Sem a animação: parábola de 0,8 m. */
  _vaultRise(u) {
    const c = this.vaultCurve, pl = this.vault;
    if (!c) { const s = (u - .45) / 1; return s > 0 && s < 1 ? 3.2 * s * (1 - s) : 0; }
    return Math.max(0, (this._curveAt(c.y, u) - this._curveAt(c.y, .45)) / 100);
  }
  _vaultStep(dt) {
    const pl = this.vault, p = this.pos, v = this.vel;
    const u0 = pl.u; pl.u = Math.min(pl.U1, pl.u + dt * pl.ts);
    if (pl.u <= pl.UL) {   // no ar: posição vem da animação (sem colisão, o caminho já foi conferido)
      const f = this._vaultFrac(pl, pl.u), base = pl.sy + (pl.landY - pl.sy) * Math.min(1, f);
      const nx = pl.sx + pl.dx * pl.L * f, nz = pl.sz + pl.dz * pl.L * f, d = pl.L * f;
      // em cima do obstáculo os pés nunca ficam abaixo do topo (+10 cm); rampa suave na entrada e na saída
      const need = pl.top + .1 - Math.max(0, pl.d1 - d) * 1.6 - Math.max(0, d - pl.land) * 2.2;
      const ny = Math.max(base + this._vaultRise(pl.u) * pl.ks, need);
      if (dt > 0) { v.set((nx - p.x) / dt, (ny - p.y) / dt, (nz - p.z) / dt); }
      p.set(nx, ny, nz); this.grounded = false;
      if (pl.u >= pl.UL) { p.y = pl.landY; this.audio.play('land', { gain: .5 }); }
    } else {               // rolamento no chão: segue em frente com colisão normal
      const df = (this._vaultFrac(pl, pl.u) - this._vaultFrac(pl, u0)) * pl.L;
      const s = dt > 0 ? df / dt : 0; v.x = pl.dx * s; v.z = pl.dz * s; v.y = Math.max(v.y - 22 * dt, -50);
      this.grounded = this.world.move(p, v, dt, R, H_CROUCH);
      if (this.grounded) this.lastGroundY = p.y;
    }
    if (pl.u >= pl.U1 || this.dead) { this.vault = null; v.x *= .6; v.z *= .6; }
  }

  /** Posiciona a câmera (3ª pessoa com colisão, ou nos olhos na luneta). Também chamado pelo WeaponSystem antes de atirar. */
  applyLook(dt = 0) {
    const c = this.camera, p = this.pos;
    // direção de mira = mouse + recuo da câmera (o centro da tela é sempre para onde o tiro vai)
    c.rotation.set(Math.max(-1.45, Math.min(1.45, this.pitch + this.recoil.p)), this.yaw + this.recoil.y, 0);
    if (this.fp || this.firstPerson) { c.position.set(p.x, p.y + this.eye, p.z); this.camDist = .3; return; }   // luneta ou 1ª pessoa: câmera nos olhos
    // distância, ombro e altura da câmera vêm das configurações (Esc → Câmera); mirando, chega perto como antes
    const s = this.settings, D = s.camDist ?? TPS.dist, S = s.camSide ?? TPS.shoulder, U = s.camHeight ?? TPS.up;
    const a = this.aim, dist = D + (TPS.aimDist - D) * a, sh = S + (TPS.aimShoulder - S) * a, up = U + (TPS.aimUp - U) * a;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    // pivô: acima da cabeça, deslocado para o ombro direito (o ombro também é testado contra paredes)
    const piv = this._piv.set(p.x, p.y + this.eye - .05 + up, p.z);
    const rx = cy, rz = -sy;
    const side = this.world.raycast(piv, { x: rx, y: 0, z: rz }, sh + .25);
    const shOk = side ? Math.max(0, side.dist - .25) : sh;
    piv.x += rx * shOk; piv.z += rz * shOk;
    // direção para trás da câmera
    const bx = sy * cp, by = -sp, bz = cy * cp;
    const hit = this.world.raycast(piv, { x: bx, y: by, z: bz }, dist + .3);
    const want = hit ? Math.max(.35, hit.dist - .3) : dist;
    if (want < this.camDist) this.camDist = want;                                    // parede: encolhe na hora
    else if (dt) this.camDist += (want - this.camDist) * Math.min(1, dt * 6);        // espaço livre: volta suave
    c.position.set(piv.x + bx * this.camDist, piv.y + by * this.camDist, piv.z + bz * this.camDist);
  }

  dispose() {
    this.audio.loop?.('walk_loop', false);
    document.removeEventListener('keydown', this._kd);
    document.removeEventListener('keyup', this._ku);
    document.removeEventListener('mousemove', this._mm);
  }
}
