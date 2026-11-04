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

/**
 * Kits do ADAPTADOR UNIVERSAL (_fonte/bracos/assar_kit.py + kits_universais.json): arquivo assets/weapons/vm/<kit>_<personagem>.glb,
 * texturas da arma em assets/weapons/vm/<prefixo>_color/_normal/_orm.jpg. gun: nome do material original -> prefixo ('#vidro' = lente).
 */
export const KITS_V2 = {
  l11: { v2: true, dir: 'vm/', gun: { sniper: 'l11_sniper', lens: '#vidro', scopereticle: '#esconder' } },
  sniper2: { v2: true, dir: 'vm/', gun: { sniper: 'sniper2_sniper', lens: '#vidro' } },
  faca: { v2: true, dir: 'vm/', gun: { knife: 'faca_knife' } },
  magnum: { v2: true, dir: 'vm/', gun: { '*': 'magnum_arma' } },
  shotgun2: { v2: true, dir: 'vm/', gun: { '*': 'shotgun2_boomstick' } },
  smg2: { v2: true, dir: 'vm/', gun: { Material_457: 'smg2_corpo', Material_458: 'smg2_guarda', Material_459: 'smg2_corpo', '*': 'smg2_corpo' } },
  m4a1s: { v2: true, dir: 'vm/', gun: { '*': 'm4a1s_corpo' } }
};

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
    const nadeP = job(this._loadGrenade(wm, tl).catch(e => { console.error('Granada: modelo não carregou (assets/weapons/grenade/grenade.fbx):', e); return null; }));
    const [map, izzy, bot, ...rest] = await Promise.all([mapP, izzyP, botP, ...animP, ...wP]);
    this.grenade = await nadeP;
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
   * Viewmodel novo da pistola (pacote "Pistol 43 Tactical"): braços BF3 + Glock no mesmo esqueleto, com câmera e animações.
   * Arquivo original sem mudanças em assets/weapons/glock_fps/glock_anim.fbx; texturas reduzidas (2048/1024) ao lado.
   * Carrega em segundo plano depois do jogo pronto (não atrasa a tela de carregamento). Tira do arquivo o que é da cena
   * de exemplo (luzes, plano de fundo e objetos vazios).
   */
  loadPistolVM() {
    return this._pvmP ??= (async () => {
      const D = A + 'weapons/glock_fps/', EMPTY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const M = new THREE.LoadingManager(); M.setURLModifier(u => /\.(png|tga|dds|jpe?g)(\?|$)/i.test(u) && !u.startsWith('data:') && !u.startsWith('blob:') ? EMPTY : u);
      const rig = await new FBXLoader(M).loadAsync(D + 'glock_anim.fbx');
      const tl = new THREE.TextureLoader(), T = (f, srgb) => { const t = tl.load(D + f); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
      const gun = new THREE.MeshStandardMaterial({ name: 'Glock', map: T('glock_base.jpg', true), normalMap: T('glock_normal.jpg'), metalnessMap: T('glock_metal.jpg'),
        roughnessMap: T('glock_rough.jpg'), metalness: 1, roughness: 1, emissiveMap: T('glock_emis.jpg', true), emissive: 0xffffff, emissiveIntensity: .6 });
      const sleeve = new THREE.MeshStandardMaterial({ name: 'BF3_0011', map: T('tex_0011_1.jpg', true), roughness: .85, metalness: 0 });
      const hand = new THREE.MeshStandardMaterial({ name: 'BF3_0012', map: T('tex_0012_1.jpg', true), roughness: .8, metalness: 0 });
      const junk = [];
      rig.traverse(o => {
        if (o.isLight || (o.isMesh && !o.isSkinnedMesh)) junk.push(o);   // luzes e plano/esfera da cena de exemplo
        if (o.isSkinnedMesh) {
          o.frustumCulled = false; o.castShadow = o.receiveShadow = false;
          if (o.name === 'Glock') o.material = gun;
          else o.material = [].concat(o.material).map(m => /0011/.test(m.name) ? sleeve : /0012/.test(m.name) ? hand : m);
        }
      });
      for (const o of junk) o.removeFromParent();
      if (!rig.getObjectByName('Camera') || !rig.getObjectByName('Barrel_end')) throw new Error('viewmodel da pistola: arquivo sem Camera ou Barrel_end');
      rig.userData.asset = true; this.pistolVM = rig; return rig;
    })().catch(e => { this._pvmP = null; console.error('Viewmodel novo da pistola não carregou:', e); throw e; });
  }

  /** viewmodel da pistola pelo nome do kit (PistolViewmodel.KITS): 'mm9' (padrão) ou 'glock' */
  loadPistolKit(kit = 'p9', char = 'izzy') { return kit === 'glock' ? this.loadPistolVM() : kit === 'mm9' ? this.loadPistolMM9() : this.loadKit(kit === 'izzy9' ? 'p9' : kit, char); }
  /**
   * Kits com os BRAÇOS DA IZZY (o mesmo braço em todas as armas): feitos no Blender a partir dos kits do LokitoBlu
   * (_fonte/izzy_arms/build.py: malha dos braços da Izzy vestida no esqueleto do kit, com o tamanho de braço dela).
   * A pele usa a MESMA textura da Izzy (vem do modelo dela, já carregado); a arma usa as texturas do kit.
   *  izzy9 = pistola 9 mm; ak = AK-74M.
   */
  loadKit(kit, char = 'izzy') {
    this._kitP ??= {};
    return this._kitP[kit + '/' + char] ??= (async () => {
      // texturas da ARMA de cada kit (a pele vem do personagem)
      const K = { p9: { dir: 'pistol_anim/', gun: { '9m1': 'p9m1', '9m2': 'p9m2' } }, ak: { dir: 'ak_anim/', gun: { '*': 'ak' } }, ...KITS_V2 }[kit];
      if (!K) throw new Error('kit desconhecido: ' + kit);
      // quais personagens já têm braços gerados neste kit (assets/config/bracos_gerados.json); sem o personagem, usa os da Izzy
      this._bracosP ??= fetch(A + 'config/bracos_gerados.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : { kits: {} }).catch(() => ({ kits: {} }));
      const lista = (await this._bracosP).kits?.[kit] || {}, who = lista[char] ? char : lista.izzy ? 'izzy' : char;
      if (who !== char) console.warn(`Braços de "${char}" ainda não gerados no kit ${kit}: usando os da Izzy (rode "5 - GERAR BRACOS DOS PERSONAGENS.bat")`);
      let file = lista[who] || `assets/weapons/${K.dir}${kit}_${who}.glb`;
      const D = A + 'weapons/' + K.dir;
      let g; try { g = await new GLTFLoader().loadAsync(file); }
      catch (e) { if (who === 'izzy') throw e; console.warn(`Braços de "${who}" não encontrados no kit ${kit}: usando os da Izzy`); g = await new GLTFLoader().loadAsync(file = `assets/weapons/${K.dir}${kit}_izzy.glb`); }
      const tl = new THREE.TextureLoader(), T = (f, srgb) => { const t = tl.load(D + f); t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
      const mats = {}, gunMat = key => mats[key] ??= new THREE.MeshStandardMaterial({ name: key, map: T(key + '_color.jpg', true), normalMap: T(key + '_normal.jpg'),
        roughnessMap: T(key + '_orm.jpg'), metalnessMap: T(key + '_orm.jpg'), roughness: 1, metalness: 1 });
      if (!this.chars[who] && !this._charRaw?.[who]) { this._charRaw ??= {}; this._charRaw[who] = await new FBXLoader().loadAsync(A + 'characters/' + who + '.fbx'); }   // Lab: personagem ainda não carregado
      const skin = n => this._charSkin(who, n);
      const shell = new THREE.MeshStandardMaterial({ name: 'cápsula', map: T('../pistol_anim/shell_color.jpg', true), roughness: .35, metalness: 1 });
      const rig = g.scene; rig.animations = g.animations;
      for (const a of rig.animations) if (!(a.duration > 1e-3)) a.duration = 1 / 30;   // clipe de 1 quadro (ex.: parado da M4A1-S): sem isso o tempo vira NaN
      rig.traverse(o => {
        if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = o.receiveShadow = false;
        const n = o.material?.name || '';
        if (n.startsWith('arma:')) {   // kit do adaptador universal: material da arma pelo nome original
          const t = K.gun[n.slice(5)] ?? K.gun['*'];
          o.material = t === '#vidro' ? new THREE.MeshStandardMaterial({ name: 'vidro', color: 0x0a1418, roughness: .05, metalness: .9, transparent: true, opacity: .55 })
            : t === '#esconder' ? new THREE.MeshBasicMaterial({ visible: false }) : t ? gunMat(t) : new THREE.MeshStandardMaterial({ name: n, color: 0x2a2d30, roughness: .45, metalness: .7 });
          return;
        }
        o.material = (o.name.startsWith('Bracos_') || n.startsWith('pele:')) ? skin(n.replace(/^pele:/, '')) : /shell|bullet/.test(n) ? shell : gunMat(K.gun[n.replace(/\..*/, '')] || K.gun['*'] || Object.values(K.gun)[0]);
      });
      const camOk = rig.getObjectByName('Camera') || (() => { let c = null; rig.traverse(o => { if (o.isCamera && !c) c = o; }); if (c) c.name = 'Camera'; return c; })();
      if (!camOk || (!K.v2 && (!rig.getObjectByName('Slide') || !rig.getObjectByName('r_wrist')))) throw new Error('kit ' + kit + ': arquivo sem Camera, Slide ou r_wrist');
      rig.userData.asset = true; return rig;
    })().catch(e => { this._kitP[kit + '/' + char] = null; console.error('Kit ' + kit + ' não carregou:', e); throw e; });
  }
  /** pele dos braços: o material do PRÓPRIO personagem com esse nome (no Lab, carrega o modelo dele se ainda não estiver) */
  _charSkin(char, matName) {
    this._skinM ??= {}; const key = char + '/' + matName;
    return this._skinM[key] ??= (() => {
      const root = this.chars[char]?.root || this._charRaw?.[char]; let src = null, first = null;
      root?.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { first ??= m; if (m.name === matName) src ??= m; } });
      src ??= first;
      const map = src?.map ? src.map.clone() : null;
      if (map) { map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true; }   // UV do GLB é invertida em relação ao FBX
      return new THREE.MeshStandardMaterial({ name: 'pele_' + char, map, roughness: .7, metalness: 0 });
    })();
  }
  /**
   * Kit "Pistol Animations (BLENDER)" do Sketchfab (autor LokitoBlu; arma 9 mm de @TORI106): braços + arma + câmera +
   * animações num esqueleto só. Convertido do .blend com o Blender para assets/weapons/pistol_anim/pistol_anim.glb (sem imagens
   * dentro); as texturas ficam ao lado, em JPG. orm = oclusão (R), aspereza (G), metal (B).
   */
  loadPistolMM9() {
    return this._mm9P ??= (async () => {
      const D = A + 'weapons/pistol_anim/';
      const g = await new GLTFLoader().loadAsync(D + 'pistol_anim.glb');
      const tl = new THREE.TextureLoader(), T = (f, srgb) => { const t = tl.load(D + f); t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
      const gun = n => new THREE.MeshStandardMaterial({ name: '9' + n, map: T(`p9${n}_color.jpg`, true), normalMap: T(`p9${n}_normal.jpg`),
        roughnessMap: T(`p9${n}_orm.jpg`), metalnessMap: T(`p9${n}_orm.jpg`), roughness: 1, metalness: 1 });
      const M = {
        m1: gun('m1'), m2: gun('m2'),
        arm: new THREE.MeshStandardMaterial({ name: 'pele', map: T('arm_color.jpg', true), normalMap: T('arm_normal.jpg'), roughness: .62, metalness: 0 }),
        sleeve: new THREE.MeshStandardMaterial({ name: 'manga', map: T('sleeve_color.jpg', true), normalMap: T('sleeve_normal.jpg'), roughness: .9, metalness: 0 }),
        shell: new THREE.MeshStandardMaterial({ name: 'cápsula', map: T('shell_color.jpg', true), roughness: .35, metalness: 1 }),
        bullet: new THREE.MeshStandardMaterial({ name: 'bala', map: T('bullet_color.jpg', true), roughness: .35, metalness: 1 })
      };
      const pick = n => /^9m1/.test(n) ? M.m1 : /^9m2/.test(n) ? M.m2 : /shell/.test(n) ? M.shell : /bullet/.test(n) ? M.bullet
        : /sleeve/.test(n) ? M.sleeve : /arm|organic/.test(n) ? M.arm : null;
      const rig = g.scene; rig.animations = g.animations; const junk = [];
      rig.traverse(o => {
        if (o.isLight) junk.push(o);
        if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; const m = pick(o.material?.name || ''); if (m) o.material = m; }
      });
      for (const o of junk) o.removeFromParent();
      if (!rig.getObjectByName('Camera') || !rig.getObjectByName('Slide') || !rig.getObjectByName('r_wrist')) throw new Error('viewmodel 9 mm: arquivo sem Camera, Slide ou r_wrist');
      rig.userData.asset = true; this.pistolMM9 = rig; return rig;
    })().catch(e => { this._mm9P = null; console.error('Viewmodel 9 mm não carregou:', e); throw e; });
  }

  /**
   * Braços "FPS arms (rigged only)" do OpenGameArt (autor: para, licença CC0, malha feita no MakeHuman).
   * Em metros; mão solta do antebraço (no Blender ela era presa por IK, que o FBX não traz): o ArmRetarget leva a mão
   * direto à pegada da arma e dobra o braço até ela. Carrega junto com o viewmodel da pistola, em segundo plano.
   */
  loadOgaArms() {
    return this._ogaP ??= (async () => {
      const D = A + 'weapons/fps_arms/', EMPTY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const M = new THREE.LoadingManager(); M.setURLModifier(u => /\.(png|tga|jpe?g)(\?|$)/i.test(u) && !u.startsWith('data:') && !u.startsWith('blob:') ? EMPTY : u);
      const obj = await new FBXLoader(M).loadAsync(D + 'arms.fbx');
      const map = new THREE.TextureLoader().load(D + 'arms_diff.png'); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
      const mat = new THREE.MeshStandardMaterial({ name: 'pele', map, roughness: .62, metalness: 0 });
      obj.traverse(o => { if (o.isSkinnedMesh) { o.material = mat; o.frustumCulled = false; o.castShadow = o.receiveShadow = false; } });
      if (!obj.getObjectByName('handR') || !obj.getObjectByName('upper_armR')) throw new Error('braços OGA: ossos não encontrados');
      obj.userData.asset = true; this.ogaArms = obj; return obj;
    })().catch(e => { this._ogaP = null; console.error('Braços OGA não carregaram:', e); throw e; });
  }

  /**
   * Granada M67 (assets/weapons/grenade/grenade.fbx + texturas m67_d.jpg / m67_n.png).
   * O arquivo vem em outra escala e deitado: aqui fica de pé, com o centro do corpo no meio (pivô) e 9,5 cm de altura (tamanho real).
   * Visual separado da física: o colisor é uma esfera (Grenades.js / NADE.radius).
   */
  async _loadGrenade(wm, tl) {
    const raw = await new FBXLoader(wm).loadAsync(A + 'weapons/grenade/grenade.fbx');
    const map = tl.load(A + 'weapons/grenade/m67_d.jpg'), nrm = tl.load(A + 'weapons/grenade/m67_n.png');
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map, normalMap: nrm, roughness: .55, metalness: .35, name: 'M67' });
    raw.traverse(o => { if (o.isMesh) { if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); o.material = mat; o.castShadow = true; } });
    raw.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(raw), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const k = .095 / Math.max(size.x, size.y, size.z);
    raw.position.sub(mid); const g = new THREE.Group(); g.add(raw); g.scale.setScalar(k);
    const root = new THREE.Group(); root.add(g); root.name = 'grenade'; root.userData.asset = true;
    return root;
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
