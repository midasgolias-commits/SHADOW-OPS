import * as THREE from 'three';

/**
 * ACABAMENTOS DE ARMA (skins cosméticas, estilo PUBG): o jogador escolhe um por arma no menu.
 * Só o jogador local usa (menu, 3ª e 1ª pessoa); bots e jogadores online ficam com o padrão.
 *
 * Tudo procedural (sem arquivos novos): cada acabamento = uma textura pequena feita no canvas (≤256 px, UMA por acabamento,
 * dividida entre todas as armas) e/ou cor, metal e aspereza. A textura original da arma não some: vira "detalhe"
 * (o brilho dela, relativo à média, escurece/clareia o acabamento), então frestas, parafusos e desgaste continuam aparecendo.
 *
 * Como troca: cada material da arma ganha uma CÓPIA com o acabamento (guardada em cache por material + acabamento, então as
 * armas iguais dividem a mesma cópia). Os originais nunca são alterados (os bots usam os mesmos). 'padrao' devolve exatamente
 * os materiais originais. Vidro/transparente/invisível fica como está; o corte da luneta (onBeforeCompile) continua valendo.
 */
const D = { comum: 'comum', raro: 'raro', epico: 'epico', lendario: 'lendario' };
// paleta/valores provisórios: revisar com a direção de arte
const DEFS = [
  { id: 'padrao', name: 'Padrão', rarity: D.comum, desc: 'Acabamento de fábrica da arma.',
    sw: 'linear-gradient(135deg,#3b3f44,#1d2024 60%,#2a2d31)' },
  { id: 'urbano', name: 'Camuflagem Urbana', rarity: D.comum, desc: 'Manchas cinza para concreto e asfalto.',
    tex: () => camo(256, ['#8a8d91', '#5d6166', '#b5b8bb', '#3a3d41'], 11), rep: 3, metal: .25, rough: .62, detail: .6,
    sw: 'radial-gradient(circle at 25% 30%,#b5b8bb 0 18%,transparent 19%),radial-gradient(circle at 70% 65%,#3a3d41 0 22%,transparent 23%),radial-gradient(circle at 82% 22%,#5d6166 0 15%,transparent 16%),radial-gradient(circle at 30% 80%,#5d6166 0 17%,transparent 18%),#8a8d91' },
  { id: 'deserto', name: 'Deserto', rarity: D.comum, desc: 'Areia e terra seca, fosco.',
    tex: () => camo(256, ['#c8ad7f', '#a98a5c', '#e0cfa6', '#7d6443'], 23), rep: 3, metal: .1, rough: .75, detail: .6,
    sw: 'radial-gradient(circle at 28% 32%,#e0cfa6 0 18%,transparent 19%),radial-gradient(circle at 72% 62%,#7d6443 0 20%,transparent 21%),radial-gradient(circle at 80% 18%,#a98a5c 0 16%,transparent 17%),radial-gradient(circle at 25% 78%,#a98a5c 0 17%,transparent 18%),#c8ad7f' },
  { id: 'floresta', name: 'Floresta', rarity: D.raro, desc: 'Camuflagem de mata: verde, marrom e preto.',
    tex: () => camo(256, ['#4f5b34', '#6b5536', '#2f3a22', '#161812'], 37), rep: 3, metal: .12, rough: .7, detail: .6,
    sw: 'radial-gradient(circle at 25% 30%,#6b5536 0 20%,transparent 21%),radial-gradient(circle at 70% 66%,#2f3a22 0 22%,transparent 23%),radial-gradient(circle at 80% 22%,#161812 0 12%,transparent 13%),radial-gradient(circle at 30% 78%,#161812 0 10%,transparent 11%),#4f5b34' },
  { id: 'artico', name: 'Ártico', rarity: D.raro, desc: 'Camuflagem digital de neve.',
    tex: () => camo(256, ['#e9eef2', '#c3ccd4', '#8796a6', '#4c5866'], 53, 8), rep: 3, metal: .12, rough: .68, detail: .55,
    sw: 'linear-gradient(90deg,transparent 50%,#8796a6 50% 75%,transparent 75%) 0 0/16px 16px,linear-gradient(0deg,transparent 50%,#c3ccd4 50%) 0 0/24px 24px,linear-gradient(90deg,#4c5866 0 12%,transparent 12%) 6px 10px/30px 22px,#e9eef2' },
  { id: 'carbono', name: 'Fibra de Carbono', rarity: D.raro, desc: 'Trama de carbono, escura e lisa.',
    tex: () => carbon(64), rep: 18, metal: .3, rough: .32, detail: .35,
    sw: 'linear-gradient(45deg,#2a2d31 25%,transparent 25% 75%,#2a2d31 75%) 0 0/8px 8px,linear-gradient(45deg,#2a2d31 25%,#121416 25% 75%,#2a2d31 75%) 4px 4px/8px 8px' },
  { id: 'cromo', name: 'Cromo Escuro', rarity: D.epico, desc: 'Metal polido escuro, espelhado.',
    color: 0x30353c, metal: 1, rough: .18, detail: .45,
    sw: 'linear-gradient(160deg,#6b737d,#1c1f23 45%,#8a929c 55%,#25292e)' },
  { id: 'tigre', name: 'Tigre Neon', rarity: D.epico, desc: 'Listras de tigre em neon que brilham no escuro.',
    tex: () => tiger(256), rep: 2, metal: .35, rough: .4, detail: .4, emis: { color: 0xffffff, k: .55 },
    sw: 'repeating-linear-gradient(115deg,#0b0b12 0 9px,#19e3ff 9px 11px,#ff2bd6 11px 17px,#0b0b12 17px 26px)' },
  { id: 'ouro', name: 'Ouro', rarity: D.lendario, desc: 'Ouro escovado. Para quem quer ser visto.',
    tex: () => brushed(128, '#d9a93a'), rep: 1, metal: 1, rough: .3, detail: .4,
    sw: 'linear-gradient(135deg,#7a5a14,#f5d77a 35%,#b8861f 55%,#ffe9a8 70%,#8c6516)' }
];
export const WEAPON_SKINS = DEFS.map(({ id, name, rarity, desc }) => ({ id, name, rarity, desc }));
const BY = Object.fromEntries(DEFS.map(d => [d.id, d]));

