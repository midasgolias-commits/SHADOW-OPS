/**
 * Mapas do jogo: dados puros (sem Three.js). Eixos: x leste, z sul, y cima. Yaw 0 olha para -z. Piso em y=0.
 * A colisão vem de WarehouseData.js / CeleiroData.js (geradas); o visual é o modelo do mapa (Game._addMapModel / Game._addCeleiro).
 * O antigo "Pátio Industrial" (caixas procedurais) foi removido em 27/10/2026.
 */
import { WAREHOUSE as W } from './WarehouseData.js';
import { CELEIRO as C } from './CeleiroData.js';
import { RANGE } from './RangeData.js';

/** Mapas jogáveis (o id vai no config da partida; o nome é o que aparece na sala). */
export const MAPS = [
  { id: 'warehouse', name: 'WAREHOUSE' },
  { id: 'celeiro', name: 'CELEIRO' }
];

export function buildMapData(id = 'warehouse') {
  return id === 'celeiro' ? buildCeleiroData() : buildWarehouseData();
}


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
