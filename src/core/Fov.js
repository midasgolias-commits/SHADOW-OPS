/** O "campo de visão" das configurações é HORIZONTAL (como nos jogos de tiro). A câmera do Three.js usa o VERTICAL. */
export const vfov = (hDeg, aspect) => 2 * Math.atan(Math.tan(hDeg * Math.PI / 360) / Math.max(.2, aspect)) * 180 / Math.PI;
