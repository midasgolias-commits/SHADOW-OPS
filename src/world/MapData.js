/**
 * Mapas do jogo: dados puros (sem Three.js). Eixos: x leste, z sul, y cima. Yaw 0 olha para -z. Piso em y=0.
 * A colisão vem de WarehouseData.js / CeleiroData.js (geradas); o visual é o modelo do mapa (Game._addMapModel / Game._addCeleiro).
 * O antigo "Pátio Industrial" (caixas procedurais) foi removido em 27/10/2026.
 */
import { WAREHOUSE as W } from './WarehouseData.js';
import { CELEIRO as C } from './CeleiroData.js';
import { RANGE } from './RangeData.js';
import { FAVELA as F } from './FavelaData.js';

/** Mapas jogáveis (o id vai no config da partida; o nome é o que aparece na sala). */
export const MAPS = [
  { id: 'favela', name: 'FAVELA' },
  { id: 'warehouse', name: 'WAREHOUSE' },
  { id: 'celeiro', name: 'CELEIRO' }
];

export function buildMapData(id = 'warehouse') {
  return id === 'favela' ? buildFavelaData() : id === 'celeiro' ? buildCeleiroData() : buildWarehouseData();
}

/**
 * FAVELA: trecho do mapa FavelaRJ (feito na Unreal), da avenida do canal até o alto perto da escola. Morro: o piso NÃO fica em y=0.
 * Colisão em FavelaData.js (gerada por FavelaRJ_UE/Web/tools/shadowops-favela.mjs): caixas das casas/vias/valão + terreno
 * como mapa de alturas (CollisionWorld.setTerrain) + piso por célula para os bots (Navigation em 2,5D).
 * Visual: src/world/FavelaMap.js (GLBs simplificados em assets/maps/favela). A Polícia ('att') sobe da avenida; o Bandido ('def') segura o alto.
 */
