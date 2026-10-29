import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { WEAPON_MODELS, normalizeWeapon } from '../weapons/WeaponModels.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ANIMS, FOLDER } from './AnimTable.js';
import { loadGrips } from '../weapons/Grips.js';
export { ANIMS, AUTHORED } from './AnimTable.js';

/**
 * Carrega uma vez (no início da página) tudo que vem de arquivo: mapa, personagens, animações e armas.
 * Fica em memória entre partidas: o Game.stop() NÃO descarta nada daqui (objetos marcados com userData.asset).
 */
const A = 'assets/';

export class Assets {
  constructor() { this.ready = false; this.error = null; this.map = null; this.chars = {}; this.clips = {}; this.weapons = {}; this.progress = 0; }

  /** opts.map = false: não carrega o mapa (Lab de Armas). */
  async load(onProgress = () => {}, opts = {}) {
    const jobs = [], done = { n: 0 }, tick = () => { done.n++; this.progress = done.n / jobs.length; onProgress(this.progress); };
    const fbx = new FBXLoader(), gltf = new GLTFLoader();
    const job = p => { const j = p.then(r => { tick(); return r; }); jobs.push(j); return j; };
    const mapP = opts.map === false ? Promise.resolve({ scene: null }) : job(gltf.loadAsync(A + 'maps/warehouse.glb'));
    const gripsP = loadGrips();   // ajustes de arma na mão (Lab de Armas)
    const izzyP = job(fbx.loadAsync(A + 'characters/izzy.fbx'));
    const botP = job(fbx.loadAsync(A + 'characters/bot.fbx'));
    const animP = Object.entries(ANIMS).map(([id, file]) =>
      job(fbx.loadAsync(encodeURI(`${A}anims/${FOLDER(id)}/${file}.fbx`)).then(o => [id, o.animations[0]])));
    // armas: se uma falhar, o jogo segue sem o modelo dela (aviso no console)
    // os arquivos das armas apontam para texturas originais que não existem aqui (as nossas são trocadas no normalizeWeapon):
    // um gerenciador que devolve uma imagem vazia evita os erros 404 no console
    const EMPTY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const wm = new THREE.LoadingManager(); wm.setURLModifier(u => /\.(png|tga|tif|tiff|bmp|psd)(\?|$)/i.test(u) && !u.startsWith('data:') && !u.startsWith('blob:') ? EMPTY : u);
    const dae = new ColladaLoader(wm), wfbx = new FBXLoader(wm), tl = new THREE.TextureLoader();
    const wP = Object.entries(WEAPON_MODELS).map(([id, cfg]) => job((cfg.file.endsWith('.dae') ? dae.loadAsync(cfg.file).then(r => r.scene) : cfg.file.endsWith('.glb') ? gltf.loadAsync(cfg.file).then(r => r.scene) : cfg.file.endsWith('.obj') ? new OBJLoader(wm).loadAsync(cfg.file) : wfbx.loadAsync(cfg.file))
      .then(o => [id, normalizeWeapon(o, cfg, tl)]).catch(e => { console.warn('Arma sem modelo:', id, e); return [id, null]; })));
    const [map, izzy, bot, ...rest] = await Promise.all([mapP, izzyP, botP, ...animP, ...wP]);
    const anims = rest.slice(0, animP.length);
    for (const [id, m] of rest.slice(animP.length)) if (m) { m.userData.asset = true; this.weapons[id] = m; }
    await gripsP;
    this.map = map.scene; if (this.map) this.map.userData.asset = true;
    this.chars.izzy = this._prepChar(izzy); this.chars.bot = this._prepChar(bot);
    for (const [id, clip] of anims) { clip.name = id; this.clips[id] = this._prepClip(id, clip); }
    this._fillFingers();
    this.ready = true; return this;
  }

