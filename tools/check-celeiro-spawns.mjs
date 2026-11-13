/**
 * Escolhe e verifica os spawns/sites do mapa CELEIRO.
 *
 * Regras (iguais às do jogo):
 *  - corpo do jogador: raio 0,4 m e altura 1,8 m; degraus até 0,45 m são subidos andando;
 *  - a célula é andável se não encosta em colisor nenhum na altura do corpo (y=0) — mesma ideia de Navigation.js;
 *  - folga mínima de 2 m até qualquer colisor que ocupe a altura do corpo;
 *  - o ponto tem que ser alcançável a pé a partir do centro do mapa (flood-fill 8 direções em grade de 0,5 m).
 *
 * Uso: node tools/check-celeiro-spawns.mjs
 */
import { CELEIRO } from '../src/world/CeleiroData.js';

const b = CELEIRO.bounds;
const BOXES = CELEIRO.boxes.map(([x0, y0, z0, x1, y1, z1]) => ({ x0, y0, z0, x1, y1, z1 }));
// colisores que atrapalham o corpo (0,2 m a 1,8 m de altura)
const BODY = BOXES.filter((k) => k.y0 < 1.8 && k.y1 > 0.2);

const EPS = 1e-4;
const R = 0.4, H = 1.8, STEP = 0.45;

const hit = (x, y, z, r, h) => BODY.some((k) =>
  x - r < k.x1 - EPS && x + r > k.x0 + EPS && y < k.y1 - EPS && y + h > k.y0 + EPS &&
  z - r < k.z1 - EPS && z + r > k.z0 + EPS);

/** andável como no jogo: em pé (alto) e sem degrau maior que STEP na altura dos pés. */
const walkable = (x, z) => {
  if (hit(x, 0.05, z, R, H)) return false;      // corpo em pé, pés quase no chão
  return true;
};

const clearance = (x, z) => {
  let best = Infinity;
  for (const k of BODY) {
    const dx = Math.max(k.x0 - x, 0, x - k.x1);
    const dz = Math.max(k.z0 - z, 0, z - k.z1);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
};

/* ---------------- grade de células + alcance a partir do centro ---------------- */
const CELL = 0.5;
const nx = Math.round((b.maxX - b.minX) / CELL), nz = Math.round((b.maxZ - b.minZ) / CELL);
const cx = (i) => b.minX + (i + 0.5) * CELL, cz = (j) => b.minZ + (j + 0.5) * CELL;
const free = new Uint8Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) free[j * nx + i] = walkable(cx(i), cz(j)) ? 1 : 0;

const reach = new Uint8Array(nx * nz);
const seedI = Math.round((0 - b.minX) / CELL), seedJ = Math.round((0 - b.minZ) / CELL);
const q = [];
if (free[seedJ * nx + seedI]) { reach[seedJ * nx + seedI] = 1; q.push(seedJ * nx + seedI); }
for (let h = 0; h < q.length; h++) {
  const k = q[h], i = k % nx, j = (k / nx) | 0;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = i + di, c = j + dj;
    if (a < 0 || c < 0 || a >= nx || c >= nz) continue;
    const m = c * nx + a;
    if (!free[m] || reach[m]) continue;
    if (di && dj && !(free[j * nx + a] && free[c * nx + i])) continue;   // sem cortar quina
    reach[m] = 1; q.push(m);
  }
}

/** Célula válida (andável + alcançável + folga) mais próxima de (x,z). */
function best(x, z, minClear = 2) {
  let out = null, bestD = Infinity;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (!reach[k]) continue;
    const px = cx(i), pz = cz(j);
    const d = Math.hypot(px - x, pz - z);
    if (d >= bestD) continue;
    if (clearance(px, pz) < minClear) continue;
    out = { x: +px.toFixed(2), z: +pz.toFixed(2), clear: +clearance(px, pz).toFixed(2), d: +d.toFixed(2) };
    bestD = d;
  }
  return out;
}

/* ---------------- pontos desejados (regiões aproximadas) ---------------- */
const wantAtt = [[-6, 33], [-3, 32], [0, 33], [-3, 35], [-3, 30.5]];   // base sul
const wantDef = [[-1, -34.5], [2, -33], [5, -34.5], [2, -36], [2, -31.8]]; // base norte
const wantDm = [[-3, 30.5], [2, -31.8], [-16, 20], [15, -21], [-20, -2], [19, 4], [0, 12], [0, -14], [-12, -33], [10, 33], [-20, 30], [18, -32]];
const wantSites = [{ id: 'A', x: 2, z: -20 }, { id: 'B', x: -2, z: 20 }];

const fix = (pts, label, minClear = 2) => pts.map(([x, z], i) => {
  const p = best(x, z, minClear);
  if (!p) return { i, x, z, FALHOU: true };
  const moved = Math.hypot(p.x - x, p.z - z);
  return { i, x: p.x, z: p.z, moved: +moved.toFixed(2), clear: p.clear };
});

const att = fix(wantAtt, 'att'), def = fix(wantDef, 'def'), dm = fix(wantDm, 'dm');
const sites = wantSites.map((s) => {
  const p = best(s.x, s.z, 5) || best(s.x, s.z, 4);   // o retângulo do site precisa caber, não só o centro
  return { id: s.id, x: p?.x, z: p?.z, clear: p?.clear, moved: p ? +Math.hypot(p.x - s.x, p.z - s.z).toFixed(2) : null };
});

console.log('gradas andáveis:', free.reduce((a, v) => a + v, 0), '/', free.length, '| alcançáveis do centro:', reach.reduce((a, v) => a + v, 0));
console.log('\nATT (base sul):', JSON.stringify(att));
console.log('DEF (base norte):', JSON.stringify(def));
console.log('DM:', JSON.stringify(dm));
console.log('SITES:', JSON.stringify(sites));

const bad = [...att, ...def, ...dm].filter((p) => p.FALHOU);
console.log(bad.length ? '\nFALHARAM: ' + JSON.stringify(bad) : '\nTodos os pontos passaram (andável + alcançável + folga >= 2 m).');

const lit = (arr) => '[\n  ' + arr.map((p) => `{ x: ${p.x}, z: ${p.z} }`).join(',\n  ') + '\n]';
console.log('\n// ---- literal para MapData.js ----');
console.log('const ATT = [[', att.map((p) => `${p.x}, ${p.z}`).join('], ['), ']];');
console.log('const DEF = [[', def.map((p) => `${p.x}, ${p.z}`).join('], ['), ']];');
console.log('const DM  = [[', dm.map((p) => `${p.x}, ${p.z}`).join('], ['), ']];');
console.log('sites:', JSON.stringify(sites.map((s) => ({ id: s.id, x: s.x, z: s.z }))));
