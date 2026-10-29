import * as THREE from 'three';

/**
 * Clarão na ponta do cano (texturas em assets/fx/muzzle: A risco, B cone, C chama em anel, D faíscas, E chama cheia).
 * Duas chamas cruzadas ao longo do cano (aparecem de qualquer lado) + brilho redondo virado para a frente
 * (aparece mirando pelo cano) + faíscas. Cada tiro sorteia forma, giro e tamanho.
 * Tiro único: clarão maior e um pouco mais longo. Tiro segurado (automático): clarões menores e rápidos.
 */
const DIR = 'assets/fx/muzzle/';
let TEX = null, GLOW = null, PLANE = null, DISC = null;
function shared() {
  if (TEX) return;
  const tl = new THREE.TextureLoader();
  TEX = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map(k => { const t = tl.load(DIR + k + '.png'); t.colorSpace = THREE.SRGBColorSpace; return [k, t]; }));
  // brilho redondo (desenhado aqui, sem arquivo)
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,250,225,1)'); r.addColorStop(.25, 'rgba(255,200,90,.9)'); r.addColorStop(.6, 'rgba(255,110,20,.35)'); r.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  GLOW = new THREE.CanvasTexture(c); GLOW.colorSpace = THREE.SRGBColorSpace;
  // plano com a base da textura na origem e a ponta da chama em +Z (direção do cano)
  PLANE = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0).rotateX(Math.PI / 2);
  DISC = new THREE.PlaneGeometry(1, 1);
}
const mat = map => new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });

/** Tamanho do clarão por arma (comprimento da chama em metros). */
const SIZE = { rifle: .34, aug: .34, smg: .26, sniper: .5, shotgun: .48, pistol: .22 };

export class MuzzleFlash {
  /** light: true acende uma luz rápida (só para o jogador; nos bots ficaria caro). */
  constructor({ light = false } = {}) {
    if (typeof document === 'undefined') { this.group = null; return; }   // testes em Node: sem efeito
    shared();
    this.group = new THREE.Group(); this.group.visible = false; this.group.userData.instance = true;
    this.mats = [mat(TEX.E), mat(TEX.E), mat(GLOW), mat(TEX.D), mat(TEX.D)];
    const [m1, m2, mg, ms1, ms2] = this.mats;
    m1.color.setRGB(2, 1.7, 1.4); m2.color.setRGB(2, 1.7, 1.4); mg.color.setRGB(1.6, 1.4, 1.2);   // mais forte (somado à cena, sem o "achatamento" de cor)
    this.f1 = new THREE.Mesh(PLANE, m1); this.f2 = new THREE.Mesh(PLANE, m2); this.f2.rotation.z = Math.PI / 2;
    this.glow = new THREE.Mesh(DISC, mg);
    this.s1 = new THREE.Mesh(PLANE, ms1); this.s2 = new THREE.Mesh(PLANE, ms2); this.s2.rotation.z = Math.PI / 2;
    this.flame = new THREE.Group(); this.flame.add(this.f1, this.f2, this.s1, this.s2);
    this.group.add(this.flame, this.glow);
    for (const m of [this.f1, this.f2, this.glow, this.s1, this.s2]) { m.renderOrder = 5; m.frustumCulled = false; }
    if (light) { this.light = new THREE.PointLight(0xffa040, 0, 4, 2); this.group.add(this.light); }
    this.t = 0; this.max = 1;
  }
  /** Prende na arma (objeto já normalizado: +Z = cano) na posição da boca do cano. */
  attach(weapon) {
    if (!this.group) return;
    this.group.removeFromParent(); this.group.visible = false;
    if (!weapon?.userData.muzzle) return;
    const m = weapon.userData.muzzle; this.group.position.set(m.x, m.y, m.z + .005);
    weapon.add(this.group);
  }
  /** Um tiro. id: arma (tamanho); auto: segurando o gatilho; small: mirando pela arma (clarão menor, não tapa a mira). */
  fire(id, auto = false, small = false) {
    if (!this.group?.parent) return;
    const L = (SIZE[id] ?? .3) * (auto ? .78 : 1.15) * (small ? .55 : 1) * (.85 + Math.random() * .3);
    const W = L * (.42 + Math.random() * .12);
    // forma sorteada: chama cheia (mais comum), cone ou chama em anel
    const r = Math.random(), tex = r < .55 ? TEX.E : r < .85 ? TEX.B : TEX.C;
    this.f1.material.map = tex; this.f2.material.map = Math.random() < .5 ? tex : TEX.E;
    this.f1.scale.set(W, 1, L); this.f2.scale.set(W * .85, 1, L * .9);
    this.flame.rotation.z = Math.random() * Math.PI;
    // faíscas: no tiro único quase sempre; segurando, de vez em quando
    const sp = !auto ? Math.random() < .8 : Math.random() < .3;
    this.s1.visible = this.s2.visible = sp; this.s1.scale.set(W * 1.3, 1, L * 1.5); this.s2.scale.set(W * 1.3, 1, L * 1.4);
    const g = L * (auto ? .8 : 1.05); this.glow.scale.set(g, g, 1); this.glow.rotation.z = Math.random() * 6.28;
    this.max = this.t = auto ? .045 : .07;
    this.group.visible = true; this._apply(1);
    if (this.light) this.light.intensity = auto ? 2.2 : 3.2;
  }
  _apply(k) {
    const o = Math.min(1, k * 1.6);   // fica cheio no começo e apaga no fim
    for (const m of this.mats) m.opacity = o;
    this.flame.scale.setScalar(1 + (1 - k) * .25);
  }
  update(dt) {
    if (!this.group?.visible) return;
    this.t -= dt;
    if (this.t <= 0) { this.group.visible = false; if (this.light) this.light.intensity = 0; return; }
    const k = this.t / this.max; this._apply(k); if (this.light) this.light.intensity *= .7;
  }
  dispose() { if (!this.group) return; this.group.removeFromParent(); for (const m of this.mats) m.dispose(); }
}
