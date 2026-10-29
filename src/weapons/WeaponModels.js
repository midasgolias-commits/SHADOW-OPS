import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { gripFor, leftHandFor, GRIP_BASE } from './Grips.js';
import { MuzzleFlash } from './MuzzleFlash.js';

/**
 * Tranco do tiro (feito em código, por cima da animação): a arma vai para trás e o cano sobe, depois volta.
 * back = recuo (m), up (m), pitch = cano sobe (graus), dur = tempo de volta (s).
 * bolt (sniper): depois do tiro, a arma deita e baixa um pouco enquanto "puxa o ferrolho" (at = começa, len = dura, roll/dip/pitch).
 */
export const SHOT_KICK = {
  rifle: { back: .016, up: .004, pitch: 2.5, dur: .12 },
  aug: { back: .007, up: .0015, pitch: .9, dur: .1 },   // AUG: tranco leve (pedido: só um toque, sem inclinar)
  smg: { back: .011, up: .003, pitch: 1.6, dur: .09 },
  pistol: { back: .02, up: .006, pitch: 7, dur: .16 },
  shotgun: { back: .04, up: .01, pitch: 9, dur: .3, bolt: { at: .3, len: .5, roll: -8, dip: .02, pitch: -4 } },
  sniper: { back: .035, up: .008, pitch: 7, dur: .3, bolt: { at: .38, len: .85, roll: 16, dip: .03, pitch: -6 } }
};
const _kq = new THREE.Quaternion(), _ke = new THREE.Euler(), _kv = new THREE.Vector3();
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

/**
 * Modelos 3D das armas (só visual; as regras continuam em Weapons.js).
 * Cada arquivo vem numa escala/orientação diferente: ao carregar, a arma é "normalizada" para um quadro padrão:
 *   +Z = direção do cano, +Y = cima, origem no punho (onde a mão direita segura), comprimento total = len (m).
 * O cano é a ponta mais fina do eixo maior; o lado de cima é o lado onde fica o cano.
 * Ajustes finos por arma: rot (graus, aplicada antes da normalização automática), flip, grip (0..1 ao longo do comprimento).
 */
const W = 'assets/weapons/';
export const WEAPON_MODELS = {
  rifle:   { file: W + 'rifle/ar15.fbx', ads: { back: .42, up: 0, dx: 0, dy: 0, sight: { y: .18, z: .03 } }, glass: /Glass/i, lift: /^Scope/, hand2: .28,   // sight: centro da janela do holográfico (a detecção automática erra neste modelo)
             len: .92, grip: .36, gripDown: .22, tex: { 'texture set 1': W + 'rifle/set1.jpg', 'texture set 2': W + 'rifle/set2.jpg' } },
  // AUG A3 (bullpup): punho no meio da arma, carregador atrás dele; luneta embutida (vidro = OpticLense); medidas tiradas do arquivo;
  // hand2/hand2Down: mão esquerda na empunhadura vertical da frente; hand2Rot: giro da mão (graus) para fechar em volta dela
  aug:     { file: W + 'aug/aug.fbx', len: .79, grip: .39, gripDown: .1, hand2: .19, hand2Down: .02, hand2Rot: [45, -90, -90], glass: /Lense/i, tex: { '*': W + 'aug/color.jpg' }, scopeCut: { tan: .094, near: .125, far: .8 },
             ads: { back: .16, up: 0, dx: 0, dy: 0, sight: { x: -.0079, y: .165, z: -.012 } } },
  smg:     { file: W + 'smg/vector.dae', len: .62, grip: .30, gripDown: .25, tex: { '*': W + 'smg/albedo.jpg' }, ads: { back: .14, up: -.018, dx: -.0055, dy: .0011 }, hand2: .2 },   // ads: câmera atrás da mira holográfica; dx/dy centralizam a janela do holográfico no ponto vermelho
  sniper:  { file: W + 'sniper/sniper.fbx', hand2: .34, len: 1.15, grip: .33, gripDown: .2, tex: { '*': W + 'sniper/color.jpg' } },
  shotgun: { file: W + 'shotgun/spas.dae', hand2: .34, len: 1.0, grip: .3, gripDown: .2, tex: { Parts1: W + 'shotgun/parts1.jpg', Parts2: W + 'shotgun/parts2.jpg' } },
  pistol:  { file: W + 'pistol/magnum.fbx', hand2: .04, hand2Down: .05, cull: { axis: 'x', below: -50 }, len: .3, grip: .25, gripDown: .45, tex: { '*': W + 'pistol/color.jpg' } },
  // faca de energia (convertida do .blend com o Blender do usuário); Material.001 = lâmina que brilha
  // faca: M9 Bayonet (lâmina de aço, guarda, cabo) com materiais completos (cor, relevo, metal/aspereza) — desde 28/10
  knife:   { file: W + 'm9/knife.obj', len: .36, grip: .14, gripDown: .5, tex: { Blade: W + 'm9/blade_color.jpg', Guard: W + 'm9/guard_color.jpg', Handle: W + 'm9/handle_color.jpg' },
             pbr: { Blade: W + 'm9/blade', Guard: W + 'm9/guard', Handle: W + 'm9/handle' } },
  // karambit: pegada invertida (reverse: a lâmina curva sai por baixo do mindinho; o anel fica do lado do indicador)
  karambit: { file: W + 'karambit/karambit.fbx', len: .25, grip: .28, gripDown: .5, reverse: true, tex: { '*': W + 'karambit/karambit_color.jpg' }, pbr: { '*': W + 'karambit/karambit' } }
  // faca antiga (lâmina de energia), guardada para voltar se precisar:
  // knife: { file: W + 'eknife/knife.glb', len: .36, grip: .16, gripDown: .5, tex: { 'Material.001': W + 'eknife/m001.jpg', 'Material.002': W + 'eknife/m002.jpg', 'Material': W + 'eknife/m000.jpg' }, emis: { 'Material.001': W + 'eknife/m001_emis.jpg' } }
};

