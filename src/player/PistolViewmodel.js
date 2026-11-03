import * as THREE from 'three';
import { MuzzleFlash } from '../weapons/MuzzleFlash.js';
import { vmFor } from '../weapons/Grips.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * VIEWMODEL NOVO DA PISTOLA (pacote "Pistol 43 Tactical": braços BF3 + Glock num esqueleto só, com câmera própria).
 *
 * Por que os braços do pacote (e não os da Izzy): o pacote anima braços E arma no MESMO esqueleto (ferrolho, carregador,
 * bala) com proporções e pegada feitas um para o outro. Os braços da Izzy são um rig Mixamo de corpo inteiro com outras
 * medidas e orientações de osso: copiar as rotações deixaria as mãos fora da arma (a arma anda pelos ossos dela, não pela mão).
 *
 * Como desenha: a cena do viewmodel é desenhada com a câmera DO PACOTE (nó "Camera", que olha para +X no arquivo).
 * O ajuste fino (Lab → "Viewmodel novo da pistola") mexe só nessa câmera: posição (cm), giro (graus), campo de visão
 * e quanto do balanço da câmera animada entra (camK). Fica salvo em grips.json → vm.pistol (não mexe nas outras armas).
 *
 * Clipes reais do arquivo: Origin (parado, 1 quadro), Walk, Run, Shot, Reloat_t (recarga com bala na agulha),
 * Reloat_f (recarga vazia), Inspect. Não há clipe de sacar/guardar: a troca usa o mesmo movimento de descer/subir dos outros braços.
 */
export const VM_CLIPS = { idle: 'Hands|Origin', walk: 'Hands|Walk', run: 'Hands|Run', shot: 'Hands|Shot', reloadT: 'Hands|Reloat_t', reloadF: 'Hands|Reloat_f', inspect: 'Hands|Inspect' };
export const VM_SWAP = { down: 14, pitch: 26 };   // troca de arma: quanto desce (cm) e gira (graus) até sumir da tela
const FWD_FIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);   // câmera do arquivo olha +X; a do three olha -Z
/**
 * KITS de viewmodel (cada um = braços + arma + animações feitos juntos):
 *  glock: pacote "Pistol 43 Tactical" (FBX; câmera olha +X; tem inspecionar; sem sacar/guardar);
 *  mm9:   "Pistol Animations (BLENDER)" do Sketchfab (autor LokitoBlu; arma de @TORI106), convertido do .blend com o Blender
 *         para GLB; câmera já olha -Z; tem SACAR (Draw) e GUARDAR (Not_Draw), recarga rápida e completa; sem inspecionar.
 */
export const KITS = {
  glock: { clips: VM_CLIPS, camFix: FWD_FIX, muzzle: 'barrel', magGrip: true },
  mm9: { clips: { idle: 'Idle', walk: 'Walk', run: 'Jog', shot: 'Fire', reloadT: 'Reload_Fast', reloadF: 'Reload_Complete', draw: 'Draw', holster: 'Not_Draw' },
    camFix: null, muzzle: 'mesh', magGrip: false, gun: /^Cube005/, gunMat: /9m/, lightCam: true, env: true }
};
// izzy9 / ak: os MESMOS kits com os braços da Izzy no lugar da luva (feito no Blender: _fonte/izzy_arms/build.py) — braço único em todas as armas
KITS.izzy9 = { ...KITS.mm9 };
KITS.ak = { ...KITS.mm9, clips: { idle: 'Idle', walk: 'Walk', run: 'Walk', shot: 'Shot', reloadT: 'Reload_Fast', reloadF: 'Reload_Complete', draw: 'Draw', holster: 'Not_Draw' },
  gun: /^AK/, gunMat: null, runSpeed: 1.45 };
const _w = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();

