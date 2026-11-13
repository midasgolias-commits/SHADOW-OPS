// Confere e sugere nascimentos e sites da FAVELA: andável, alcançável a pé a partir da Polícia e com folga.
//   node tools/check-favela-spawns.mjs
// Cole os valores sugeridos em FAVELA_SPAWNS / FAVELA_SITES (src/world/MapData.js) e rode de novo para conferir.
import { buildMapData } from '../src/world/MapData.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { Navigation } from '../src/world/Navigation.js';

const t0 = Date.now();
const map = buildMapData('favela');
const world = new CollisionWorld();
for (const b of map.boxes) world.addBox(b.min, b.max, b.tag);
world.setTerrain(map.terrain);
const nav = new Navigation(world, map.bounds, map.navSeed, map.navCell, map.floorAt);
let andaveis = 0, alcancaveis = 0;
for (let k = 0; k < nav.walk.length; k++) { andaveis += nav.walk[k]; alcancaveis += nav.reach[k]; }
console.log(`navegação ${nav.nx}x${nav.nz}: ${andaveis} andáveis, ${alcancaveis} alcançáveis a partir da Polícia (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// folga: todas as células num raio r andáveis, alcançáveis e quase no mesmo nível
function folga(x, z, r = 1.5, dy = .5) {
  const k0 = nav.index(x, z); if (k0 < 0 || !nav.reach[k0]) return false;
  const y0 = nav.fy[k0];
  for (let a = -r; a <= r; a += nav.cell) for (let b = -r; b <= r; b += nav.cell) {
    if (a * a + b * b > r * r) continue;
    const k = nav.index(x + a, z + b); if (k < 0 || !nav.reach[k] || Math.abs(nav.fy[k] - y0) > dy) return false;
  }
  return true;
}
const confere = (nome, l) => l.forEach(([x, z]) => console.log(`  ${nome} ${x},${z}: ${folga(x, z) ? 'ok' : 'FALHA'} piso ${nav.floorY(x, z).toFixed(2)}`));

// candidatos numa faixa, espalhados (o mais longe dos já escolhidos), perto de um alvo
function escolhe(x0, z0, x1, z1, n, alvo, sep = 3) {
  const c = [];
  for (let z = z0; z <= z1; z += 1) for (let x = x0; x <= x1; x += 1) if (folga(x, z, 2)) c.push([x, z]);
  c.sort((p, q) => Math.hypot(p[0] - alvo[0], p[1] - alvo[1]) - Math.hypot(q[0] - alvo[0], q[1] - alvo[1]));
  const out = [];
  for (const p of c) { if (out.every(q => Math.hypot(p[0] - q[0], p[1] - q[1]) >= sep)) out.push(p); if (out.length >= n) break; }
  return out;
}
function site(alvo, w, d, raio = 18) {
  let best = null;
  for (let z = alvo[1] - raio; z <= alvo[1] + raio; z += 1) for (let x = alvo[0] - raio; x <= alvo[0] + raio; x += 1) {
    let ok = true, lo = 1e9, hi = -1e9;
    for (let a = -w / 2; a <= w / 2 && ok; a += .5) for (let b = -d / 2; b <= d / 2; b += .5) {
      const k = nav.index(x + a, z + b); if (k < 0 || !nav.reach[k]) { ok = false; break; } lo = Math.min(lo, nav.fy[k]); hi = Math.max(hi, nav.fy[k]);
    }
    if (!ok || hi - lo > 1.2) continue;
    const dist = Math.hypot(x - alvo[0], z - alvo[1]);
    if (!best || dist < best.dist) best = { x, z, dist, dy: hi - lo };
  }
  return best;
}
const dm = (n) => {   // espalhados pela arena: o ponto alcançável mais longe dos já escolhidos
  const c = []; for (let z = map.bounds.minZ + 4; z < map.bounds.maxZ - 4; z += 3) for (let x = map.bounds.minX + 4; x < map.bounds.maxX - 4; x += 3) if (folga(x, z, 1.5)) c.push([x, z]);
  const out = [c[Math.floor(c.length / 2)]];
  while (out.length < n) { let bp = null, bd = -1; for (const p of c) { const d = Math.min(...out.map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))); if (d > bd) { bd = d; bp = p; } } out.push(bp); }
  return out;
};

console.log('\nATUAIS:');
confere('att', map.spawns.attackers.map(p => [p.x, p.z]));
confere('def', map.spawns.defenders.map(p => [p.x, p.z]));
confere('dm ', map.spawns.dm.map(p => [p.x, p.z]));
for (const s of map.sites) console.log(`  site ${s.id} ${s.x},${s.z}:`, site([s.x, s.z], s.w, s.d, 0) ? 'ok' : 'FALHA');

console.log('\nSUGESTÃO:');
console.log('att:', JSON.stringify(escolhe(-110, 364, 10, 380, 5, [-55, 372])));
console.log('def:', JSON.stringify(escolhe(-90, 158, 10, 190, 5, [-40, 172])));
console.log('dm: ', JSON.stringify(dm(12)));
for (const s of map.sites) { const r = site([s.x, s.z], s.w, s.d); console.log(`site ${s.id}:`, r ? `x ${r.x} z ${r.z} (a ${r.dist.toFixed(1)} m do alvo, desnível ${r.dy.toFixed(2)} m)` : 'nenhum lugar plano por perto'); }
const path = nav.findPath(map.spawns.attackers[0], map.spawns.defenders[0]);
console.log('\ncaminho Polícia -> Bandido:', path ? `${path.length} pontos` : 'NÃO EXISTE');
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