/** Normaliza o objeto carregado para o quadro padrão. Retorna um Group com a arma pronta (origem no punho, cano em +Z). */
/**
 * Luneta "aberta" na mira pela arma (AUG): o tubo por dentro (anéis cinza entre o aro de trás e a lente da frente) não é desenhado,
 * então pelo aro de trás se vê o cenário inteiro. Corta só o que está DENTRO do cone do aro (tan = raio/distância, visto da câmera)
 * e entre near e far (m) da câmera — o aro, o corpo da arma e as armas de outros jogadores (longe) continuam normais.
 */
const CUTS = {};
/** Reflexo de ambiente (sala genérica) só para os materiais que pedem (aço da faca). Criado uma vez, no primeiro desenho. */
const ENV_MATS = []; let ENV_TEX = null;
export function ensureWeaponEnv(renderer) {
  if (!ENV_MATS.length) return;
  if (!ENV_TEX) { const pm = new THREE.PMREMGenerator(renderer); ENV_TEX = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose(); }
  for (const m of ENV_MATS) if (m.envMap !== ENV_TEX) { m.envMap = ENV_TEX; m.envMapIntensity = .9; m.needsUpdate = true; }
  ENV_MATS.length = 0;
}
function scopeCutPatch(m, cfg) {
  const id = Object.keys(WEAPON_MODELS).find(k => WEAPON_MODELS[k] === cfg) || 'x';
  const U = CUTS[id] ??= { scopeOn: { value: 0 }, scopeTan: { value: cfg.scopeCut.tan }, scopeNear: { value: cfg.scopeCut.near }, scopeFar: { value: cfg.scopeCut.far } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float scopeOn, scopeTan, scopeNear, scopeFar;')
      .replace('void main() {', 'void main() {\n if (scopeOn > .5) { float zz = vViewPosition.z; if (zz > scopeNear && zz < scopeFar && length(vViewPosition.xy) < scopeTan * zz) discard; }');
  };
  m.customProgramCacheKey = () => 'scopeCut';
}
/** Liga o corte da luneta só da arma id (ou desliga todas com id = null). Chamar a cada quadro, antes de desenhar. */
export function setScopeCut(id, on) { for (const [k, U] of Object.entries(CUTS)) U.scopeOn.value = on && k === id ? 1 : 0; }

