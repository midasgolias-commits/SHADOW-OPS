import * as THREE from 'three';

/** Caixas de acerto no espaço local do bot (pés na origem, frente = -z). */
const BOXES = [
  { zone: 'limb', min: [-.19, 0, -.14], max: [.19, .8, .14] },       // pernas
  { zone: 'body', min: [-.25, .8, -.17], max: [.25, 1.45, .17] },    // tronco
  { zone: 'limb', min: [-.4, .85, -.12], max: [-.25, 1.4, .12] },    // braço esquerdo
  { zone: 'limb', min: [.25, .85, -.12], max: [.4, 1.4, .12] },      // braço direito
  { zone: 'head', min: [-.13, 1.45, -.13], max: [.13, 1.78, .13] }   // cabeça
];
export const EYE = 1.55;

/** Raio contra o corpo do bot. Retorna { dist, zone } ou null. o, d: {x,y,z}, d normalizado. */
export function rayBody(pos, yaw, o, d, max) {
  // descarte rápido: distância do raio ao eixo do corpo
  const cx = pos.x - o.x, cy = pos.y + .9 - o.y, cz = pos.z - o.z;
  const tc = Math.max(0, Math.min(max, cx * d.x + cy * d.y + cz * d.z));
  const px = o.x + d.x * tc - pos.x, py = o.y + d.y * tc - pos.y - .9, pz = o.z + d.z * tc - pos.z;
  if (px * px + py * py + pz * pz > 1.7) return null;

  const s = Math.sin(yaw), c = Math.cos(yaw), ox = o.x - pos.x, oz = o.z - pos.z;
  const O = [ox * c - oz * s, o.y - pos.y, ox * s + oz * c], D = [d.x * c - d.z * s, d.y, d.x * s + d.z * c];
  let best = null;
  for (const b of BOXES) {
    let t0 = 0, t1 = max, ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      if (Math.abs(D[a]) < 1e-9) { if (O[a] < b.min[a] || O[a] > b.max[a]) ok = false; continue; }
      let ta = (b.min[a] - O[a]) / D[a], tb = (b.max[a] - O[a]) / D[a]; if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) ok = false;
    }
    if (ok && (!best || t0 < best.dist)) best = { dist: t0, zone: b.zone };
  }
  return best;
}

/** Geometria e materiais compartilhados entre todos os bots. */
export class BodyKit {
  constructor() { this.geo = new THREE.BoxGeometry(1, 1, 1); this.mats = new Map(); }
  mat(color) {
    let m = this.mats.get(color);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: .8, metalness: .05 }); this.mats.set(color, m); }
    return m;
  }
  dispose() { this.geo.dispose(); for (const m of this.mats.values()) m.dispose(); this.mats.clear(); }
}

/** Boneco articulado feito de caixas. Retorna { group, legL, legR, armL, armR }. */
export function buildBody(kit, color) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const dark = kit.mat(0x1a1d20), skin = kit.mat(0xb88a68), cloth = kit.mat(color), vest = kit.mat(0x2b3138);
  const box = (parent, w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(kit.geo, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  const pivot = (x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; };

  box(g, .5, .62, .3, 0, 1.13, 0, cloth);          // tronco
  box(g, .53, .26, .33, 0, 1.25, 0, vest);         // colete
  box(g, .24, .26, .24, 0, 1.62, 0, skin);         // cabeça
  box(g, .26, .1, .26, 0, 1.73, 0, dark);          // capacete
  box(g, .2, .07, .05, 0, 1.64, -.125, dark);      // visor
  const legL = pivot(-.1, .8, 0), legR = pivot(.1, .8, 0);
  box(legL, .17, .8, .2, 0, -.4, 0, dark); box(legR, .17, .8, .2, 0, -.4, 0, dark);
  const armL = pivot(-.32, 1.4, 0), armR = pivot(.32, 1.4, 0);
  box(armL, .13, .55, .14, 0, -.27, 0, cloth); box(armR, .13, .55, .14, 0, -.27, 0, cloth);
  box(armR, .06, .46, .09, 0, -.6, 0, dark);       // arma na mão direita (aponta ao longo do braço)
  return { group: g, legL, legR, armL, armR };
}
