/**
 * Mapa "WAREHOUSE": dados puros (sem Three.js). Eixos: x leste, z sul, y cima. Yaw 0 olha para -z. Piso em y=0.
 * A colisão vem de WarehouseData.js (gerada do GLB); o visual é o próprio GLB (MapBuilder carrega via Assets).
 * O antigo "Pátio Industrial" (caixas procedurais) foi removido em 27/10/2026.
 */
import { WAREHOUSE as W } from './WarehouseData.js';
import { RANGE } from './RangeData.js';

export function buildMapData() {
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
