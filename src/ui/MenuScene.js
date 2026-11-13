import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Cenário 3D do menu iniciar: canto de um galpão à noite.
 * O personagem fica em (0,0,0), pisando no chão de concreto e fazendo sombra.
 * Camadas: perto (pallet, barris), meio (caixas, contêiner), fundo (parede, porta de enrolar, pilares, vigas do teto).
 * Modelos e texturas reaproveitados do mapa CELEIRO; detalhes industriais (canos, faixas, placas) feitos em código.
 * Sem feixe de luz visível e sem faíscas (pedido do usuário).
 */
const C = 'assets/maps/celeiro/';
const texLoader = new THREE.TextureLoader();
function pbr(dir, rep, opts = {}) {
  const t = (f, srgb) => {
    const x = texLoader.load(C + 'textures/' + dir + '/' + f);
    x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(rep[0], rep[1]); x.anisotropy = 4;
    if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x;
  };
  return new THREE.MeshStandardMaterial({ map: t('color.jpg', true), normalMap: t('normal.jpg'), roughnessMap: t('rough.jpg'), roughness: 1, metalness: 0, ...opts });
}

/** coloca um GLB com o tamanho (maior lado) pedido, apoiado no chão */
function prop(scene, file, size, x, z, ry = 0, y = 0, shadow = true) {
  new GLTFLoader().load(C + 'models/' + file, g => {
    const o = g.scene, b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
    o.scale.setScalar(size / Math.max(s.x, s.y, s.z));
    const b2 = new THREE.Box3().setFromObject(o), c = b2.getCenter(new THREE.Vector3());
    const wrap = new THREE.Group(); o.position.set(-c.x, -b2.min.y, -c.z); wrap.add(o);
    wrap.position.set(x, y, z); wrap.rotation.y = ry;
    o.traverse(n => { if (n.isMesh) { n.castShadow = shadow; n.receiveShadow = true; } });
    scene.add(wrap);
  }, undefined, e => console.warn('Cenário do menu: não carregou', file, e));
}

/** textura desenhada num canvas */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function box(scene, mat, w, h, d, x, y, z, { cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = recv; scene.add(m); return m;
}

function decal(scene, mat, w, h, x, z, rot = 0, y = .003) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = rot;
  m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m;
}

