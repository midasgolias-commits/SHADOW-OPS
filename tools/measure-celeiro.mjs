// tools/measure-celeiro.mjs — auditoria somente-leitura dos assets do mapa CELEIRO.
// Uso: node tools/measure-celeiro.mjs [--json]
// Não escreve em assets/. Mede GLBs (malhas, tris, materiais, texturas embutidas)
// e JPGs (dimensões, bytes).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../assets/maps/celeiro/', import.meta.url));
const MODELS = join(ROOT, 'models');
const TEX = join(ROOT, 'textures');

const fmt = (n) => n.toLocaleString('pt-BR');
const mb = (b) => (b / 1048576).toFixed(2);

// ---------- JPEG ----------
function jpegInfo(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xd9) break;
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15 exceto DHT(C4), JPG(C8), DAC(CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), components: buf[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}

// ---------- GLB ----------
function parseGLB(buf) {
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error('não é GLB');
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  let off = 12, json = null, binLen = 0, chunkCount = 0;
  const chunks = [];
  while (off < total && off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    chunks.push({ type: type === 0x4e4f534a ? 'JSON' : type === 0x004e4942 ? 'BIN' : '0x' + type.toString(16), len });
    if (type === 0x4e4f534a) json = JSON.parse(buf.slice(off + 8, off + 8 + len).toString('utf8'));
    if (type === 0x004e4942) binLen = len;
    off += 8 + len; chunkCount++;
  }
  return { version, total, json, binLen, chunks, chunkCount };
}

const compSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const typeCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function glbStats(file) {
  const buf = readFileSync(file);
  const { version, json: g, binLen, chunks } = parseGLB(buf);
  const acc = g.accessors || [];
  let tris = 0, prims = 0, verts = 0;
  const triByMesh = [];
  for (const m of g.meshes || []) {
    let mt = 0;
    for (const p of m.primitives || []) {
      prims++;
      const pos = acc[p.attributes.POSITION];
      if (pos) verts += pos.count;
      if (p.indices != null) mt += acc[p.indices].count / 3;
      else if (pos) mt += pos.count / 3;
    }
    triByMesh.push({ name: m.name || '(sem nome)', tris: Math.round(mt), prims: (m.primitives || []).length });
    tris += mt;
  }
  const images = (g.images || []).map((im) => {
    let w = null, h = null, bytes = null, embedded = im.bufferView != null;
    if (embedded) {
      const bv = g.bufferViews[im.bufferView];
      bytes = bv.byteLength;
      if ((im.mimeType || '').includes('jpeg')) {
        const slice = buf.slice(20 + bv.byteOffset + (g.buffers?.[0]?.byteLength ? 0 : 0), 0); // placeholder
      }
    }
    return { name: im.name || im.uri || '(embutida)', mimeType: im.mimeType || null, embedded, bytes, bufferView: im.bufferView ?? null, uri: im.uri ?? null };
  });
  // localizar BIN chunk para ler dimensões das imagens embutidas
  let binStart = -1;
  let o = 12;
  while (o < buf.length) {
    const len = buf.readUInt32LE(o), type = buf.readUInt32LE(o + 4);
    if (type === 0x004e4942) { binStart = o + 8; break; }
    o += 8 + len;
  }
  if (binStart >= 0) {
    for (const im of images) {
      if (im.bufferView == null) continue;
      const bv = g.bufferViews[im.bufferView];
      const start = binStart + (bv.byteOffset || 0);
      const len = Math.min(bv.byteLength, 4096);
      const head = buf.slice(start, start + Math.min(len, buf.length - start));
      const info = jpegInfo(head);
      if (info) { im.w = info.w; im.h = info.h; }
      else if ((im.mimeType || '').includes('png') && head.slice(1, 4).toString() === 'PNG') {
        im.w = head.readUInt32BE(16); im.h = head.readUInt32BE(20);
      } else if (head.slice(0, 4).toString() === 'RIFF' && head.slice(8, 12).toString() === 'WEBP') {
        const fmt = head.slice(12, 16).toString();
        if (fmt === 'VP8X') { im.w = 1 + head.readUIntLE(24, 3); im.h = 1 + head.readUIntLE(27, 3); im.fmt = 'VP8X'; }
        else if (fmt === 'VP8 ') { im.w = head.readUInt16LE(26) & 0x3fff; im.h = head.readUInt16LE(28) & 0x3fff; im.fmt = 'VP8'; }
        else if (fmt === 'VP8L') {
          const b = head.readUInt32LE(21);
          im.w = (b & 0x3fff) + 1; im.h = ((b >> 14) & 0x3fff) + 1; im.fmt = 'VP8L';
        }
      }
    }
  }
  const texToImg = (g.textures || []).map((t) => t.source).filter((s) => s != null);
  const usedImages = new Set(texToImg);
  const matNames = (g.materials || []).map((m) => m.name || '(sem nome)');
  const ext = g.extensionsUsed || [];
  const totTriRounded = Math.round(tris);
  return {
    file: basename(file), bytes: buf.length, version, binLen,
    meshes: (g.meshes || []).length, prims, tri: totTriRounded, verts,
    nodes: (g.nodes || []).length, materials: matNames, materialCount: matNames.length,
    images, usedImages: usedImages.size, textures: (g.textures || []).length,
    ext, triByMesh,
    chunks,
    lights: (g.extensions?.KHR_lights_punctual?.lights || []).length,
    animations: (g.animations || []).length,
    skins: (g.skins || []).length,
    embeddedBytes: images.reduce((a, i) => a + (i.bytes || 0), 0),
  };
}

