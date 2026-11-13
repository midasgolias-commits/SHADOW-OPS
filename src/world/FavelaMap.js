import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * FAVELA: visual do mapa FavelaRJ (feito na Unreal e simplificado para o navegador em FavelaRJ_UE/Web/tools).
 * Arquivos em assets/maps/favela: glb/<categoria>/*.glb (malhas com meshopt), tex/*.jpg, mats.json (materiais),
 * inst.json + inst/*.bin (árvores e objetos), fora.json (casas dos bairros de fora).
 * Coordenadas = as da colisão (FavelaData.js): x leste, y cima, z sul, metros. Carrega uma vez e é reaproveitado
 * entre partidas (o grupo tem userData.asset, como o CELEIRO).
 */
const VS_WPOS = `
  vec4 rjW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    rjW = instanceMatrix * rjW;
  #endif
  vWPos = (modelMatrix * rjW).xyz;
`;
// Textura projetada pelo mundo (as construções não têm UV): cobre "tile" metros pelo plano mais de frente.
const FS_TRI = `
  varying vec3 vWPos;
  vec3 rjNormalMundo() { return normalize(cross(dFdx(vWPos), dFdy(vWPos))); }
  vec4 rjTri(sampler2D t, vec2 tile, vec3 n) {
    vec3 w = pow(abs(n), vec3(6.0)); w /= (w.x + w.y + w.z);
    vec4 a = texture2D(t, vec2(vWPos.z, vWPos.y) / tile);
    vec4 b = texture2D(t, vec2(vWPos.x, vWPos.z) / tile.xx);
    vec4 c = texture2D(t, vec2(vWPos.x, vWPos.y) / tile);
    return a * w.x + b * w.y + c * w.z;
  }
`;
const ORDEM = ['terreno', 'extras', 'vias', 'valao', 'casas', 'vidros', 'bope'];
const PESO = { terreno: 7, extras: 3, vias: 5, valao: .5, casas: 22, vidros: .5, bope: .1 };   // MB aproximados, para a barra

export class FavelaMap {
  constructor(base = 'assets/maps/favela/') {
    this.base = base;
    this.group = new THREE.Group(); this.group.name = 'favela'; this.group.userData.asset = true;
    this.ready = false; this._loading = null;
    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.tl = new THREE.TextureLoader();
    this.texCache = new Map(); this.matCache = new Map(); this.uMascara = { value: null };
    this.tipos = new Map(); this.vivos = [];
    this._last = new THREE.Vector3(1e9, 0, 0);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }

  /** Carrega tudo (uma vez). onProgress(0..1, texto). */
  load(onProgress) { return this._loading || (this._loading = this._load(onProgress || (() => {}))); }