export function normalizeWeapon(obj, cfg, texLoader) {
  // alguns arquivos trazem luzes e câmeras junto (uma luz de intensidade 1000 estourava a cena): remove
  const junk = []; obj.traverse(n => { if (n.isLight || n.isCamera) junk.push(n); }); for (const n of junk) n.parent?.remove(n);
  // peça solta longe da arma (ex.: cartucho no arquivo da Magnum): junta os vértices num ponto só, some da vista
  if (cfg.cull) obj.traverse(n => {
    if (!n.isMesh) return; const pos = n.geometry.attributes.position, a = 'xyz'.indexOf(cfg.cull.axis);
    let keep = -1; for (let i = 0; i < pos.count; i++) if (pos.getComponent(i, a) >= cfg.cull.below) { keep = i; break; }
    if (keep < 0) return; const kx = pos.getX(keep), ky = pos.getY(keep), kz = pos.getZ(keep);
    for (let i = 0; i < pos.count; i++) if (pos.getComponent(i, a) < cfg.cull.below) pos.setXYZ(i, kx, ky, kz);
    pos.needsUpdate = true; n.geometry.computeBoundingBox(); n.geometry.computeBoundingSphere();
  });
  obj.updateMatrixWorld(true);
  // texturas e materiais (os caminhos de textura dentro dos arquivos raramente servem)
  const cache = {};
  const texFor = name => {
    const url = cfg.tex[name] || cfg.tex['*'] || Object.values(cfg.tex)[0]; if (!url) return null;
    if (!cache[url]) { cache[url] = texLoader.load(url); cache[url].colorSpace = THREE.SRGBColorSpace; cache[url].anisotropy = 4; }
    return cache[url];
  };
  const pts = [];
  obj.traverse(n => {
    if (!n.isMesh) return;
    const mats = [].concat(n.material).map(m => {
      const nm = (m && m.name) || '';
      if (/sky/i.test(nm) && !cfg.tex[nm]) { return new THREE.MeshBasicMaterial({ visible: false }); }   // peças "Sky" do FBX da sniper: lente/fundo do arquivo
      const mat = new THREE.MeshStandardMaterial({ map: texFor(nm), metalness: .55, roughness: .5, name: nm });
      const pb = cfg.pbr?.[nm] || cfg.pbr?.['*'];   // materiais completos: relevo (normal) + aspereza (G) e metal (B) num só arquivo
      if (pb) {
        const ld = (u, srgb) => { const t = texLoader.load(u); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
        mat.normalMap = ld(pb + '_normal.jpg'); const orm = ld(pb + '_orm.jpg'); mat.roughnessMap = mat.metalnessMap = orm; mat.metalness = 1; mat.roughness = 1;
        mat.userData.wantsEnv = true; ENV_MATS.push(mat);   // metal precisa de reflexo (sem ele o aço fica preto)
      }
      const e = cfg.emis?.[nm];   // brilho próprio (lâmina de energia)
      if (e) { const t = texLoader.load(e); t.colorSpace = THREE.SRGBColorSpace; mat.emissiveMap = t; mat.emissive.setRGB(1, 1, 1); mat.emissiveIntensity = 4; }
      return mat;
    });
    n.material = Array.isArray(n.material) ? mats : mats[0];
    // vidros das miras (opacos no arquivo): transparentes, para dar para mirar através deles
    // corpo da luneta de aumento: clareia um pouco (por dentro o tubo ficava todo preto na mira)
    if (cfg.lift?.test(n.name)) for (const m of [].concat(n.material)) { m.emissive?.setRGB(.16, .17, .18); if (m.map) m.emissiveMap = m.map; }
    if (cfg.glass?.test(n.name)) n.material = new THREE.MeshStandardMaterial({ color: 0x9fc7c4, transparent: true, opacity: .12, depthWrite: false, metalness: 0, roughness: .05, name: 'glass' });
    if (cfg.scopeCut) for (const m of [].concat(n.material)) scopeCutPatch(m, cfg);
    n.castShadow = true; n.receiveShadow = false;
    const pos = n.geometry.attributes.position, v = new THREE.Vector3();
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld); pts.push(v.clone()); }
  });
  // eixos pela caixa envolvente
  const box = new THREE.Box3().setFromPoints(pts), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const axes = ['x', 'y', 'z'].sort((a, b) => size[b] - size[a]);
  const L = axes[0], Hh = axes[1], D = axes[2];
  // ponta do cano: extremidade do eixo maior com menor seção transversal
  const span = size[L], end = s => { const sel = pts.filter(p => s > 0 ? p[L] > box.max[L] - span * .12 : p[L] < box.min[L] + span * .12);
    const b = new THREE.Box3().setFromPoints(sel), z = b.getSize(new THREE.Vector3()); return { area: z[Hh] * z[D], c: b.getCenter(new THREE.Vector3()) }; };
  const ePlus = end(1), eMinus = end(-1);
  let fwdSign = ePlus.area <= eMinus.area ? 1 : -1; if (cfg.flip) fwdSign *= -1;
  const muzzleC = fwdSign > 0 ? ePlus.c : eMinus.c;
  let upSign = muzzleC[Hh] >= c[Hh] ? 1 : -1; if (cfg.flipUp) upSign *= -1;
  // matriz de base: colunas = eixos do arquivo que viram X, Y, Z do quadro padrão
  const e = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  const zAx = e[L].clone().multiplyScalar(fwdSign), yAx = e[Hh].clone().multiplyScalar(upSign), xAx = new THREE.Vector3().crossVectors(yAx, zAx);
  const basis = new THREE.Matrix4().makeBasis(xAx, yAx, zAx).invert();   // arquivo -> padrão
  const s = cfg.len / span;
  // punho: a `grip` do comprimento a partir da coronha, `gripDown` da altura abaixo do centro
  const rearL = fwdSign > 0 ? box.min[L] : box.max[L];
  const gripFile = c.clone(); gripFile[L] = rearL + fwdSign * span * cfg.grip; gripFile[Hh] = c[Hh] - upSign * size[Hh] * cfg.gripDown;
  const inner = new THREE.Group(); inner.add(obj);
  const m = new THREE.Matrix4().makeScale(s, s, s).multiply(basis).multiply(new THREE.Matrix4().makeTranslation(-gripFile.x, -gripFile.y, -gripFile.z));
  inner.matrixAutoUpdate = false; inner.matrix.copy(m);
  const root = new THREE.Group(); root.add(inner);
  // pontos úteis no quadro padrão
  const toStd = p => p.clone().applyMatrix4(m);
  const muz = toStd(muzzleC); root.userData.muzzle = new THREE.Vector3(0, muz.y, muz.z);
  root.userData.sight = new THREE.Vector3(0, (box.max[Hh] - gripFile[Hh]) * upSign * s + .02, 0);
  // centro da mira (peças mais altas da arma: alça/holográfico) — onde a câmera olha ao mirar pela arma
  const topCut = upSign > 0 ? box.max[Hh] - size[Hh] * .22 : box.min[Hh] + size[Hh] * .22;
  const top = pts.filter(p => upSign > 0 ? p[Hh] > topCut : p[Hh] < topCut);
  if (top.length) { const tb = new THREE.Box3().setFromPoints(top), tc = toStd(tb.getCenter(new THREE.Vector3())); root.userData.sightC = new THREE.Vector3(0, tc.y, tc.z); }
  return root;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(),
  _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _hq = new THREE.Quaternion(), _rel = new THREE.Quaternion();

/**
 * Prende armas a um personagem animado, como se estivessem coladas na mão direita.
 * A rotação "arma em relação à mão" é medida na pose de mira (as duas mãos na arma: o cano vai da mão direita à esquerda)
 * e depois fica fixa: em qualquer animação a arma acompanha a mão, sem girar quando a mão esquerda sai do guarda-mão.
 */
