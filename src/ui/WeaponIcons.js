/**
 * Ícones das armas em SVG (desenho próprio, só contorno). Cor via currentColor.
 * viewBox 0 0 200 64: todas as armas apontam para a direita, alinhadas pelo cabo.
 */
const P = {
  rifle: 'M8 30h22l4-6h70l3-4h46v4h34v6h-34v5h-22l-6 4h-14l-3 14h-12l2-14h-20l-10 18h-14l8-18h-16l-10 6H8z M70 24v-6h26v6 M118 20v-5h8v5',
  aug: 'M10 34h18l6-8h42l6-4h24v-8h42v8h26v4h16v6h-16v4h-44l-6 6h-12l-6 18h-12l6-18h-14l-5 14h-11l3-14h-14l-6 6H10z M92 14v-5h40v5',   // bullpup com luneta
  smg: 'M30 26h18l3-6h56l6 6h40v6h-34l-4 6h-20l-8 18h-14l6-18h-10l-4 22h-12l3-22h-8l-12 6H30z M64 20v-6h22v6 M150 26v-4h12',
  sniper: 'M4 30h26l4-5h54l3-3h60v3h50v5h-50v4h-22l-4 4h-16l-6 12h-12l4-12h-16l-12 8H4z M60 22v-10h52v10 M54 14h64 M124 38v12h8V38',
  shotgun: 'M10 30h24l4-5h64l4-3h82v6h-82v4h18v6h-30l-6 4h-12l-8 16h-14l6-16h-12l-12 8H10z M108 38h40',
  pistol: 'M54 18h96v10h-6v4h-34l-4 4h-12l-8 26H64l8-26H54z M150 18v-4h6v4 M92 32a6 6 0 0 0 12 0',
  knife: 'M30 34h40l6-6h10v14H76l-6-4H30a4 4 0 0 1 0-4z M86 28c30-2 64 0 96 4-28 6-62 8-96 8z',
  grenade: 'M92 12h16v8h-16z M84 20h32v6H84z M100 26a26 24 0 1 1-.1 0z M116 22c14 0 26 8 30 22l-6 2c-4-10-12-16-24-16z M86 42h28 M86 54h28',
  karambit: 'M40 30a10 10 0 1 1 0 .1z M50 34h34l6-4h8v12H90l-6-4H50z M98 30c30-14 62-10 84 8-26-8-54-8-82 2z'
};
/** Símbolo de tiro na cabeça (alvo com marca), também em contorno. */
const HEAD = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="30" r="16"/><path d="M32 6v12M32 42v14M8 30h12M44 30h12"/><circle cx="32" cy="30" r="4" class="fill"/></svg>';

export function weaponIcon(id, cls = '') {
  const d = P[id] || P.rifle;
  return `<svg class="wicon ${cls}" viewBox="0 0 200 64" aria-hidden="true"><path d="${d}"/></svg>`;
}
export const headIcon = () => HEAD.replace('<svg', '<svg class="hicon"');