  async _load(onP) {
    const j = u => fetch(this.base + u).then(r => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });
    const [mj, man, inst, fora] = await Promise.all([j('mats.json'), j('glb/manifest.json'), j('inst.json'), j('fora.json')]);
    this.mats = mj.mats; this.uMascara.value = this.tex(mj.mascara, false);
    const total = ORDEM.reduce((s, k) => s + (PESO[k] || 1), 0) + 4; let feito = 0;
    const passo = (k, n, i) => onP(Math.min(.99, (feito + (PESO[k] || 1) * (i / Math.max(1, n))) / total), 'Carregando a favela');
    const grupos = {};
    for (const k of ORDEM) {
      const g = grupos[k] = new THREE.Group(); g.name = k; this.group.add(g);
      const lista = man[k] || []; let i = 0;
      await this._lotes(lista, 6, async f => { const s = await this._glb(`glb/${k}/${f}`); this._aplica(s, k !== 'vidros'); g.add(s); passo(k, lista.length, ++i); });
      feito += PESO[k] || 1;
    }
    for (const f of man.raiz || []) { const s = await this._glb(`glb/${f}`); this._aplica(s, false); this.group.add(s); }   // água do valão
    // rio: plano grande no nível do gerador (3,6 m)
    const rio = new THREE.Mesh(new THREE.PlaneGeometry(16000, 3000).rotateX(-Math.PI / 2), this.material('rio', true, false, false));
    rio.position.set(0, 3.6, 222); rio.receiveShadow = true; this.group.add(rio);
    onP(.9, 'Plantando as árvores');
    await this._fora(fora);
    await this._instancias(inst);
    this.ready = true; onP(1, 'Favela pronta');
    return this;
  }

  /** Troca o modelo das árvores perto da câmera (cartão de longe, árvore de verdade perto). Chamar a cada quadro. */
  update(cam) {
    if (!this.ready || cam.distanceTo(this._last) < 15) return;
    this._last.copy(cam);
    for (const v of this.vivos) {
      if (v.longe) for (let j = 0; j < v.nIdx; j++) v.longe.set(v.idx[j], this._mat(v.a, v.idx[j]));
      const r2 = v.raio * v.raio, a = v.a, cand = [];
      for (let i = 0; i < v.n; i++) { const dx = a[i * 5] - cam.x, dz = a[i * 5 + 2] - cam.z, d2 = dx * dx + dz * dz; if (d2 < r2) cand.push([d2, i]); }
      if (cand.length > v.cap) cand.sort((p, q) => p[0] - q[0]);
      const m = Math.min(v.cap, cand.length); v.nIdx = m;
      for (let k = 0; k < m; k++) { const i = cand[k][1]; v.idx[k] = i; v.perto.set(k, this._mat(a, i)); if (v.longe) v.longe.set(i, ZERO); }
      v.perto.count(m); if (v.longe) v.longe.count(v.n);
    }
  }

  /* ---------- carga ---------- */
  async _glb(u) { return (await this.loader.loadAsync(this.base + u)).scene; }
  async _lotes(lista, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < lista.length) await fn(lista[i++]); })); }
  tex(u, srgb = true) {
    if (!u) return null;
    const k = u + srgb;
    if (!this.texCache.has(k)) {
      const t = this.tl.load(this.base + u);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
      this.texCache.set(k, t);
    }
    return this.texCache.get(k);
  }
  _aplica(root, sombra) {
    root.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry, nome = o.material?.name || '', k = this.mats[nome]?.kind;
      o.material = this.material(nome, !!g.attributes.normal, !!g.attributes.uv, !!g.attributes.color);
      o.castShadow = sombra && k !== 'vidro' && k !== 'agua'; o.receiveShadow = k !== 'vidro';
    });
  }
  // atributo quantizado (int16/int8) vira float para aplicar a matriz do nó (instâncias)
  _float(g) {
    for (const [k, a] of Object.entries(g.attributes)) {
      if (a.array instanceof Float32Array && !a.normalized) continue;
      const n = a.count, s = a.itemSize, f = new Float32Array(n * s), get = [a.getX, a.getY, a.getZ, a.getW];   // getComponent não existe no three 0.160
      for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) f[i * s + c] = get[c].call(a, i);
      g.setAttribute(k, new THREE.BufferAttribute(f, s));
    }
    return g;
  }
  _partes(s) {
    const out = []; s.updateMatrixWorld(true);
    s.traverse(o => { if (!o.isMesh) return; const g = this._float(o.geometry.clone()); g.applyMatrix4(o.matrixWorld); out.push({ g, nome: o.material.name }); });
    return out;
  }
  _tipo(nome) { if (!this.tipos.has(nome)) this.tipos.set(nome, this._glb(`glb/tipos/${nome}.glb`).then(s => this._partes(s))); return this.tipos.get(nome); }
  _conj(partes, cap, sombra, grupo) {
    const ms = partes.map(({ g, nome }) => {
      const m = new THREE.InstancedMesh(g, this.material(nome, !!g.attributes.normal, !!g.attributes.uv, !!g.attributes.color), cap);
      m.castShadow = sombra; m.receiveShadow = true; m.count = 0; m.frustumCulled = false; grupo.add(m); return m;
    });
    return { meshes: ms, set: (i, mat) => { for (const m of ms) m.setMatrixAt(i, mat); }, count: n => { for (const m of ms) { m.count = n; m.instanceMatrix.needsUpdate = true; } } };
  }
  _mat(a, i) {
    this._p.set(a[i * 5], a[i * 5 + 1], a[i * 5 + 2]); this._q.setFromAxisAngle(this._up, a[i * 5 + 3]); const s = a[i * 5 + 4]; this._s.set(s, s, s);
    return this._m.compose(this._p, this._q, this._s);
  }
  async _fora(lista) {
    const g = new THREE.Group(); g.name = 'fora'; this.group.add(g);
    await this._lotes(Object.keys(lista), 6, async nome => {
      const partes = this._partes(await this._glb(`glb/fora/${nome}.glb`)), L = lista[nome], c = this._conj(partes, L.length, true, g);
      L.forEach((r, i) => { this._p.set(r[0], r[1], r[2]); this._q.setFromAxisAngle(this._up, r[3]); this._s.set(r[4], 1, r[4]); c.set(i, this._m.compose(this._p, this._q, this._s)); });
      c.count(L.length); for (const m of c.meshes) { m.frustumCulled = true; m.computeBoundingSphere(); }
    });
  }
  async _instancias(tipos) {
    const veg = new THREE.Group(); veg.name = 'vegetacao'; this.group.add(veg);
    await this._lotes(tipos, 4, async t => {
      const a = new Float32Array(await (await fetch(`${this.base}inst/${t.nome}.bin`)).arrayBuffer()), n = a.length / 5;
      const arvore = t.nome.startsWith('arv'), miudo = /^(Capim|weed|fern|shrub)/.test(t.nome);
      const v = { a, n, longe: null, perto: null, raio: 0, cap: 0, idx: null, nIdx: 0 };
      if (arvore) {
        const lg = t.lods.find(l => l.endsWith('_2')), pt = t.lods.find(l => l.endsWith('_1')) || t.lods[0];
        if (lg) { v.longe = this._conj(await this._tipo(lg), n, true, veg); for (let i = 0; i < n; i++) v.longe.set(i, this._mat(a, i)); v.longe.count(n); }
        v.cap = 700; v.raio = 120; v.perto = this._conj(await this._tipo(pt), v.cap, true, veg);
      } else if (miudo) {
        const capim = t.nome.startsWith('Capim'); v.cap = capim ? 5000 : 500; v.raio = capim ? 60 : 50;
        v.perto = this._conj(await this._tipo(t.lods[0]), v.cap, false, veg);
      } else {
        const c = this._conj(await this._tipo(t.lods[0]), n, true, veg);
        for (let i = 0; i < n; i++) c.set(i, this._mat(a, i)); c.count(n);
      }
      if (v.perto) { v.idx = new Int32Array(v.cap); this.vivos.push(v); }
    });
  }

  /* ---------- materiais (mesma lógica dos materiais da Unreal, simplificada) ---------- */
  _injeta(m, chave, fsHead, fsMap, uniforms = {}, semCor = false) {
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VS_WPOS);
      let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FS_TRI + fsHead).replace('#include <map_fragment>', fsMap);
      if (semCor) fs = fs.replace('#include <color_fragment>', '');
      sh.fragmentShader = fs;
    };
    m.customProgramCacheKey = () => 'favela-' + chave;
  }
  material(nome, temNormal, temUV, temCor) {
    const key = `${nome}|${temNormal}|${temUV}|${temCor}`;
    if (this.matCache.has(key)) return this.matCache.get(key);
    const d = this.mats[nome] || { kind: 'vc' }, side = d.side === 2 ? THREE.DoubleSide : THREE.FrontSide;
    const base = { side, flatShading: !temNormal, vertexColors: temCor, roughness: d.rough ?? .8, metalness: d.metal ?? 0 };
    let m;
    switch (d.kind) {
      case 'terreno': {   // cinco camadas pela cor do vértice: terra, R pedra, G capim, B folhas, A cimento
        m = new THREE.MeshStandardMaterial({ ...base, roughness: .95, vertexColors: true });
        const T = d.texs.map(u => this.tex(u)), tl = d.tiles.map(v => v.toFixed(2));
        m.map = T[0];
        this._injeta(m, 'terreno', `
          uniform sampler2D tT0, tT1, tT2, tT3, tT4, tMasc;
          float rjPeso(float c, float r) { return clamp((c + (r - 0.5) * 0.5 - 0.5) * 5.0 + 0.5, 0.0, 1.0); }
        `, `
          vec2 p = vWPos.xz;
          float ms = texture2D(tMasc, p / 9.0).r, gran = texture2D(tMasc, p * 0.00022).r;
          float lg = smoothstep(60.0, 400.0, distance(vWPos, cameraPosition));
          #define AMOSTRA(t, s) mix(texture2D(t, p / s).rgb, texture2D(t, p / (s * 8.0)).rgb, lg)
          vec3 ct = AMOSTRA(tT0, ${tl[0]}), cg = AMOSTRA(tT2, ${tl[2]}), cf = AMOSTRA(tT3, ${tl[3]}), ci = AMOSTRA(tT4, ${tl[4]});
          vec3 cr = rjTri(tT1, vec2(${tl[1]}), rjNormalMundo()).rgb;
          #ifdef USE_COLOR_ALPHA
            vec4 vc = vColor;
          #else
            vec4 vc = vec4(vColor, 0.0);
          #endif
          vec3 cor = mix(mix(mix(mix(ct, cg, rjPeso(vc.g, ms)), cf, rjPeso(vc.b, ms)), cr, rjPeso(vc.r, ms)), ci, rjPeso(vc.a, ms));
          diffuseColor.rgb = cor * (0.70 + gran * 0.62);
        `, { tT0: { value: T[0] }, tT1: { value: T[1] }, tT2: { value: T[2] }, tT3: { value: T[3] }, tT4: { value: T[4] }, tMasc: this.uMascara }, true);
        break;
      }
      case 'parede': {   // bloco por baixo, reboco pintado por cima; a alfa do vértice diz quanto reboco sobrou
        m = new THREE.MeshStandardMaterial({ ...base, roughness: .9 });
        const tb = this.tex(d.tex), tr = this.tex(d.tex2); m.map = tb;
        this._injeta(m, 'parede' + temCor, `uniform sampler2D tBloco, tReb, tMasc;`, `
          vec3 n = rjNormalMundo();
          vec3 bl = rjTri(tBloco, vec2(${d.tile[0]}, ${d.tile[1]}), n).rgb, rb = rjTri(tReb, vec2(${d.tile2[0]}, ${d.tile2[1]}), n).rgb;
          vec4 ms = rjTri(tMasc, vec2(2.7), n);
          #ifdef USE_COLOR_ALPHA
            vec4 vc = vColor;
          #elif defined(USE_COLOR)
            vec4 vc = vec4(vColor, 1.0);
          #else
            vec4 vc = vec4(1.0);
          #endif
          float tem = clamp(vc.a * 100.0, 0.0, 1.0), dd = (ms.r * 0.86 + ms.g * 0.14) - (1.0 - vc.a * 1.05);
          float mk = clamp(dd * 40.0, 0.0, 1.0) * tem, borda = clamp((dd + 0.035) * 16.0, 0.0, 1.0) * tem;
          float macro = 0.78 + texture2D(tMasc, vWPos.xz * 0.0035).r * 0.55;
          vec3 b1 = mix(bl, bl * vc.rgb, 1.0 - tem) * macro, massa = mix(b1, vec3(macro * 0.27), borda);
          vec3 reb = rb * vc.rgb * macro * (1.0 - max(ms.b - 0.45, 0.0) * 0.9);
          diffuseColor.rgb = mix(massa, reb, mk);
        `, { tBloco: { value: tb }, tReb: { value: tr }, tMasc: this.uMascara }, true);
        break;
      }
      case 'pbr': case 'unity': {
        const t = this.tex(d.tex);
        const cor = d.kind === 'unity' ? new THREE.Color(...d.color) : new THREE.Color(...(d.tint || [1, 1, 1]));
        m = new THREE.MeshStandardMaterial({ ...base, color: cor, map: t || null });
        if (d.cut) { m.alphaTest = .4; m.side = THREE.DoubleSide; }
        const tile = d.tile || [1, 1];
        if (t && !temUV) this._injeta(m, 'tri' + tile.join('x'), `uniform vec2 uTile;`, `diffuseColor *= rjTri(map, uTile, rjNormalMundo());`, { uTile: { value: new THREE.Vector2(tile[0], tile[1]) } });
        else if (t && temUV && d.kind === 'pbr') this._injeta(m, 'uv' + tile.join('x'), `uniform vec2 uTile;`, `diffuseColor *= texture2D(map, vMapUv / uTile);`, { uTile: { value: new THREE.Vector2(tile[0], tile[1]) } });
        break;
      }
      case 'cor': m = new THREE.MeshStandardMaterial({ ...base, vertexColors: false, color: new THREE.Color(...d.color) }); break;
      case 'vidro': m = new THREE.MeshStandardMaterial({ ...base, vertexColors: false, color: new THREE.Color(...d.color), roughness: .06, metalness: .2, transparent: true, opacity: .55, depthWrite: false }); break;
      case 'emissivo': m = new THREE.MeshStandardMaterial({ ...base, vertexColors: false, color: new THREE.Color(...d.color), emissive: new THREE.Color(...d.color), emissiveIntensity: 1.5 }); break;
      case 'agua': m = new THREE.MeshStandardMaterial({ ...base, vertexColors: false, color: new THREE.Color(...d.color), roughness: .08, metalness: .1, transparent: true, opacity: d.opacity ?? .85, depthWrite: false }); break;
      default: m = new THREE.MeshStandardMaterial(base);
    }
    m.name = nome; this.matCache.set(key, m);
    return m;
  }
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
