import * as THREE from 'three';
import { CharacterAnimator, upperOnly, OVER } from '../player/CharacterAnimator.js';
import { HeldWeapon } from '../weapons/WeaponModels.js';
import { buildMenuScene } from './MenuScene.js';

const KNIVES = new Set(['knife', 'karambit', 'faca2']);
// vagas do grupo no menu (x, z, giro): dois ao lado e dois mais atrás, todos olhando para a câmera
const SQUAD_SPOTS = [[-1.45, -.7, .12], [1.45, -.7, -.12], [-2.8, -1.5, .22], [2.8, -1.5, -.22]];

/**
 * Personagem em 3D na sala (como no Point Blank): mostra a skin escolhida segurando a arma equipada.
 * Arrastar com o mouse gira o personagem. Só desenha enquanto está visível (start/stop).
 */
export class CharacterPreview {
  constructor(canvas, assets, view = {}) {   // view: { dist, lookY, floor, pose, spin } — enquadramento, palco e pose
    this.canvas = canvas; this.assets = assets; this.skin = null; this.weapon = null; this.yaw = view.yaw ?? -.5; this.drag = null; this.run = false;
    this.fixed = !!view.fixed; this.weaponSkins = view.set === 'galpao';   // menu: a arma mostra a skin escolhida         // fixed: personagem parado de frente (sem giro e sem arrastar com o mouse)
    this.pose = view.pose || 'fire';   // pose de vitrine: 'fire' (arma erguida, sala) ou 'idle' (parado, menu)
    this.spin = view.spin ?? .25;      // giro automático (rad/s)
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.shadowMap.enabled = view.floor !== false;
    const s = this.scene = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xe8eef5, 0x3a3530, 1.4));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(2, 4, 3); key.castShadow = view.floor !== false; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.2, bottom: -.2 }); s.add(key);
    const rim = new THREE.DirectionalLight(0x7fb0ff, 1.4); rim.position.set(-3, 2.5, -2.5); s.add(rim);
    if (view.floor !== false) {   // chão: círculo com brilho suave (palco da sala); no menu o brilho é feito no CSS
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      rg.addColorStop(0, 'rgba(201,180,88,.55)'); rg.addColorStop(.55, 'rgba(201,180,88,.12)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = .002; s.add(floor);
      const sh = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.ShadowMaterial({ opacity: .35 })); sh.rotation.x = -Math.PI / 2; sh.receiveShadow = true; s.add(sh);
    }
    this.camera = new THREE.PerspectiveCamera(26, 1, .1, 50); this.camera.position.set(0, (view.lookY ?? .93) + .07, view.dist ?? 5.6); this.camera.lookAt(0, view.lookY ?? .93, 0);   // corpo inteiro com folga em cima
    if (view.set === 'galpao') {   // menu iniciar: cenário 3D com chão (o personagem pisa nele)
      buildMenuScene(s, r); key.visible = false; key.castShadow = false; rim.intensity = .6; s.children[0].intensity = .18;
      r.setPixelRatio(Math.min(devicePixelRatio, 1.5));   // tela cheia: limita a resolução para PCs fracos
      const camY = view.camY ?? 1.5; this.camera.position.set(0, camY, view.dist ?? 6.3); this.camera.lookAt(0, view.lookY ?? 1.05, 0);
    }
    this.clock = new THREE.Clock();
    canvas.addEventListener('pointerdown', e => { if (this.fixed) return; this.drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (this.drag === null) return; this.yaw += (e.clientX - this.drag) * .012; this.drag = e.clientX; });
    const end = () => { this.drag = null; }; canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }
  /**
   * GRUPO no menu (como no PUBG): os amigos que entram na sala aparecem ao lado do seu personagem, com o nome em cima.
   * list: [{ id, name, skin, primary }] (até 4, sem você). Quem saiu some; quem entrou ganha a próxima vaga livre.
   */
  setSquad(list = []) {
    if (!this.assets.ready) return;
    this.squad ??= new Map();
    const want = new Map(list.slice(0, SQUAD_SPOTS.length).map(p => [p.id, p]));
    for (const [id, f] of this.squad) if (!want.has(id)) { this._dropFigure(f); this.squad.delete(id); }
    const used = new Set([...this.squad.values()].map(f => f.spot));
    for (const [id, p] of want) {
      const skin = p.skin === 'bot' ? 'bot' : 'izzy', weapon = p.primary || 'rifle';
      let f = this.squad.get(id);
      if (f && f.skin !== skin) { this._dropFigure(f); this.squad.delete(id); f = null; }
      if (!f) {
        const spot = SQUAD_SPOTS.findIndex((_, i) => !used.has(i)); used.add(spot);
        f = this._makeFigure(skin); f.spot = spot; f.id = id;
        const [x, z, ry] = SQUAD_SPOTS[spot]; f.obj.position.set(x, 0, z); f.obj.rotation.y = ry;
        this.squad.set(id, f);
      }
      if (f.weapon !== weapon) this._poseFigure(f, weapon);
      if (f.name !== p.name) { f.name = p.name; this._tag(f); }
    }
  }
  _makeFigure(skin) {
    const { obj, clips } = this.assets.instance(skin); obj.scale.setScalar(.01); obj.traverse(n => { if (n.isMesh) n.castShadow = true; });
    this.scene.add(obj);
    const held = new HeldWeapon(obj, this.assets.weapons, skin); held.attachTo(this.scene);
    const ca = new CharacterAnimator(obj, clips); ca.withPose('fire', () => held.calibrate()); ca.dispose();
    return { obj, clips, held, skin, mixer: new THREE.AnimationMixer(obj), weapon: null, name: null, tag: null };
  }
  _poseFigure(f, weapon) {
    f.weapon = weapon; f.held.set(weapon); f.held.snap = true; f.mixer.stopAllAction();
    const knife = KNIVES.has(weapon), a = f.mixer.clipAction(f.clips[knife ? 'knife_idle' : 'idle'] || f.clips.idle);
    a.play(); a.time = Math.random() * a.getClip().duration;   // cada um num ponto da animação (não ficam sincronizados)
    f.held.scene = knife ? 'knife_idle' : 'idle';
  }
  _tag(f) {
    if (f.tag) { this.scene.remove(f.tag); f.tag.material.map.dispose(); f.tag.material.dispose(); }
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const x = cv.getContext('2d');
    x.font = '600 44px Oswald, Bahnschrift, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,.8)'; x.strokeText(f.name || 'Amigo', 256, 50); x.fillStyle = '#e9edf1'; x.fillText(f.name || 'Amigo', 256, 50);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    f.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
    f.tag.scale.set(1.3, .245, 1); f.tag.position.set(f.obj.position.x, 1.98, f.obj.position.z); this.scene.add(f.tag);
  }
  _dropFigure(f) {
    this.scene.remove(f.obj); f.mixer.stopAllAction(); f.held.dispose();
    if (f.tag) { this.scene.remove(f.tag); f.tag.material.map.dispose(); f.tag.material.dispose(); }
  }
  /** Troca a skin e/ou a arma mostrada. */
  set(skin, weapon) {
    if (!this.assets.ready) return;
    if (skin !== this.skin) {
      if (this.obj) { this.scene.remove(this.obj); this.mixer.stopAllAction(); this.held.dispose(); }
      const { obj, clips } = this.assets.instance(skin); obj.scale.setScalar(.01); obj.traverse(n => { if (n.isMesh) n.castShadow = true; });
      this.scene.add(obj); this.obj = obj; this.clips = clips; this.skin = skin;
      this.held = new HeldWeapon(obj, this.assets.weapons, skin, { skins: this.weaponSkins }); this.held.attachTo(this.scene);
      const ca = new CharacterAnimator(obj, clips); ca.withPose('fire', () => this.held.calibrate()); ca.dispose();
      this.mixer = new THREE.AnimationMixer(obj); this.weapon = null;
    }
    if (weapon !== this.weapon) {
      this.weapon = weapon; this.held.set(weapon); this.held.snap = true;
      this.mixer.stopAllAction();
      const knife = weapon === 'knife' || weapon === 'karambit' || weapon === 'faca2';
      // pose de vitrine: sala = arma erguida (mira); menu = parado, arma na altura da cintura; faca: pose da faca
      const p = knife ? 'knife_idle' : this.pose;
      const base = this.mixer.clipAction(this.clips[p === 'fire' ? 'idle' : p] || this.clips.idle); base.play();
      if (!knife && p === 'fire' && this.clips.fire) { const o = this.mixer.clipAction(upperOnly(this.clips.fire)); o.setEffectiveWeight(OVER); o.play(); o.time = o.getClip().duration * .999; o.timeScale = 0; }
      this.held.scene = p;
    }
  }
  _size() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
  }
  start() { if (this.run) return; this.run = true; this.clock.getDelta(); const loop = () => { if (!this.run) return; requestAnimationFrame(loop); this._frame(); }; loop(); }
  stop() { this.run = false; }
  _frame() {
    const dt = Math.min(this.clock.getDelta(), .1); if (!this.canvas.clientWidth) return;   // escondido (menu/sala fora da tela): não gasta GPU
    this._size();
    if (this.obj) {
      if (this.drag === null) this.yaw += dt * this.spin;   // gira devagar sozinho
      this.obj.rotation.y = this.yaw; this.mixer.update(dt); this.obj.updateMatrixWorld(true);
      this.held.update(true, null, dt); if (this.weapon !== 'knife' && this.weapon !== 'karambit' && this.weapon !== 'faca2') this.held.leftHandIK(true, 1);
    }
    if (this.squad) for (const f of this.squad.values()) {   // amigos do grupo
      f.mixer.update(dt); f.obj.updateMatrixWorld(true);
      f.held.update(true, null, dt); if (!KNIVES.has(f.weapon)) f.held.leftHandIK(true, 1);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