const out = { models: [], textures: [], totals: {} };

for (const f of readdirSync(MODELS).filter((f) => extname(f).toLowerCase() === '.glb').sort()) {
  out.models.push(glbStats(join(MODELS, f)));
}

for (const d of readdirSync(TEX).filter((d) => statSync(join(TEX, d)).isDirectory()).sort()) {
  const files = readdirSync(join(TEX, d)).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  const entry = { folder: d, bytes: 0, files: [] };
  for (const f of files) {
    const p = join(TEX, d, f);
    const b = statSync(p).size;
    const info = jpegInfo(readFileSync(p));
    entry.files.push({ file: f, bytes: b, w: info?.w ?? null, h: info?.h ?? null });
    entry.bytes += b;
  }
  out.textures.push(entry);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('\n=== GLBs ===');
  console.log('arquivo          MB     tris   verts  malhas prims mats chars  imagens embutidas  ext');
  for (const m of out.models) {
    const embedded = m.images.filter((i) => i.embedded);
    console.log(
      `${m.file.padEnd(16)} ${mb(m.bytes).padStart(6)} ${fmt(m.tri).padStart(7)} ${fmt(m.verts).padStart(7)} ${String(m.meshes).padStart(6)} ${String(m.prims).padStart(5)} ${String(m.materialCount).padStart(4)} ${String(m.chunks.length).padStart(5)}  ${String(embedded.length).padStart(3)}/${String(m.images.length).padEnd(3)} ${fmt(m.embeddedBytes).padStart(9)}  ${m.ext.join(',') || '-'}`
    );
    for (const im of m.images) console.log(`    img ${im.name} ${im.mimeType || ''} ${im.w || '?'}x${im.h || '?'} ${im.bytes ? mb(im.bytes) + 'MB' : ''}`);
    for (const mm of m.materials) console.log(`    mat ${mm}`);
  }
  console.log('\n=== TEXTURAS (pastas) ===');
  for (const t of out.textures) {
    console.log(`\n${t.folder}  ${mb(t.bytes)} MB`);
    for (const f of t.files) console.log(`   ${f.file.padEnd(12)} ${String(f.bytes).padStart(8)} B  ${f.w}x${f.h}`);
  }
  const tm = out.models.reduce((a, m) => a + m.bytes, 0);
  const tt = out.textures.reduce((a, t) => a + t.bytes, 0);
  console.log(`\nTOTAL modelos: ${mb(tm)} MB | TOTAL texturas: ${mb(tt)} MB | GERAL: ${mb(tm + tt)} MB`);
}