const _cq = new THREE.Quaternion(), _cx = new THREE.Vector3(1, 0, 0), _ce = new THREE.Euler();
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fc = new THREE.Vector3(), _fd = new THREE.Vector3(), _fe = new THREE.Vector3(), _ff = new THREE.Vector3();
const _fq = new THREE.Quaternion(), _fp = new THREE.Quaternion(), _fw = new THREE.Quaternion(), _qI = new THREE.Quaternion();
/** Mão fechada: dobra de cada falange (graus, base → ponta) com "Fechar a mão" = 1. sign: lado para onde os dedos dobram. */
export const FIST = { finger: [60, 90, 55], thumb: [35, 40, 35], sign: 1 };   // dedos dobram em volta do eixo X do osso
const _lt = new THREE.Vector3();
const BLADE = id => id === 'knife' || id === 'karambit';   // armas brancas (mesma pegada de faca na mão)
const KNIFE_REL = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2));
export class HeldWeapon {
  /** kind: 'izzy' ou 'bot' (cada personagem tem os próprios ajustes do Lab de Armas). */
  constructor(charObj, models, kind = 'izzy', { flashLight = false } = {}) {
    this.char = charObj; this.models = models; this.cur = null; this.id = null; this.rel = null; this.kind = kind;
    this.scene = 'idle';   // cena atual (parado, andando, atirando...): escolhe o ajuste salvo no Lab
    this.live = null; this.liveLH = null;   // Lab: ajuste sendo editado (ainda não salvo)
    this.offP = new THREE.Vector3(); this.offQ = new THREE.Quaternion(); this.snap = true;
    this.baseQ = new THREE.Quaternion(); this.basePos = new THREE.Vector3();
    this.kickT = 9;   // tempo desde o último tiro (tranco)
    this.flash = new MuzzleFlash({ light: flashLight });   // clarão na ponta do cano (fica preso na arma atual)
    charObj.traverse(n => {
      if (!n.isBone) return;
      if (/RightHand$/.test(n.name)) this.rh = n; else if (/LeftHand$/.test(n.name)) this.lh = n;
      else if (/RightHandIndex1$/.test(n.name)) this.ri = n;
      else if (/RightHand(Pinky|Ring)1$/.test(n.name)) this.rp = n;   // outra ponta da linha dos nós dos dedos (Izzy tem anelar, não mindinho)
    });
    this.holder = new THREE.Group(); this.holder.userData.instance = true;
    this.la = this.lh?.parent?.parent; this.lf = this.lh?.parent;   // braço e antebraço esquerdos (IK)
    this.ikW = 0;
  }
  attachTo(scene) { scene.add(this.holder); if (this.flash.light) scene.add(this.flash.light); }   // a luz fica sempre na cena (trocar o número de luzes recompila tudo)
  /** Clarão de um tiro. auto: segurando o gatilho; small: mirando pela arma (menor, não tapa a mira). */
  muzzleFlash(auto = false, small = false) {
    if (!this.cur || BLADE(this.id) || !this.holder.visible) return;
    this.flash.fire(this.id, auto, small);
    if (this.flash.light) { const m = this.muzzleWorld; if (m) this.flash.light.position.copy(m); }
  }
  /** Tranco de um tiro (recuo + ferrolho da sniper). small: mirando pela luneta/mira (bem menor). */
  shotKick(small = false) { if (this.cur && SHOT_KICK[this.id]) { this.kickT = 0; this.kickSmall = small; } }
  /** Aplica o tranco (no quadro da arma). Chamado no fim do update. */
  _applyKick(dt) {
    const K = SHOT_KICK[this.id]; if (!K || this.kickT > 3) return;
    const t = this.kickT; this.kickT += dt;
    const a = .03, k = (t < a ? t / a : Math.exp(-(t - a) / (K.dur / 3))) * (this.kickSmall ? .35 : 1);
    let back = K.back * k, up = K.up * k, pitch = K.pitch * k, roll = 0;
    if (K.bolt && !this.kickSmall) {   // ferrolho: deita, baixa e volta
      const b = K.bolt, u = (t - b.at) / b.len;
      if (u > 0 && u < 1) { const w = smooth(Math.min(1, u * 3)) * (1 - smooth(Math.max(0, (u - .6) / .4))); roll = b.roll * w; up -= b.dip * w; pitch += b.pitch * w; }
    }
    if (k < .001 && !roll) return;
    _kv.set(0, up, -back).applyQuaternion(this.cur.quaternion); this.cur.position.add(_kv);
    this.cur.quaternion.multiply(_kq.setFromEuler(_ke.set(-pitch * DEG, 0, roll * DEG)));
  }
  set(id) {
    if (id === this.id) return; this.id = id; this.kickT = 9;
    if (this.cur) this.holder.remove(this.cur);
    const src = this.models[id]; this.cur = src ? src.clone() : null; if (this.cur) this.holder.add(this.cur);
    this.flash.attach(this.cur);
    this.snap = true;   // arma nova: o ajuste entra direto, sem deslizar
  }
  // (clone() de Object3D copia userData via JSON: os vetores viram objetos simples, por isso o copy)
  get muzzleWorld() { if (!this.cur) return null; return this.cur.localToWorld(new THREE.Vector3().copy(this.cur.userData.muzzle)); }
  get sightWorld() { if (!this.cur) return null; return this.cur.localToWorld(new THREE.Vector3().copy(this.cur.userData.sight)); }
  /** Quanto falta (rad) para o cano apontar no yaw/pitch da mira. Usado para girar o corpo e inclinar o tronco. */
  aimError(yaw, pitch) {
    if (!this.cur) return null;
    const d = _f.set(0, 0, 1).applyQuaternion(this.cur.quaternion);
    const wrap = a => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
    return { yaw: wrap(yaw - Math.atan2(-d.x, -d.z)), pitch: pitch - Math.asin(Math.max(-1, Math.min(1, d.y))) };
  }
  _palm(out) { this.rh.getWorldPosition(out); if (this.ri) out.lerp(this.ri.getWorldPosition(_b), .55); return out; }
  /** Mede a rotação arma↔mão na pose atual (chamar com o personagem na pose de mira). */
  calibrate(blend = 1) {
    if (!this.rh || !this.lh) return;
    this.char.updateMatrixWorld(true);
    const palm = this._palm(_a); this.lh.getWorldPosition(_b); _f.subVectors(_b, palm);
    if (_f.lengthSq() < 1e-4) return;
    _f.normalize(); _u.set(0, 1, 0); _r.crossVectors(_u, _f).normalize(); _u.crossVectors(_f, _r).normalize();
    _m.makeBasis(_r, _u, _f); _q.setFromRotationMatrix(_m);
    this.rh.getWorldQuaternion(_hq);
    const rel = _rel.copy(_hq).invert().multiply(_q);
    if (!this.rel || blend >= 1) this.rel = rel.clone(); else this.rel.slerp(rel, blend);
  }
  /**
   * Fecha os dedos da mão direita (0..1) por cima da animação. Pode ser chamado várias vezes no mesmo quadro sem acumular:
   * se o osso ainda está com o valor que nós pusemos, volta primeiro ao da animação.
   */
  _curl(k, wrist = null) {
    // punho (mão direita inteira): giro em graus [x, y, z] por cima da animação — a arma/faca vai junto
    if (!this._wr) this._wr = { b: this.rh, base: new THREE.Quaternion(), set: new THREE.Quaternion(), on: false };
    { const f = this._wr; if (f.b) { if (f.on && f.b.quaternion.equals(f.set)) f.b.quaternion.copy(f.base); f.on = false;
      if (wrist && (wrist[0] || wrist[1] || wrist[2])) { f.base.copy(f.b.quaternion); f.b.quaternion.multiply(_cq.setFromEuler(_ce.set(wrist[0] * DEG, wrist[1] * DEG, wrist[2] * DEG, 'XYZ'))); f.set.copy(f.b.quaternion); f.on = true; } } }
    // dedos: punho "humano" — cada falange é alinhada com a anterior (tira o dedo torto/aberto da animação) e dobrada
    // em volta do eixo dos nós dos dedos (indicador → anelar), igual a uma mão fechando de verdade
    if (!this._fing) {
      this._fing = []; const by = {}; this.char.traverse(n => { const m = n.isBone && /RightHand(Index|Middle|Ring|Pinky|Thumb)([1-4])$/.exec(n.name); if (m) (by[m[1]] ??= [])[+m[2] - 1] = n; });
      this._fingChains = Object.entries(by).map(([name, bs]) => ({ thumb: name === 'Thumb', bs: bs.filter(Boolean) })).filter(c => c.bs.length >= 3);
      for (const c of this._fingChains) for (const b of c.bs.slice(0, 3)) this._fing.push({ b, base: new THREE.Quaternion(), set: new THREE.Quaternion(), on: false });
      const f1 = n => this._fingChains.find(c => c.bs[0].name.includes(n))?.bs[0]; this._knu = [f1('Index'), f1('Pinky') || f1('Ring')];
    }
    for (const f of this._fing) { if (f.on && f.b.quaternion.equals(f.set)) f.b.quaternion.copy(f.base); f.on = false; }   // volta à animação
    if (k > 0 && this._knu[0] && this._knu[1]) {
      this.rh.updateWorldMatrix(true, true);
      const H = this.rh.getWorldPosition(_fa).clone(), across = this._knu[0].getWorldPosition(_fb).sub(this._knu[1].getWorldPosition(_fc)).normalize();
      // lado da palma: normal da mão, virada para onde as pontas dos dedos já dobram na animação
      const mid = this._fingChains.find(c => /Middle/.test(c.bs[0].name)) || this._fingChains.find(c => !c.thumb);
      const along = mid.bs[0].getWorldPosition(_fd).sub(H).normalize(), palm = new THREE.Vector3().crossVectors(across, along).normalize();
      let side = 0; for (const c of this._fingChains) if (!c.thumb) { const t = c.bs[c.bs.length - 1].getWorldPosition(_fb), b0 = c.bs[0].getWorldPosition(_fc); side += t.sub(b0).dot(palm); }
      if (Math.abs(side) < 1e-4) { const t = this._fingChains.find(c => c.thumb); if (t) side = t.bs[t.bs.length - 1].getWorldPosition(_fb).sub(H).dot(palm); }
      if (side < 0) palm.negate(); palm.multiplyScalar(FIST.sign);
      const knuW = this._knu[0].getWorldPosition(new THREE.Vector3()).distanceTo(this._knu[1].getWorldPosition(_fb));   // largura da mão
      const chains = [...this._fingChains].sort((a, b) => a.thumb - b.thumb);   // polegar por último: ele fecha por cima dos dedos já dobrados
      for (const c of chains) {
        const ang = c.thumb ? FIST.thumb : FIST.finger;
        let prev = c.bs[0].getWorldPosition(_fd).sub(H).normalize();
        // polegar: mira o meio do indicador/médio já fechados (por fora, do lado da palma) — cruza na frente dos dedos como num soco
        let T = null;
        if (c.thumb) { const ix = this._fingChains.find(x => /Index/.test(x.bs[0].name)), md = this._fingChains.find(x => /Middle/.test(x.bs[0].name)) || ix;
          T = ix.bs[2].getWorldPosition(new THREE.Vector3()).lerp(md.bs[2].getWorldPosition(_fb), .5).addScaledVector(palm, knuW * .35); }
        for (let j = 0; j < 3 && j + 1 < c.bs.length; j++) {
          const axis = _fe.crossVectors(prev, palm).normalize();   // girar "prev" em volta disto (+) leva o dedo para a palma
          const b = c.bs[j], P = b.getWorldPosition(_fb), cur = c.bs[j + 1].getWorldPosition(_fc).sub(P).normalize();
          let want;
          if (c.thumb && j === 0) want = _ff.copy(cur).lerp(_fd.copy(T).sub(P).normalize(), Math.min(1, k)).normalize();   // base do polegar vai até o alvo
          else if (c.thumb) want = _ff.copy(prev).applyAxisAngle(_fe.crossVectors(prev, _fd.copy(T).sub(P)).lengthSq() > 1e-8 ? _fe.normalize() : axis, ang[j] * k * DEG);   // pontas dobram em volta dos dedos
          else want = _ff.copy(prev).applyAxisAngle(axis, ang[j] * k * DEG);
          _fq.setFromUnitVectors(cur, want);
          b.parent.getWorldQuaternion(_fp); b.getWorldQuaternion(_fw);
          const rec = this._fing.find(x => x.b === b); rec.base.copy(b.quaternion);
          b.quaternion.copy(_fp.invert().multiply(_fq.multiply(_fw))); rec.set.copy(b.quaternion); rec.on = true;
          b.updateWorldMatrix(false, true); prev = want.clone();
        }
      }
    }
    this.rh?.updateMatrixWorld(true);
  }
  /** visible: mostra a arma; ads: { pos, quat, k } leva a arma para a frente da câmera (mira pela arma), k = 0..1. */
  update(visible = true, ads = null, dt = 1 / 60) {
    this.flash.update(dt);
    this.holder.visible = visible && !!this.cur; if (!this.cur || !this.rh || !visible) return;
    this.char.updateMatrixWorld(true);
    { const G = this.live || gripFor(this.kind, this.id, this.scene); this._curl(G.curl || 0, G.wrist); }   // fechar a mão e girar o punho (Lab)
    const palm = this._palm(_a);
    this.rh.getWorldQuaternion(_hq);
    if (BLADE(this.id) && this.ri && this.rp) {
      // faca na mão fechada: a lâmina sai do lado do polegar, na linha dos nós dos dedos (mindinho → indicador)
      this.ri.getWorldPosition(_b); this.rp.getWorldPosition(_f); _f.subVectors(_b, _f).normalize();   // eixo da lâmina
      if (WEAPON_MODELS[this.id]?.reverse) _f.negate();   // pegada invertida (karambit): a lâmina sai pelo lado do mindinho
      this.rh.getWorldPosition(_u); _u.subVectors(_b, _u);                                             // punho → dedos
      _r.crossVectors(_u, _f).normalize(); _u.crossVectors(_f, _r).normalize();
      _m.makeBasis(_r, _u, _f); this.cur.quaternion.setFromRotationMatrix(_m);
    } else if (BLADE(this.id)) this.cur.quaternion.copy(_hq).multiply(KNIFE_REL);
    else if (this.rel) this.cur.quaternion.copy(_hq).multiply(this.rel);
    else this.cur.quaternion.copy(_hq);
    // ajuste salvo no Lab de Armas para esta cena (troca de cena: desliza suave até o novo ajuste)
    this.baseQ.copy(this.cur.quaternion); this.basePos.copy(palm);
    const g = this.live || gripFor(this.kind, this.id, this.scene);
    _gp.fromArray(g.p); _gq.setFromEuler(_ge.set(g.r[0] * DEG, g.r[1] * DEG, g.r[2] * DEG));
    if (this.snap) { this.offP.copy(_gp); this.offQ.copy(_gq); this.snap = false; }
    else { const k = 1 - Math.exp(-dt * 14); this.offP.lerp(_gp, k); this.offQ.slerp(_gq, k); }
    this.cur.quaternion.multiply(this.offQ);
    this.cur.position.copy(this.offP).applyQuaternion(this.baseQ).add(palm);
    this._applyKick(dt);
    if (ads && ads.k > 0) { this.cur.position.lerp(ads.pos, ads.k); this.cur.quaternion.slerp(ads.quat, ads.k); }
  }
  /**
   * Leva a mão esquerda até o guarda-mão da arma (IK de dois ossos: braço + antebraço).
   * on: liga (segurando a arma) ou desliga suave (recarga, faca, troca). Chamar depois de update().
   */
  /** pole (opcional, direção no mundo): para onde o cotovelo aponta. 1ª pessoa usa "para baixo" (o antebraço vem da borda de baixo da tela). */
  /**
   * Mão esquerda LIVRE (faca/karambit na 1ª pessoa): o braço esquerdo aparece e a mão vai para um ponto fixo em relação ao corpo,
   * com giro próprio — ajustado no Lab ("Mão esquerda livre") e salvo na cena (lhFree). Não segue a arma.
   * F = { f, h, s (cm: frente, altura, lado esquerdo), rx, ry, rz (graus) } ou null (desliga).
   */
  /**
   * capture: pode tirar a referência do giro da mão agora? (só com a pose parada da faca já assentada — vindo de outra arma, a mão ainda
   * estava na pose dela e a referência saía errada: no jogo a mão esquerda ficava virada diferente do Lab, para sempre)
   */
  leftHandFree(F, pole = null, capture = true) {
    if (!F || !this.la || !this.lf || !this.lh) return false;
    this.char.updateMatrixWorld(true);
    const t = this.char.localToWorld(_lt.set(F.s || 0, F.h ?? 135, F.f ?? 35));   // modelo Mixamo: +z frente, +x lado esquerdo (cm)
    const a = this.la.getWorldPosition(_ia), b = this.lf.getWorldPosition(_ib), c = this.lh.getWorldPosition(_ic);
    twoBoneIK(this.la, this.lf, a, b, c, t);
    if (pole) elbowToward(this.la, this.lf, this.lh, pole, 1);
    // giro da mão: absoluto em relação ao corpo (referência = mão da animação, tirada uma vez)
    this.char.getWorldQuaternion(_hw); this.lf.updateMatrixWorld(true); this.lh.getWorldQuaternion(_hq0);
    if (!this._lfRef) { if (!capture) return true; this._lfRef = _hw.clone().invert().multiply(_hq0); }
    _hr.setFromEuler(_he.set((F.rx || 0) * DEG, (F.ry || 0) * DEG, (F.rz || 0) * DEG, 'XYZ'));
    _hq1.copy(_hw).multiply(_hr).multiply(this._lfRef);
    this.lf.getWorldQuaternion(_hp); this.lh.quaternion.copy(_hp.invert().multiply(_hq1)); this.lh.updateMatrixWorld(true);
    return true;
  }
  /** capture: pode tirar a referência do giro da mão agora? (só com a arma parada na pose — não no meio da troca/subida da arma) */
  leftHandIK(on, dt, pole = null, capture = true) {
    this.ikW += ((on && this.cur && !BLADE(this.id) ? 1 : 0) - this.ikW) * Math.min(1, dt * 12);
    if (this.ikW < .01 || !this.la || !this.lf || !this.cur) return;
    const lh = this.liveLH || leftHandOf(this.kind, this.id, this.scene);
    const t = _t.set(lh.s || 0, -lh.d, lh.f);
    this.cur.updateMatrixWorld(); this.cur.localToWorld(t);
    this.char.updateMatrixWorld(true);
    const a = this.la.getWorldPosition(_ia), b = this.lf.getWorldPosition(_ib), c = this.lh.getWorldPosition(_ic);
    t.lerp(c, 1 - this.ikW);
    twoBoneIK(this.la, this.lf, a, b, c, t);
    if (pole) elbowToward(this.la, this.lf, this.lh, pole, this.ikW);
    // giro da mão esquerda (graus, no quadro da arma, por cima da pose da animação): ex.: AUG — a mão fecha na empunhadura vertical
    // giro ABSOLUTO (não soma em cima do quadro anterior): mão = arma · giro · pose de referência da mão na arma
    // (a referência é tirada uma vez, da pose da animação, antes de qualquer giro) — assim a mão nunca fica girando sem parar
    if (lh.rx || lh.ry || lh.rz) {
      this.lf.updateMatrixWorld(true); this.lh.getWorldQuaternion(_hq0); this.cur.getWorldQuaternion(_hw);
      this._lhRef ??= {}; const key = this.id;   // UMA referência por arma (antes era por cena: ao atirar/recarregar a mão trocava de pegada)
      // a referência só é tirada com a mão JÁ presa na arma (IK inteiro): no jogo o IK entra aos poucos (troca de arma, início),
      // e uma referência tirada no meio do caminho deixava a mão torta, diferente do Lab
      if (!this._lhRef[key]) { if (this.ikW < .98 || !capture) return; this._lhRef[key] = _hw.clone().invert().multiply(_hq0); }   // mão vista pela arma, sem giro
      _hr.setFromEuler(_he.set((lh.rx || 0) * DEG, (lh.ry || 0) * DEG, (lh.rz || 0) * DEG, 'XYZ'));
      _hq1.copy(_hw).multiply(_hr).multiply(this._lhRef[key]);                    // alvo fixo para este giro
      _hq0.slerp(_hq1, this.ikW);
      this.lf.getWorldQuaternion(_hp); this.lh.quaternion.copy(_hp.invert().multiply(_hq0)); this.lh.updateMatrixWorld(true);
    }
  }
  dispose() { this.flash.dispose(); this.flash.light?.removeFromParent(); this.holder.parent?.remove(this.holder); }
}

