// Baixa texturas CC0 (Poly Haven + ambientCG) para textures/<pasta>/{color,normal,rough}.jpg
// Uso: node textures/download.mjs   (Node 18+; Windows 10+ tem `tar`)
// Nao executa nada baixado: so grava JPGs. ZIPs do ambientCG sao extraidos com tar e apagados.
import { mkdirSync, writeFileSync, rmSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

// [pasta, fonte, id, resolucao]
const LIST = [
  ['concrete_wall', 'ph', 'concrete_wall_004', '1k'],
  ['concrete_floor', 'acg', 'Concrete034', '1K'],
  ['roof', 'ph', 'rusty_corrugated_iron', '2k'],
  ['container', 'ph', 'corrugated_iron_02', '1k'],
  ['train_metal', 'ph', 'rusty_metal_02', '1k'],
  ['painted_metal', 'ph', 'rusty_painted_metal', '1k'],
  ['wood_planks', 'ph', 'plank_flooring', '1k'],
  ['wood_crate', 'acg', 'Planks001', '1K'],
  ['bark', 'acg', 'Bark001', '1K'],
  ['sand', 'ph', 'coast_sand_01', '2k'],
];

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'texture-fetch/1.0' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}

async function ph(dir, id, res) {
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  const pick = (k) => files[k]?.[res]?.jpg?.url;
  const map = { 'color.jpg': pick('Diffuse'), 'normal.jpg': pick('nor_gl'), 'rough.jpg': pick('Rough') };
  for (const [name, url] of Object.entries(map)) {
    if (!url) { console.warn(`  falta ${name} em ${id}`); continue; }
    writeFileSync(join(dir, name), Buffer.from(await (await get(url)).arrayBuffer()));
    console.log('  ', name, url);
  }
}

async function acg(dir, id, res) {
  const url = `https://ambientcg.com/get?file=${id}_${res}-JPG.zip`;
  const tmp = join(dir, '_zip');
  mkdirSync(tmp, { recursive: true });
  const zip = join(tmp, 'a.zip');
  writeFileSync(zip, Buffer.from(await (await get(url)).arrayBuffer()));
  execFileSync(process.platform==='win32'?'C:/Windows/System32/tar.exe':'tar', ['-xf', zip, '-C', tmp]);
  const base = `${id}_${res}-JPG`;
  const map = { 'color.jpg': `${base}_Color.jpg`, 'normal.jpg': `${base}_NormalGL.jpg`, 'rough.jpg': `${base}_Roughness.jpg` };
  for (const [name, src] of Object.entries(map)) {
    if (existsSync(join(tmp, src))) { copyFileSync(join(tmp, src), join(dir, name)); console.log('  ', name, url); }
    else console.warn(`  falta ${src}`, readdirSync(tmp));
  }
  rmSync(tmp, { recursive: true, force: true });
}

for (const [folder, src, id, res] of LIST) {
  const dir = join(ROOT, folder);
  mkdirSync(dir, { recursive: true });
  console.log(folder, id);
  if (existsSync(join(dir, 'color.jpg'))) { console.log('  ja existe, pulando'); continue; }
  try { await (src === 'ph' ? ph(dir, id, res) : acg(dir, id, res)); }
  catch (e) { console.warn('  FALHOU:', e.message); }
}
