import * as THREE from 'three';

/**
 * GRANADA (M67): equipar (tecla 4 ou G) → segurar o botão esquerdo (puxa o pino e mostra o arco previsto)
 * → soltar (arremessa) | botão direito (cancela). Trocar de arma (1/2/3/Q/rodinha) guarda a granada.
 *
 * Física própria, no MESMO mundo de colisão do jogo (CollisionWorld: caixas AABB):
 *  - esfera do tamanho da granada, gravidade, arrasto do ar (depende da massa), giro;
 *  - colisão contínua: a cada subpasso (1/240 s) o movimento é um raio contra as caixas, então ela não atravessa paredes;
 *  - quique com restituição e atrito no impacto, rolamento com atrito no chão e repouso (para de simular parada).
 * A PRÉVIA do arco usa exatamente as mesmas funções (launch + step) do arremesso real.
 * Explosão: uma vez só; dano com queda pela distância e linha de visão (parede bloqueia); cada alvo leva dano uma vez.
 */
export const NADE = {
  count: 1,             // granadas por vida (no treino são infinitas)
  fuse: 2.5,            // segundos do arremesso até explodir
  speed: 16,            // m/s velocidade inicial do arremesso
  upBias: .14,          // rad: o arremesso sai um pouco acima da mira
  inherit: .6,          // quanto da velocidade do jogador vai junto
  gravity: 9.81,        // m/s²
  mass: .4,             // kg (M67 ≈ 400 g): entra no arrasto do ar
  drag: .0006,          // coeficiente de arrasto (aceleração = drag·v²/massa)
  radius: .035,         // m: colisor (esfera). O modelo tem ~6,4 cm de diâmetro
  restitution: .4,      // 0..1: quanto da velocidade volta no quique
  friction: .35,        // perda da velocidade "de lado" em cada impacto
  rollFriction: 1.6,    // 1/s: freio rolando no chão
  restSpeed: .55,       // m/s: abaixo disso no impacto com o chão, não quica mais
  sleepSpeed: .06,      // m/s: abaixo disso no chão por .3 s, para de simular
  substep: 1 / 240,     // s: passo da física (o mesmo na prévia)
  dmgMax: 140,          // dano no centro
  dmgFull: 1.4,         // m: até essa distância, dano máximo
  dmgRadius: 7,         // m: alcance máximo
  dmgCurve: 1.6,        // forma da queda (1 = linear; maior = cai mais rápido perto da borda)
  wallMul: 0,           // dano atrás de parede/obstáculo (0 = bloqueia)
  fx: 1,                // intensidade dos efeitos (luz, fogo, fumaça, faíscas, tremor)
  previewTime: 3,       // s: limite da prévia sem bater em nada
  previewDots: 34,      // pontos do arco
  handBack: .45         // s: tempo da animação de arremesso
};

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

/* ---------- física (usada pela prévia e pelo arremesso real) ---------- */
/** Ponto de saída e velocidade do arremesso, a partir da posição/olhar do jogador e da mira. */
export function launchParams(game, out = { p: new THREE.Vector3(), v: new THREE.Vector3() }) {
  const pl = game.player, cam = game.camera, world = game.world;
  const fwd = cam.getWorldDirection(new THREE.Vector3()), right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
  const eye = new THREE.Vector3(pl.pos.x, pl.pos.y + pl.eye, pl.pos.z);
  // ponto que a mira (centro da tela) aponta: na 3ª pessoa a câmera fica atrás, então mira = onde o raio da câmera bate
  const hit = world.raycast(cam.position, fwd, 80), aimPt = hit ? new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z) : cam.position.clone().addScaledVector(fwd, 80);
  // saída: mão direita, um pouco à frente e acima do ombro (sem entrar na parede)
  const want = eye.clone().addScaledVector(right, .2).addScaledVector(UP, .02).addScaledVector(_v.set(fwd.x, 0, fwd.z).normalize(), .3);
  const d = want.clone().sub(eye), L = d.length(); d.divideScalar(L || 1);
  const block = world.raycast(eye, d, L + NADE.radius);
  out.p.copy(block ? eye.clone().addScaledVector(d, Math.max(0, block.dist - NADE.radius - .02)) : want);
  const dir = aimPt.sub(out.p).normalize();
  const side = new THREE.Vector3().crossVectors(dir, UP); if (side.lengthSq() < 1e-6) side.copy(right); side.normalize();
  dir.applyAxisAngle(side, NADE.upBias);   // levanta um pouco o arco
  out.v.copy(dir).multiplyScalar(NADE.speed);
  out.v.x += pl.vel.x * NADE.inherit; out.v.z += pl.vel.z * NADE.inherit;
  return out;
}