const DEG = Math.PI / 180, _gp = new THREE.Vector3(), _gq = new THREE.Quaternion(), _ge = new THREE.Euler();
const _hq0 = new THREE.Quaternion(), _hq1 = new THREE.Quaternion(), _hw = new THREE.Quaternion(), _hr = new THREE.Quaternion(), _hd = new THREE.Quaternion(), _hp = new THREE.Quaternion(), _he = new THREE.Euler();
/** Mão esquerda padrão de uma arma (quando nada foi salvo no Lab). rx/ry/rz = giro da mão (graus), ex.: empunhadura vertical. */
/**
 * Mão esquerda a usar: a salva no Lab; senão, para arma com "base" (AUG ← VX), a POSIÇÃO da mão da VX (o braço fica igual)
 * com o GIRO próprio da arma (hand2Rot: só a mão gira para fechar na empunhadura); senão, o padrão da arma.
 */
/**
 * 1ª pessoa: a mão esquerda só é PUXADA para a arma (IK) quando você ajustou o giro da mão no Lab (ex.: AUG, empunhadura vertical).
 * Nas outras armas fica a mão da própria animação — é exatamente o que o Lab mostra com "Ver a mão esquerda segurando" desligado,
 * que é como as pegadas foram ajustadas. (Antes o jogo puxava sempre a mão para um ponto padrão e o braço ficava esticado/diferente do Lab.)
 */
