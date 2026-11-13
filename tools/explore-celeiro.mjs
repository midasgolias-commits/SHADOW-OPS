// tools/explore-celeiro.mjs — mapa ASCII de áreas livres do CELEIRO (diagnóstico, somente leitura).
// Uso: node tools/explore-celeiro.mjs
// Imprime, em grade de 1 m: '#' = colide com o corpo do jogador (r 0.4, alt 1.8),
// 'x' = andável mas com menos de 2 m de folga de colisores, '.' = livre com folga >= 2 m.
import { fileURLToPath } from 'node:url';

const THREE_URL = process.env.THREE_URL || 'file:///C:/Users/Coutinho/Desktop/mapa%20vagao/three/build/three.module.js';
const THREE = await import(THREE_URL);
const { buildCeleiro } = await import(new URL('../src/world/CeleiroMap.js', import.meta.url).href);

const m = buildCeleiro(THREE, { textures: false, models: false });
const { colliders, bounds } = m;
console.log('colisores:', colliders.length, '| bounds:', JSON.stringify(bounds));

const R = 0.4;
const H = 1.8;
// só colisores que o corpo do jogador (pés em y=0) pode encostar
const solids = colliders.filter((c) => c.y < H && c.y + c.h > 0);

const rect = (c) => [c.x - c.w / 2, c.z - c.d / 2, c.x + c.w / 2, c.z + c.d / 2];
const distToRect = (px, pz, r) => {
  const dx = Math.max(r[0] - px, 0, px - r[2]);
  const dz = Math.max(r[1] - pz, 0, pz - r[3]);
  return Math.hypot(dx, dz);
};
const STATS = solids.map((c) => ({ ...c, box: rect(c) }));
const scan = (x, z) => {
  let min = Infinity;
  for (const s of STATS) {
    const d = distToRect(x, z, s.box);
    if (d < min) min = d;
    if (min === 0) break;
  }
  return { min, blocked: min < R };
};

const x0 = Math.ceil(bounds.xMin), x1 = Math.floor(bounds.xMax);
const z0 = Math.ceil(bounds.zMin), z1 = Math.floor(bounds.zMax);
const rows = [];
for (let z = z0; z <= z1; z++) {
  let line = '';
  for (let x = x0; x <= x1; x++) {
    if (x <= bounds.xMin + 2 || x >= bounds.xMax - 2 || z <= bounds.zMin + 2 || z >= bounds.zMax - 2) {
      // ainda pode ser andável (ex.: dentro do galpão); marca só a borda externa
    }
    const r = scan(x, z);
    line += r.blocked ? '#' : r.min < 2 ? 'x' : '.';
  }
  rows.push(String(z).padStart(4) + ' ' + line);
}
let head = '     ';
for (let x = x0; x <= x1; x++) head += x % 10 === 0 ? '|' : (x % 5 === 0 ? '+' : ' ');
console.log(head);
for (const r of rows) console.log(r);
let head2 = '     ';
for (let x = x0; x <= x1; x++) head2 += x % 10 === 0 ? String(Math.abs(x) / 10 | 0) : ' ';
console.log(head2);