let favelaCache = null;
const i16 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Int16Array(u.buffer); };
function buildFavelaData() {
  if (!favelaCache) {   // decodifica uma vez (117 mil caixas e duas grades de 175 mil pontos)
    const A = F.arena, B = i16(F.boxes), T = i16(F.terrain), FL = i16(F.floor);
    const boxes = new Array(F.boxCount);
    for (let n = 0; n < F.boxCount; n++) {
      const o = n * 6;
      boxes[n] = { min: { x: A.minX + B[o] / 100, y: B[o + 1] / 100, z: A.minZ + B[o + 2] / 100 },
        max: { x: A.minX + B[o + 3] / 100, y: B[o + 4] / 100, z: A.minZ + B[o + 5] / 100 }, tag: 'concrete' };
    }
    // grade invisível na beira do rio: segura o corpo (não cai no canal), deixa passar tiro e granada
    const G = i16(F.blockers);
    for (let n = 0; n < F.blockerCount; n++) {
      const o = n * 6;
      boxes.push({ min: { x: A.minX + G[o] / 100, y: G[o + 1] / 100, z: A.minZ + G[o + 2] / 100 },
        max: { x: A.minX + G[o + 3] / 100, y: G[o + 4] / 100, z: A.minZ + G[o + 5] / 100 }, tag: 'blocker', kind: 'floor' });
    }
    const grid = arr => Float32Array.from(arr, v => v === -32768 ? NaN : v / 100);
    favelaCache = { boxes, terrain: { minX: A.minX, minZ: A.minZ, cell: F.cell, nx: F.nx, nz: F.nz, h: grid(T) }, floor: grid(FL) };
  }
  const { terrain, floor } = favelaCache, A = F.arena;
  // Piso de pé (rua, escada, laje do térreo) em (x,z): o ponto da grade mais próximo.
  const floorAt = (x, z) => {
    const i = Math.round((x - A.minX) / F.cell), k = Math.round((z - A.minZ) / F.cell);
    return i < 0 || k < 0 || i >= F.nx || k >= F.nz ? NaN : floor[k * F.nx + i];
  };
  // Paredes invisíveis no limite da arena (do fundo do canal até bem acima dos telhados).
  const walls = [[A.minX - 1, A.minZ, A.minX, A.maxZ], [A.maxX, A.minZ, A.maxX + 1, A.maxZ], [A.minX - 1, A.minZ - 1, A.maxX + 1, A.minZ], [A.minX - 1, A.maxZ, A.maxX + 1, A.maxZ + 1]]
    .map(([x0, z0, x1, z1]) => ({ min: { x: x0, y: -10, z: z0 }, max: { x: x1, y: 90, z: z1 }, tag: 'concrete', kind: 'floor' }));
  const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  const pt = (x, z, tx, tz) => ({ x, y: floorAt(x, z), z, yaw: yawTo(x, z, tx, tz) });
  // Pontos conferidos por tools/check-favela-spawns.mjs (andável, alcançável e com folga).
  const ATT = FAVELA_SPAWNS.att.map(([x, z]) => pt(x, z, -50, 250));
  const DEF = FAVELA_SPAWNS.def.map(([x, z]) => pt(x, z, -50, 300));
  const DM = FAVELA_SPAWNS.dm.map(([x, z]) => ({ x, y: floorAt(x, z), z }));
  const sites = FAVELA_SITES.map(s => ({ ...s, y: floorAt(s.x, s.z) }));
  return {
    name: 'FAVELA', visual: 'favela', y0: 0, navCell: .5, navSeed: ATT[0], floorAt,
    terrain, bounds: { minX: A.minX, maxX: A.maxX, minZ: A.minZ, maxZ: A.maxZ },
    boxes: favelaCache.boxes.concat(walls),
    sites, labels: [],
    zones: FAVELA_ZONES,
    spawns: { attackers: ATT, defenders: DEF, dm: DM }
  };
}
// Nascimentos, sites e zonas da FAVELA (x, z em metros; a altura vem do piso). Ataque = Polícia, na avenida do canal; defesa = Bandido, no alto.
// Rotas a pé (tools/check-favela-spawns.mjs): Polícia → A 123 m, → B 161 m (passa pela ponte da Estrada); Bandido → A 88 m, → B 28 m.
const FAVELA_SPAWNS = {
  att: [[-55, 373], [-57, 370], [-52, 373], [-53, 368], [-60, 372]],   // avenida do canal, perto da ponte
  def: [[-86, 243], [-86, 246], [-78, 237], [-97, 240], [-99, 242]],   // meio do morro, entre os sites
  dm: [[-139, 267], [-22, 372], [-34, 159], [-139, 375], [-19, 267], [-145, 165], [-79, 312], [-76, 210], [-82, 369], [-127, 216], [-82, 261], [-94, 165]]
};
const FAVELA_SITES = [{ id: 'A', x: -60, z: 280, w: 8, d: 6 }, { id: 'B', x: -112, z: 250, w: 8, d: 6 }];   // A: praça; B: laje plana a oeste
const FAVELA_ZONES = [{ team: 'att', x0: -63, z0: 366, x1: -49, z1: 377 }, { team: 'def', x0: -102, z0: 234, x1: -74, z1: 249 }];

function buildWarehouseData() {
  const n = W.boxes.length, last = n - 5;   // as 5 últimas: base sob o piso + 4 paredes invisíveis
  const boxes = W.boxes.map((b, i) => ({
    min: { x: b[0], y: b[1], z: b[2] }, max: { x: b[3], y: b[4], z: b[5] }, tag: 'concrete',
    kind: i >= last ? 'floor' : undefined   // 'floor' = não aparece no minimapa
  }));
  const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  const att = W.spawns.att.map(([x, z]) => ({ x, z, yaw: yawTo(x, z, 0, z) }));
  const def = W.spawns.def.map(([x, z]) => ({ x, z, yaw: yawTo(x, z, 0, z) }));
  const dm = W.spawns.dm.map(([x, z]) => ({ x, z }));
  return {
    name: 'WAREHOUSE', glb: 'assets/maps/warehouse.glb', y0: W.y0, navCell: .5, navSeed: W.navSeed,
    bounds: W.bounds, boxes,
    sites: [{ id: 'A', x: 20, z: -21, w: 8, d: 6 }, { id: 'B', x: -14, z: 12, w: 8, d: 6 }],
    labels: [],
    zones: [{ team: 'att', x0: -39.5, z0: -10, x1: -31, z1: 10 }, { team: 'def', x0: 31, z0: -10, x1: 39.5, z1: 10 }],
    spawns: { attackers: att, defenders: def, dm }
  };
}