/** Um passo de física. s = { p, v, w (giro), sleep, rest, ground }. Devolve o impacto (ou null). */
export function stepNade(s, dt, world) {
  if (s.sleep) return null;
  const r = NADE.radius, v = s.v;
  v.y -= NADE.gravity * dt;
  const sp = v.length(); if (sp > 0) v.multiplyScalar(Math.max(0, 1 - NADE.drag * sp / NADE.mass * dt));
  const L = v.length() * dt; let impact = null;
  if (L > 1e-7) {
    const dir = _v.copy(v).normalize();
    const hit = world.sweepSphere(s.p, dir, L, r);   // esfera contra as caixas (contato exato, sem atravessar)
    if (hit && hit.inside) { s.p.addScaledVector(_w.set(hit.normal.x, hit.normal.y, hit.normal.z), hit.dist + 1e-4); }   // encostada/dentro: empurra para fora
    else if (hit) {
      const n = _w.set(hit.normal.x, hit.normal.y, hit.normal.z);
      s.p.addScaledVector(dir, Math.max(0, hit.dist - 1e-4));
      const vn = v.dot(n);
      if (vn < 0) {
        const speed = -vn;
        v.addScaledVector(n, -vn * (1 + NADE.restitution));                 // reflete a parte que bate
        const vn2 = v.dot(n), tan = new THREE.Vector3().copy(v).addScaledVector(n, -vn2);
        tan.multiplyScalar(1 - NADE.friction * Math.min(1, speed / 4));      // atrito no impacto
        if (n.y > .7 && speed < NADE.restSpeed) v.copy(tan); else v.copy(tan).addScaledVector(n, vn2);   // devagar no chão: assenta
        s.w.multiplyScalar(.55).add(new THREE.Vector3().crossVectors(n, tan).multiplyScalar(.6 / r));
        impact = { speed, point: { x: s.p.x, y: s.p.y, z: s.p.z }, normal: { x: n.x, y: n.y, z: n.z }, tag: hit.tag };
      }
    } else s.p.addScaledVector(dir, L);
  }
  // no chão: rola com atrito e acaba parando
  const down = world.sweepSphere(s.p, { x: 0, y: -1, z: 0 }, .012, r);
  s.ground = !!down && down.normal.y > .7 && !down.inside;
  if (s.ground) {
    if (v.y < 0 && v.y > -NADE.restSpeed) v.y = 0;
    const k = Math.exp(-NADE.rollFriction * dt); v.x *= k; v.z *= k;
    s.w.crossVectors(UP, v).multiplyScalar(1 / r);   // giro de rolamento (visual)
    if (v.length() < NADE.sleepSpeed) { s.rest += dt; if (s.rest > .3) { s.sleep = true; v.set(0, 0, 0); } } else s.rest = 0;
  } else s.w.multiplyScalar(Math.exp(-.3 * dt));
  return impact;
}