export function fpUsesIK(kind, id) { if (!id || BLADE(id)) return false; const lh = leftHandOf(kind, id, 'fp_walk'); return !!(lh && (lh.rx || lh.ry || lh.rz)); }
export function leftHandOf(kind, id, scene) {
  const own = leftHandFor(kind, id, scene); if (own) return own;
  const b = GRIP_BASE[id], d = defaultLeftHand(id);
  if (b) { const p = leftHandFor(kind, b, scene) || defaultLeftHand(b); return { f: p.f, d: p.d, s: p.s || 0, rx: d.rx, ry: d.ry, rz: d.rz }; }
  return d;
}
export const defaultLeftHand = id => { const c = WEAPON_MODELS[id] || {}, r = c.hand2Rot || [0, 0, 0]; return { f: c.hand2 ?? .25, d: c.hand2Down ?? .015, s: c.hand2Side ?? 0, rx: r[0], ry: r[1], rz: r[2] }; };
const _t = new THREE.Vector3(), _ia = new THREE.Vector3(), _ib = new THREE.Vector3(), _ic = new THREE.Vector3();
const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _ax0 = new THREE.Vector3(), _ax1 = new THREE.Vector3();
const _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const acos = x => Math.acos(Math.max(-1, Math.min(1, x)));
/**
 * Gira o braço inteiro em volta da linha ombro→mão até o cotovelo ficar do lado de `pole` (a mão não sai do lugar).
 * k: 0..1 (quanto aplicar).
 */