/**
 * CELEIRO: pátio com galpão (celeiro), containers, vagões, toras, caixotes, torres e muro com grade.
 * Colisão em CeleiroData.js (gerada de CeleiroMap.js); o visual é construído por CeleiroMap.js (GLB + geometria própria).
 */
function buildCeleiroData() {
  const n = C.boxes.length, last = n - 5;   // as 5 últimas: base sob o piso + 4 paredes invisíveis
  const boxes = C.boxes.map((b, i) => ({
    min: { x: b[0], y: b[1], z: b[2] }, max: { x: b[3], y: b[4], z: b[5] }, tag: 'concrete',
    kind: i >= last ? 'floor' : undefined
  }));
  const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

  // bases: norte (z ~ -34) e sul (z ~ +32); o time 'att' ataca a partir do sul, 'def' defende o norte
  // pontos verificados por tools/check-celeiro-spawns.mjs (andável, alcançável a pé e com folga >= 2 m)
  const ATT = [[-6.08, 33.08], [-3.08, 32.08], [-0.08, 33.08], [-2.08, 33.58], [-4.08, 30.58]];
  const DEF = [[-1.08, -34.42], [1.92, -32.92], [4.92, -34.42], [0.92, -34.92], [1.92, -31.92]];
  const DM = [
    [-4.08, 30.58], [1.92, -31.92], [-15.58, 20.08], [14.42, -20.92], [-19.08, -1.92], [16.42, 1.08],
    [-0.08, 12.58], [-0.08, -13.92], [-8.58, -32.92], [6.42, 33.08], [-13.58, 24.58], [11.92, -25.42]
  ];
  const att = ATT.map(([x, z]) => ({ x, z, yaw: yawTo(x, z, 2, -34) }));
  const def = DEF.map(([x, z]) => ({ x, z, yaw: yawTo(x, z, -3, 32) }));
  const dm = DM.map(([x, z]) => ({ x, z }));

  return {
    name: 'CELEIRO', visual: 'celeiro', y0: 0, navCell: .5, navSeed: C.navSeed,
    bounds: C.bounds, boxes,
    sites: [{ id: 'A', x: 5.92, z: -13.92, w: 6, d: 4 }, { id: 'B', x: -3.08, z: 13.58, w: 6, d: 4 }],
    labels: [],
    zones: [{ team: 'att', x0: -8, z0: 28, x1: 2, z1: 37 }, { team: 'def', x0: -4, z0: -38, x1: 7, z1: -29 }],
    spawns: { attackers: att, defenders: def, dm }
  };
}

/** Mapa do TREINO: stand de tiro (assets/maps/shooting_range). Colisão em RangeData.js; o visual é o FBX (Assets.loadRange). */
export function buildRangeData() {
  const R = RANGE, n = R.boxes.length, last = n - 5;
  const boxes = R.boxes.map((b, i) => ({
    min: { x: b[0], y: b[1], z: b[2] }, max: { x: b[3], y: b[4], z: b[5] }, tag: 'concrete',
    kind: i >= last || b[1] >= 2 ? 'floor' : undefined   // laje, limites e teto não aparecem no minimapa
  }));
  const sp = { ...R.spawn };
  return {
    name: 'STAND DE TIRO', model: 'range', y0: 0, navCell: .5, navSeed: R.navSeed,
    bounds: R.bounds, boxes, sites: [], labels: [], zones: [], indoor: true,
    range: R,   // posições do treino (baias, botão do menu, bots)
    spawns: { attackers: [sp], defenders: [sp], dm: [sp] }
  };
}
