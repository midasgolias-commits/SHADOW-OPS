/**
 * Gera src/world/CeleiroData.js a partir do construtor do mapa CELEIRO (src/world/CeleiroMap.js).
 * Roda em Node sem DOM: o construtor devolve os colisores AABB mesmo sem texturas/modelos.
 *
 *   node tools/gen-celeiro-data.mjs
 *
 * Formato gerado: caixas [minX, minY, minZ, maxX, maxY, maxZ] no mesmo padrão de WarehouseData.js,
 * mais as 5 caixas de apoio (base sob o piso + 4 paredes invisíveis no limite do mapa).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildCeleiro } from '../src/world/CeleiroMap.js';

// o construtor precisa de um THREE; usamos a cópia r180 que veio junto do projeto do mapa
const THREE_URL = process.env.THREE_URL || 'file:///C:/Users/Coutinho/Desktop/mapa%20vagao/three/build/three.module.js';
const THREE = await import(THREE_URL);

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/world/CeleiroData.js');

const map = buildCeleiro(THREE, { textures: false, models: false });
const { colliders, bounds } = map;

const b = {
  minX: bounds.xMin, maxX: bounds.xMax,
  minZ: bounds.zMin, maxZ: bounds.zMax
};

const round = (v) => Math.round(v * 1000) / 1000;
const boxes = colliders.map((c) => [
  round(c.x - c.w / 2), round(c.y), round(c.z - c.d / 2),
  round(c.x + c.w / 2), round(c.y + c.h), round(c.z + c.d / 2)
]);

// apoio: base sólida sob o piso (o jogo não tem "chão infinito") + 4 paredes invisíveis no limite
const PAD = 0.5, WALL_T = 1, WALL_H = 8;
boxes.push([round(b.minX - PAD), -2, round(b.minZ - PAD), round(b.maxX + PAD), 0, round(b.maxZ + PAD)]);
boxes.push([round(b.minX - WALL_T), 0, round(b.minZ - WALL_T), round(b.minX), WALL_H, round(b.maxZ + WALL_T)]);
boxes.push([round(b.maxX), 0, round(b.minZ - WALL_T), round(b.maxX + WALL_T), WALL_H, round(b.maxZ + WALL_T)]);
boxes.push([round(b.minX - WALL_T), 0, round(b.minZ - WALL_T), round(b.maxX + WALL_T), WALL_H, round(b.minZ)]);
boxes.push([round(b.minX - WALL_T), 0, round(b.maxZ), round(b.maxX + WALL_T), WALL_H, round(b.maxZ + WALL_T)]);

const fmtBoxes = boxes.map((x) => '[' + x.join(',') + ']').join(',');

const js = `/** Dados gerados a partir de src/world/CeleiroMap.js (colisores do mapa "Celeiro"). Não editar à mão:
 * rode \`node tools/gen-celeiro-data.mjs\`. */
export const CELEIRO = {
  y0: 0,
  bounds: ${JSON.stringify(b)},
  navSeed: { x: 0, z: 0 },
  // caixas de colisão [minX, minY, minZ, maxX, maxY, maxZ]; as 5 últimas são a base sob o piso e as paredes invisíveis do limite
  boxes: [${fmtBoxes}]
};
`;

writeFileSync(out, js, 'utf8');
console.log('colisores do mapa:', colliders.length, '| caixas no total:', boxes.length);
console.log('bounds:', JSON.stringify(b));
console.log('gerado:', out);
