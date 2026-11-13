// tools/celeiro-instances.mjs — contagem headless (Node, sem DOM/WebGL) de instâncias e custo do mapa CELEIRO.
// Uso: node tools/celeiro-instances.mjs
// Lê src/world/CeleiroMap.js (não altera) e usa o three local do projeto de origem (r180); THREE_URL troca o caminho.

const OPS = new URL('../', import.meta.url);
const ORIGIN_THREE = process.env.THREE_URL || 'file:///C:/Users/Coutinho/Desktop/mapa%20vagao/three/build/three.module.js';

const THREE = await import(ORIGIN_THREE);
const { buildCeleiro } = await import(new URL('../src/world/CeleiroMap.js', import.meta.url).href);

const t0 = performance.now();
const map = buildCeleiro(THREE, { textures: false, models: false });
const buildMs = +(performance.now() - t0).toFixed(1);

let tris = 0, meshes = 0, casters = 0;
map.group.updateMatrixWorld(true);
map.group.traverse((o) => {
  if (!o.isMesh) return;
  meshes++; if (o.castShadow) casters++;
  const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
  tris += o.isInstancedMesh ? n * o.count : n;
});

// Triângulos reais dos GLB por categoria (medidos em tools/measure-celeiro.mjs)
const GLB = {
  cont_full: { tri: 6329, mats: 1, meshes: 1, bytes: 931208 },
  cont_mid: { tri: 6329, mats: 1, meshes: 1, bytes: 931208 },
  cont_short: { tri: 6329, mats: 1, meshes: 1, bytes: 931208 },
  boxcar: { tri: 3896, mats: 1, meshes: 1, bytes: 388584 },
  crate: { tri: 605, mats: 1, meshes: 1, bytes: 293540 },
  barrel: { tri: 1079, mats: 1, meshes: 1, bytes: 198940 },
  pallet: { tri: 882, mats: 1, meshes: 1, bytes: 115304 },
  logs: { tri: 1584, mats: 1, meshes: 1, bytes: 790976 },
};

const plan = map.modelPlan;
const rows = Object.entries(plan).map(([k, n]) => ({
  cat: k, inst: n, triUnit: GLB[k]?.tri ?? null,
  triTotal: (GLB[k]?.tri ?? 0) * n,
  drawCalls: GLB[k]?.meshes ?? 0, // InstancedMesh por submalha/categoria
}));

// fallback escondido no navegador (mas ainda em memória/VRAM)
let fbTris = 0, fbMain = 0, fbCast = 0;
map.group.children.filter((o) => o.name.startsWith('fallback_')).forEach((g) => g.traverse((o) => {
  if (!o.isMesh) return;
  const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  fbTris += o.isInstancedMesh ? n * o.count : n; fbMain++; if (o.castShadow) fbCast++;
}));

const modelsTris = rows.reduce((a, r) => a + r.triTotal, 0);
const modelsCalls = rows.reduce((a, r) => a + r.drawCalls, 0);
console.log(JSON.stringify({
  buildMs,
  semModelos: { triangulos: Math.round(tris), drawCallsMain: meshes, drawCallsShadow: casters, total: meshes + casters },
  modelPlan: plan,
  comModelos: {
    triangulos: Math.round(tris - fbTris + modelsTris),
    drawCallsMain: meshes - fbMain + modelsCalls,
    drawCallsShadow: casters - fbCast + rows.filter((r) => r.cat !== 'pallet').length,
  },
  categorias: rows,
  fallback: { triangulos: Math.round(fbTris), meshesMain: fbMain, casters: fbCast },
  downloadModelosMB: +(Object.entries(plan).reduce((a, [k, n]) => a + (GLB[k]?.bytes || 0), 0) / 1048576).toFixed(2),
}, null, 1));
map.dispose?.();