const _pa = new THREE.Vector3(), _pe = new THREE.Vector3(), _pp = new THREE.Vector3(), _eq = new THREE.Quaternion(), _ew = new THREE.Quaternion(), _er = new THREE.Quaternion();
function elbowToward(boneA, boneB, hand, pole, k = 1) {
  const a = boneA.getWorldPosition(_ia), h = hand.getWorldPosition(_ic), ax = _pa.subVectors(h, a); if (ax.lengthSq() < 1e-8) return; ax.normalize();
  const e = boneB.getWorldPosition(_ib).sub(a); e.addScaledVector(ax, -e.dot(ax));
  const p = _pp.copy(pole); p.addScaledVector(ax, -p.dot(ax));
  if (e.lengthSq() < 1e-8 || p.lengthSq() < 1e-8) return; e.normalize(); p.normalize();
  let ang = Math.acos(Math.max(-1, Math.min(1, e.dot(p)))); if (_pe.crossVectors(e, p).dot(ax) < 0) ang = -ang;
  _eq.setFromAxisAngle(ax, ang * k);
  boneA.getWorldQuaternion(_ew); boneA.parent.getWorldQuaternion(_er);
  boneA.quaternion.copy(_er.invert().multiply(_eq.multiply(_ew))); boneA.updateMatrixWorld(true);
}

