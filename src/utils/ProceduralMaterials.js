import * as THREE from 'three';

const cache = new Map();

function tex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(g, s, n) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = (Math.random() > .5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (Math.random() * .14) + ')';
    const r = Math.random() * 3 + .5; g.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
}
function stains(g, s, n) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 20 + Math.random() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

const container = hex => () => new THREE.MeshStandardMaterial({ roughness: .55, metalness: .6, map: tex(256, (g, s) => {
  g.fillStyle = hex; g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 16) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, 0, 5, s); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 5, 0, 3, s); }
  stains(g, s, 6); speckle(g, s, 3000);
}) });

const recipes = {
  containerRed: container('#8a2f22'), containerBlue: container('#2b4f7a'), containerGreen: container('#3f6240'),
  concrete: () => new THREE.MeshStandardMaterial({ roughness: .95, map: tex(256, (g, s) => {
    g.fillStyle = '#74777a'; g.fillRect(0, 0, s, s); stains(g, s, 8); speckle(g, s, 7000);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath();
    let x = Math.random() * s, y = 0; g.moveTo(x, y);
    while (y < s) { x += (Math.random() - .5) * 18; y += 8 + Math.random() * 10; g.lineTo(x, y); }
    g.stroke();
  }) }),
  asphalt: () => new THREE.MeshStandardMaterial({ roughness: 1, map: tex(256, (g, s) => {
    g.fillStyle = '#3d3f42'; g.fillRect(0, 0, s, s); stains(g, s, 10); speckle(g, s, 12000);
  }) }),
  metal: () => new THREE.MeshStandardMaterial({ roughness: .45, metalness: .75, map: tex(256, (g, s) => {
    g.fillStyle = '#4b535a'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y++) { g.fillStyle = `rgba(${Math.random() > .5 ? '255,255,255' : '0,0,0'},${Math.random() * .08})`; g.fillRect(0, y, s, 1); }
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (const [x, y] of [[10, 10], [s - 10, 10], [10, s - 10], [s - 10, s - 10]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; g.strokeRect(2, 2, s - 4, s - 4);
    stains(g, s, 4);
  }) }),
  crate: () => new THREE.MeshStandardMaterial({ roughness: .85, map: tex(256, (g, s) => {
    g.fillStyle = '#7b5c38'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      const y = i * s / 4; g.fillStyle = `hsl(32,${30 + Math.random() * 12}%,${30 + Math.random() * 8}%)`; g.fillRect(0, y + 2, s, s / 4 - 4);
      for (let k = 0; k < 30; k++) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(Math.random() * s, y + Math.random() * s / 4, 20 + Math.random() * 50, 1); }
    }
    g.strokeStyle = '#2d2418'; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8);
    g.beginPath(); g.moveTo(8, 8); g.lineTo(s - 8, s - 8); g.stroke();
    speckle(g, s, 2500);
  }) }),
  paintedMetal: () => new THREE.MeshStandardMaterial({ roughness: .6, metalness: .5, map: tex(256, (g, s) => {
    g.fillStyle = '#4f5a3f'; g.fillRect(0, 0, s, s); speckle(g, s, 6000); stains(g, s, 6);
    g.fillStyle = '#d6c96a'; g.fillRect(0, s - 28, s, 12);
  }) })
};

export const PM = {
  get(name) {
    if (!cache.has(name)) cache.set(name, recipes[name]());
    return cache.get(name);
  },
  /** Placa com letra (sinalização dos bombsites). */
  label(text, bg = '#c9b458', fg = '#101417') {
    const key = 'label:' + text + bg;
    if (!cache.has(key)) cache.set(key, new THREE.MeshBasicMaterial({ map: tex(256, (g, s) => {
      g.fillStyle = bg; g.fillRect(0, 0, s, s); g.fillStyle = fg; g.fillRect(10, 10, s - 20, 12); g.fillRect(10, s - 22, s - 20, 12);
      g.font = 'bold 190px Impact,"Arial Narrow",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, s / 2, s / 2 + 6);
    }) }));
    return cache.get(key);
  },
  /** Marcação de piso do bombsite: borda de zebra e letra translúcida. */
  siteMark(letter) {
    const key = 'mark:' + letter;
    if (!cache.has(key)) {
      const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, map: tex(256, (g, s) => {
        g.clearRect(0, 0, s, s); g.strokeStyle = 'rgba(230,190,40,.75)'; g.lineWidth = 10; g.setLineDash([26, 18]); g.strokeRect(10, 10, s - 20, s - 20);
        g.setLineDash([]); g.fillStyle = 'rgba(230,190,40,.28)'; g.font = 'bold 190px Impact,"Arial Narrow",sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, s / 2, s / 2 + 8);
      }) });
      m.map.wrapS = m.map.wrapT = THREE.ClampToEdgeWrapping; cache.set(key, m);
    }
    return cache.get(key);
  },
  disposeAll() {
    for (const m of cache.values()) { m.map?.dispose(); m.dispose(); }
    cache.clear();
  },
  /** Ajusta os UVs de uma BoxGeometry para tile de ~2 m, evitando texturas esticadas. */
  scaleBoxUV(geo, w, h, d, tile = 2) {
    const uv = geo.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
    }
    uv.needsUpdate = true;
  }
};