export function buildMenuScene(scene, renderer) {
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.background = new THREE.Color(0x06080b);
  scene.fog = new THREE.Fog(0x06080b, 10, 28);
  // reflexo suave (só para metais: skins Cromo/Ouro das armas não ficam pretas no menu)
  const env = canvasTex(256, 128, (g, w, h) => {   // galpão escuro com a luz quente do teto: pouca energia (só os metais notam)
    const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, '#2a2620'); v.addColorStop(.45, '#0d0f12'); v.addColorStop(1, '#070809'); g.fillStyle = v; g.fillRect(0, 0, w, h);
    const r = g.createRadialGradient(w * .5, h * .12, 0, w * .5, h * .12, w * .18); r.addColorStop(0, 'rgba(255,226,176,.9)'); r.addColorStop(1, 'rgba(255,226,176,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h);
    const b = g.createRadialGradient(w * .12, h * .55, 0, w * .12, h * .55, w * .14); b.addColorStop(0, 'rgba(143,180,255,.45)'); b.addColorStop(1, 'rgba(143,180,255,0)'); g.fillStyle = b; g.fillRect(0, 0, w, h);
  });
  env.mapping = THREE.EquirectangularReflectionMapping; scene.environment = env;

  // ---------- chão ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), pbr('concrete_floor', [7, 7], { color: 0x8a8a8a }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // faixa amarela/preta de segurança
  const stripe = canvasTex(512, 32, (g, w, h) => {
    g.fillStyle = '#d9a320'; g.fillRect(0, 0, w, h); g.fillStyle = '#111';
    for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 24 + h, 0); g.lineTo(x + h, 0); g.fill(); }
    g.globalAlpha = .35; for (let i = 0; i < 400; i++) { g.fillStyle = Math.random() < .5 ? '#000' : '#777'; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3); }
  });
  decal(scene, new THREE.MeshStandardMaterial({ map: stripe, roughness: .85 }), 18.6, .22, -.2, -4.4);
  // manchas de óleo
  const oil = canvasTex(256, 256, (g, w) => {
    for (let i = 0; i < 9; i++) { const x = 60 + Math.random() * 136, y = 60 + Math.random() * 136, r = 20 + Math.random() * 60, rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(10,8,6,.55)'); rg.addColorStop(1, 'rgba(10,8,6,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, w); }
  });
  const oilMat = new THREE.MeshStandardMaterial({ map: oil, transparent: true, depthWrite: false, roughness: .25, metalness: .2 });
  for (const [x, z, s] of [[-2.4, -1.4, 2.6], [2.8, -.6, 1.6], [.6, -3, 2], [-1.2, 1.2, 3.2], [1.6, 1.6, 2.4]]) decal(scene, oilMat, s, s, x, z, x, .004);
  // sombra de contato (os pés ficam "plantados" mesmo com sombra fraca) + círculo dourado pintado
  const blob = canvasTex(128, 128, (g, w) => { const rg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); rg.addColorStop(0, 'rgba(0,0,0,.6)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, w); });
  decal(scene, new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }), .95, .95, 0, 0, 0, .006);
  const ring = canvasTex(256, 256, (g, w) => { g.strokeStyle = 'rgba(217,180,74,1)'; g.lineWidth = 8; g.setLineDash([22, 10]); g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 8, 0, 6.28); g.stroke(); });
  decal(scene, new THREE.MeshBasicMaterial({ map: ring, transparent: true, depthWrite: false, opacity: .85, toneMapped: false }), 1.7, 1.7, 0, 0, 0, .005);

  // ---------- paredes, pilares e teto ----------
  const wallMat = pbr('concrete_wall', [6, 2], { color: 0x6c6c6c });
  box(scene, wallMat, 30, 9, .4, 0, 4.5, -8, { cast: false });
  box(scene, wallMat, .4, 9, 20, -9.5, 4.5, -2, { cast: false });
  const metal = pbr('painted_metal', [1, 4], { color: 0x4d5862, metalness: .5 });
  for (const x of [-5.6, 5.6]) box(scene, metal, .45, 9, .45, x, 4.5, -7.55);
  // porta de enrolar (metal ondulado) com luz fria escapando por baixo
  const roll = canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 8) { const l = 70 + (y / 8 % 2) * 22; g.fillStyle = `rgb(${l},${l + 6},${l + 10})`; g.fillRect(0, y, w, 8); }
    g.globalAlpha = .4; for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < .6 ? '#3a2a1c' : '#111'; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 3 + Math.random() * 14); }
  });
  box(scene, new THREE.MeshStandardMaterial({ map: roll, roughness: .55, metalness: .6 }), 4.4, 4.6, .12, 2.2, 2.3, -7.75, { cast: false });
  box(scene, new THREE.MeshStandardMaterial({ color: 0xd9a320, roughness: .7 }), 4.8, .22, .2, 2.2, 4.72, -7.7, { cast: false });
  const gap = new THREE.Mesh(new THREE.PlaneGeometry(4.4, .06), new THREE.MeshBasicMaterial({ color: 0x9cc4ff })); gap.position.set(2.2, .03, -7.68); scene.add(gap);
  const gapGlow = new THREE.PointLight(0x7fa8ff, 1.2, 2.5, 2); gapGlow.position.set(2.2, .6, -7.2); scene.add(gapGlow);
  // canos na parede
  const pipe = new THREE.MeshStandardMaterial({ color: 0x5a3b26, roughness: .45, metalness: .8 });
  for (const [y, r] of [[5.2, .13], [5.55, .08]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 26, 14), pipe); p.rotation.z = Math.PI / 2; p.position.set(0, y, -7.6); scene.add(p); }
  const vp = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 5.2, 14), pipe); vp.position.set(-3.9, 2.6, -7.6); scene.add(vp);
  // placa de saída (verde) e placa de aviso
  const exit = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#0c6b3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9ffe8'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SAÍDA', w / 2, h / 2 + 2); });
  const ex = new THREE.Mesh(new THREE.PlaneGeometry(.9, .34), new THREE.MeshBasicMaterial({ map: exit })); ex.position.set(2.2, 5.15, -7.68); scene.add(ex);
  const warn = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#d9a320'; g.fillRect(0, 0, w, w); g.fillStyle = '#111'; g.strokeStyle = '#111'; g.fillRect(10, 10, w - 20, 8); g.fillRect(10, w - 18, w - 20, 8);
    g.beginPath(); g.moveTo(w / 2, 46); g.lineTo(w - 50, w - 70); g.lineTo(50, w - 70); g.closePath(); g.lineWidth = 14; g.stroke();
    g.textAlign = 'center'; g.font = 'bold 100px Arial'; g.fillText('!', w / 2, w - 86); g.font = 'bold 26px Arial'; g.fillText('ÁREA RESTRITA', w / 2, w - 30);
  });
  const wp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: warn, roughness: .8 })); wp.position.set(-3.2, 2.0, -7.78); scene.add(wp);

  // ---------- objetos (modelos do CELEIRO) ----------
  prop(scene, 'container.glb', 6.1, -7.5, -7, .9, 0, false);
  prop(scene, 'crate.glb', 1.1, 3.1, -3.6, .25);
  prop(scene, 'crate.glb', 1.1, 4.25, -3.9, -.1);
  prop(scene, 'crate.glb', 1.0, 6.4, -6.2, .8, 0, false);
  prop(scene, 'barrel.glb', 1.0, -2.3, -3.6, 0, 0, false);
  prop(scene, 'barrel.glb', 1.0, -2.9, -3.3, 1, 0, false);
  prop(scene, 'pallet.glb', 1.3, 2.4, -1.9, .4);

  // ---------- luzes (sem feixe visível) ----------
  // luz principal de cima: ilumina o personagem e faz a sombra no chão
  const lamp = new THREE.SpotLight(0xffe2b0, 110, 14, .5, .6, 1.6);
  lamp.position.set(.3, 5.4, .9); lamp.target.position.set(0, 0, 0); lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.camera.near = 2; lamp.shadow.camera.far = 7; lamp.shadow.bias = -.0004; lamp.shadow.normalBias = .02;
  scene.add(lamp, lamp.target);
  // contorno frio por trás (separa o personagem do fundo) e luzes de ambiente
  const rimBack = new THREE.SpotLight(0x8fb4ff, 45, 12, .45, .7, 1.4); rimBack.position.set(-1.5, 4, -4); rimBack.target.position.set(0, 1.2, 0); scene.add(rimBack, rimBack.target);
  const fundo = new THREE.SpotLight(0x8fb4ff, 30, 11, .7, .8, 1.4); fundo.position.set(-2, 6, 0); fundo.target.position.set(-5, 1, -6); scene.add(fundo, fundo.target);
  const quente = new THREE.PointLight(0xffa04a, 3, 6, 1.6); quente.position.set(4.2, 1.4, -4.6); scene.add(quente);
}