/* ---------- texturas dos efeitos (feitas uma vez) ---------- */
let TEX = null;
function fxTextures() {
  if (TEX) return TEX;
  const mk = (draw, n = 128) => { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const radial = stops => mk((g, n) => { const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); stops.forEach(([o, c]) => r.addColorStop(o, c)); g.fillStyle = r; g.fillRect(0, 0, n, n); });
  TEX = {
    fire: radial([[0, 'rgba(255,250,220,1)'], [.25, 'rgba(255,190,80,.95)'], [.55, 'rgba(255,90,20,.55)'], [1, 'rgba(120,20,0,0)']]),
    smoke: mk((g, n) => { for (let i = 0; i < 14; i++) { const x = n * (.3 + Math.random() * .4), y = n * (.3 + Math.random() * .4), r = n * (.18 + Math.random() * .18), rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(70,68,64,.35)'); rg.addColorStop(1, 'rgba(70,68,64,0)'); g.fillStyle = rg; g.fillRect(0, 0, n, n); } }),
    spark: radial([[0, 'rgba(255,255,230,1)'], [.3, 'rgba(255,200,90,.9)'], [1, 'rgba(255,120,30,0)']]),
    dot: radial([[0, 'rgba(255,225,140,1)'], [.45, 'rgba(255,190,70,.9)'], [1, 'rgba(255,160,40,0)']]),
    scorch: radial([[0, 'rgba(8,6,5,.85)'], [.55, 'rgba(15,12,10,.55)'], [1, 'rgba(20,16,12,0)']])
  };
  return TEX;
}

/* ---------- sistema ---------- */
export class GrenadeSystem {
  /** game: o Game (player, camera, world, scene, audio, weapons, bots, range, online). template: modelo da granada (Assets). */
  constructor(game, template, { infinite = false } = {}) {
    this.game = game; this.template = template; this.infinite = infinite;
    this.count = NADE.count; this.equipped = false; this.cooking = false; this.throwT = -1; this.prev = null;
    this.live = []; this.fx = []; this.shakeT = 0; this.shakeA = 0; this.areaTargets = [];
    const sc = game.scene;
    // modelo na mão (3ª pessoa) e na frente da câmera (1ª pessoa): uma cópia cada, reaproveitada
    this.hand = template.clone(true); this.hand.visible = false; sc.add(this.hand);
    this.view = template.clone(true); this.view.visible = false; sc.add(this.view);
    // prévia do arco: pontos + marcador do impacto
    const T = fxTextures();
    this.dots = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(NADE.previewDots * 3), 3)),
      new THREE.PointsMaterial({ map: T.dot, size: 9, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    this.dots.frustumCulled = false; this.dots.renderOrder = 999; this.dots.visible = false; sc.add(this.dots);
    this.mark = new THREE.Mesh(new THREE.RingGeometry(.22, .32, 32), new THREE.MeshBasicMaterial({ color: 0xffb444, transparent: true, opacity: .9, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.mark.renderOrder = 999; this.mark.visible = false; sc.add(this.mark);
    this._pv = { p: new THREE.Vector3(), v: new THREE.Vector3() };
    // teclas/mouse (registrados uma vez; removidos no dispose)
    const ok = () => game.running && !game.paused && !game.player?.dead && !!document.pointerLockElement;
    this._kd = e => {
      if (!ok() || e.repeat) return;
      if (e.code === 'Digit4' || e.code === 'KeyG') { this.equipped ? this.unequip() : this.equip(); }
      else if (this.equipped && (/^Digit[1-3]$/.test(e.code) || e.code === 'KeyQ')) {   // volta para a arma pedida
        this.unequip(); const W = game.weapons, i = +e.code.slice(5) - 1;
        if (e.code === 'KeyQ') { if (W.last) W.switchTo(W.last); } else if (W.loadout[i]) W.switchTo(W.loadout[i]);
      }
    };
    this._md = e => { if (!ok() || !this.equipped || this.throwT >= 0) return; if (e.button === 0) this.cooking = true; else if (e.button === 2 && this.cooking) this.cooking = false; };
    this._mu = e => { if (e.button === 0 && this.cooking) { this.cooking = false; if (ok()) this.throw(); } };
    this._wh = () => { if (this.equipped && ok()) this.unequip(); };
    document.addEventListener('keydown', this._kd); document.addEventListener('mousedown', this._md); document.addEventListener('mouseup', this._mu);
    document.addEventListener('wheel', this._wh, { passive: true });
  }

  /** alvos de dano em área: fn() => [{ pos:{x,y,z} (pés), alive, name, hurt(n) }] */
  addAreaTarget(fn) { this.areaTargets.push(fn); }

  get left() { return this.infinite ? Infinity : this.count; }
  equip() { if (this.left <= 0 || this.equipped) return false; this.equipped = true; this.cooking = false; this.throwT = -1; this.game.weapons.scoped = false; this.game.weapons.fireDown = false; this.game.audio.play('ui'); return true; }
  unequip() { this.equipped = false; this.cooking = false; this.throwT = -1; this._hidePreview(); }
  refill() { this.count = NADE.count; }
  /** morreu / saiu: sem estado pendurado */
  reset() { this.unequip(); this.hand.visible = this.view.visible = false; }

  throw() {
    if (!this.equipped || this.left <= 0) return;
    const L = launchParams(this.game);
    this.spawn(L.p, L.v, NADE.fuse, true);
    if (!this.infinite) this.count--;
    this.throwT = 0; this._hidePreview();
    this.game.anim?.hit();   // 3ª pessoa: braço do personagem faz o movimento de arremesso
    this.game.online?.net.sendGame({ t: 'ev', e: 'nade', p: L.p.toArray().map(n => +n.toFixed(3)), v: L.v.toArray().map(n => +n.toFixed(3)), f: NADE.fuse });
  }

  /** Granada no mundo. mine = minha (aplica dano); de um amigo online = só visual (o dano vem de quem jogou). */
  spawn(p, v, fuse, mine) {
    const o = this.template.clone(true); o.position.copy(p); this.game.scene.add(o);
    const ax = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
    this.live.push({ s: { p: p.clone(), v: v.clone(), w: ax.multiplyScalar(14), sleep: false, rest: 0, ground: false }, o, t: fuse, mine, acc: 0, exploded: false });
  }
  spawnRemote(m) { if (Array.isArray(m.p) && Array.isArray(m.v)) this.spawn(new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), +m.f || NADE.fuse, false); }

  update(dt) {
    const g = this.game, world = g.world;
    // granadas no mundo (física com passo fixo)
    for (const n of this.live) {
      n.acc += dt;
      while (n.acc >= NADE.substep) {
        n.acc -= NADE.substep;
        const imp = stepNade(n.s, NADE.substep, world);
        if (imp && imp.speed > 1.2) this._sound(imp.point, 'land', Math.min(.5, imp.speed * .06));
      }
      n.o.position.copy(n.s.p);
      const wl = n.s.w.length(); if (wl > 1e-3) { _q.setFromAxisAngle(_w.copy(n.s.w).divideScalar(wl), wl * dt); n.o.quaternion.premultiply(_q); }
      if ((n.t -= dt) <= 0 && !n.exploded) this._explode(n);
    }
    this.live = this.live.filter(n => { if (!n.exploded) return true; g.scene.remove(n.o); return false; });
    this._updateFx(dt);
    // na mão
    const pl = g.player, fp = !!pl?.firstPerson;
    if (this.throwT >= 0) { this.throwT += dt; if (this.throwT >= NADE.handBack) { this.throwT = -1; this.unequip(); if (this.left > 0 && this.infinite) this.equip(); } }
    const holding = this.equipped && this.throwT < 0 && !pl?.dead;
    this._handPose(holding && !fp, dt);
    this._viewPose(holding && fp, dt);
    // prévia (só preparando)
    if (holding && this.cooking) this._preview(); else this._hidePreview();
  }

  /** 3ª pessoa: granada presa na mão direita do personagem */
  _handPose(on, dt) {
    const h = this.hand, a = this.game.avatar; h.visible = !!(on && a);
    if (!h.visible) return;
    if (!this._bone || this._boneOf !== a) { this._boneOf = a; this._bone = null; a.traverse(n => { if (!this._bone && n.isBone && /RightHand$/.test(n.name)) this._bone = n; }); }
    if (!this._bone) { h.visible = false; return; }
    this._bone.updateWorldMatrix(true, false);
    this._bone.getWorldPosition(h.position); this._bone.getWorldQuaternion(h.quaternion);
    h.position.add(_v.set(0, .06, .03).applyQuaternion(h.quaternion));
  }
  /** 1ª pessoa: granada embaixo à direita da tela; ao preparar ela recua (braço armando o arremesso) */
  _viewPose(on, dt) {
    const v = this.view; v.visible = on; if (!on) return;
    const c = this.game.camera, k = this._cookK = THREE.MathUtils.lerp(this._cookK || 0, this.cooking ? 1 : 0, Math.min(1, dt * 10));
    const bob = Math.sin(performance.now() / 260) * .004 * (1 - k);
    v.position.set(.17 + k * .05, -.15 + k * .1 + bob, -.34 + k * .08).applyQuaternion(c.quaternion).add(c.position);
    v.quaternion.copy(c.quaternion).multiply(_q.setFromEuler(new THREE.Euler(-.35 - k * .5, .6, .2)));
  }

  _preview() {
    const g = this.game, P = launchParams(g, this._pv), s = { p: P.p.clone(), v: P.v.clone(), w: new THREE.Vector3(), sleep: false, rest: 0 };
    const pos = this.dots.geometry.attributes.position, N = NADE.previewDots, maxSteps = Math.round(NADE.previewTime / NADE.substep);
    const pts = [s.p.clone()]; let hit = null;
    for (let i = 0; i < maxSteps && !hit; i++) { hit = stepNade(s, NADE.substep, g.world); if (i % 6 === 5 || hit) pts.push(s.p.clone()); }   // mesmos números do arremesso real
    // distribui os pontos ao longo do caminho
    for (let i = 0; i < N; i++) { const q = pts[Math.min(pts.length - 1, Math.round(i / (N - 1) * (pts.length - 1)))]; pos.setXYZ(i, q.x, q.y, q.z); }
    pos.needsUpdate = true; this.dots.geometry.computeBoundingSphere(); this.dots.visible = true;
    if (hit) {
      this.mark.visible = true; this.mark.position.set(hit.point.x + hit.normal.x * .02, hit.point.y + hit.normal.y * .02, hit.point.z + hit.normal.z * .02);
      this.mark.quaternion.setFromUnitVectors(_v.set(0, 0, 1), _w.set(hit.normal.x, hit.normal.y, hit.normal.z));
    } else this.mark.visible = false;
    this.lastPreview = { pts, hit };   // (testes)
  }
  _hidePreview() { this.dots.visible = false; this.mark.visible = false; }

  /* ---------- explosão ---------- */
  _explode(n) {
    n.exploded = true;
    const g = this.game, c = n.s.p.clone(), from = { x: c.x, y: c.y + .15, z: c.z };
    this._sound(c, 'explosion', 1.3);
    this._spawnFx(c);
    const d = Math.hypot(c.x - g.camera.position.x, c.y - g.camera.position.y, c.z - g.camera.position.z);
    this.shakeA = Math.max(this.shakeA, NADE.fx * Math.max(0, 1 - d / 22) * .09); this.shakeT = .55;
    this.lastBlast = { at: c.clone(), hits: [] };
    if (!n.mine) return;   // granada de amigo: o dano é calculado na tela de quem jogou
    const done = new Set();   // cada alvo leva dano uma vez por explosão
    for (const fn of this.areaTargets) for (const t of fn() || []) {
      if (!t || !t.alive || done.has(t.key ?? t)) continue; done.add(t.key ?? t);
      const pts = [{ x: t.pos.x, y: t.pos.y + 1.15, z: t.pos.z }, { x: t.pos.x, y: t.pos.y + 1.6, z: t.pos.z }, { x: t.pos.x, y: t.pos.y + .35, z: t.pos.z }];
      const dist = Math.min(...pts.map(p => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z)));
      if (dist > NADE.dmgRadius) continue;
      const seen = pts.some(p => g.world.hasLOS(from, p));
      const k = dist <= NADE.dmgFull ? 1 : Math.pow(1 - (dist - NADE.dmgFull) / (NADE.dmgRadius - NADE.dmgFull), NADE.dmgCurve);
      const dmg = Math.round(NADE.dmgMax * k * (seen ? 1 : NADE.wallMul));
      this.lastBlast.hits.push({ name: t.name, dist: +dist.toFixed(2), seen, dmg });
      if (dmg > 0) t.hurt(dmg);
    }
  }
  _sound(p, name, gain) {
    const g = this.game, cam = g.camera, dx = p.x - cam.position.x, dz = p.z - cam.position.z, dist = Math.hypot(dx, dz), yaw = g.player?.yaw || 0;
    const pan = dist > .1 ? Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist)) * .8 : 0;
    g.audio.play(name, { gain, pan, dist });
  }
  _spawnFx(c) {
    const T = fxTextures(), sc = this.game.scene, k = NADE.fx, list = [];
    const light = new THREE.PointLight(0xffa850, 60 * k, 16, 2); light.position.copy(c).y += .4; sc.add(light);
    list.push({ o: light, life: .45, upd: (e, t) => { light.intensity = 60 * k * Math.pow(1 - t, 2); } });
    const sprite = (tex, blend, color = 0xffffff) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: blend, color })); sc.add(s); return s; };
    for (let i = 0; i < 7; i++) {   // bola de fogo
      const s = sprite(T.fire, THREE.AdditiveBlending), off = new THREE.Vector3((Math.random() - .5) * .9, Math.random() * .7 + .2, (Math.random() - .5) * .9), size = (1.6 + Math.random() * 1.6) * k;
      s.position.copy(c).add(off.clone().multiplyScalar(.3));
      list.push({ o: s, life: .35 + Math.random() * .3, upd: (e, t) => { s.position.addScaledVector(off, e * 1.2); s.scale.setScalar(size * (.3 + t * .9)); s.material.opacity = 1 - t; } });
    }
    for (let i = 0; i < 12; i++) {   // fumaça
      const s = sprite(T.smoke, THREE.NormalBlending, 0x8a857c), vel = new THREE.Vector3((Math.random() - .5) * 1.4, .5 + Math.random() * .8, (Math.random() - .5) * 1.4), size = 1.6 + Math.random() * 1.8, delay = Math.random() * .15;
      s.position.copy(c).y += .3; s.material.opacity = 0; s.material.rotation = Math.random() * 6.3;
      list.push({ o: s, life: 3 + Math.random() * 1.5, upd: (e, t) => { s.position.addScaledVector(vel, e); vel.multiplyScalar(Math.exp(-e * .9)); s.scale.setScalar(size * (.5 + t * 1.6)); s.material.opacity = (t < delay ? 0 : Math.min(1, (t - delay) * 6)) * (1 - t) * .75; } });
    }
    // faíscas / estilhaços
    const N = Math.round(70 * k), pos = new Float32Array(N * 3), vel = [];
    for (let i = 0; i < N; i++) { pos.set([c.x, c.y + .1, c.z], i * 3); const d = new THREE.Vector3(Math.random() - .5, Math.random() * .9, Math.random() - .5).normalize().multiplyScalar(6 + Math.random() * 10); vel.push(d); }
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: T.spark, size: .14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; sc.add(pts);
    list.push({ o: pts, life: .9, upd: (e, t) => { const a = geo.attributes.position; for (let i = 0; i < N; i++) { vel[i].y -= 9.8 * e; a.setXYZ(i, a.getX(i) + vel[i].x * e, Math.max(c.y - .05, a.getY(i) + vel[i].y * e), a.getZ(i) + vel[i].z * e); } a.needsUpdate = true; pts.material.opacity = 1 - t; } });
    // onda de choque no chão + marca queimada
    const ground = this.game.world.raycast({ x: c.x, y: c.y + .2, z: c.z }, { x: 0, y: -1, z: 0 }, 1.5), gy = ground ? ground.point.y + .015 : c.y - NADE.radius + .015;
    const ring = new THREE.Mesh(new THREE.RingGeometry(.7, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, gy + .01, c.z); sc.add(ring);
    list.push({ o: ring, life: .4, upd: (e, t) => { ring.scale.setScalar(.3 + t * 5.5 * k); ring.material.opacity = .6 * (1 - t); } });
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ map: T.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.set(c.x, gy, c.z); sc.add(scorch);
    list.push({ o: scorch, life: 18, upd: (e, t) => { scorch.material.opacity = t < .8 ? 1 : (1 - t) * 5; } });
    for (const f of list) { f.t = 0; this.fx.push(f); }
  }
  _updateFx(dt) {
    for (const f of this.fx) { f.t += dt; f.upd(dt, Math.min(1, f.t / f.life)); }
    this.fx = this.fx.filter(f => { if (f.t < f.life) return true; this._drop(f.o); return false; });
    if (this.shakeT > 0) this.shakeT -= dt;
  }
  _drop(o) { o.parent?.remove(o); o.geometry?.dispose(); if (o.material) { o.material.dispose(); } }   // texturas são compartilhadas (fxTextures)
  /** tremor da câmera depois da explosão (Game chama antes de desenhar) */
  applyShake(cam) {
    if (this.shakeT <= 0 || this.shakeA <= 0) return;
    const a = this.shakeA * (this.shakeT / .55);
    cam.position.x += (Math.random() - .5) * a; cam.position.y += (Math.random() - .5) * a; cam.position.z += (Math.random() - .5) * a;
    if (this.shakeT <= 0) this.shakeA = 0;
  }
  hud() { return { equipped: this.equipped, cooking: this.cooking, left: this.left, live: this.live.length }; }

  dispose() {
    document.removeEventListener('keydown', this._kd); document.removeEventListener('mousedown', this._md); document.removeEventListener('mouseup', this._mu);
    document.removeEventListener('wheel', this._wh);
    for (const n of this.live) n.o.parent?.remove(n.o); this.live.length = 0;
    for (const f of this.fx) this._drop(f.o); this.fx.length = 0;
    for (const o of [this.hand, this.view]) o.parent?.remove(o);
    this._drop(this.dots); this._drop(this.mark);
  }
}