/** CSS `background` para o quadradinho do acabamento na interface. */
export function skinSwatch(id) { return (BY[id] || BY.padrao).sw; }

// ---- escolha salva (por arma) ----
const LS = 'shadowops.wskins'; let SAVED = null;
const saved = () => { if (SAVED) return SAVED; try { SAVED = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { SAVED = {}; } if (typeof SAVED !== 'object') SAVED = {}; return SAVED; };
export function getWeaponSkin(weaponId) { const s = saved()[weaponId]; return BY[s] ? s : 'padrao'; }
export function setWeaponSkin(weaponId, skinId) {
  const s = saved(), id = BY[skinId] ? skinId : 'padrao';
  if (id === 'padrao') delete s[weaponId]; else s[weaponId] = id;
  try { localStorage.setItem(LS, JSON.stringify(s)); } catch {}
  return id;
}

// ---- texturas (feitas uma vez por acabamento, só quando usadas) ----
const TEX = {};
function texOf(d) {
  if (!d.tex) return null;
  if (TEX[d.id]) return TEX[d.id];
  const t = new THREE.CanvasTexture(d.tex()); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(d.rep || 1, d.rep || 1); t.anisotropy = 4; return TEX[d.id] = t;
}
const rng = s => () => ((s = Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5 | 0, ((s ^ (s >>> 13)) >>> 0) / 4294967296));
/** ruído suave que emenda nas bordas (a textura repete sem costura). */
function noise(N, seed) {
  const R = rng(seed), out = new Float32Array(N * N), oct = [[4, .55], [8, .3], [16, .15]];
  for (const [c, w] of oct) {
    const g = Float32Array.from({ length: c * c }, R), at = (x, y) => g[((y % c + c) % c) * c + ((x % c + c) % c)], sm = t => t * t * (3 - 2 * t);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / N * c, fy = y / N * c, ix = Math.floor(fx), iy = Math.floor(fy), u = sm(fx - ix), v = sm(fy - iy);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * u, b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * u;
      out[y * N + x] += (a + (b - a) * v) * w;
    }
  }
  return out;
}
const canvas = N => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** camuflagem: base / escura / clara + manchas da 4ª cor (px > 1 = digital, em blocos). */
function camo(N, pal, seed, px = 1) {
  const c = canvas(N), x = c.getContext('2d'), img = x.createImageData(N, N), n1 = noise(N, seed), n2 = noise(N, seed * 7 + 3), P = pal.map(rgb);
  for (let y = 0; y < N; y++) for (let i = 0; i < N; i++) {
    const k = Math.floor(y / px) * px * N + Math.floor(i / px) * px, a = n1[k], b = n2[k];
    const col = b > .6 ? P[3] : a < .42 ? P[1] : a > .58 ? P[2] : P[0], o = (y * N + i) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}
/** fibra de carbono: trama 2x2, cada quadrado com degradê na direção do fio. */
function carbon(N) {
  const c = canvas(N), x = c.getContext('2d'), h = N / 4;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const hor = (i + j) % 2 === 0;   // fio deitado / em pé, alternando
    const g = hor ? x.createLinearGradient(i * h, 0, i * h + h, 0) : x.createLinearGradient(0, j * h, 0, j * h + h);
    g.addColorStop(0, '#121416'); g.addColorStop(.5, '#34383d'); g.addColorStop(1, '#121416');
    x.fillStyle = g; x.fillRect(i * h, j * h, h, h);
  }
  return c;
}
/** listras de tigre neon: fundo preto, borda ciano e miolo magenta (a mesma imagem serve de brilho). */
function tiger(N) {
  const c = canvas(N), x = c.getContext('2d'), img = x.createImageData(N, N), n = noise(N, 71), B = rgb('#0b0b12'), C = rgb('#19e3ff'), M = rgb('#ff2bd6');
  for (let y = 0; y < N; y++) for (let i = 0; i < N; i++) {
    const k = y * N + i, s = Math.sin((i / N * 5 + (n[k] - .5) * 2.4) * Math.PI * 2) * .5 + .5;
    const col = s > .8 ? M : s > .7 ? C : B, o = k * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}
/** metal escovado: riscos finos na horizontal em volta da cor base. */
function brushed(N, base) {
  const c = canvas(N), x = c.getContext('2d'), R = rng(97), [r, g, b] = rgb(base);
  for (let y = 0; y < N; y++) { const k = .9 + R() * .2; x.fillStyle = `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`; x.fillRect(0, y, N, 1); }
  return c;
}

// ---- materiais ----
const ORIG = new WeakMap();   // cópia com acabamento -> material original
const CACHE = {};             // acabamento -> WeakMap(material original -> cópia)
const LUM = 'vec3(.2126,.7152,.0722)';
/** Pula: vidro, transparente, invisível, material que não é PBR (clarão do tiro, sprites) e o que pedir userData.noSkin. */
const skippable = m => !m || !m.isMeshStandardMaterial || m.transparent || m.visible === false || m.opacity < 1 || /^(glass|vidro)$/i.test(m.name || '') || m.userData?.noSkin;
function skinned(m, d) {
  const C = CACHE[d.id] ??= new WeakMap(); let c = C.get(m); if (c) return c;
  c = m.clone(); c.name = m.name; ORIG.set(c, m); C.set(m, c);
  c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;   // clone() não leva isso: sem eles o corte da luneta sumiria
  const tex = texOf(d), hasMap = !!m.map;
  c.metalnessMap = null; c.roughnessMap = null; c.metalness = d.metal; c.roughness = d.rough;   // o relevo (normalMap) fica
  c.color.set(tex ? 0xffffff : d.color ?? 0xffffff);
  if (d.emis && tex) { c.emissiveMap = tex; c.emissive.set(d.emis.color); c.emissiveIntensity = d.emis.k; }
  if (d.metal > .3) c.userData.wantsEnv = true;   // metal precisa de reflexo (HeldWeapon pede o mesmo reflexo das armas)
  if (!hasMap) { if (tex) c.map = tex; }   // sem textura original: o acabamento entra direto como textura
  else {
    // textura original vira só "detalhe": brilho do ponto / brilho médio (último nível do mipmap); o acabamento repete por cima
    const U = { skinTex: { value: tex }, skinRep: { value: d.rep || 1 }, skinDetail: { value: d.detail ?? .5 } }, T = tex ? 1 : 0;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    c.onBeforeCompile = (sh, r) => {
      prev.call(c, sh, r);   // mantém o que já existia (corte da luneta da AUG etc.)
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${T ? 'uniform sampler2D skinTex;' : ''}\nuniform float skinRep, skinDetail;`)
        .replace('#include <map_fragment>', `#ifdef USE_MAP
 vec4 wsD = texture2D(map, vMapUv); float wsA = max(dot(textureLod(map, vec2(.5), 14.).rgb, ${LUM}), .02);
 float wsK = mix(1., clamp(dot(wsD.rgb, ${LUM}) / wsA, .3, 1.8), skinDetail);
 diffuseColor.rgb *= ${T ? 'texture2D(skinTex, vMapUv * skinRep).rgb * ' : ''}wsK; diffuseColor.a *= wsD.a;
#endif`);
    };
    c.customProgramCacheKey = () => prevKey.call(m) + '|wskin' + T;
  }
  return c;
}
/**
 * Põe o acabamento skinId em todas as malhas de root (THREE.Object3D). Pode chamar quantas vezes quiser: sempre parte do original.
 * skip (opcional): (malha, material) => true para não mexer (ex.: braços do viewmodel). Devolve root.
 */
export function applyWeaponSkin(root, skinId, skip = null) {
  const d = BY[skinId] || BY.padrao;
  root?.traverse(n => {
    if (!n.isMesh || !n.material) return;
    const one = m => { const o = ORIG.get(m) || m; return d.id === 'padrao' || skippable(o) || skip?.(n, o) ? o : skinned(o, d); };
    n.material = Array.isArray(n.material) ? n.material.map(one) : one(n.material);
    n.userData.wskin = d.id;
  });
  return root;
}
