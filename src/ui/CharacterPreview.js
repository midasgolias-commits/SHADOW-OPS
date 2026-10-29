import * as THREE from 'three';
import { CharacterAnimator, upperOnly, OVER } from '../player/CharacterAnimator.js';
import { HeldWeapon } from '../weapons/WeaponModels.js';

/**
 * Personagem em 3D na sala (como no Point Blank): mostra a skin escolhida segurando a arma equipada.
 * Arrastar com o mouse gira o personagem. Só desenha enquanto está visível (start/stop).
 */
export class CharacterPreview {
  constructor(canvas, assets, view = {}) {   // view: { dist, lookY } enquadramento da câmera (sala: personagem grande)
    this.canvas = canvas; this.assets = assets; this.skin = null; this.weapon = null; this.yaw = -.5; this.drag = null; this.run = false;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.shadowMap.enabled = true;
    const s = this.scene = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xe8eef5, 0x3a3530, 1.4));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(2, 4, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.2, bottom: -.2 }); s.add(key);
    const rim = new THREE.DirectionalLight(0x7fb0ff, 1.4); rim.position.set(-3, 2.5, -2.5); s.add(rim);
    // chão: círculo com brilho suave (palco)
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(201,180,88,.55)'); rg.addColorStop(.55, 'rgba(201,180,88,.12)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = .002; s.add(floor);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.ShadowMaterial({ opacity: .35 })); sh.rotation.x = -Math.PI / 2; sh.receiveShadow = true; s.add(sh);
    this.camera = new THREE.PerspectiveCamera(26, 1, .1, 50); this.camera.position.set(0, (view.lookY ?? .93) + .07, view.dist ?? 5.6); this.camera.lookAt(0, view.lookY ?? .93, 0);   // corpo inteiro com folga em cima
    this.clock = new THREE.Clock();
    canvas.addEventListener('pointerdown', e => { this.drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (this.drag === null) return; this.yaw += (e.clientX - this.drag) * .012; this.drag = e.clientX; });
    const end = () => { this.drag = null; }; canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }
  /** Troca a skin e/ou a arma mostrada. */
  set(skin, weapon) {
    if (!this.assets.ready) return;
    if (skin !== this.skin) {
      if (this.obj) { this.scene.remove(this.obj); this.mixer.stopAllAction(); this.held.dispose(); }
      const { obj, clips } = this.assets.instance(skin); obj.scale.setScalar(.01); obj.traverse(n => { if (n.isMesh) n.castShadow = true; });
      this.scene.add(obj); this.obj = obj; this.clips = clips; this.skin = skin;
      this.held = new HeldWeapon(obj, this.assets.weapons, skin); this.held.attachTo(this.scene);
      const ca = new CharacterAnimator(obj, clips); ca.withPose('fire', () => this.held.calibrate()); ca.dispose();
      this.mixer = new THREE.AnimationMixer(obj); this.weapon = null;
    }
    if (weapon !== this.weapon) {
      this.weapon = weapon; this.held.set(weapon); this.held.snap = true;
      this.mixer.stopAllAction();
      const knife = weapon === 'knife' || weapon === 'karambit';
      // pose de vitrine: parado com a arma erguida (pose de mira), como no menu do Point Blank; faca: pose da faca
      const base = this.mixer.clipAction(this.clips[knife ? 'knife_idle' : 'idle']); base.play();
      if (!knife && this.clips.fire) { const o = this.mixer.clipAction(upperOnly(this.clips.fire)); o.setEffectiveWeight(OVER); o.play(); o.time = o.getClip().duration * .999; o.timeScale = 0; }
      this.held.scene = knife ? 'knife_idle' : 'fire';
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
    const dt = Math.min(this.clock.getDelta(), .1); this._size();
    if (this.obj) {
      if (this.drag === null) this.yaw += dt * .25;   // gira devagar sozinho
      this.obj.rotation.y = this.yaw; this.mixer.update(dt); this.obj.updateMatrixWorld(true);
      this.held.update(true, null, dt); if (this.weapon !== 'knife' && this.weapon !== 'karambit') this.held.leftHandIK(true, 1);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