  /**
   * Mapa do TREINO (stand de tiro): carrega na primeira vez que o treino abre (fica em memória depois).
   * O FBX aponta para texturas com outros nomes/pastas: todas ficam em assets/maps/shooting_range/tex/<nome>.jpg.
   * O arquivo vem sem normais (a luz deixava tudo preto): são calculadas aqui. Unidade do arquivo: cm.
   */
  loadRange(onProgress = () => {}) {
    if (this.range) return Promise.resolve(this.range);
    return this._rangeP ??= (async () => {
      const M = new THREE.LoadingManager();
      M.setURLModifier(u => /\.(jpe?g|png|tga|tif|tiff|bmp)(\?|$)/i.test(u) && !u.startsWith('data:') && !u.startsWith('blob:')
        ? A + 'maps/shooting_range/tex/' + decodeURIComponent(u.split(/[\\/]/).pop()).replace(/\.[a-z]+$/i, '.jpg') : u);
      const obj = await new FBXLoader(M).loadAsync(A + 'maps/shooting_range/shooting_range.fbx', e => { if (e.total) onProgress(e.loaded / e.total); });
      obj.scale.setScalar(.01);
      obj.traverse(o => {
        if (!o.isMesh) return;
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        o.receiveShadow = true; o.castShadow = !/Ceiling/.test(o.name);   // o teto não projeta sombra (a luz fica embaixo dele)
        for (const m of [].concat(o.material)) {
          m.side = THREE.DoubleSide;
          if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = 4; }
          if (/LED/.test(m.name)) { m.emissive?.set(0xffffff); m.emissiveIntensity = 1.2; }   // luminárias acesas
          if (/Glass/.test(m.name)) { m.transparent = true; m.opacity = .55; m.depthWrite = false; }   // vidro das baias: dá para ver através
          m.shininess = Math.min(m.shininess ?? 30, 30);
        }
      });
      obj.userData.asset = true; this.range = obj; return obj;
    })().catch(e => { this._rangeP = null; throw e; });
  }

  _prepChar(o) {
    o.userData.asset = true;
    o.traverse(n => {
      if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false;   // malha com skin: a caixa de corte não acompanha a animação
        for (const m of [].concat(n.material)) { m.side = THREE.FrontSide; if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; m.shininess = 8; m.specular?.setScalar?.(.08); } }
    });
    const bones = new Set(); o.traverse(n => { if (n.isBone) bones.add(n.name); });
    return { root: o, bones };
  }

  /** Remove o deslocamento horizontal do quadril (quem move o personagem é a física). No pulo, o quadril não sobe (a física sobe). */
  _prepClip(id, clip) {
    const air = /jump|vault/.test(id);
    for (const t of clip.tracks) {
      if (!/Hips\.position$/.test(t.name)) continue;
      const v = t.values;
      // salto por cima: guarda o caminho do quadril (cm) — a física usa para mover o jogador junto com a animação
      if (id === 'knife_vault') clip.userData = { root: { t: Array.from(t.times), y: Array.from(v.filter((_, i) => i % 3 === 1)), z: Array.from(v.filter((_, i) => i % 3 === 2)) } };
      for (let i = 3; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; if (air) v[i + 1] = Math.min(v[i + 1], v[1]); }
    }
    return clip;
  }

  /**
   * Algumas animações vêm só com polegar e indicador: os outros dedos da Izzy voltariam para a pose de "T" (mão aberta, faca solta).
   * Completa os dedos que faltam com a pose parada da mesma pasta (faca: segurando a faca; armas: segurando o fuzil).
   */
  _fillFingers() {
    const FING = /(Thumb|Index|Middle|Ring|Pinky)\d/;
    for (const [id, clip] of Object.entries(this.clips)) {
      const ref = this.clips[id.startsWith('knife') ? 'knife_idle' : id.startsWith('pistol') ? 'pistol_idle' : 'idle']; if (!ref || ref === clip) continue;
      const have = new Set(clip.tracks.map(t => t.name));
      for (const t of ref.tracks) {
        if (have.has(t.name) || !FING.test(t.name.split('.')[0])) continue;
        const n = t.getValueSize(); clip.tracks.push(new t.constructor(t.name, [0], Array.from(t.values.slice(0, n))));
      }
    }
  }

  /** Cópia do personagem com esqueleto próprio + clipes filtrados para os ossos que ele tem. */
  instance(kind) {
    const c = this.chars[kind], obj = cloneSkinned(c.root);
    obj.userData.asset = false; obj.userData.instance = true;
    const key = '_clips_' + kind;
    if (!this[key]) this[key] = Object.fromEntries(Object.entries(this.clips).map(([id, clip]) =>
      [id, new THREE.AnimationClip(id, clip.duration, clip.tracks.filter(t => c.bones.has(t.name.split('.')[0])))]));
    return { obj, clips: this[key] };
  }
}