/** IK analítico de dois ossos (ombro A → cotovelo B → mão C) para alcançar T, mantendo o plano atual do cotovelo. */
function twoBoneIK(boneA, boneB, a, b, c, t) {
  const lab = _v1.subVectors(b, a).length(), lcb = _v2.subVectors(c, b).length();
  const lat = Math.max(.01, Math.min(_v3.subVectors(t, a).length(), lab + lcb - .001));
  const ac = _v1.subVectors(c, a), ab = _v2.subVectors(b, a), at = _v3.subVectors(t, a);
  const lac = ac.length(); if (lac < 1e-4) return;
  const ac_ab_0 = acos(ac.dot(ab) / (lac * lab)), ba_bc_0 = acos(_w1.subVectors(a, b).normalize().dot(_w2.subVectors(c, b).normalize()));
  const ac_at_0 = acos(ac.dot(at) / (lac * at.length()));
  const ac_ab_1 = acos((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat)), ba_bc_1 = acos((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb));
  _ax0.crossVectors(ac, ab); if (_ax0.lengthSq() < 1e-10) _ax0.set(0, 0, 1); _ax0.normalize();
  _ax1.crossVectors(ac, at); const has1 = _ax1.lengthSq() > 1e-10; if (has1) _ax1.normalize();
  _q0.setFromAxisAngle(_ax0, ac_ab_1 - ac_ab_0); _q1.setFromAxisAngle(_ax0, ba_bc_1 - ba_bc_0); _q2.setFromAxisAngle(has1 ? _ax1 : _ax0, has1 ? ac_at_0 : 0);
  // cotovelo (giro no mundo convertido para o espaço do pai, que ainda é o ombro original)
  boneB.getWorldQuaternion(_wq); boneA.getWorldQuaternion(_pq);
  boneB.quaternion.copy(_pq.clone().invert().multiply(_q1.multiply(_wq)));
  // ombro
  boneA.getWorldQuaternion(_wq); boneA.parent.getWorldQuaternion(_pq);
  boneA.quaternion.copy(_pq.invert().multiply(_q2.multiply(_q0).multiply(_wq)));
  boneA.updateMatrixWorld(true);
}
