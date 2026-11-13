/**
 * Mapa "CELEIRO" (pátio-armazém) — porte do projeto standalone "mapa vagao" (Three.js r180) para o jogo.
 * Geometria e texturas próprias (CC0 + canvas) e 6 modelos GLB CC-BY (créditos em assets/maps/celeiro/CREDITOS.md).
 * Metros, Y para cima, chão em y=0.
 * Uso: const { group, ready } = buildCeleiro(THREE, { basePath: 'assets/maps/celeiro/' });
 * Funciona em Node sem DOM (sem texturas nem modelos): é assim que CelebieroData.js é gerado (tools/gen-celeiro-data.mjs).
 */

export function buildCeleiro(THREE, { basePath = 'assets/maps/celeiro/', textures = true, deckUnderside = true, models = true, modelsPath = null, GLTFLoader = null } = {}) {
  const hasDOM = typeof document !== 'undefined' && textures;
  const T = THREE;
  const pending = [];
  const disposables = [];
  const colliders = [];
  const group = new T.Group();
  group.name = 'mapa-galpao';

  // ---------------------------------------------------------------- utilidades
  let seed = 1337;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd();
  const V3 = T.Vector3, ONE = new V3(1, 1, 1);
  const _e = new T.Euler(), _q = new T.Quaternion();
  const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
    return new T.Matrix4().compose(new V3(x, y, z), _q, new V3(sx, sy, sz));
  };

  // ---- ruído de valor periódico (texturas tileáveis)
  const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const vnoise = (x, y, px, py, s) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const i0 = ((ix % px) + px) % px, i1 = (i0 + 1) % px, j0 = ((iy % py) + py) % py, j1 = (j0 + 1) % py;
    const a = hash(i0, j0, s), b = hash(i1, j0, s), c = hash(i0, j1, s), d = hash(i1, j1, s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (u, v, px, py, oct, s) => { let sum = 0, amp = 0.5, norm = 0; for (let o = 0; o < oct; o++) { sum += amp * vnoise(u * px, v * py, px, py, s + o * 17); norm += amp; px *= 2; py *= 2; amp *= 0.5; } return sum / norm; };
  const hexRGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const mix = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------------------------------------------------------------- texturas
  const texUrl = (folder, kind) => `${basePath}textures/${folder}/${kind}.jpg`;
  const linCache = new Map();
  // normal/rough (lineares). Cada (pasta,tipo,tile) é um clone que compartilha a imagem.
  function linTex(folder, kind, tile, rot = 0, srgb = false) {
    if (!hasDOM) return null;
    let entry = linCache.get(folder + kind);
    if (!entry) {
      entry = { clones: [], loaded: false };
      pending.push(new Promise(res => { entry.base = new T.TextureLoader().load(texUrl(folder, kind), () => { entry.loaded = true; entry.clones.forEach(c => (c.needsUpdate = true)); res(); }, undefined, () => res()); }));
      linCache.set(folder + kind, entry);
      disposables.push(entry.base);
    }
    const t = entry.base.clone();
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / tile[0], 1 / tile[1]); t.anisotropy = 8;
    if (rot) { t.center.set(0.5, 0.5); t.rotation = rot; }
    t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
    if (entry.loaded) t.needsUpdate = true;
    entry.clones.push(t); disposables.push(t);
    return t;
  }
  // textura de cor em canvas: desenho procedural + (opcional) detalhe = luminância normalizada de um JPG CC0.
  // Resultado: média ≈ cor-alvo da visual-direction, com o detalhe da foto CC0.
  function paint({ w = 512, h = w, draw, detail = null, contrast = 1, alpha = false, tile = [1, 1], srgb = true }) {
    if (!hasDOM) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    draw(ctx, w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / tile[0], 1 / tile[1]); t.anisotropy = 8;
    disposables.push(t);
    if (detail && !alpha) {
      pending.push(new Promise(res => {
        const img = new Image();
        img.onload = () => {
          const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
          const x2 = c2.getContext('2d', { willReadFrequently: true }); x2.drawImage(img, 0, 0, w, h);
          const dd = x2.getImageData(0, 0, w, h).data, base = ctx.getImageData(0, 0, w, h), bd = base.data;
          const n = w * h, lum = new Float32Array(n); let mean = 0;
          for (let i = 0; i < n; i++) { const l = 0.2126 * dd[i * 4] + 0.7152 * dd[i * 4 + 1] + 0.0722 * dd[i * 4 + 2]; lum[i] = l; mean += l; }
          mean = Math.max(1, mean / n);
          for (let i = 0; i < n; i++) { const f = Math.max(0.15, 1 + (lum[i] / mean - 1) * contrast); bd[i * 4] = Math.min(255, bd[i * 4] * f); bd[i * 4 + 1] = Math.min(255, bd[i * 4 + 1] * f); bd[i * 4 + 2] = Math.min(255, bd[i * 4 + 2] * f); }
          ctx.putImageData(base, 0, 0); t.needsUpdate = true; res();
        };
        img.onerror = () => res();
        img.src = texUrl(detail, 'color');
      }));
    }
    return t;
  }
  const flat = (hex) => (ctx, w, h) => { ctx.fillStyle = '#' + hex.toString(16).padStart(6, '0'); ctx.fillRect(0, 0, w, h); };
  // preenchimento por pixel com função (u,v) -> [r,g,b,a]
  const perPixel = (fn) => (ctx, w, h) => { const im = ctx.createImageData(w, h), d = im.data; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, c = fn(x / w, y / h, x, y); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3] ?? 255; } ctx.putImageData(im, 0, 0); };

  // 4.5 areia: manchas FBM (#B98F6E..#D8B896) — o detalhe fino vem do coast_sand_01
  // 4.5 areia (rodada 1): bege-rosado claro #C9A98D, manchas pequenas (~0,25 m) e pouco contraste
  const sandDraw = perPixel((u, v) => { const a = fbm(u, v, 16, 16, 3, 11), b = fbm(u, v, 4, 4, 2, 23); const t = sstep(0.3, 0.7, a * 0.8 + b * 0.2); const lo = [0xBA, 0x9C, 0x84], hi = [0xD4, 0xBA, 0xA2]; return [mix(lo[0], hi[0], t), mix(lo[1], hi[1], t), mix(lo[2], hi[2], t)]; });
  // 4.4 telhado verde-água com ferrugem; listras alongadas ao longo de V (= ao longo da cumeeira, como na top.jpg)
  const roofDraw = perPixel((u, v) => {
    // rodada 2: verde-água #5FB3A0 predominante; ferrugem sutil (~25%) em faixas verticais; estrias claras
    // BUG-0006: períodos por tile de 16 m -> estrias de ~0,7 m x ~4 m (antes 1 período em v = risco de 16 m)
    const band = fbm(u, v, 24, 4, 3, 5), drip = fbm(u, v, 48, 6, 2, 9), lite = fbm(u, v, 36, 5, 2, 13);
    const teal = [0x5F, 0xB3, 0xA0], rust = [0x8A, 0x70, 0x5C], light = [0xC4, 0xD0, 0xC8];
    const tr = sstep(0.55, 0.68, band * 0.75 + drip * 0.25) * 0.28; let c = [mix(teal[0], rust[0], tr), mix(teal[1], rust[1], tr), mix(teal[2], rust[2], tr)];
    const tl = sstep(0.58, 0.68, lite) * 0.55; c = [mix(c[0], light[0], tl), mix(c[1], light[1], tl), mix(c[2], light[2], tl)];
    return c; // BUG-0006: sem nervura senoidal própria (brigava com a da normal map em outro passo -> moiré)
  });
  // 4.2 revestimento verde (rodada 1): #4F9A6C, ripas verticais finas (0,15 m) e juntas horizontais a cada 1,2 m (tile 2,4 m)
  const panelDraw = (ctx, w, h) => { // rodada 3: 4x4 placas de 0,6 m por tile de 2,4 m, tipo azulejo/telha metálica
    const n = 4, c = w / n, b = Math.round(c * 0.09);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * c, y = j * c, k = rr(-0.06, 0.06);
      ctx.fillStyle = 'rgb(' + [0x4F, 0x9A, 0x6C].map(v => Math.round(v * (1 + k))) + ')'; ctx.fillRect(x, y, c, c);
      ctx.fillStyle = 'rgba(170,215,180,0.55)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + c, y); ctx.lineTo(x + c - b, y + b); ctx.lineTo(x + b, y + b); ctx.lineTo(x + b, y + c - b); ctx.lineTo(x, y + c); ctx.fill();
      ctx.fillStyle = 'rgba(20,55,35,0.6)'; ctx.beginPath(); ctx.moveTo(x + c, y + c); ctx.lineTo(x, y + c); ctx.lineTo(x + b, y + c - b); ctx.lineTo(x + c - b, y + c - b); ctx.lineTo(x + c - b, y + b); ctx.lineTo(x + c, y); ctx.fill();
      const g = ctx.createRadialGradient(x + c / 2, y + c / 2, 0, x + c / 2, y + c / 2, c * 0.5); g.addColorStop(0, 'rgba(120,190,140,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x + b, y + b, c - 2 * b, c - 2 * b);
      ctx.fillStyle = 'rgba(25,60,40,0.8)'; ctx.fillRect(x, y, c, 2); ctx.fillRect(x, y, 2, c);
    }
  };
  const contDraw = (hex, wear = 1) => (ctx, w, h) => {
    flat(hex)(ctx, w, h);
    for (let i = 0; i < 70; i++) { ctx.strokeStyle = rnd() < 0.6 ? 'rgba(220,210,200,0.18)' : 'rgba(20,15,10,0.22)'; ctx.lineWidth = 1; ctx.beginPath(); const x = rr(0, w), y = rr(0, h), a = rr(0, Math.PI), l = rr(8, 60); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
    for (let i = 0; i < 60 * wear; i++) { ctx.fillStyle = `rgba(138,153,168,${rr(0.35, 0.75)})`; ctx.fillRect(rr(0, w), rr(0, h), rr(2, 7), rr(2, 5)); }
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,25,10,0.18)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  };
  // 4.3 grade (rodada 3): azul-acinzentado claro #9FB3C8; parte de baixo fechada (~65%), topo translúcido; manchas rosadas suaves
  const fenceDraw = (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#9FB3C8';
    const split = h * 0.42;
    for (let x = 0; x < w; x += 9) ctx.fillRect(x, split, 6, h - split);   // metade de baixo: barras grossas e próximas
    for (let x = 0; x < w; x += 12) ctx.fillRect(x, 0, 3, split);          // topo: barras finas e espaçadas
    ctx.fillRect(0, 0, w, 7); ctx.fillRect(0, split - 3, w, 6); ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = '#8DA2B6'; ctx.fillRect(0, 0, 10, h); ctx.fillRect(w / 2 - 5, 0, 10, h);
    ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 22; i++) { const x = rr(0, w), y = rr(h * 0.3, h * 0.9), r = rr(14, 40); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(196,140,140,0.45)'); g.addColorStop(1, 'rgba(196,140,140,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r * 2, 2 * r, r * 4); }
    ctx.globalCompositeOperation = 'source-over';
  };
  // 5. logotipo próprio "trio de pirâmides" (estêncil), NÃO é o da referência
  const logoDraw = (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const s = 150, hh = s * Math.sqrt(3) / 2, cx = w / 2, cy = h / 2, step = s / 2 + 22;
    [-1, 0, 1].forEach((k, i) => {
      const x = cx + k * step, up = i !== 1;
      const pts = up ? [[x - s / 2, cy + hh / 2], [x, cy - hh / 2], [x + s / 2, cy + hh / 2]] : [[x - s / 2, cy - hh / 2], [x + s / 2, cy - hh / 2], [x, cy + hh / 2]];
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#D9B52B';
      ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      // miolo vazado (triângulo interno) + pontes de estêncil
      const c0 = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3], sc = 0.52;
      ctx.beginPath(); pts.forEach((p, j) => { const q = [c0[0] + (p[0] - c0[0]) * sc, c0[1] + (p[1] - c0[1]) * sc]; j ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.translate(x, cy); ctx.rotate((up ? 20 : -20) * Math.PI / 180); ctx.fillRect(-4, -h, 10, 2 * h); ctx.fillRect(36, -h, 6, 2 * h); ctx.restore();
      // chanfro no vértice
      const v = up ? pts[1] : pts[2]; ctx.fillRect(v[0] - 12, v[1] - (up ? 0 : 14), 24, 14);
    });
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(0,0,0,${rr(0.1, 0.5)})`; ctx.fillRect(rr(0, w), rr(0, h), rr(1, 4), rr(1, 3)); }
    ctx.globalCompositeOperation = 'source-over';
  };
  // caixote (rodada 2): madeira envelhecida #A08A5E, quadro grosso, painel escuro com manchas
  const crateDraw = (ctx, w, h) => {
    ctx.fillStyle = '#6E5A3C'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(30,20,10,0.6)'; for (let x = 0; x < w; x += w / 5) ctx.fillRect(x, 0, 3, h);
    for (let i = 0; i < 14; i++) { const x = rr(0, w), y = rr(0, h), r = rr(6, 26), g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(25,18,8,0.45)'); g.addColorStop(1, 'rgba(25,18,8,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); }
    const b = w * 0.16; ctx.fillStyle = '#A08A5E';
    ctx.fillRect(0, 0, w, b); ctx.fillRect(0, h - b, w, b); ctx.fillRect(0, 0, b, h); ctx.fillRect(w - b, 0, b, h);
    ctx.strokeStyle = 'rgba(45,30,15,0.75)'; ctx.lineWidth = 3; ctx.strokeRect(b, b, w - 2 * b, h - 2 * b); ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.fillStyle = 'rgba(60,45,25,0.35)'; for (let i = 0; i < 4; i++) ctx.fillRect(rr(0, w), 0, rr(2, 6), h);
  };
  // tampo dos decks (rodada 2): tábuas de 0,25 m com frestas escuras e blocos claro/escuro tipo pallet (tile 2,4 m)
  const deckDraw = (ctx, w, h) => {
    const n = 10, pw = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) { const k = ((i >> 1) + j) % 2 ? 0.88 : 1.08; ctx.fillStyle = 'rgb(' + [0x6B, 0x54, 0x44].map(c => Math.round(c * k * rr(0.94, 1.06))) + ')'; ctx.fillRect(i * pw, j * h / 3, pw, h / 3); }
    ctx.fillStyle = 'rgba(20,12,8,0.85)'; for (let i = 0; i <= n; i++) ctx.fillRect(i * pw - 2, 0, 4, h);
    ctx.fillStyle = 'rgba(20,12,8,0.6)'; for (let j = 0; j < 3; j++) for (let i = 0; i < n; i++) ctx.fillRect(i * pw, j * h / 3 + ((i * 37) % 23), pw, 3);
    ctx.fillStyle = 'rgba(180,160,140,0.25)'; for (let i = 0; i < n; i++) ctx.fillRect(i * pw + 3, 0, 2, h);
  };
  // concreto (rodada 2): manchado/sujo com escorridos verticais, sem juntas de bloco (detalhe = concrete_floor)
  const concreteDraw = (ctx, w, h) => {
    const im = ctx.createImageData(w, h), d = im.data, base = [0x9A, 0x96, 0x8C];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h, blot = fbm(u, v, 4, 4, 3, 31), drip = fbm(u, v, 28, 2, 2, 37), top = Math.max(0, 1 - v * 3.5);
      const k = 0.82 + 0.3 * blot - 0.22 * sstep(0.55, 0.75, drip) * (0.4 + 0.6 * (1 - v)) - 0.1 * top, o = (y * w + x) * 4;
      d[o] = base[0] * k; d[o + 1] = base[1] * k * 1.01; d[o + 2] = base[2] * k * 0.97; d[o + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
  };
  const blobDraw = (ctx, w, h) => { ctx.clearRect(0, 0, w, h); ctx.filter = 'blur(' + Math.round(w * 0.11) + 'px)'; ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6); ctx.filter = 'none'; };
  const greyDraw = (ctx, w, h) => {
    ctx.fillStyle = '#8A877A'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(40,40,35,0.7)'; ctx.lineWidth = 3;
    ctx.strokeRect(w * 0.06, h * 0.08, w * 0.88, h * 0.38); ctx.strokeRect(w * 0.06, h * 0.54, w * 0.88, h * 0.38);
    ctx.fillStyle = '#4A4A44'; ctx.fillRect(w * 0.42, h * 0.24, w * 0.16, h * 0.05); ctx.fillRect(w * 0.42, h * 0.7, w * 0.16, h * 0.05);
  };
  const barrelDraw = (ctx, w, h) => {
    ctx.fillStyle = '#B03030'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#E8E8E8'; ctx.fillRect(0, h * 0.28, w, h * 0.09); ctx.fillRect(0, h * 0.63, w, h * 0.09);
    ctx.fillStyle = 'rgba(60,10,10,0.5)'; ctx.fillRect(0, h * 0.12, w, 3); ctx.fillRect(0, h * 0.88, w, 3);
  };
  // janelas (rodada 1): grade de vidros pequenos — o canvas = 6 x 3 vidros = 1,5 m x 0,9 m (UV em metros / tamanho)
  const windowDraw = (ctx, w, h) => {
    ctx.fillStyle = '#EEF2F4'; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(160,175,185,0.35)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2F6B4C'; ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, h - 6, w, 6); ctx.fillRect(0, 0, 6, h); ctx.fillRect(w - 6, 0, 6, h);
    for (let i = 1; i < 6; i++) ctx.fillRect(i * w / 6 - 3, 0, 6, h);
    for (let j = 1; j < 3; j++) ctx.fillRect(0, j * h / 3 - 3, w, 6);
  };
  const ringsDraw = (ctx, w, h) => { ctx.fillStyle = '#A88A64'; ctx.fillRect(0, 0, w, h); for (let r = w * 0.48; r > 2; r -= rr(3, 7)) { ctx.strokeStyle = `rgba(90,60,35,${rr(0.15, 0.4)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(w / 2 + rr(-1, 1), h / 2 + rr(-1, 1), r, 0, 7); ctx.stroke(); } ctx.strokeStyle = '#4A3A2C'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.48, 0, 7); ctx.stroke(); };

  // ---------------------------------------------------------------- materiais (1 por linha da visual-direction)
  const M = {};
  const FENCE_H = 1.25;
  function std(key, { color = 0xffffff, plain, map, normal, rough, tile = [2, 2], ns = 1, roughness = 0.85, metalness = 0, extra = {} }) {
    const p = { color: hasDOM && map ? color : (plain ?? color), roughness, metalness, ...extra };
    if (hasDOM) {
      if (map) p.map = map;
      if (normal) { p.normalMap = linTex(normal, 'normal', tile); p.normalScale = new T.Vector2(ns, ns); }
      if (rough) p.roughnessMap = linTex(rough, 'rough', tile);
    }
    const m = new T.MeshStandardMaterial(p); m.name = key; M[key] = m; disposables.push(m); return m;
  }
  // material fotográfico: color.jpg direto (sRGB) + normal + rough, mesma rotação em todos os mapas; UV em metros
  function photo(key, folder, { tile = [2, 2], rot = 0, tint = 0xffffff, plain = 0x888888, roughness = 1, metalness = 0, ns = 1 }) {
    const p = { color: hasDOM ? tint : plain, roughness, metalness };
    if (hasDOM) { p.map = linTex(folder, 'color', tile, rot, true); p.normalMap = linTex(folder, 'normal', tile, rot); p.roughnessMap = linTex(folder, 'rough', tile, rot); p.normalScale = new T.Vector2(ns, ns); }
    const m = new T.MeshStandardMaterial(p); m.name = key; M[key] = m; disposables.push(m); return m;
  }
  const t2 = (a) => [a, a];
  std('sand', { plain: 0xC9A98D, map: paint({ w: 1024, draw: sandDraw, detail: 'sand', contrast: 0.75, tile: t2(4) }), normal: 'sand', rough: 'sand', tile: t2(4), ns: 0.6, roughness: 1 });
  std('concrete', { plain: 0x9A968C, map: paint({ draw: concreteDraw, detail: 'concrete_floor', contrast: 1.2, tile: [3, 2.5] }), normal: 'concrete_floor', rough: 'concrete_floor', tile: [3, 2.5], roughness: 1 });
  photo('floor', 'floor_worn', { tile: t2(3), tint: 0xE6EAEA, plain: 0xA9AFB0, roughness: 0.75, ns: 0.6 }); // concrete_floor_worn_001
  std('roof', { plain: 0x5FB3A0, map: paint({ w: 1024, draw: roofDraw, detail: 'roof', contrast: 0.25, tile: t2(16) }), normal: 'roof', rough: 'roof', tile: t2(16), ns: 1.4, roughness: 0.8, metalness: 0.25, extra: { side: T.DoubleSide } });
  photo('greenPanel', 'barn_wall', { tile: t2(2), rot: Math.PI / 2, plain: 0x4F7A5A }); // green_rough_planks: tábuas em pé (fonte horizontal, girada 90°)
  // faixa vermelha: tábuas de celeiro pintadas (distressed_painted_planks, base clara com ferrugem) tingidas de vermelho-celeiro
  photo('redWall', 'barn_red', { tile: t2(2), tint: 0xF06A58, plain: 0x7D2A26, roughness: 0.95, ns: 1.6 });
  // piso interno: o galpão fica na sombra do telhado; um leve emissivo da própria textura evita o "buraco escuro"
  if (hasDOM && M.floor) { M.floor.emissive = new T.Color(0xb4b8b8); M.floor.emissiveMap = M.floor.map; M.floor.emissiveIntensity = 0.25; } // BUG-0009: era 1,1 e anulava sombra/AO
  // BUG-0008: a barn_trim (pintura descascada, manchas de ~0,5 m) virava "camuflagem" nas peças de 0,15-0,35 m.
  // Estrutura agora é madeira pintada lisa: verde #4A8A66 x luminância do Planks001 (contraste baixo), tile de 0,9 m (veio fino).
  std('greenWood', { plain: 0x3F8560, map: paint({ draw: flat(0x4A8A66), detail: 'wood_crate', contrast: 0.45, tile: t2(0.9) }), normal: 'wood_crate', tile: t2(0.9), ns: 0.5, roughness: 0.85 });
  photo('ramp', 'ramp_wood', { tile: t2(2), tint: 0xD8B9A2, plain: 0x8C6A55, ns: 1.2 }); // plank_flooring_03: tábuas ao longo de U = sentido da subida
  for (const [k, hx, wear, con, ns] of [['contRed', 0x6E2A2A, 1, 0.6, 1], ['contYellow', 0xB8962E, 2.5, 0.95, 1.6], ['contBlue', 0x3E5266, 1, 0.6, 1], ['contFrame', 0x4A1D1D, 1, 0.6, 1]])
    std(k, { plain: hx, map: paint({ draw: contDraw(hx, wear), detail: 'container', contrast: con, tile: t2(4) }), normal: 'container', rough: 'container', tile: t2(4), ns, roughness: 0.8, metalness: 0.4 });
  std('train', { plain: 0x3A3D40, map: paint({ draw: flat(0x3A3D40), detail: 'train_metal', contrast: 0.7, tile: t2(2) }), normal: 'train_metal', rough: 'train_metal', tile: t2(2), roughness: 0.8, metalness: 0.2 });
  std('trainRoof', { plain: 0xB9BCBC, map: paint({ draw: flat(0xB9BCBC), detail: 'train_metal', contrast: 0.45, tile: t2(2) }), roughness: 0.6, metalness: 0.3 });
  // madeira velha (rodada 1): marrom-acinzentada #6B5444, tábuas largas (Planks001: tábuas ao longo de V; 'swap' deita ao longo do comprimento)
  std('wood', { plain: 0x6B5444, map: paint({ draw: flat(0x6B5444), detail: 'wood_crate', contrast: 0.85, tile: t2(2.4) }), normal: 'wood_crate', rough: 'wood_crate', tile: t2(2.4), roughness: 0.9 });
  std('bark', { plain: 0x4A4038, map: paint({ draw: flat(0x4A4038), detail: 'bark', contrast: 1.1, tile: t2(1.5) }), normal: 'bark', tile: t2(1.5), roughness: 0.95 });
  std('logEnd', { plain: 0xA88A64, map: paint({ w: 128, draw: ringsDraw }), roughness: 0.9 });
  std('cream', { color: 0xE8DCB0, roughness: 0.7, metalness: 0.2 });
  std('darkMetal', { color: 0x2B2C2E, roughness: 0.6, metalness: 0.6 });
  std('towerRoof', { plain: 0x23323F, map: paint({ draw: flat(0x23323F), detail: 'painted_metal', contrast: 0.8, tile: t2(2) }), normal: 'painted_metal', tile: t2(2), roughness: 0.7, metalness: 0.3 });
  std('fence', { plain: 0x9FB3C8, map: paint({ w: 512, h: 256, draw: fenceDraw, alpha: true, tile: [3, FENCE_H] }), roughness: 0.5, metalness: 0.6, extra: hasDOM ? { alphaTest: 0.5, alphaToCoverage: true, side: T.DoubleSide } : { side: T.DoubleSide, transparent: true, opacity: 0.3 } });
  std('logo', { plain: 0xD9B52B, map: paint({ w: 512, h: 256, draw: logoDraw, alpha: true }), roughness: 0.8, extra: { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } });
  std('crate', { plain: 0xA08A5E, map: paint({ w: 256, draw: crateDraw, detail: 'wood_crate', contrast: 1.0 }), roughness: 0.9 });
  std('deck', { plain: 0x6B5444, map: paint({ draw: deckDraw, detail: 'wood_planks', contrast: 0.6, tile: t2(2.5) }), normal: 'wood_planks', rough: 'wood_planks', tile: t2(2.5), roughness: 0.9 });
  { const m = new T.MeshBasicMaterial({ color: 0x000000, map: paint({ w: 128, draw: blobDraw, alpha: true }), transparent: true, opacity: hasDOM ? 0.5 : 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); m.name = 'blob'; M.blob = m; disposables.push(m); }
  std('crateGrey', { plain: 0x8A877A, map: paint({ w: 256, draw: greyDraw, detail: 'wood_crate', contrast: 0.4 }), roughness: 0.8, metalness: 0.1 });
  std('barrel', { plain: 0xB03030, map: paint({ w: 256, draw: barrelDraw, detail: 'painted_metal', contrast: 0.7 }), roughness: 0.55, metalness: 0.3 });
  { const m = new T.MeshBasicMaterial({ color: hasDOM ? 0xffffff : 0xEEF2F4, map: paint({ w: 256, h: 192, draw: windowDraw }), side: T.DoubleSide }); m.name = 'window'; M.window = m; disposables.push(m); }

  // ---------------------------------------------------------------- lotes (merge por material)
  const batches = {};
  const _v = new V3(), _n = new V3(), _nm = new T.Matrix3();
  // CAT != null: as peças vão para um lote "cat:material" que vira o FALLBACK procedural da categoria (escondido se o GLB carregar)
  let CAT = null;
  const PLACE = {}; // cat -> [{ m: Matrix4 (cubo unitário centrado -> caixa alvo), color: Color|null }]
  const place = (cat, m, color = null) => (PLACE[cat] || (PLACE[cat] = [])).push({ m, color });
  function addGeo(key0, geo, m, o = {}) {
    const key = CAT && key0 !== 'blob' ? CAT + ':' + key0 : key0;
    const B = batches[key] || (batches[key] = { p: [], n: [], uv: [], idx: [], count: 0 });
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    _nm.getNormalMatrix(m);
    const mode = o.uv || 'box', s = o.s || [1, 1], off = o.off || [0, 0];
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i); _n.fromBufferAttribute(N, i);
      let u, w;
      if (mode === 'box') {
        const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
        if (ax >= ay && ax >= az) { u = _n.x > 0 ? -_v.z : _v.z; w = _v.y; }
        else if (ay >= az) { u = _v.x; w = _n.y > 0 ? -_v.z : _v.z; }
        else { u = _n.z > 0 ? _v.x : -_v.x; w = _v.y; }
      } else { u = U.getX(i); w = U.getY(i); }
      if (o.swap) [u, w] = [w, u];
      B.uv.push(u * s[0] + off[0], w * s[1] + off[1]);
      _v.applyMatrix4(m); _n.applyMatrix3(_nm).normalize();
      B.p.push(_v.x, _v.y, _v.z); B.n.push(_n.x, _n.y, _n.z);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) B.idx.push(B.count + geo.index.getX(i));
    else for (let i = 0; i < P.count; i++) B.idx.push(B.count + i);
    B.count += P.count;
    geo.dispose();
  }
  const inst = {}; // key -> {geo, mats:[]}
  function addInst(key0, geoFactory, m) { const key = CAT ? CAT + ':' + key0 : key0; (inst[key] || (inst[key] = { geo: geoFactory(), mats: [] })).mats.push(m); }

  // ---- colisores
  function col(x, z, w, d, y = 0, h = 1) { colliders.push({ x: +x.toFixed(3), z: +z.toFixed(3), w: +w.toFixed(3), d: +d.toFixed(3), h: +h.toFixed(3), y: +y.toFixed(3) }); }
  // caixa orientada (centro cx,cz; w ao longo do eixo local x; rotY) -> 1..n AABB
  function colOBB(cx, cz, w, d, ry, y, h, tol = 0.5) {
    const c = Math.cos(ry), s = Math.sin(ry), ac = Math.abs(c), as = Math.abs(s);
    if (as < 0.02 || ac < 0.02) { const ax = as < 0.02; col(cx, cz, ax ? w : d, ax ? d : w, y, h); return; }
    // divide ao longo do maior lado para a AABB não engordar mais que ~tol
    let L = w, D = d, ux = c, uz = -s; // eixo local x no mundo = (cos, -sin)
    if (d > w) { L = d; D = w; ux = s; uz = c; }
    const n = Math.max(1, Math.ceil(L * Math.min(ac, as) / tol)), pl = L / n;
    for (let i = 0; i < n; i++) {
      const t = -L / 2 + pl * (i + 0.5), px = cx + ux * t, pz = cz + uz * t;
      const ex = Math.abs(ux) * pl + Math.abs(uz) * D, ez = Math.abs(uz) * pl + Math.abs(ux) * D;
      col(px, pz, ex, ez, y, h);
    }
  }

  // ---- referencial local (rotação só em Y para colisores; rx/rz livres para peças)
  class Frame {
    constructor(x = 0, y = 0, z = 0, ry = 0) { this.x = x; this.y = y; this.z = z; this.ry = ry; this.m = mat4(x, y, z, 0, ry, 0); }
    // caixa com BASE em y
    box(key, x, y, z, w, h, d, o = {}) { this.boxC(key, x, y + h / 2, z, w, h, d, o); }
    // caixa com CENTRO em y
    boxC(key, x, y, z, w, h, d, o = {}) { const g = new T.BoxGeometry(w, h, d); addGeo(key, g, this.m.clone().multiply(mat4(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0)), o); }
    geo(key, g, x, y, z, o = {}) { addGeo(key, g, this.m.clone().multiply(mat4(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx || 1, o.sy || 1, o.sz || 1)), o); }
    // ponto de instância de GLB: caixa alvo (centro x,y,z; tamanho w,h,d; rotação local)
    place(cat, x, y, z, w, h, d, o = {}, color = null) { place(cat, this.m.clone().multiply(mat4(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, w, h, d)), color); }
    inst(key, factory, x, y, z, sx, sy, sz, o = {}) { addInst(key, factory, this.m.clone().multiply(mat4(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, sx, sy, sz))); }
    w(lx, lz) { const c = Math.cos(this.ry), s = Math.sin(this.ry); return [this.x + lx * c + lz * s, this.z - lx * s + lz * c]; }
    col(lx, lz, w, d, y, h, extraRy = 0) { const [x, z] = this.w(lx, lz); colOBB(x, z, w, d, this.ry + extraRy, this.y + y, h); }
    bc(key, x, y, z, w, h, d, o = {}) { this.box(key, x, y, z, w, h, d, o); this.col(x, z, w, d, y, h, o.ry || 0); }
    // sombra de contato (AO falso) no chão sob a peça: retângulo desfocado, margem 0,9 m
    blob(x, z, w, d, ry = 0, m = 0.9) { const [wx, wz] = this.w(x, z), inWh = wx > -9.5 && wx < 7.6 && wz > -9.6 && wz < 7.7; this.geo('blob', new T.PlaneGeometry(w + m, d + m), x, inWh ? 0.065 : 0.015, z, { rx: -Math.PI / 2, ry, uv: 'keep' }); } // BUG-0009: acima do piso do galpão (y 0,05)
  }
  const W0 = new Frame();
  const unitBox = () => new T.BoxGeometry(1, 1, 1);
  const barrelGeo = () => new T.CylinderGeometry(0.3, 0.3, 0.9, 14, 1);

  // ================================================================= DADOS (metros; rodada 1: contorno conferido em ref/top.jpg a 2400 px)
  // Pontas N/S medidas na top.jpg: recorte NW (x=-6,8 / -10,1..-10,9) e muro sul em z=42,1 com recorte SE (x 5,6..9,0; z 39,3).
  // [x, z, fence, alto]  -> aresta i vai do ponto i ao i+1. alto = muro de 2,5 m sem grade (blocos das pontas).
  const OUTLINE = [
    [-6.8, -44.17, 0, 1], [14.27, -44.17, 0, 1], [14.27, -26.6, 1, 0], [24.95, -10.47, 1, 0], [22.6, -7.08, 1, 0], [20.26, -1.09, 1, 0],
    [20.26, 6.46, 1, 0], [15.05, 13.75, 1, 0], [9.0, 27.0, 0, 1], [9.0, 39.3, 0, 1], [5.6, 39.3, 0, 1], [5.6, 42.1, 0, 1],
    [-16.0, 42.1, 1, 0], [-16.0, 24.3, 1, 0], [-25.83, 9.58, 1, 0], [-21.6, 2.0, 1, 0], [-21.4, -10.2, 1, 0], [-11.51, -27.9, 1, 0],
    [-10.9, -36.4, 0, 1], [-10.1, -39.7, 0, 1], [-6.8, -39.7, 0, 1],
  ];
  // BUG-0004: os 2 trechos copiados da referência ([-25.83,9.58 -> -31.0,2.5] e [24.95,-10.47 -> 26.0,-8.9]) saíam do vértice
  // para o vazio fora da laje. Removidos: o perímetro fechado já é o OUTLINE (aresta i -> i+1, com volta ao ponto 0), sem frestas.
  const OVERSHOOT = [];
  const END_WALL_H = 2.5, LOW_WALL_H = 1.1;

  // ================================================================= CHÃO + PLATAFORMA
  {
    const shape = new T.Shape(OUTLINE.map(([x, z]) => new T.Vector2(x, -z)));
    const g = new T.ShapeGeometry(shape); g.rotateX(-Math.PI / 2);
    const ground = new T.Mesh(g, M.sand); ground.name = 'ground'; ground.receiveShadow = true; group.add(ground);
    disposables.push(g);
    const gb = new T.ShapeGeometry(new T.Shape(OUTLINE.map(([x, z]) => new T.Vector2(x, z)))); gb.rotateX(Math.PI / 2); // face de baixo da laje
    W0.geo('concrete', gb, 0, -2.6, 0, { uv: 'keep' });
    for (let i = 0; i < OUTLINE.length; i++) { // borda da laje (2,6 m) sob o muro
      const [x0, z0] = OUTLINE[i], [x1, z1] = OUTLINE[(i + 1) % OUTLINE.length];
      const L = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
      new Frame((x0 + x1) / 2, 0, (z0 + z1) / 2, ry).box('concrete', 0, -2.6, 0, L + 0.4, 2.6, 0.45);
    }
    for (const [x, z] of [[-3, -30], [8, -30], [-14, -8], [14, -8], [-12, 14], [6, 14], [-10, 32], [4, 32], [-3, 0]]) W0.box('darkMetal', x, -12, z, 0.9, 9.4, 0.9);
  }

  // ================================================================= MURO PERIMETRAL + GRADE (gerado das arestas do contorno)
  function perimWall(x0, z0, x1, z1, fence, tall) {
    const w = Math.hypot(x1 - x0, z1 - z0); if (w < 0.3) return;
    const F = new Frame((x0 + x1) / 2, 0, (z0 + z1) / 2, -Math.atan2(z1 - z0, x1 - x0)), h = tall ? END_WALL_H : LOW_WALL_H;
    F.box('concrete', 0, 0, 0, w + 0.2, h, 0.4, { off: [rr(0, 3), 0] });
    F.box('concrete', 0, h, 0, w + 0.2, 0.08, 0.5); // capa
    const n = Math.max(1, Math.round(w / 3));
    for (let i = 0; i <= n; i++) F.box('concrete', -w / 2 + (w / n) * i, 0, 0, 0.45, h + 0.15, 0.6);
    if (fence) F.geo('fence', new T.PlaneGeometry(w, FENCE_H), 0, h + 0.08 + FENCE_H / 2, 0, { uv: 'keep', s: [w, FENCE_H] });
    F.col(0, 0, w + 0.2, 0.45, 0, h + (fence ? FENCE_H + 0.08 : 0.08));
    F.blob(0, 0, w, 0.5, 0, 0.7);
  }
  OUTLINE.forEach(([x0, z0], i) => { const [x1, z1] = OUTLINE[(i + 1) % OUTLINE.length]; perimWall(x0, z0, x1, z1, OUTLINE[i][2], OUTLINE[i][3]); });
  OVERSHOOT.forEach(([x0, z0, x1, z1]) => perimWall(x0, z0, x1, z1, 1, 0));

  // ================================================================= GALPÃO
  // Rodada 1: alturas reestimadas por perspectiva em wh_side_0 / eye_0_0 (fov vertical): faixa vermelha 3,3 m,
  // beiral das alas 3,2 m, alas encostam na nave a 4,4 m, beiral da nave 5,6 m, cumeeira 6,5 m.
  {
    const X0 = -9.5, X1 = 7.6, Z0 = -9.6, Z1 = 7.7, NL = -5.3, NR = 3.6, RX = -0.85;
    const EAVE = 5.6, RIDGE = 6.5, WING = 3.2, WTOP = 4.4, PORT_L = -4.25, PORT_R = 2.55, PORT_H = 3.3, RED_H = 3.3, t = 0.2;
    const HS = (NR - NL) / 2, RISE = RIDGE - EAVE; // meia-vão e flecha da nave
    const winPlane = (w, h) => { const g = new T.PlaneGeometry(w, h); return g; };
    const WIN = (x, y, z, w, h, ry = 0) => W0.geo('window', winPlane(w, h), x, y, z, { ry, uv: 'keep', s: [w / 1.5, h / 0.9] });
    // piso
    W0.box('floor', (X0 + X1) / 2, -0.05, (Z0 + Z1) / 2, X1 - X0, 0.1, Z1 - Z0);
    // fachadas N e S (extrusão do contorno, portal como recorte)
    const facade = [[X0, 0], [PORT_L, 0], [PORT_L, PORT_H], [PORT_R, PORT_H], [PORT_R, 0], [X1, 0], [X1, WING], [NR, WTOP], [NR, EAVE], [RX, RIDGE], [NL, EAVE], [NL, WTOP], [X0, WING]];
    const extr = (pts, depth) => new T.ExtrudeGeometry(new T.Shape(pts.map(p => new T.Vector2(p[0], p[1]))), { depth, bevelEnabled: false });
    // 4 grupos de janelinhas no frontão (medidos na wh_side_0, fachada S); na N espelha em torno do eixo da nave
    const GABLE_WIN = [[-4.67, -3.6], [-3.06, -1.45], [-1.31, 1.11], [1.51, 2.58]];
    for (const [zf, side] of [[Z0, -1], [Z1 - t, 1]]) {
      W0.geo('greenPanel', extr(facade, t), 0, 0, zf, { uv: 'keep' });
      const zo = side > 0 ? Z1 + 0.015 : Z0 - 0.015; // face externa
      const mx = (x) => side > 0 ? x : 2 * RX - x;
      // faixa vermelha (3,3 m) com canto verde em cada ponta + batentes/verga vermelhos do portal
      W0.box('redWall', (-8.15 + PORT_L) / 2, 0, zo, PORT_L + 8.15, RED_H, 0.03);
      W0.box('redWall', (PORT_R + 6.2) / 2, 0, zo, 6.2 - PORT_R, RED_H, 0.03);
      W0.box('redWall', (X0 + X1) / 2, RED_H - 0.12, zo + side * 0.03, X1 - X0 - 0.4, 0.14, 0.05); // friso vermelho contínuo
      for (const xj of [PORT_L, PORT_R]) W0.box('redWall', xj, 0, (zf + t / 2), 0.28, PORT_H, 0.32);
      W0.box('redWall', (PORT_L + PORT_R) / 2, PORT_H, zf + t / 2, PORT_R - PORT_L + 0.28, 0.22, 0.32);
      // porta pequena verde (SW na fachada S; espelhada na N)
      // BUG-0005: porta pequena = folha de tábuas (mesmo barn_wall da parede) + batente; fica à frente da faixa vermelha (sem z-fight)
      { const dz = zo + side * 0.045, dx = mx(-7.6);
        W0.box('greenPanel', dx, 0, dz, 0.95, 1.25, 0.04);
        for (const ex of [-1, 1]) W0.box('greenWood', dx + ex * 0.52, 0, dz + side * 0.01, 0.09, 1.34, 0.06);
        W0.box('greenWood', dx, 1.25, dz + side * 0.01, 1.13, 0.09, 0.06); }
      for (const [a, b] of GABLE_WIN) {
        const xa = mx(a), xb = mx(b), xc = (xa + xb) / 2, w = Math.abs(xb - xa);
        for (const zz of side > 0 ? [Z1 + 0.02, Z1 - t - 0.02] : [Z0 - 0.02, Z0 + t + 0.02]) WIN(xc, 5.0, zz, w, 0.8);
      }
    }
    // paredes externas das alas (W com vão em z=0,5; E com vão em z=-3,8), janelas a 1,4-2,4 m
    const wing = (xw, dirSign, holeZ, winZ) => {
      const pts = [[Z0, 0], [holeZ - 1.6, 0], [holeZ - 1.6, 2.4], [holeZ + 1.6, 2.4], [holeZ + 1.6, 0], [Z1, 0], [Z1, WING], [Z0, WING]];
      W0.geo('greenPanel', extr(pts, t), xw, 0, 0, { ry: -Math.PI / 2, uv: 'keep' }); // extrusão vai para -x
      for (const zc of winZ) for (const dx of [0.02, -t - 0.02]) WIN(xw + (dirSign > 0 ? -dx - t : dx), 1.9, zc, 1.3, 0.9, Math.PI / 2);
      const cx = xw - t / 2; col(cx, (Z0 + holeZ - 1.6) / 2, t + 0.1, holeZ - 1.6 - Z0, 0, WING + 0.4); col(cx, (holeZ + 1.6 + Z1) / 2, t + 0.1, Z1 - holeZ - 1.6, 0, WING + 0.4);
    };
    wing(X0 + t, -1, 0.5, [-7.5, -3.6, 4.6]);
    wing(X1, 1, -3.8, [-7.6, 0.4, 4.4]);
    // paredes altas da nave (clerestório) WTOP..EAVE com janelinhas
    for (const xn of [NL, NR]) {
      W0.box('greenPanel', xn, WTOP - 0.25, (Z0 + Z1) / 2, t, EAVE - WTOP + 0.25, Z1 - Z0);
      for (let zc = -8.4; zc <= 6.6; zc += 2.5) for (const dx of [-t / 2 - 0.02, t / 2 + 0.02]) WIN(xn + dx, (WTOP + EAVE) / 2 + 0.05, zc, 0.9, 0.7, Math.PI / 2);
      W0.box('greenWood', xn, WTOP - 0.3, (Z0 + Z1) / 2, 0.3, 0.3, Z1 - Z0); // viga longitudinal
    }
    // colunas (passo 4 m) + tesouras + caibros + girts
    const colZ = [-9.0, -5.0, -1.0, 3.0, 7.0];
    for (const xn of [NL, NR]) for (const zc of colZ) { W0.bc('greenWood', xn, 0, zc, 0.35, WTOP - 0.3, 0.35); W0.blob(xn, zc, 0.35, 0.35, 0, 0.55); } // BUG-0009: contato dos pilares
    const hl = Math.hypot(HS, RISE), ang = Math.atan2(RISE, HS);
    for (const zc of colZ) {
      W0.box('greenWood', RX, EAVE - 0.2, zc, NR - NL, 0.2, 0.2);
      W0.boxC('greenWood', (NL + RX) / 2, (EAVE + RIDGE) / 2 - 0.15, zc, hl, 0.18, 0.18, { rz: ang });
      W0.boxC('greenWood', (NR + RX) / 2, (EAVE + RIDGE) / 2 - 0.15, zc, hl, 0.18, 0.18, { rz: -ang });
      W0.box('greenWood', RX, EAVE - 0.05, zc, 0.16, RISE - 0.15, 0.16);
      for (const sx of [-1, 1]) W0.boxC('greenWood', RX + sx * 1.3, EAVE + 0.3, zc, 0.12, 0.9, 0.12, { rz: sx * 0.9 });
      for (const [xa, xb] of [[X0, NL], [NR, X1]]) {
        const L = Math.abs(xb - xa), a = Math.atan2(xa === X0 ? WTOP - WING : WING - WTOP, L);
        W0.boxC('greenWood', (xa + xb) / 2, (WING + WTOP) / 2 - 0.12, zc, Math.hypot(L, WTOP - WING), 0.16, 0.16, { rz: a });
        W0.box('greenWood', (xa + xb) / 2, WING - 0.2, zc, L, 0.16, 0.16);
      }
    }
    for (const zz of [Z0 + t + 0.1, Z1 - t - 0.1]) for (const y of [1.1, 2.3]) W0.box('greenWood', (X0 + PORT_L) / 2, y, zz, PORT_L - X0, 0.14, 0.14), W0.box('greenWood', (PORT_R + X1) / 2, y, zz, X1 - PORT_R, 0.14, 0.14);
    // travessas e pilares das alas: cortados no vão da porta lateral (W: z=0,5; E: z=-3,8; vão de 3,2 m) — porta livre
    const SIDE_HOLE = [[X0 + t + 0.1, 0.5], [X1 - t - 0.1, -3.8]], HH = 1.6;
    for (const [xx, hz] of SIDE_HOLE) {
      for (const y of [1.0, 2.3]) {
        if (y < 2.4) { // abaixo da verga: dois trechos, sem cruzar o vão
          W0.box('greenWood', xx, y, (Z0 + hz - HH) / 2, 0.14, 0.14, hz - HH - Z0);
          W0.box('greenWood', xx, y, (hz + HH + Z1) / 2, 0.14, 0.14, Z1 - hz - HH);
        } else W0.box('greenWood', xx, y, (Z0 + Z1) / 2, 0.14, 0.14, Z1 - Z0);
      }
      for (const zc of colZ) if (Math.abs(zc - hz) > HH + 0.15) W0.box('greenWood', xx, 0, zc, 0.22, WING, 0.22);
      for (const zj of [hz - HH - 0.11, hz + HH + 0.11]) W0.box('greenWood', xx, 0, zj, 0.22, WING, 0.22); // batentes
      W0.box('greenWood', xx, 2.4, hz, 0.22, 0.2, 2 * HH + 0.44); // verga
    }
    for (const f of [0.25, 0.6, 0.9]) for (const sx of [-1, 1]) W0.box('greenWood', RX + sx * HS * f, RIDGE - RISE * f - 0.29, (Z0 + Z1) / 2, 0.14, 0.14, Z1 - Z0); // terças
    // telhados (chapa ondulada, nervuras ao longo de Z)
    const slope = (xa, ya, xb, yb) => {
      const L = Math.hypot(xb - xa, yb - ya), a = Math.atan2(yb - ya, xb - xa);
      W0.boxC('roof', (xa + xb) / 2, (ya + yb) / 2 + 0.05, -0.95, L, 0.07, 20.1, { rz: a, off: [rr(0, 3), rr(0, 3)] });
    };
    const OV = 0.5, kN = RISE / HS;
    slope(NL - OV, EAVE - kN * OV, RX, RIDGE); // água oeste (beiral 0,5 m)
    slope(RX, RIDGE, NR + OV, EAVE - kN * OV);
    const kW = (WTOP - WING) / (NL - X0), kE = (WTOP - WING) / (X1 - NR), WOV = 1.2;
    slope(X0 - WOV, WING - kW * WOV, NL, WTOP); slope(NR, WTOP, X1 + WOV, WING - kE * WOV);
    W0.boxC('roof', RX, RIDGE + 0.09, -0.95, 0.5, 0.06, 20.1); // cumeeira
    // colisores do corpo: fachadas (com portal), telhados em degraus
    for (const z of [Z0 + t / 2, Z1 - t / 2]) {
      col((X0 + NL) / 2, z, NL - X0, t + 0.1, 0, WTOP); col((NR + X1) / 2, z, X1 - NR, t + 0.1, 0, WTOP);
      col((NL + PORT_L) / 2, z, PORT_L - NL, t + 0.1, 0, EAVE); col((PORT_R + NR) / 2, z, NR - PORT_R, t + 0.1, 0, EAVE);
      col((PORT_L + PORT_R) / 2, z, PORT_R - PORT_L, t + 0.1, PORT_H, EAVE - PORT_H + 0.5);
    }
    for (let i = 0; i < 4; i++) { // alas e nave: 4 faixas por água
      const f = (i + 0.5) / 4;
      col(X0 - WOV + (NL - X0 + WOV) * f, -0.95, (NL - X0 + WOV) / 4, 20.1, WING - kW * WOV + (WTOP - WING + kW * WOV) * f - 0.1, 0.3);
      col(X1 + WOV - (X1 + WOV - NR) * f, -0.95, (X1 + WOV - NR) / 4, 20.1, WING - kE * WOV + (WTOP - WING + kE * WOV) * f - 0.1, 0.3);
      for (const sx of [-1, 1]) col(RX + sx * (HS + OV) * (1 - f), -0.95, (HS + OV) / 4, 20.1, RIDGE - RISE * (1 - f) * (HS + OV) / HS - 0.1, 0.3);
    }
  }

  // ================================================================= CONTAINERS
  // tint por instância sobre o albedo grafite do GLB (~#3A3C3C): razão linear alvo/base -> mesma cor final dos procedurais
  const CONT_BASE = new T.Color(0x3A3C3C);
  const tintFor = (hex) => { const c = new T.Color(hex); return new T.Color().setRGB(c.r / CONT_BASE.r, c.g / CONT_BASE.g, c.b / CONT_BASE.b); };
  const CONT_TINT = { red: tintFor(0x6E2A2A), red_open: tintFor(0x6E2A2A), yellow: tintFor(0xB8962E), blue: tintFor(0x3E5266) };
  const contKey = (v) => v === 'yellow' ? 'contYellow' : v === 'blue' ? 'contBlue' : 'contRed';
  function container(d) {
    const { x, z, w: L, d: Wd, h: H, rotY: ry = 0, variant } = d, key = contKey(variant), F = new Frame(x, 0, z, ry);
    const tw = 0.06, op = d.opening, openEnd = d.openEnd || 0, doors = d.doors ?? 1, off = [rr(0, 4), 0];
    const glb = !op && !openEnd; // fechado: vira container.glb (porta do GLB na ponta +x)
    if (glb) { const v = L >= 5.5 ? 'cont_full' : L >= 4 ? 'cont_mid' : 'cont_short'; F.place(v, 0, H / 2, 0, L, H, Wd, { ry: doors === -1 ? Math.PI : 0 }, CONT_TINT[variant] || CONT_TINT.red); CAT = 'm_' + v; }
    F.box(key, 0, 0, 0, L, 0.12, Wd, { off });
    if (variant === 'yellow' && op) { // faixa de aviso: listras diagonais pretas sobre o piso amarelo, nas bordas da passagem
      for (const zz of [-1, 1]) for (let x = op.offsetX - op.w / 2 + 0.15; x < op.offsetX + op.w / 2 - 0.1; x += 0.22) F.boxC('darkMetal', x, 0.125, zz * (Wd / 2 - 0.3), 0.07, 0.01, 0.36, { ry: 0.78 });
    }
    F.box(key, 0, H - 0.08, 0, L - 0.02, 0.08, Wd - 0.02, { off });
    for (const s of [-1, 1]) {
      const zc = s * (Wd / 2 - tw / 2);
      if (op) {
        const a = op.offsetX - op.w / 2, b = op.offsetX + op.w / 2;
        F.box(key, (-L / 2 + a) / 2, 0.12, zc, a + L / 2, H - 0.2, tw, { off }); F.box(key, (b + L / 2) / 2, 0.12, zc, L / 2 - b, H - 0.2, tw, { off });
        F.box(key, (a + b) / 2, op.h, zc, b - a, H - 0.08 - op.h, tw, { off });
        F.col((-L / 2 + a) / 2, s * (Wd / 2 - 0.12), a + L / 2, 0.25, 0, H); F.col((b + L / 2) / 2, s * (Wd / 2 - 0.12), L / 2 - b, 0.25, 0, H);
        F.col((a + b) / 2, s * (Wd / 2 - 0.12), b - a, 0.25, op.h, H - op.h);
      } else { F.box(key, 0, 0.12, zc, L, H - 0.2, tw, { off }); if (openEnd) F.col(0, s * (Wd / 2 - 0.12), L, 0.25, 0, H); }
    }
    for (const e of [-1, 1]) {
      if (openEnd === e) continue;
      F.box(key, e * (L / 2 - tw / 2), 0.12, 0, tw, H - 0.2, Wd - 2 * tw, { off });
      if (op || openEnd) F.col(e * (L / 2 - 0.12), 0, 0.25, Wd, 0, H);
      if (doors === e) { // barras de travamento + junta das portas
        for (const zb of [-0.36, -0.12, 0.12, 0.36]) F.box('darkMetal', e * (L / 2 + 0.025), 0.2, zb * Wd / 1.2 * 1.2, 0.04, H - 0.45, 0.045);
        F.box('darkMetal', e * (L / 2 + 0.015), 0.15, 0, 0.02, H - 0.3, 0.03);
      }
    }
    const fk = key === 'contRed' ? 'contFrame' : key; // quadro: bordô escuro nos vermelhos
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) F.box(fk, ex * (L / 2 - 0.08), 0, ez * (Wd / 2 - 0.08), 0.19, H, 0.19);
    for (const y of [0, H - 0.2]) { for (const ez of [-1, 1]) F.box(fk, 0, y, ez * (Wd / 2 - 0.05), L - 0.3, 0.2, 0.2); for (const ex of [-1, 1]) F.box(fk, ex * (L / 2 - 0.05), y, 0, 0.2, 0.2, Wd - 0.3); }
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) for (const y of [0, H - 0.24]) F.box(fk, ex * (L / 2 - 0.1), y, ez * (Wd / 2 - 0.1), 0.26, 0.24, 0.26); // cantoneiras (corner castings)
    // BUG-0002: o decal fica DENTRO da categoria (CAT ainda ativo): nos que viram GLB ele some junto com o fallback procedural
    // (o GLB tem a própria pintura); só aparece nos que continuam procedurais (red_open) ou se o GLB falhar ao carregar.
    if (variant === 'red' || variant === 'red_open') if (L >= 4.5) for (const s of [-1, 1]) F.geo('logo', new T.PlaneGeometry(1.7, 0.85), s * L * 0.22, 1.35, s * (Wd / 2 + 0.03), { ry: s > 0 ? 0 : Math.PI, uv: 'keep' });
    CAT = null;
    F.blob(0, 0, L, Wd);
    if (!op && !openEnd) F.col(0, 0, L, Wd, 0, H);
    else F.col(0, 0, L, Wd, H - 0.1, 0.1); // teto (dá para subir)
    return F;
  }
  const CONTAINERS = [
    { id: 'cont_red_open_N', variant: 'red_open', x: -6.2, z: -19.2, w: 9.5, d: 2.5, h: 2.6, rotY: 0.25, opening: { offsetX: -1.8, w: 3.0, h: 2.3 }, doors: 1 },
    { id: 'cont_yellow_S', variant: 'yellow', x: 4.2, z: 17.9, w: 9.5, d: 2.5, h: 2.6, rotY: 0.22, opening: { offsetX: 1.2, w: 3.0, h: 2.3 }, doors: -1 },
    { id: 'cont_ramp_NE', variant: 'red', x: 13.3, z: -14.0, w: 6.3, d: 2.4, h: 2.6, rotY: 0, doors: 1, pallet: -1 },
    { id: 'cont_ramp_SW', variant: 'red', x: -14.6, z: 14.1, w: 6.3, d: 2.4, h: 2.6, rotY: 0, doors: -1, pallet: 1 },
    { id: 'cont_red_W', variant: 'red', x: -13.9, z: -4.15, w: 4.6, d: 2.1, h: 2.4, rotY: -1.23 },
    { id: 'cont_short_NE', variant: 'red', x: 3.07, z: -19.3, w: 3.4, d: 1.9, h: 2.4, rotY: 1.571 },
    { id: 'cont_short_SW', variant: 'red', x: -5.16, z: 19.3, w: 3.4, d: 1.9, h: 2.4, rotY: 1.571 },
    // dentro do galpão (posições reestimadas por wh_inside_0/1; ver build.md)
    { id: 'wh_blue_1', variant: 'blue', x: -3.86, z: -4.8, w: 6.1, d: 2.4, h: 2.6, rotY: 1.571, openEnd: -1, doors: 1 },
    { id: 'wh_blue_2', variant: 'blue', x: 2.5, z: -0.9, w: 4.8, d: 2.4, h: 2.6, rotY: 1.571, doors: 1 },
  ];
  for (const c of CONTAINERS) {
    const F = container(c);
    if (c.pallet) { const px = c.pallet * (c.w / 2 - 0.75); F.place('pallet', px, c.h + 0.085, 0, 1.25, 0.17, 1.25); CAT = 'm_pallet'; for (let i = 0; i < 5; i++) F.box('wood', px, c.h, -0.6 + i * 0.3, 1.2, 0.04, 0.2); for (const zz of [-0.55, 0, 0.55]) F.box('wood', px, c.h + 0.04, zz, 1.2, 0.1, 0.12, { ry: Math.PI / 2 }); for (let i = 0; i < 5; i++) F.box('wood', px - 0.5 + i * 0.25, c.h + 0.14, 0, 0.18, 0.03, 1.25); CAT = null; }
  }

  // ================================================================= RAMPAS (tábuas) — +x local = sentido de subida
  function ramp({ x, z, w: run, d, h: rise, rotY }) {
    const F = new Frame(x, 0, z, rotY), len = Math.hypot(run, rise), a = Math.atan2(rise, run), n = 3, pw = d / n;
    for (let i = 0; i < n; i++) F.boxC('ramp', 0, rise / 2, -d / 2 + pw * (i + 0.5), len, 0.07, pw - 0.06, { rz: a, off: [rr(0, 2), i * 0.37] });
    for (const f of [0.3, 0.7]) F.boxC('wood', -run / 2 + run * f, rise * f - 0.1, 0, 0.12, 0.1, d + 0.1);
    const steps = Math.ceil(rise / 0.3);
    for (let i = 0; i < steps; i++) F.col(-run / 2 + run * (i + 0.5) / steps, 0, run / steps, d, 0, rise * (i + 1) / steps);
  }
  [{ x: 10.9, z: -17.2, w: 4.8, d: 1.6, h: 2.6, rotY: -1.571 }, { x: -12.3, z: 16.8, w: 5.0, d: 1.6, h: 2.6, rotY: 1.571 },
   { x: 3.5, z: -24.9, w: 3.5, d: 1.5, h: 2.95, rotY: -1.571 }, { x: -5.3, z: 24.5, w: 3.5, d: 1.7, h: 2.95, rotY: 1.571 }].forEach(ramp);

  // ================================================================= VAGÕES
  for (const [x, z, plankSide, px, pz] of [[5.7, -22.0, 1, 7.8, -20.35], [-7.5, 22.0, -1, -9.6, 20.35]]) {
    const F = new Frame(x, 0, z, 0), L = 7.0, Wd = 2.3;
    F.place('boxcar', 0, 1.55, 0, L + 0.3, 3.1, Wd + 0.1); CAT = 'm_boxcar';
    F.box('train', 0, 0.95, 0, L, 1.95, Wd, { off: [rr(0, 2), 0] });
    F.box('trainRoof', 0, 2.9, 0, L + 0.12, 0.12, Wd + 0.16);
    F.box('trainRoof', 0, 3.02, 0, L, 0.08, Wd - 0.5);
    for (let i = 0; i < 9; i++) F.box('trainRoof', -L / 2 + 0.4 + i * (L - 0.8) / 8, 3.02, 0, 0.06, 0.1, Wd - 0.4);
    for (const s of [-1, 1]) {
      for (let i = 0; i <= 9; i++) F.box('train', -L / 2 + 0.1 + i * (L - 0.2) / 9, 0.95, s * (Wd / 2 + 0.03), 0.08, 1.95, 0.05);
      F.box('train', 0, 1.0, s * (Wd / 2 + 0.08), 1.8, 1.8, 0.08); // porta corrediça em relevo
      for (const dx of [-0.9, 0.9]) F.box('darkMetal', dx, 0.98, s * (Wd / 2 + 0.11), 0.06, 1.84, 0.04);
      F.box('darkMetal', 0, 2.82, s * (Wd / 2 + 0.1), 2.3, 0.06, 0.06); // trilho da porta
      for (const px of [-2.4, 2.4]) F.box('train', px, 1.25, s * (Wd / 2 + 0.06), 1.5, 1.2, 0.05); // painéis em relevo
      F.box('train', 0, 2.75, s * (Wd / 2 + 0.07), 2.2, 0.08, 0.1);
    }
    F.box('darkMetal', 0, 0.62, 0, L + 0.3, 0.33, 1.9);
    for (const bx of [-2.4, 2.4]) {
      F.box('darkMetal', bx, 0.42, 0, 0.5, 0.3, 1.5); // travessa do truque
      for (const sz of [-1.02, 1.02]) F.box('darkMetal', bx, 0.24, sz, 2.1, 0.24, 0.07); // laterais do truque (fora das rodas)
      for (const wx of [-0.65, 0.65]) { for (const wz of [-0.84, 0.84]) F.geo('darkMetal', new T.CylinderGeometry(0.36, 0.36, 0.1, 12), bx + wx, 0.36, wz, { rx: Math.PI / 2 }); F.geo('darkMetal', new T.CylinderGeometry(0.07, 0.07, 1.9, 6), bx + wx, 0.36, 0, { rx: Math.PI / 2 }); }
    }
    for (const e of [-1, 1]) F.box('darkMetal', e * (L / 2 + 0.25), 0.55, 0, 0.35, 0.25, 0.3);
    CAT = null; col(x, z, L + 0.3, Wd + 0.2, 0, 3.1); F.blob(0, 0, L, Wd);
    // tábuas em pé (WOOD) do lado do vagão
    const P = new Frame(px, 0, pz, 0);
    for (let i = 0; i < 3; i++) P.box('wood', -0.78 + i * 0.78, 0, 0, 0.72, 3.6, 0.1, { rx: -0.04 * plankSide, off: [i * 0.7, 0] });
    P.col(0, 0, 2.4, 0.4, 0, 3.6); P.blob(0, 0, 2.4, 0.3);
  }

  const LOG_TINT = new T.Color().setRGB(0.82, 0.78, 0.74); // escurece/dessatura levemente (#4A4038)
  // ================================================================= PILHAS DE TORAS
  for (const [x, z] of [[-4.06, -28.5], [1.6, 28.1]]) {
    const F = new Frame(x, 0, z, 0);
    for (const zz of [-1.0, 0, 1.0]) F.box('wood', 0, 0, zz, 8.0, 0.1, 0.14, { swap: true });
    for (let i = 0; i < 9; i++) F.box('wood', -3.8 + i * 0.95, 0.1, 0, 0.2, 0.05, 2.4);
    for (let row = 0; row < 3; row++) for (const sz of [-1, 1]) F.place('logs', rr(-0.15, 0.15), 0.15 + 0.275 + row * 0.53, sz * 0.56, 7.2, 0.56, 1.12, { ry: (row + (sz > 0 ? 1 : 0)) % 2 ? Math.PI : 0 }, LOG_TINT);
    CAT = 'm_logs';
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) {
      const r = rr(0.25, 0.29), len = rr(6.9, 7.5), y = 0.15 + 0.28 + row * 0.53, zz = -0.84 + k * 0.56 + rr(-0.03, 0.03), xo = rr(-0.25, 0.25);
      F.geo('bark', new T.CylinderGeometry(r, r, len, 10, 1, true), xo, y, zz, { rz: Math.PI / 2, uv: 'keep', s: [2 * Math.PI * r, len], off: [rr(0, 1), rr(0, 1)] });
      for (const e of [-1, 1]) F.geo('logEnd', new T.CircleGeometry(r, 10), xo + e * len / 2, y, zz, { ry: e * Math.PI / 2, uv: 'keep' });
    }
    CAT = null;
    for (const s of [-1, 1]) for (const sx of [-3.1, 0, 3.1]) F.box('wood', sx, 0, s * 1.3, 0.75, 2.3, 0.12, { off: [rr(0, 2), 0] });
    F.col(0, 0, 8.0, 2.75, 0, 2.3); F.blob(0, 0, 8.0, 2.6);
  }

  // ================================================================= TORRES DE VIGIA
  function tower(x, z, stairs, openSide, openX) {
    const F = new Frame(x, 0, z, 0), s = 1.45, PY = 2.5;
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) F.bc('wood', ex * s, 0, ez * s, 0.3, 4.75, 0.3);
    F.bc('wood', 0, PY, 0, 3.3, 0.15, 3.3, { swap: true });
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) F.box('wood', ex * s * 0.5, PY - 0.25, ez * s, s, 0.2, 0.12), F.box('wood', ex * s, PY - 0.25, ez * s * 0.5, 0.12, 0.2, s);
    const bl = Math.hypot(2.9, 2.1), ba = Math.atan2(2.1, 2.9);
    for (const ez of [-1, 1]) F.boxC('wood', 0, 1.3, ez * s, bl, 0.14, 0.08, { rz: ez * ba });
    for (const ex of [-1, 1]) F.boxC('wood', ex * s, 1.3, 0, 0.08, 0.14, bl, { rx: ex * ba });
    // parapeito de tábuas (1,1 m) com vão de acesso no lado da escada
    const PH = 1.1, y0 = PY + 0.15;
    for (const ez of [-1, 1]) {
      if (ez === openSide) {
        const a = openX - 0.65, b = openX + 0.65;
        if (a > -s) F.bc('wood', (-s + a) / 2, y0, ez * s, a + s, PH, 0.08);
        if (b < s) F.bc('wood', (b + s) / 2, y0, ez * s, s - b, PH, 0.08);
      } else F.bc('wood', 0, y0, ez * s, 2.9, PH, 0.08);
      F.box('wood', 0, y0 + PH, ez * s, 3.0, 0.08, 0.14);
    }
    for (const ex of [-1, 1]) { F.bc('wood', ex * s, y0, 0, 0.08, PH, 2.9); F.box('wood', ex * s, y0 + PH, 0, 0.14, 0.08, 3.0); }
    F.box('towerRoof', 0, 4.72, 0, 4.2, 0.12, 3.6, { rx: 0.06 });
    F.box('wood', 0, 4.6, 0, 3.3, 0.12, 3.3);
    F.col(0, 0, 4.2, 3.6, 4.6, 0.3);
    // escada
    const S = new Frame(stairs.x, 0, stairs.z, stairs.rotY), run = 3.0, rise = PY + 0.15, sl = Math.hypot(run, rise), sa = Math.atan2(rise, run), n = 9;
    for (const zz of [-0.65, 0.65]) S.boxC('ramp', 0, rise / 2, zz, sl, 0.25, 0.07, { rz: sa });
    for (let i = 0; i < n; i++) S.box('ramp', -run / 2 + run * (i + 0.5) / n, rise * (i + 1) / n - 0.05, 0, 0.3, 0.05, 1.25, { swap: true });
    for (const zz of [-0.7, 0.7]) S.boxC('wood', 0.1, rise / 2 + 0.9, zz, sl, 0.06, 0.06, { rz: sa });
    for (let i = 0; i < n; i++) S.col(-run / 2 + run * (i + 0.5) / n, 0, run / n, 1.4, 0, rise * (i + 1) / n);
  }
  tower(12.2, -29.0, { x: 11.4, z: -32.1, rotY: -1.571 }, -1, -0.8);
  tower(-14.2, 28.1, { x: -13.6, z: 31.2, rotY: 1.571 }, 1, 0.6);

  // ================================================================= TELHEIROS GRANDES (decks das pontas)
  // Rodada 1: medidos na top.jpg (2400 px): N_A x -6,78..-0,50 / N_B 3,68..11,30 (z -44,2..-36,6);
  // S_C x -12,56..-4,90 / S_D -0,71..5,57 (z 35,3..42,7). Simetria pontual N<->S confirmada.
  // O tampo da referência é uma face única (invisível de baixo): o ponto eye_0 (1,2; 36) fica SOB o deck D e a foto
  // mostra céu. Por padrão reproduzimos isso; deckUnderside:true acrescenta a face de baixo (recomendado no jogo).
  for (const sh of [
    { x: -3.64, z: -40.4, w: 6.28, d: 7.6, front: 1, wall: [-6.78, -3.0] },
    { x: 7.49, z: -40.4, w: 7.62, d: 7.6, front: 1, wall: [5.5, 11.3] },
    { x: -8.73, z: 39.0, w: 7.66, d: 7.4, front: -1 },
    { x: 2.43, z: 39.0, w: 6.28, d: 7.4, front: -1 },
  ]) {
    const F = new Frame(sh.x, 0, sh.z, 0), Y = 2.5, TOP = Y + 0.28;
    F.geo('deck', new T.PlaneGeometry(sh.w, sh.d), 0, TOP, 0, { rx: -Math.PI / 2, uv: 'keep', s: [sh.w, sh.d], swap: true, off: [rr(0, 2), rr(0, 2)] });
    if (deckUnderside) F.geo('deck', new T.PlaneGeometry(sh.w, sh.d), 0, Y + 0.2, 0, { rx: Math.PI / 2, uv: 'keep', s: [sh.w, sh.d], swap: true });
    for (const f of [-0.33, 0, 0.33]) F.box('wood', f * sh.w, Y + 0.02, 0, 0.18, 0.22, sh.d - 0.3); // vigas por baixo
    for (const f of [-0.25, 0.25]) F.box('wood', 0, TOP, f * sh.d, sh.w - 0.3, 0.04, 0.22, { swap: true }); // travessas por cima
    for (const s2 of [-1, 1]) { F.box('wood', 0, Y, s2 * (sh.d / 2 - 0.1), sh.w, 0.28, 0.2, { swap: true }); F.box('wood', s2 * (sh.w / 2 - 0.1), Y, 0, 0.2, 0.28, sh.d - 0.4, { swap: true }); }
    for (const s2 of [-1, 1]) F.box('wood', s2 * sh.w * 0.2, TOP, 0, 0.3, 0.03, sh.d - 0.4); // ripas de reforço por cima (quadro visto na top)
    F.box('wood', 0, TOP, 0, sh.w - 0.4, 0.03, 0.3, { swap: true });
    F.col(0, 0, sh.w, sh.d, Y, 0.3);
    const pz = sh.front * (sh.d / 2 - 0.25);
    for (const px of [-sh.w / 2 + 0.25, 0, sh.w / 2 - 0.25]) F.bc('wood', px, 0, pz, 0.35, Y, 0.35);
    if (sh.wall) { const [wx0, wx1] = sh.wall; W0.bc('concrete', (wx0 + wx1) / 2, 0, sh.z + sh.front * (sh.d / 2 - 0.8), wx1 - wx0, 1.9, 0.35, { off: [rr(0, 3), 0] }); }
  }
  // tocos de muro baixo no corredor entre os decks (linhas claras na top.jpg)
  for (const [x0, x1, z] of [[2.1, 3.8, -36.95], [-4.9, -3.4, 35.4]]) W0.bc('concrete', (x0 + x1) / 2, 0, z, x1 - x0, 1.5, 0.3);

  // ================================================================= TELHEIROS PEQUENOS (PEROLA)
  for (const sh of [{ x: -21.7, z: 6.7, w: 5.6, d: 3.9, ry: 0.98 }, { x: 20.8, z: -8.0, w: 5.0, d: 4.4, ry: -0.5 }]) {
    const F = new Frame(sh.x, 0, sh.z, sh.ry), Y = 2.3;
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) F.bc('wood', ex * (sh.w / 2 - 0.2), 0, ez * (sh.d / 2 - 0.2), 0.25, Y, 0.25);
    F.box('wood', 0, Y + 0.1, 0, sh.w, 0.08, sh.d, { rz: 0.03, swap: true });
    for (const s of [-1, 1]) { F.box('cream', 0, Y - 0.1, s * (sh.d / 2 - 0.2), sh.w + 0.2, 0.2, 0.15); F.box('cream', s * (sh.w / 2 - 0.2), Y - 0.1, 0, 0.15, 0.2, sh.d + 0.2); }
    for (const f of [-0.25, 0, 0.25]) F.box('cream', f * sh.w, Y, 0, 0.12, 0.1, sh.d);
    F.bc('wood', -sh.w / 2 + 0.1, 0, 0, 0.12, Y, sh.d - 0.3, { off: [0, rr(0, 1)] }); // parede de tábuas (WOOD)
    F.col(0, 0, sh.w, sh.d, Y, 0.25);
  }

  // ================================================================= MUROS DE CONCRETO INTERNOS + COBERTURAS BAIXAS
  for (const [x, z, w, h, d, ry] of [[-1.9, -10.9, 3.1, 2.2, 0.5, 1.571], [-0.4, 8.8, 3.1, 2.2, 0.5, 1.571], [10.3, -3.8, 3.6, 2.2, 0.5, 0], [-13.2, 0.5, 4.4, 2.2, 0.5, 0],
    [-19.2, -4.2, 3.0, 1.5, 0.3, 0], [19.0, 3.9, 2.8, 1.5, 0.3, 0]]) {
    const F = new Frame(x, 0, z, ry); F.bc('concrete', 0, 0, 0, w, h, d, { off: [rr(0, 3), rr(0, 1)] }); F.box('concrete', 0, h, 0, w + 0.12, 0.1, d + 0.12); F.blob(0, 0, w, d, 0, 0.8);
  }

  // ================================================================= CAIXOTES (instanciados)
  const crate = (F, x, y, z, w, h, d, o = {}) => { F.place('crate', x, y + h / 2, z, w, h, d, o); CAT = 'm_crate'; F.inst('crate', unitBox, x, y + h / 2, z, w, h, d, o); CAT = null; };
  {
    const F = new Frame(12.6, 0, 3.5, -1.126); // 4x2
    for (const cx of [-2.325, -0.775, 0.775, 2.325]) for (const cz of [-0.65, 0.65]) crate(F, cx, 0, cz, 1.53, 1.3, 1.28, { ry: rr(-0.03, 0.03) });
    F.col(0, 0, 6.2, 2.6, 0, 1.3); F.blob(0, 0, 6.2, 2.6);
  }
  for (const [x, z, ry] of [[-7.9, -10.7, 0], [5.8, 8.6, Math.PI]]) { // montes junto ao galpão
    const F = new Frame(x, 0, z, ry);
    for (const cx of [-1.95, 0, 1.95]) crate(F, cx, 0, 0.2, 1.9, 0.95, 1.0, { ry: rr(-0.05, 0.05) });
    crate(F, -0.95, 0.95, 0.15, 1.9, 0.95, 1.0, { ry: 0.08 });
    // BUG-0010: com rz 0.28 o canto de baixo desce 0.719 m abaixo do centro -> base y = 0.95 + 0.719 - 0.475 = 1.194 (era 1.05: entrava 0.14 m).
    // x 1.1 -> 1.2 para a face esquerda não raspar o caixote empilhado em -0.95 (borda ~x 0.04); canto apoia em x~0.42 no topo do caixote do meio.
    crate(F, 1.2, 1.2, 0.25, 1.9, 0.95, 1.0, { rz: 0.28, ry: -0.1 });
    F.col(0, 0.2, 5.8, 1.2, 0, 1.9); F.blob(0, 0.2, 5.8, 1.2);
  }
  { const F = new Frame(19.6, 0, 3.1, 0.1); crate(F, -0.68, 0, 0, 1.3, 1.2, 1.3); crate(F, 0.68, 0, 0.05, 1.3, 1.2, 1.3, { ry: 0.06 }); crate(F, 0.2, 1.2, 0, 1.3, 1.2, 1.3, { ry: -0.12 }); F.col(0, 0, 2.7, 1.5, 0, 2.4); F.blob(0, 0, 2.7, 1.4); }
  { const F = new Frame(-20.8, 0, -5.0, 0.1); crate(F, -0.6, 0, 0, 1.15, 1.3, 1.3); crate(F, 0.6, 0, 0.1, 1.15, 1.3, 1.3, { ry: 0.15 }); F.col(0, 0, 2.4, 1.6, 0, 1.3); F.blob(0, 0, 2.4, 1.3); }
  for (const [x, z, w, d, h, ry, n] of [[-20.3, 9.5, 2.3, 1.6, 1.3, -0.57, 1], [18.7, -10.2, 2.3, 1.6, 1.3, -0.57, 1], [13.3, 15.7, 2.9, 2.1, 0.8, -0.32, 2]]) {
    const F = new Frame(x, 0, z, ry);
    for (let i = 0; i < n; i++) F.inst('crateGrey', unitBox, 0, i * h + h / 2, 0, w, h, d);
    F.col(0, 0, w, d, 0, h * n); F.blob(0, 0, w, d);
  }
  // barris (dentro do galpão)
  for (const [x, z, y] of [[-8.0, -8.6, 0], [-7.35, -8.6, 0], [-8.0, -8.6, 0.9], [5.5, 6.8, 0], [6.1, 6.8, 0], [5.5, 6.8, 0.9], [6.1, 6.8, 0.9]]) { const ry = rr(0, 6); W0.place('barrel', x, y + 0.45, z, 0.6, 0.9, 0.6, { ry }); CAT = 'm_barrel'; W0.inst('barrel', barrelGeo, x, y + 0.45, z, 1, 1, 1, { ry }); CAT = null; }
  col(-7.7, -8.6, 1.4, 0.7, 0, 1.8); col(5.8, 6.8, 1.3, 0.7, 0, 1.8); W0.blob(-7.7, -8.6, 1.3, 0.6, 0, 0.5); W0.blob(5.8, 6.8, 1.2, 0.6, 0, 0.5);
  // BUG-0009: preenchimento interno barato (2 PointLight SEM sombra sob a cumeeira) — o telhado bloqueia o sol e o hemisphere
  for (const z of [-5.0, 3.0]) { const L = new T.PointLight(0xE8ECEE, 9, 16, 2); L.position.set(-0.85, 4.6, z); L.castShadow = false; L.name = 'fill_galpao'; group.add(L); }

  // ================================================================= MONTAGEM
  const noShadow = new Set(['fence', 'window', 'logo', 'blob']);
  let tris = 0, calls = 0, castCalls = 0;
  const ORDER = Object.keys(batches);
  const fallback = {}; // cat -> Group (procedural substituível)
  const holder = (key) => { const i = key.indexOf(':'); if (i < 0) return [group, key]; const cat = key.slice(0, i); if (!fallback[cat]) { fallback[cat] = new T.Group(); fallback[cat].name = 'fallback_' + cat; group.add(fallback[cat]); } return [fallback[cat], key.slice(i + 1)]; };
  for (const key of ORDER) {
    const B = batches[key], g = new T.BufferGeometry(), [par, mk] = holder(key);
    g.setAttribute('position', new T.Float32BufferAttribute(B.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(B.n, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(B.uv, 2));
    g.setIndex(B.count > 65535 ? new T.Uint32BufferAttribute(B.idx, 1) : new T.Uint16BufferAttribute(B.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const mesh = new T.Mesh(g, M[mk]); mesh.name = 'batch_' + key;
    mesh.castShadow = !noShadow.has(mk); mesh.receiveShadow = mk !== 'window';
    if (mk === 'logo') mesh.renderOrder = 2;
    par.add(mesh); disposables.push(g);
    tris += B.idx.length / 3; calls++; if (mesh.castShadow) castCalls++;
  }
  for (const key of Object.keys(inst)) {
    const [par, mk] = holder(key), I = inst[key], mesh = new T.InstancedMesh(I.geo, M[mk], I.mats.length);
    I.mats.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere?.(); mesh.name = 'inst_' + key; mesh.castShadow = mesh.receiveShadow = true;
    par.add(mesh); disposables.push(I.geo);
    tris += (I.geo.index ? I.geo.index.count : I.geo.attributes.position.count) / 3 * I.mats.length; calls++; castCalls++;
  }
  { const g = group.getObjectByName('ground').geometry; tris += g.index.count / 3; calls++; }


  // ================================================================= MODELOS SKETCHFAB (CC-BY, docs/creditos-modelos.md)
  // Cada GLB vira 1 InstancedMesh por submalha, escalado para a caixa alvo de cada ponto (PLACE). Se falhar, o fallback fica.
  const statsOut = { triangles: 0, drawCallsMain: 0, drawCallsShadow: 0, colliders: colliders.length, materials: Object.keys(M).length, models: {} };
  function computeStats() {
    let t = 0, c = 0, cs = 0;
    const walk = (o) => { if (!o.visible) return; if (o.isMesh) { const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; t += o.isInstancedMesh ? n * o.count : n; c++; if (o.castShadow) cs++; } o.children.forEach(walk); };
    walk(group); Object.assign(statsOut, { triangles: Math.round(t), drawCallsMain: c, drawCallsShadow: cs });
  }
  computeStats();
  const MODEL_DIR = modelsPath ?? basePath + 'models/';
  async function getLoader() {
    if (GLTFLoader) return new GLTFLoader();
    for (const p of ['three/addons/loaders/GLTFLoader.js', '/three/examples/jsm/loaders/GLTFLoader.js', '/three-addons/loaders/GLTFLoader.js']) { try { const mod = await import(/* @vite-ignore */ p); if (mod.GLTFLoader) return new mod.GLTFLoader(); } catch (e) { /* tenta o próximo */ } }
    return null;
  }
  // geometria em espaço de mundo do glTF (bake das transformações dos nós)
  function extract(gltf, pick) { gltf.scene.updateMatrixWorld(true); const parts = []; gltf.scene.traverse(o => { if (o.isMesh && (!pick || pick(o))) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); parts.push({ geo: g, mat: o.material }); } }); return parts; }
  // container 772f4be3 (BUG-0001): a folha de porta da ponta +x vem aberta ~140°. Em vez de escolher vértices por limiar de posição
  // (que partia as barras de trava ao meio), agrupa os triângulos em COMPONENTES CONEXOS (vértices soldados por posição) e decide
  // por componente, pelo centróide, se ele pertence à folha aberta (fora da lateral +z e na altura da ponta +x do corpo).
  // Cada componente da folha gira inteiro sobre a dobradiça (canto +x/+z do corpo); o ângulo vem da posição do painel da folha.
  // Depois confere o bbox: se algo da folha sobrar fora do AABB do corpo, apaga a folha (as portas procedurais não são usadas
  // no GLB, mas nada fica solto). Retorna { rotated, removed, bodyBox } para teste.
  function closeDoor(g) {
    const P = g.attributes.position, n = P.count, attrs = ['normal', 'tangent'].map(k => g.attributes[k]).filter(Boolean);
    const idx = g.index ? g.index.array : Uint32Array.from({ length: n }, (_, i) => i);
    const par = new Int32Array(n).map((_, i) => i), find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
    const seen = new Map(); for (let i = 0; i < n; i++) { const k = Math.round(P.getX(i) * 1e4) + ',' + Math.round(P.getY(i) * 1e4) + ',' + Math.round(P.getZ(i) * 1e4); if (seen.has(k)) uni(seen.get(k), i); else seen.set(k, i); }
    for (let t = 0; t < idx.length; t += 3) { uni(idx[t], idx[t + 1]); uni(idx[t], idx[t + 2]); }
    const comps = new Map();
    for (let i = 0; i < n; i++) { const r = find(i); let c = comps.get(r); if (!c) comps.set(r, c = { ids: [], sx: 0, sz: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }); c.ids.push(i); const x = P.getX(i), y = P.getY(i), z = P.getZ(i); c.sx += x; c.sz += z; c.min[0] = Math.min(c.min[0], x); c.min[1] = Math.min(c.min[1], y); c.min[2] = Math.min(c.min[2], z); c.max[0] = Math.max(c.max[0], x); c.max[1] = Math.max(c.max[1], y); c.max[2] = Math.max(c.max[2], z); }
    const list = [...comps.values()], body = list.reduce((a, c) => c.ids.length > a.ids.length ? c : a);
    const hx = body.max[0], hz = body.max[2]; // dobradiça: canto +x/+z do corpo (2,34 / 0,76 neste modelo)
    const isLeaf = (c) => c !== body && c.sx / c.ids.length > hx - 0.1 && c.sz / c.ids.length > hz + 0.02;
    const leaf = list.filter(isLeaf); if (!leaf.length) return { rotated: 0, removed: 0, bodyBox: body };
    const panel = leaf.reduce((a, c) => (c.max[0] - c.min[0]) + (c.max[2] - c.min[2]) > (a.max[0] - a.min[0]) + (a.max[2] - a.min[2]) ? c : a); // painel = maior componente em planta
    const D = -Math.PI / 2 - Math.atan2((panel.min[2] + panel.max[2]) / 2 - hz, (panel.min[0] + panel.max[0]) / 2 - hx); // leva a folha a apontar para -z (ao longo da ponta)
    const cs = Math.cos(D), sn = Math.sin(D);
    for (const c of leaf) for (const i of c.ids) {
      const dx = P.getX(i) - hx, dz = P.getZ(i) - hz; P.setX(i, hx + dx * cs - dz * sn); P.setZ(i, hz + dx * sn + dz * cs);
      for (const A of attrs) { const ax = A.getX(i), az = A.getZ(i); A.setX(i, ax * cs - az * sn); A.setZ(i, ax * sn + az * cs); }
    }
    P.needsUpdate = true;
    // conferência: nada da folha pode ficar fora do AABB do corpo (folga 0,2 m em x: as barras de trava salientes passam ~0,16 m da ponta; 0,15 m em z)
    const out = (c) => { let bad = false; for (const i of c.ids) { const x = P.getX(i), z = P.getZ(i); if (x > body.max[0] + 0.2 || z > body.max[2] + 0.15 || z < body.min[2] - 0.15) { bad = true; break; } } return bad; };
    const bad = leaf.filter(out); let removed = 0;
    if (bad.length) { // fallback: apaga a folha inteira (todas as componentes dela)
      const kill = new Uint8Array(n); leaf.forEach(c => c.ids.forEach(i => (kill[i] = 1)));
      const keep = []; for (let t = 0; t < idx.length; t += 3) if (!kill[idx[t]] && !kill[idx[t + 1]] && !kill[idx[t + 2]]) keep.push(idx[t], idx[t + 1], idx[t + 2]);
      removed = leaf.length; g.setIndex(keep);
    }
    return { rotated: leaf.length, removed, bodyBox: body };
  }
  // BUG-0003: o albedo do container tem o texto "COBARK LOGISTICS PTY LTD." + seta na lateral +z (faixa u .41-.57 / v .49-.81 da textura).
  // Nas variantes encurtadas o corte do miolo partiria o texto; então nelas o texto é apagado do albedo, cobrindo com um trecho
  // liso do painel gêmeo ao lado (u .197-.352), igual em cor/desgaste. A variante inteira (cont_full) mantém o texto.
  function cleanTextMaterial(src) {
    const m = src.clone(); m.name = (src.name || 'container') + '_clean';
    try {
      const img = src.map && src.map.image; if (!img) return m;
      const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
      const f = (a, k) => Math.round(a * k), sw = f(0.155, w), sh = f(0.32, h);
      x.drawImage(c, f(0.197, w), f(0.49, h), sw, sh, f(0.41, w), f(0.49, h), sw, sh);
      const t = new T.CanvasTexture(c); t.flipY = src.map.flipY; t.colorSpace = src.map.colorSpace; t.wrapS = src.map.wrapS; t.wrapT = src.map.wrapT; t.anisotropy = src.map.anisotropy; t.channel = src.map.channel;
      m.map = t; disposables.push(t, m);
    } catch (e) { /* sem canvas: mantém o material original */ }
    return m;
  }
  // encurta tirando o MIOLO (as metades colam no centro) em vez de escalar: o passo das nervuras não muda
  function cutMiddle(g, newLen) { const out = g.clone(); out.computeBoundingBox(); const bb = out.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cut = Math.max(0, ((bb.max.x - bb.min.x) - newLen) / 2), P = out.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i) - cx; P.setX(i, cx + Math.sign(x) * Math.max(0, Math.abs(x) - cut)); } P.needsUpdate = true; return out; }
  // centra todas as partes no cubo da caixa (centro do bbox na origem) e devolve a extensão
  function center(parts) { const bb = new T.Box3(); parts.forEach(p => { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); }); const c = bb.getCenter(new V3()), e = bb.getSize(new V3()); parts.forEach(p => { p.geo.translate(-c.x, -c.y, -c.z); p.geo.computeBoundingSphere(); }); return e; }
  function instantiate(cat, parts, ext, { shadow = true } = {}) {
    const pts = PLACE[cat]; if (!pts || !pts.length) return;
    const norm = new T.Matrix4().makeScale(1 / ext.x, 1 / ext.y, 1 / ext.z);
    for (const p of parts) {
      const im = new T.InstancedMesh(p.geo, p.mat, pts.length); im.name = 'glb_' + cat;
      pts.forEach((pt, i) => { im.setMatrixAt(i, pt.m.clone().multiply(norm)); if (pt.color) im.setColorAt(i, pt.color); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere(); im.castShadow = shadow; im.receiveShadow = true;
      group.add(im); disposables.push(p.geo);
    }
    if (fallback['m_' + cat]) fallback['m_' + cat].visible = false;
    statsOut.models[cat] = pts.length;
  }
  // média de luminância linear do albedo (para dessaturar/normalizar no shader do vagão)
  function meanLum(tex) { try { const img = tex.image, c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data; let s = 0; const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; for (let i = 0; i < d.length; i += 4) s += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); return Math.max(0.02, s / 256); } catch (e) { return 0.2; } }
  // vagão: albedo laranja -> corpo cinza-escuro #3A3D40 e teto prateado #B9BCBC (máscara pela normal do objeto)
  function boxcarMaterial(src) {
    const m = src.clone(); m.metalness = 0.1; m.roughness = 0.75; m.side = T.DoubleSide; const mean = m.map ? meanLum(m.map) : 0.2; // BUG-0007
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uBody = { value: new T.Color(0x6A6E72) }; sh.uniforms.uRoof = { value: new T.Color(0xB9BCBC) }; sh.uniforms.uMean = { value: mean };
      sh.vertexShader = 'varying float vUpN;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vUpN = objectNormal.y;');
      sh.fragmentShader = 'uniform vec3 uBody; uniform vec3 uRoof; uniform float uMean; varying float vUpN;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  { float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / uMean; float d = mix(0.82, 1.18, clamp(l * 0.5, 0.0, 1.0)); diffuseColor.rgb = d * mix(uBody, uRoof, step(0.7, vUpN)); } // BUG-0007 fix 2: tint chapado sobre o albedo dessaturado; o detalhe só varia ±18% (o albedo tem metade preta + painéis laranja)');
    };
    m.customProgramCacheKey = () => 'boxcar-recolor'; disposables.push(m); return m;
  }
  async function loadModels() {
    const loader = await getLoader(); if (!loader) { statsOut.modelsError = 'GLTFLoader indisponível'; return; }
    const get = (f) => loader.loadAsync(MODEL_DIR + f);
    const jobs = {
      'container.glb': (g) => {
        const parts = extract(g); parts.forEach(p => { const r = closeDoor(p.geo); statsOut.models.containerDoor = r.removed ? 'folha removida (fora do AABB)' : r.rotated + ' componentes girados'; });
        for (const [cat, len] of [['cont_full', 0], ['cont_mid', 4.7], ['cont_short', 3.4]]) {
          if (!PLACE[cat]) continue;
          const ps = parts.map(p => ({ geo: len ? cutMiddle(p.geo, len) : p.geo.clone(), mat: len ? cleanTextMaterial(p.mat) : p.mat })); instantiate(cat, ps, center(ps));
        }
      },
      'crate.glb': (g) => { const ps = extract(g, o => /box1/.test(o.name)); const use = ps.length ? ps : extract(g).slice(0, 1); instantiate('crate', use, center(use)); },
      'barrel.glb': (g) => { const ps = extract(g).slice(0, 1); instantiate('barrel', ps, center(ps)); },
      'pallet.glb': (g) => { const ps = extract(g); instantiate('pallet', ps, center(ps), { shadow: false }); },
      'logs.glb': (g) => { const ps = extract(g); instantiate('logs', ps, center(ps)); },
      'boxcar.glb': (g) => { const ps = extract(g); ps.forEach(p => { p.geo.rotateY(Math.PI / 2); p.mat = boxcarMaterial(p.mat); }); instantiate('boxcar', ps, center(ps)); },
    };
    await Promise.all(Object.entries(jobs).map(([f, fn]) => get(f).then(fn).catch(e => { statsOut.models[f] = 'falhou: ' + (e?.message || e); })));
    computeStats();
  }
  if (hasDOM && models) pending.push(loadModels());

  const spawns = [
    { id: 'spawn_N', team: 'A', x: 2.0, z: -34.0, yaw: Math.PI, points: [[-1.0, -34.5], [2.0, -33.0], [5.0, -34.5], [2.0, -36.0]] },
    { id: 'spawn_S', team: 'B', x: -3.0, z: 32.0, yaw: 0, points: [[-6.0, 33.0], [-3.0, 32.0], [0.0, 33.0], [-3.0, 35.0]] },
  ];
  const ready = Promise.all(pending).then(() => true);
  return {
    group, colliders, spawns, ready, materials: M,
    bounds: { xMin: -25.83, xMax: 24.95, zMin: -44.17, zMax: 42.1, killY: -3 },
    _glbTools: { closeDoor, cutMiddle }, // só para testes
    stats: statsOut, // atualizado após o carregamento dos GLBs (em ready)
    modelPlan: Object.fromEntries(Object.entries(PLACE).map(([k, v]) => [k, v.length])), // instâncias de GLB previstas por categoria
    dispose() { group.removeFromParent(); for (const d of disposables) d.dispose?.(); colliders.length = 0; },
  };
}