export class PistolViewmodel {
  /** rig: objeto preparado no Assets.loadPistolVM() (o mesmo é reaproveitado entre partidas). id: arma do jogo. */
  constructor(rig, id = 'pistol', kit = 'glock') {
    this.rig = rig; this.id = id; this.kitName = kit; this.kit = KITS[kit];
    const sc = this.scene = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xe8eef6, 0x4a4036, 1.25));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.2); key.position.set(1, 2.5, 1.5); sc.add(key);
    const fill = new THREE.DirectionalLight(0x9fb8d8, .7); fill.position.set(-2, 1, -1); sc.add(fill); this.lights = [key, fill];
    sc.add(rig); rig.position.set(0, 0, 0); rig.updateMatrixWorld(true);
    this.camNode = rig.getObjectByName('Camera');
    const b = n => rig.getObjectByName(n);
    this.bones = { barrel: b('Barrel'), slide: b('Slide'), barrelEnd: b('Barrel_end'), forearm: b('r_forearm'), wrist: b('r_wrist') };
    // escala do arquivo: antebraço ≈ 26 cm (usado para converter os ajustes em cm e o clarão do tiro em metros)
    this.mixer = new THREE.AnimationMixer(rig);
    const clip = n => { const c = rig.animations.find(a => a.name === n); if (!c) throw new Error('Viewmodel: clipe não encontrado no arquivo: ' + n); return c; };
    this.act = {};
    const used = new Set();
    for (const [k, n] of Object.entries(this.kit.clips)) {
      const c0 = clip(n), a = this.mixer.clipAction(used.has(n) ? c0.clone() : c0); used.add(n);   // mesmo clipe em duas funções (AK: andar/correr): cópia
      if (k === 'run' && this.kit.runSpeed) a.timeScale = this.kit.runSpeed;
      if (k === 'idle' || k === 'walk' || k === 'run') { a.setLoop(THREE.LoopRepeat); a.enabled = true; a.setEffectiveWeight(0); a.play(); }
      else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.act[k] = a;
    }
    this.act.idle.setEffectiveWeight(1);
    this.base = 'idle'; this.one = null;   // animação de base (parado/andar/correr) e ação por cima (tiro/recarga/inspecionar)
    this.mixer.addEventListener('finished', e => { if (this.one && e.action === this.act[this.one]) this._endOne(.18); });
    this.mixer.update(0); rig.updateMatrixWorld(true);
    // câmera "parada" (pose Origin): base estável; o balanço da câmera animada entra pela fração camK do ajuste
    this.rest = { p: new THREE.Vector3(), q: new THREE.Quaternion() }; this.camNode.matrixWorld.decompose(this.rest.p, this.rest.q, _s);
    // kit com luz presa à câmera: a luz vem de trás/cima da câmera (no arquivo a câmera não olha para o mesmo lado do pacote antigo)
    if (this.kit.lightCam) { this.lights[0].position.set(1.2, 2.2, 1.6).applyQuaternion(this.rest.q); this.lights[1].position.set(-2, .6, .8).applyQuaternion(this.rest.q); this.lights[0].intensity = 2.6; }
    this.unit = this.bones.forearm.getWorldPosition(new THREE.Vector3()).distanceTo(this.bones.wrist.getWorldPosition(new THREE.Vector3())) / 26;   // unidades do arquivo por cm
    // kits do LokitoBlu: medida pela MÃO (punho → base do médio = 13,4 cm), que não muda quando o braço vira o da Izzy (o antebraço muda)
    const mid = b('r_middle_low'); if (this.kit.muzzle === 'mesh' && mid) this.unit = mid.getWorldPosition(new THREE.Vector3()).distanceTo(this.bones.wrist.getWorldPosition(new THREE.Vector3())) / 13.36;
    this.cam = new THREE.PerspectiveCamera(60, 16 / 9, this.unit * .5, this.unit * 5000);
    // clarão do tiro: na boca do cano (Barrel_end), com +Z apontando para fora do cano
    this.flash = new MuzzleFlash({ light: true }); this.muzzle = new THREE.Group(); sc.add(this.muzzle);
    this.muzzle.userData.muzzle = { x: 0, y: 0, z: 0 }; this.flash.attach(this.muzzle);
    this.swE = 0; this.reloading = false; this.cfg = vmFor(id);
    if (this.kit.magGrip) this._recordMagGrip();
    if (this.kit.muzzle === 'mesh') this._findMuzzle();
  }
  /** kit sem osso na boca do cano: acha a ponta da arma na malha (pose parada) e guarda no espaço do ferrolho */
  _findMuzzle() {
    const rig = this.rig, slide = rig.getObjectByName('Slide'); rig.updateMatrixWorld(true);
    const inv = this.camNode.matrixWorld.clone().invert(), pts = [], v = new THREE.Vector3();
    rig.traverse(o => { if (!o.isSkinnedMesh || !this.kit.gun.test(o.name) || (this.kit.gunMat && !this.kit.gunMat.test([].concat(o.material)[0]?.name || ''))) return;
      const n = o.geometry.attributes.position.count; for (let i = 0; i < n; i += 2) { o.getVertexPosition(i, v); o.localToWorld(v); pts.push(v.clone()); } });
    if (!pts.length || !slide) return;
    const cs = pts.map(p => p.clone().applyMatrix4(inv)), zmin = Math.min(...cs.map(p => p.z)), tip = new THREE.Vector3(); let n = 0;
    cs.forEach((p, i) => { if (p.z < zmin + this.unit * .8) { tip.add(pts[i]); n++; } }); tip.divideScalar(n);
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(this.camNode.matrixWorld);
    const sInv = slide.matrixWorld.clone().invert();
    this.muzzleLocal = { bone: slide, p: tip.clone().applyMatrix4(sInv), d: fwd.clone().transformDirection(sInv) };
  }
  /** sacar a arma (kits com o clipe Draw): ao trocar para ela ou ao aparecer na tela */
  draw(speed = 1.6) { if (this.act.draw) this._playOne('draw', speed, .02); }

  /**
   * Correção da recarga TÁTICA do pacote: nela o carregador que aparece na tela sai e volta sozinho (a mão esquerda do
   * pacote fica lá embaixo, fora da tela, com o outro carregador). Na recarga VAZIA a mão segura o carregador direito
   * (aos 33% do clipe, a palma fica a 5 cm dele). Aqui é guardada essa pegada (mão esquerda no espaço do carregador)
   * para a mão da Izzy segurar o carregador da recarga tática do mesmo jeito.
   */
  _recordMagGrip() {
    const rig = this.rig, B = n => rig.getObjectByName(n), names = [];
    for (const n of ['upperarm', 'forearm', 'wrist']) names.push('l_' + n);
    for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) for (const k of ['low', 'mid', 'tip', 'tip_end']) names.push(`l_${f}_${k}`);
    const tmp = new THREE.AnimationMixer(rig), body = B('Wpn_body'), mag = B('Magazine'), mag2 = B('Magazine2'); if (!body || !mag || !mag2) return;
    const at = (clip, t) => { tmp.stopAllAction(); const a = tmp.clipAction(rig.animations.find(c => c.name === clip)); a.play(); tmp.setTime(t * a.getClip().duration); rig.updateMatrixWorld(true); };
    at(VM_CLIPS.reloadF, .33);
    const inv = mag2.matrixWorld.clone().invert(), grip = new Map();
    for (const n of names) { const o = B(n); if (o) grip.set(n, o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv)); }
    at(VM_CLIPS.idle, 0);
    this.magSeat = mag.getWorldPosition(new THREE.Vector3()).applyMatrix4(body.matrixWorld.clone().invert());   // carregador no lugar (espaço do corpo da arma)
    tmp.stopAllAction(); tmp.uncacheRoot(rig); this.mixer.update(0); rig.updateMatrixWorld(true);
    this.magGrip = { grip, mag, body, k: 0, pts: new Map([...grip.keys()].map(n => [n, new THREE.Vector3()])) };
  }
  /** recarga tática com o carregador fora do lugar: alvos da mão esquerda segurando ele (k = 0..1) */
  magHold(dt) {
    const G = this.magGrip; if (!G) return null;
    const out = this.one === 'reloadT' && G.mag.getWorldPosition(_w).distanceTo(_d.copy(this.magSeat).applyMatrix4(G.body.matrixWorld)) > this.unit * 1.2 * (this.guide ? 1 / (this.unit * 100) : 1);
    G.k += ((out ? 1 : 0) - G.k) * Math.min(1, dt * 16);
    if (out) for (const [n, v] of G.grip) G.pts.get(n).copy(v).applyMatrix4(G.mag.matrixWorld);   // fora do lugar: segue o carregador; voltando: fica onde soltou
    return G.k > .01 ? G : null;
  }
  /** troca suave da animação de base */
  _setBase(k, fade = .3) {
    if (this.base === k) return;
    const from = this.act[this.base], to = this.act[k]; this.base = k;
    // passo sincronizado: andar ↔ correr continua no mesmo ponto do passo (antes recomeçava do zero = "tranco")
    const fd = from.getClip().duration, td = to.getClip().duration;
    to.time = fd > 0 && td > 0 ? (from.time / fd) * td : 0;
    if (this.one) { to.setEffectiveWeight(0); return; }   // uma ação por cima está tocando: a base volta quando ela acabar
    to.enabled = true; to.setEffectiveWeight(1); to.crossFadeFrom(from, fade, false);
  }
  /** ação por cima (substitui a base enquanto toca: os clipes são de pose inteira) */
  _playOne(k, timeScale = 1, fade = .06) {
    const a = this.act[k];
    // a mesma ação de novo (tiro seguido): só volta ao começo, com peso cheio. Antes ela "reaparecia" do peso 0 e,
    // nesse instante, nada segurava a pose: braços e mãos iam para a pose de descanso do arquivo (mão saindo da arma)
    if (this.one === k) { a.stopFading(); a.enabled = true; a.paused = false; a.time = 0; a.timeScale = timeScale; a.setEffectiveWeight(1); return; }
    this.act[this.one || this.base].fadeOut(fade);   // a soma dos pesos fica sempre em 1 (sem buraco)
    a.reset(); a.timeScale = timeScale; a.setEffectiveWeight(1); a.fadeIn(fade); a.play();
    this.one = k;
  }
  _endOne(fade = .15) {
    const k = this.one; if (!k) return; this.one = null;
    this.act[k].fadeOut(fade);
    const b = this.act[this.base]; b.enabled = true; b.setEffectiveWeight(1); b.fadeIn(fade); b.play();
  }

  /** Tiro (evento real do jogo). */
  shot() { if (this.one === 'reloadT' || this.one === 'reloadF') return; this._playOne('shot', 1, .03); this._flash(); }
  /** Inspecionar (tecla F, só com a arma parada e pronta). */
  inspect() { if (this.act.inspect && !this.one && this.swE < .05) this._playOne('inspect', 1, .2); }
  /** Cancela o que estiver por cima (troca de arma, morte, renascer). */
  cancel() { if (this.one) this._endOne(.1); this.reloading = false; }

  /**
   * s: { speed, air, reloading, reloadTime, reloadTotal, mag, switchK, switchIn } (os mesmos dados que a FirstPersonView recebe).
   */
  update(dt, s) {
    this.cfg = vmFor(this.id);
    // recarga: começa junto com a recarga do jogo; tática (ainda tem bala) ou vazia; dura o mesmo tempo da recarga do jogo
    if (s.reloading && !this.reloading) {
      const k = (s.mag ?? 1) > 0 ? 'reloadT' : 'reloadF', clip = this.act[k].getClip();
      this._playOne(k, clip.duration / Math.max(.3, s.reloadTotal || s.reloadTime || clip.duration), .08);
    } else if (!s.reloading && this.reloading && (this.one === 'reloadT' || this.one === 'reloadF')) this._endOne(.12);   // recarga interrompida
    this.reloading = !!s.reloading;
    // base: parado / andando / correndo (no ar: parado)
    const sp = s.air ? 0 : (s.speed || 0);
    // parado / andar / correr com folga (histerese) e tempo mínimo: a velocidade oscila um pouco e trocava de animação toda hora (tremedeira)
    // (velocidades do jogador: agachado 2,6 · andando 5,2 · correndo com Shift 7,6 — vezes o peso da arma. Antes o limite de correr era 5,2,
    //  exatamente a velocidade de andar: a animação ficava trocando entre andar e correr a cada quadro)
    const b0 = this.base, want = b0 === 'run' ? (sp > 5.9 ? 'run' : sp > .45 ? 'walk' : 'idle') : b0 === 'walk' ? (sp > 6.3 ? 'run' : sp > .35 ? 'walk' : 'idle') : (sp > 6.3 ? 'run' : sp > 1 ? 'walk' : 'idle');
    this._baseT = (this._baseT || 0) + dt;
    if (want !== b0 && this._baseT > .25) { this._setBase(want); this._baseT = 0; }
    if (this.one === 'inspect' && (sp > .6 || s.switchK > 0)) this._endOne(.2);
    // troca de arma: desce e gira para fora da tela; kit com SACAR: na volta toca a animação de sacar no lugar da subida
    const sk = s.switchK || 0;
    if (this.act.draw && s.switchIn && sk > 0) { if (!this._drew) { this._drew = true; this.draw(1.6); } this.swE = 0; }
    else { if (!sk) this._drew = false; this.swE = sk * sk * (3 - 2 * sk); }
    if (this.swE > .9 && this.one && this.one !== 'draw') this.cancel();
    this.mixer.update(dt);
    this.rig.updateMatrixWorld(true);
    this.flash.update(dt);
  }

  /** posiciona a câmera do viewmodel: pose parada + (camK × balanço animado) + ajuste do Lab + troca de arma */
  _placeCam(aspect) {
    const c = this.cam, f = this.cfg, u = this.unit;
    this.camNode.matrixWorld.decompose(_p, _q, _s);
    c.position.copy(this.rest.p).lerp(_p, f.camK); c.quaternion.copy(this.rest.q).slerp(_q, f.camK); if (this.kit.camFix) c.quaternion.multiply(this.kit.camFix);
    const R = Math.PI / 180;
    c.quaternion.multiply(_q.setFromEuler(_e.set((f.rx + this.swE * VM_SWAP.pitch) * R, f.ry * R, f.rz * R, 'YXZ')));
    c.position.add(_v.set(f.x * u, (f.y + this.swE * VM_SWAP.down) * u, f.z * u).applyQuaternion(c.quaternion));
    c.fov = f.fov; c.aspect = aspect; c.near = u * Math.max(.3, f.near); c.updateProjectionMatrix(); c.updateMatrixWorld(true);
  }
  /** boca do cano e direção do cano: o osso Barrel fica na boca; o eixo do cano é Slide → Barrel
   *  (o osso Barrel_end aponta para CIMA, é só a ponta do osso, não serve de direção) */
  _muzzle(pos, dir) {
    const L = this.muzzleLocal;
    if (L) { pos.copy(L.p).applyMatrix4(L.bone.matrixWorld); dir.copy(L.d).transformDirection(L.bone.matrixWorld); pos.addScaledVector(dir, this.unit * .6 * (this.guide ? 1 / (this.unit * 100) : 1)); return true; }
    const a = this.bones.barrel, sl = this.bones.slide; if (!a || !sl) return false;
    a.getWorldPosition(pos); sl.getWorldPosition(dir); dir.subVectors(pos, dir).normalize();
    pos.addScaledVector(dir, this.unit * 1.5); return true;
  }
  _flash() {
    if (!this._muzzle(this.muzzle.position, _v)) return;
    this.muzzle.lookAt(_w.copy(this.muzzle.position).add(_v));   // +Z para fora do cano
    this.muzzle.scale.setScalar(this.guide ? 1 : this.unit * 100);   // o clarão é medido em metros (no modo guia o mundo já está em metros)
    this.muzzle.updateMatrixWorld(true);
    this.flash.fire(this.id, false, false);
  }

  /** desenha por cima do mapa (como a FirstPersonView) */
  /**
   * MODO GUIA (braços da Izzy): o rig vai para a cena dos braços da Izzy, alinhado à câmera dela (mundo em metros),
   * os braços do pacote ficam invisíveis (só servem de alvo para o IK) e a Glock animada aparece.
   */
  setGuide(scene) {
    const on = !!scene; if (on === !!this.guide && (!on || this.rig.parent === scene)) return;
    this.guide = on;
    (on ? scene : this.scene).add(this.rig); (on ? scene : this.scene).add(this.muzzle);
    this.rig.matrixAutoUpdate = !on;
    if (!on) { this.rig.position.set(0, 0, 0); this.rig.quaternion.identity(); this.rig.scale.set(1, 1, 1); this.rig.updateMatrixWorld(true); }
    this.rig.traverse(o => { if (o.isSkinnedMesh && o.name !== 'Glock') o.visible = !on; });
  }
  /** modo guia: põe o rig de forma que a câmera do pacote (com o ajuste do Lab) fique exatamente na câmera dos braços da Izzy */
  alignTo(cam) {
    this.rig.matrix.identity(); this.rig.matrixWorld.identity(); this.rig.updateMatrixWorld(true);   // medir no espaço do próprio rig
    this.mixer.update(0); this.rig.updateMatrixWorld(true);
    this._placeCam(1);
    _m.compose(this.cam.position, this.cam.quaternion, _s.set(1, 1, 1)).invert();
    const k = 1 / (this.unit * 100);   // unidades do arquivo → metros
    this.rig.matrix.copy(cam.matrixWorld).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(_m);
    this.rig.updateMatrixWorld(true);
  }
  render(renderer, aspect) {
    this._placeCam(aspect);
    if (this.kit.env && !this.scene.environment) {   // reflexo suave (metal da arma sem ambiente fica preto)
      this._pm ??= new THREE.PMREMGenerator(renderer); this.scene.environment = this._pm.fromScene(new RoomEnvironment(), .04).texture; this.scene.environmentIntensity = .55;
    }
    const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth();
    renderer.render(this.scene, this.cam); renderer.autoClear = ac;
  }
  /** ponto do MAPA que aparece em cima da boca do cano (para o rastro do tiro começar ali; o acerto não muda) */
  muzzleInWorld(camera, depth = .6) {
    const m = new THREE.Vector3(); if (!this._muzzle(m, _d)) return null;
    m.project(this.cam);
    if (m.z > 1 || Math.abs(m.x) > 1.3 || Math.abs(m.y) > 1.3) return null;
    const v = _v.set(m.x, m.y, .5).unproject(camera).sub(camera.position).normalize();
    return camera.position.clone().addScaledVector(v, depth);
  }
  dispose() {
    this.setGuide(null);
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.rig);
    this.scene.remove(this.rig); this.flash.dispose(); this.scene.remove(this.muzzle);
  }
}
