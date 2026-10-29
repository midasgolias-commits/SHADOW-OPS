/**
 * Desenho da 1ª pessoa em duas camadas (como nos jogos de tiro):
 *  1) o mundo, com a câmera de mira (sempre nivelada; a mira é o centro dela);
 *  2) por cima, só os braços e a arma (vm), com a câmera do "viewmodel" (posição/ângulo/zoom ajustados no Lab).
 * Assim o ângulo da arma na tela não inclina o mapa.
 * vm: objetos de primeiro nível da cena que formam o viewmodel (personagem e o grupo da arma); hide: coisas que não aparecem.
 */
export function renderFirstPerson(renderer, scene, worldCam, vmCam, vm, hide = []) {
  const top = scene.children, prev = top.map(o => o.visible);
  for (const o of hide) o.visible = false;
  for (const o of vm) o.visible = false;
  renderer.render(scene, worldCam);
  for (const o of top) if (!o.isLight && !vm.includes(o)) o.visible = false;
  for (const o of vm) o.visible = true;
  const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth();
  renderer.render(scene, vmCam);
  renderer.autoClear = ac;
  top.forEach((o, i) => { o.visible = prev[i]; });
}
