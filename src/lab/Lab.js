import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Assets } from '../core/Assets.js';
import { CharacterAnimator, upperOnly, OVER, forceMixerWrite } from '../player/CharacterAnimator.js';
import { BOB_KNIFE } from '../player/FirstPersonView.js';
import { initVmLab } from './VmLab.js';
import { KNIFE_SLASH, applyKnifeSlash, leftDuringSlash } from '../player/KnifeSlash.js';
import { HeldWeapon, defaultLeftHand, leftHandOf, fpUsesIK, ensureWeaponEnv } from '../weapons/WeaponModels.js';
import { WEAPONS, ORDER } from '../weapons/Weapons.js';
import { SCENES, grips, setGrips, saveGrips, gripFor, leftHandFor, fpFor, PRESETS_URL, GRIPS_URL, GRIP_BASE } from '../weapons/Grips.js';
import { ANIMS } from '../core/AnimTable.js';
import { vfov } from '../core/Fov.js';
import { ArmsOnly } from '../player/ArmsOnly.js';
import { renderFirstPerson } from '../player/Viewmodel.js';

/**
 * Lab de Armas: ajusta a arma na mão da Izzy e do bot, cena por cena (parado, andando, atirando...).
 * O ajuste é um deslocamento + giro em cima da posição automática; o jogo lê o arquivo salvo (Grips.js).
 */
const $ = id => document.getElementById(id);
const err = $('err'), report = m => { err.textContent = 'Erro: ' + m; err.classList.remove('hidden'); };
addEventListener('error', e => report(e.message));
addEventListener('unhandledrejection', e => report(String(e.reason)));

const DEG = 180 / Math.PI;
const st = { fpEdit: 'gun', kind: 'izzy', wid: 'rifle', scene: 'all', tool: 'translate', playing: true, speed: 1, ik: false, view: 'game', dirty: false };
let draft = { version: 1, chars: {} };
let savedSnap = null;   // cópia do que está gravado no arquivo (para marcar "salvo ✓" / "não salvo" em cada cena)
const undo = []; let lastUndoKey = '', lastUndoT = 0;

/* ---------- cena 3D ---------- */
const host = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); host.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a3238);
scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x4a4540, 1.6));
const sun = new THREE.DirectionalLight(0xfff1d6, 1.8); sun.position.set(3, 6, 2); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 }); scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x3a4248, roughness: .9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(8, 16, 0x56636b, 0x3e4950); grid.position.y = .002; scene.add(grid);
const camera = new THREE.PerspectiveCamera(50, 1, .02, 100);
const orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true; orbit.dampingFactor = .15;
const gizmo = new TransformControls(camera, renderer.domElement); gizmo.setSpace('local'); gizmo.setSize(.75); scene.add(gizmo);
// marcador do ponto onde a mão esquerda segura
const lhMark = new THREE.Mesh(new THREE.SphereGeometry(.018, 14, 8), new THREE.MeshBasicMaterial({ color: 0x5fd0ff, depthTest: false }));
lhMark.renderOrder = 10; scene.add(lhMark);

function resize() {
  const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); if (st.view === 'game' || st.view === 'aim') setView(st.view);
}
addEventListener('resize', resize);

/* ---------- personagem ---------- */
const assets = new Assets();
const eye = new THREE.Vector3(0, 1.62, -.05), eyeNow = new THREE.Vector3(); let char_head = null, fpYaw = 0;
let char = null, held = null, mixer = null, base = null, over = null, overCache = {};

function makeChar() {
  if (char) { gizmo.detach(); scene.remove(char); held.dispose(); mixer.stopAllAction(); mixer.uncacheRoot(char); }
  const { obj, clips } = assets.instance(st.kind);
  obj.scale.setScalar(.01); obj.rotation.y = Math.PI;   // de costas para a câmera, como no jogo
  scene.add(obj); char = obj; char.userData.clips = clips;
  char.userData.arms?.dispose(); char.userData.arms = new ArmsOnly(obj);   // 1ª pessoa: só braços e mãos
  held = new HeldWeapon(obj, assets.weapons, st.kind); held.attachTo(scene); held.set(st.wid);
  // mede a pegada (igual ao jogo) e o ponto dos olhos na pose de mira (âncora fixa da câmera da 1ª pessoa)
  let head = null; obj.traverse(n => { if (n.isBone && /Head$/.test(n.name)) head = n; }); char_head = head;
  const ca = new CharacterAnimator(obj, clips);
  ca.withPose('fire', () => { held.calibrate(); if (head) { head.getWorldPosition(eye); eye.y += .07; eye.z -= .09; } }); ca.dispose();
  mixer = new THREE.AnimationMixer(obj); overCache = {}; base = over = null;
  playScene();
}
// na visão 1ª pessoa só aparecem as 4 cenas dela (andar, correr, atirar, recarregar); nas outras visões, as cenas da 3ª pessoa
const BLADE_ID = id => id === 'knife' || id === 'karambit';   // armas brancas usam as cenas da faca
const sceneList = () => st.view === 'fp' ? SCENES[BLADE_ID(st.wid) ? 'fpKnife' : 'fpGun'] : SCENES[BLADE_ID(st.wid) ? 'knife' : 'gun'];
const sceneDef = () => sceneList().find(s => s.id === st.scene) || sceneList()[0];
// golpe das facas: é a pose de "andando" com o golpe por cima (igual ao jogo) — mexer nesta cena mexe na pose de "andando"
const dataScene = () => (st.view === 'fp' && sceneDef().slash ? 'fp_walk' : st.scene);

/** Toca a animação da cena: corpo inteiro + (se houver) animação de tronco por cima, com o mesmo peso do jogo. */
function playScene() {
  const sc = sceneDef(), clips = char.userData.clips;
  // pistola: as cenas usam as animações próprias dela (igual ao jogo)
  const PIS = { idle: 'pistol_idle', walk_f: 'pistol_walk_f', run_f: 'pistol_run_f', jump: 'pistol_jump', crouch_idle: 'pistol_crouch' };
  const clipName = st.wid === 'pistol' && clips[PIS[sc.clip]] ? PIS[sc.clip] : sc.clip;
  mixer.stopAllAction(); base = over = null;
  if (clips[clipName]) { base = mixer.clipAction(clips[clipName]); base.play(); if (sc.still) { base.time = 0; base.timeScale = 0; } }   // faca: pose inicial parada (o jogo não toca a corrida)
  if (sc.over && clips[sc.over]) {
    overCache[sc.over] ??= upperOnly(clips[sc.over]);
    over = mixer.clipAction(overCache[sc.over]); over.setEffectiveWeight(OVER); over.play();
    if (sc.hold) { over.time = over.getClip().duration * .999; over.timeScale = 0; }   // segura a pose de mira (igual ao jogo), só as pernas andam
  }
  mixer.update(0);
  $('animName').textContent = ANIMS[sc.over || clipName] || '';
}
let shotT = .3, shotN = 0;
const mainAction = () => (over && !sceneDef().hold ? over : base);

/* ---------- dados (rascunho até salvar) ---------- */
function wEntry(create) {
  let e = draft.chars[st.kind]?.[st.wid];
  if (!e && create) {
    const base = GRIP_BASE[st.wid];   // ex.: AUG começa com o ajuste da VX-47 (inclusive a câmera da arma)
    const src = (st.kind !== 'izzy' ? draft.chars.izzy?.[st.wid] : null) || (base ? draft.chars[st.kind]?.[base] || draft.chars.izzy?.[base] : null);
    if (base && draft.fpW?.[st.kind]?.[base] && !draft.fpW[st.kind][st.wid]) draft.fpW[st.kind][st.wid] = structuredClone(draft.fpW[st.kind][base]);
    const inherit = base && src && !draft.chars.izzy?.[st.wid];
    e = (draft.chars[st.kind] ??= {})[st.wid] = src ? structuredClone(src) : { scenes: {} };
    if (inherit) { delete e.lh; for (const sc of Object.values(e.scenes || {})) delete sc.lh; }   // mão esquerda: a da própria arma
  }
  if (e) e.scenes ??= {};
  return e;
}
const ZERO_G = { p: [0, 0, 0], r: [0, 0, 0] };
const effective = () => editingPreset() ? ((preset().scenes?.[st.scene]?.p && preset().scenes[st.scene]) || preset().scenes?.fp_walk || ZERO_G) : gripFor(st.kind, st.wid, dataScene());
function editScene() {
  const eff = structuredClone(effective()), s = sceneEntry();
  if (!s.p) { s.p = [...eff.p]; s.r = [...eff.r]; if (editingPreset() && eff.lh && !s.lh) s.lh = { ...eff.lh }; }   // ganha pegada própria (cópia da que está valendo)
  return s;
}
/** Entrada da cena (cria vazia se não existir) — usada para guardar só a câmera sem copiar a pegada. */
function sceneEntry() {
  if (editingPreset()) { const P = preset(); P.scenes ??= {}; return P.scenes[dataScene()] ??= {}; }
  return wEntry(true).scenes[dataScene()] ??= {};
}
const effectiveLH = () => (st.preview && st.view === 'fp' && preset()?.scenes?.fp_walk?.lh) || leftHandOf(st.kind, st.wid, st.scene);
function editLH() {
  const eff = { ...effectiveLH() };
  if (editingPreset()) { const P = preset(); P.scenes ??= {}; return (P.scenes.fp_walk ??= { p: [0, 0, 0], r: [0, 0, 0] }).lh ??= eff; }
  if (st.scene.startsWith('fp_')) {   // 1ª pessoa: ponto próprio da mão esquerda (não mexe na 3ª pessoa)
    const g = structuredClone(gripFor(st.kind, st.wid, 'fp_walk')), e = wEntry(true);
    return (e.scenes.fp_walk ??= { p: [...g.p], r: [...g.r] }).lh ??= eff;
  }
  const e = wEntry(true); return e.lh ??= eff;
}

function pushUndo(key) {
  const now = performance.now();
  if (key && key === lastUndoKey && now - lastUndoT < 800) { lastUndoT = now; return; }   // arrastar um controle = 1 passo só
  undo.push(JSON.stringify({ chars: draft.chars, fp: draft.fp || {}, fpW: draft.fpW || {}, backup: draft.backup || {}, presets: PRESETS })); if (undo.length > 100) undo.shift(); lastUndoKey = key; lastUndoT = now;
}
function doUndo() { if (!undo.length) return; { const u = JSON.parse(undo.pop()); draft.chars = u.chars; draft.fp = u.fp; draft.fpW = u.fpW; draft.backup = u.backup; if (u.presets) for (const k of Object.keys(PRESETS)) delete PRESETS[k], Object.assign(PRESETS, u.presets); } lastUndoKey = ''; changed(); }
/** Editando o ajuste do Claude? (prévia ligada na 1ª pessoa): as setas, anéis e números mexem nele, não no seu. */
const editingPreset = () => st.preview && st.view === 'fp' && !!preset();
function markDirty() { if (editingPreset()) st.presetDirty = true; else st.dirty = true; }
function changed() { markDirty(); refresh(); }
// mão esquerda livre (faca/karambit na 1ª pessoa): guardada na cena "andando" da 1ª pessoa (vale para todas as cenas da faca)
const LF_KEYS = ['f', 'h', 's', 'rx', 'ry', 'rz'], LF_DEF = { f: 35, h: 135, s: 15, rx: 0, ry: 0, rz: 0 };
function lfEntry() { const g = structuredClone(gripFor(st.kind, st.wid, 'fp_walk')), e = wEntry(true); const s = e.scenes.fp_walk ??= { p: [...g.p], r: [...g.r] }; return s.lhFree ??= { on: true, ...LF_DEF }; }
$('lfOn').onchange = e => { pushUndo('lf'); lfEntry().on = e.target.checked; changed(); };
for (const k of LF_KEYS) { const set = v => { pushUndo('lf_' + k); const F = lfEntry(); F[k] = +v || 0; F.on = true; changed(); }; $('lf_' + k).oninput = e => set(e.target.value); $('lf_' + k + 'N').onchange = e => set(e.target.value); }
// fechar a mão direita (dedos em volta do cabo): guardado na cena atual junto com a pegada
const setCurl = v => { pushUndo('curl'); const e = sceneEntry(); if (!e.p) { const g = gripFor(st.kind, st.wid, dataScene()); e.p = [...g.p]; e.r = [...g.r]; } e.curl = Math.max(0, Math.min(1, +v || 0)); changed(); };
$('curl').oninput = e => setCurl(e.target.value); $('curlN').onchange = e => setCurl(e.target.value);
// girar o punho (mão direita) em 3 eixos, em graus; guardado na cena atual
const setWrist = (i, v) => { pushUndo('wrist'); const e = sceneEntry(); if (!e.p) { const g = gripFor(st.kind, st.wid, dataScene()); e.p = [...g.p]; e.r = [...g.r]; }
  const w = e.wrist ? [...e.wrist] : [...(gripFor(st.kind, st.wid, dataScene()).wrist || [0, 0, 0])]; w[i] = Math.max(-180, Math.min(180, +v || 0)); e.wrist = w; changed(); };
for (let i = 0; i < 3; i++) { $('wr' + i).oninput = e => setWrist(i, e.target.value); $('wr' + i + 'N').onchange = e => setWrist(i, e.target.value); }

/* ---------- painel ---------- */
const POS = [['Lado', 'X'], ['Altura', 'Y'], ['Frente', 'Z']], ROT = [['Inclinar', 'X'], ['Virar', 'Y'], ['Rolar', 'Z']];
function valRow(id, label, min, max, step, unit) {
  return `<div class="val"><span>${label}</span><input type="range" id="${id}_r" min="${min}" max="${max}" step="${step}"><input type="number" id="${id}_n" step="${step}" title="${unit}"></div>`;
}
$('vals').innerHTML = POS.map((a, i) => valRow('p' + i, `${a[0]} (cm)`, -25, 25, .1, 'cm')).join('') + ROT.map((a, i) => valRow('r' + i, `${a[0]} (°)`, -180, 180, .5, 'graus')).join('');
$('lhVals').innerHTML = [['f', 'Frente (cm)', 0, 70], ['d', 'Baixo (cm)', -15, 15], ['s', 'Lado (cm)', -15, 15]].map(([k, l, a, b]) => valRow('lh' + k, l, a, b, .1, 'cm')).join('')
  + [['rx', 'Girar mão ↕ (°)'], ['ry', 'Girar mão ↔ (°)'], ['rz', 'Rolar mão (°)']].map(([k, l]) => valRow('lh' + k, l, -180, 180, 1, 'graus')).join('');
$('weapons').innerHTML = ORDER.map(id => `<button data-w="${id}">${WEAPONS[id].name}</button>`).join('');

const bindVal = (id, get, set) => {
  const r = $(id + '_r'), n = $(id + '_n');
  const apply = v => { if (!Number.isFinite(v)) return; pushUndo(id); set(v); changed(); };
  r.addEventListener('input', () => apply(+r.value)); n.addEventListener('change', () => apply(+n.value));
  n.addEventListener('keydown', e => e.stopPropagation());
  return () => { const v = get(); r.value = v; if (document.activeElement !== n) n.value = +v.toFixed(2); };
};
const readers = [];
for (let i = 0; i < 3; i++) {
  readers.push(bindVal('p' + i, () => effective().p[i] * 100, v => { editScene().p[i] = v / 100; }));
  readers.push(bindVal('r' + i, () => effective().r[i], v => { editScene().r[i] = v; }));
}
const FPV = [['x', 'Câmera lado (cm)', -30, 30, .5], ['y', 'Câmera altura (cm)', -30, 30, .5], ['z', 'Câmera frente/trás (cm)', -60, 40, .5],
  ['fov', 'Zoom: campo de visão (°)', 30, 100, 1], ['rx', 'Câmera inclinar (°)', -45, 45, .5], ['ry', 'Câmera virar (°)', -45, 45, .5], ['rz', 'Câmera rolar (°)', -30, 30, .5],
  ['near', 'Esconder perto (cm)', .5, 40, .5]];
$('fpVals').innerHTML = FPV.map(([k, l, a, b, s]) => valRow('fp' + k, l, a, b, s, /fov|r/.test(k) ? 'graus' : 'cm')).join('');
for (const [k] of FPV) readers.push(bindVal('fp' + k, () => fpView()[k], v => { editFp()[k] = v; }));
for (const k of ['f', 'd', 's']) readers.push(bindVal('lh' + k, () => (effectiveLH()[k] || 0) * 100, v => { editLH()[k] = v / 100; }));
for (const k of ['rx', 'ry', 'rz']) readers.push(bindVal('lh' + k, () => effectiveLH()[k] || 0, v => { editLH()[k] = v; }));   // giro da mão esquerda (empunhadura vertical da AUG)

function refresh() {
  const own = id => !!draft.chars[st.kind]?.[st.wid]?.scenes?.[id];
  // etiquetas por cena: o que tem ajuste próprio (arma / câmera / mão) e se mudou desde o último salvamento
  const ent = (d, id) => d?.chars?.[st.kind]?.[st.wid]?.scenes?.[id];
  const tags = id => {
    const e = ent(draft, id), s = ent(savedSnap, id), t = [];
    if (e?.p) t.push('<em class="tg">arma</em>'); if (e?.cam) t.push('<em class="tg">câmera</em>'); if (e?.lh) t.push('<em class="tg">mão esq.</em>');
    if (JSON.stringify(e ?? null) !== JSON.stringify(s ?? null)) t.push('<em class="tg ns">não salvo</em>');
    else if (e) t.push('<em class="tg ok">salvo ✓</em>');
    return t.length ? '<span class="tgs">' + t.join('') + '</span>' : '';
  };
  $('scenes').innerHTML = sceneList().map(s => `<li><button data-s="${s.id}" class="${s.id === st.scene ? 'on' : ''} ${own(s.id) ? 'own' : ''}"><i>${own(s.id) ? '●' : s.id === 'all' ? '◆' : '○'}</i><span class="sl">${s.label}${tags(s.id)}</span></button></li>`).join('');
  for (const b of document.querySelectorAll('[data-kind]')) b.classList.toggle('on', b.dataset.kind === st.kind);
  for (const b of document.querySelectorAll('[data-w]')) b.classList.toggle('on', b.dataset.w === st.wid);
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === st.tool);
  for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === st.view);
  const botBorrow = st.kind === 'bot' && !draft.chars.bot?.[st.wid] && draft.chars.izzy?.[st.wid];
  $('kindHint').textContent = st.kind === 'bot' ? (botBorrow ? 'Esta arma do bot está usando o ajuste da Izzy. Mexa aqui para o bot ter um ajuste próprio.' : 'Ajustes só do bot.') : 'Ajustes da sua personagem.';
  const fall = st.scene.startsWith('fp_') ? (st.scene !== 'fp_walk' ? ' (usando "andando")' : '') : ' (usando o Geral)';
  $('editing').textContent = '· ' + sceneDef().label + (st.scene !== 'all' && !own(st.scene) ? fall : '');
  $('useAll').disabled = st.scene === 'all' || !own(st.scene);
  $('lhBox').classList.toggle('hidden', BLADE_ID(st.wid));
  $('lfBox').classList.toggle('hidden', !BLADE_ID(st.wid));
  { const F = gripFor(st.kind, st.wid, 'fp_walk').lhFree; $('lfOn').checked = !!(F && F.on !== false);
    for (const k of LF_KEYS) { const v = F?.[k] ?? LF_DEF[k]; if (document.activeElement !== $('lf_' + k)) $('lf_' + k).value = v; if (document.activeElement !== $('lf_' + k + 'N')) $('lf_' + k + 'N').value = v; } }
  { const G = gripFor(st.kind, st.wid, dataScene()), c = G.curl || 0, w = G.wrist || [0, 0, 0]; if (document.activeElement !== $('curl')) $('curl').value = c; if (document.activeElement !== $('curlN')) $('curlN').value = c;
    for (let i = 0; i < 3; i++) { if (document.activeElement !== $('wr' + i)) $('wr' + i).value = w[i]; if (document.activeElement !== $('wr' + i + 'N')) $('wr' + i + 'N').value = w[i]; } }
  for (const f of readers) f();
  $('fpOwn').checked = !!draft.fpW?.[st.kind]?.[st.wid]; $('fpOwnName').textContent = WEAPONS[st.wid]?.name || '';
  { const cl = editingPreset(), who = $('fpWho'); $('fpOwn').disabled = cl;
    who.classList.toggle('claude', cl);
    who.innerHTML = cl ? '<b>Mexendo no ajuste do CLAUDE</b> (arma e câmera). O seu não muda. Para guardar: <b>"Salvar o do Claude"</b>, lá embaixo.'
      : '<b>Mexendo no SEU ajuste</b> (arma e câmera). Para guardar: <b>Salvar</b>.';
    { const own = editingPreset() ? !!preset().scenes?.[st.scene]?.cam : !!draft.chars[st.kind]?.[st.wid]?.scenes?.[st.scene]?.cam;
      $('camPin').classList.toggle('hidden', own || !st.scene.startsWith('fp_'));
      $('camScene').innerHTML = st.scene.startsWith('fp_') ? (own ? '● Esta cena (<b>' + sceneDef().label.replace('1ª pessoa · ', '') + '</b>) tem câmera <b>própria</b>: o que você mexer aqui fica só nela.'
        : '○ Esta cena ainda usa a câmera da arma. Ao mexer na câmera aqui, ela ganha uma câmera própria (as outras cenas não mudam).') : ''; }
    const f = fpView(), z = v => Math.abs(v) < .25, t = (l, v) => `${l} <span class="${z(v) ? 'ok' : 'bad'}">${(+v).toFixed(1)}°${z(v) ? ' ✓' : ''}</span>`;
    $('lvlInfo').innerHTML = [t('Rolar', f.rz), t('Inclinar', f.rx), `Virar ${(+f.ry).toFixed(1)}°`].join(' · ') + '<br><small>(virar para os lados não entorta o horizonte)</small>'; }
  cmpTable();
  $('save').classList.toggle('dirty', st.dirty);
  { const b = $('saveState');   // aviso grande: tem mudança sem salvar ou está tudo gravado
    const t = st.savedAt || (grips().saved ? new Date(grips().saved) : null), hh = t ? t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    b.className = 'savestate ' + (st.dirty || st.localOnly ? 'no' : 'yes');
    b.innerHTML = st.dirty ? '● Você tem mudanças <b>NÃO salvas</b>. Clique em <b>Salvar</b> (ou Ctrl+S).'
      : st.localOnly ? '● Salvo <b>só neste navegador</b>, não no arquivo do jogo. Abra pelo "1 - INICIAR SERVIDOR.bat" e salve de novo.'
      : '✓ Tudo salvo no jogo' + (hh ? ' (último: ' + hh + ')' : '') + '.';
    if (st.presetDirty) b.innerHTML += '<br>● O <b>ajuste do Claude</b> tem mudanças não salvas: botão "Salvar o do Claude".'; }
  if (st.dirty) { $('status').className = 'hint warn'; $('status').textContent = 'Há mudanças ainda não salvas.'; }
}

document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.kind && b.dataset.kind !== st.kind) { st.kind = b.dataset.kind; makeChar(); }
  else if (b.dataset.w && b.dataset.w !== st.wid) {
    const wasKnife = BLADE_ID(st.wid); st.wid = b.dataset.w; held.set(st.wid);
    if (wasKnife !== (BLADE_ID(st.wid)) || !sceneList().some(s => s.id === st.scene)) st.scene = st.view === 'fp' ? 'fp_walk' : 'all';
    playScene(); attachGizmo(); if (st.view === 'hand') requestAnimationFrame(() => setView('hand'));
  }
  else if (b.dataset.s) { st.scene = b.dataset.s; playScene(); }
  else if (b.dataset.tool) setTool(b.dataset.tool);
  else if (b.dataset.view) setView(b.dataset.view);
  else if (b.dataset.rot) nudge(b.dataset.rot);
  else return;
  refresh();
});
$('useAll').onclick = () => {
  const e = wEntry(false), s = e?.scenes[st.scene]; if (!s) return; pushUndo();
  if (s.cam) e.scenes[st.scene] = { cam: s.cam }; else delete e.scenes[st.scene];   // a câmera própria da cena continua
  changed();
};
$('toAll').onclick = () => {
  const fp = st.view === 'fp';
  if (!confirmBox(fp ? 'Usar este ajuste nas 4 cenas da 1ª pessoa desta arma?' : 'Usar este ajuste em TODAS as cenas da 3ª pessoa desta arma? Os ajustes próprios das outras cenas serão apagados.')) return;
  const eff = structuredClone(effective()); pushUndo(); const e = wEntry(true);
  if (fp) { for (const s of sceneList()) { const o = e.scenes[s.id] || {}; e.scenes[s.id] = { ...o, p: [...eff.p], r: [...eff.r] }; } }   // mantém a câmera e a mão esquerda de cada cena   // só a 1ª pessoa (a 3ª pessoa não muda)
  else { const keep = Object.fromEntries(Object.entries(e.scenes).filter(([k]) => k.startsWith('fp'))); e.scenes = { ...keep, all: { p: [...eff.p], r: [...eff.r] } }; st.scene = 'all'; playScene(); }
  changed();
};
$('zero').onclick = () => { pushUndo(); const s = editScene(); s.p = [0, 0, 0]; s.r = [0, 0, 0]; changed(); };
$('undo').onclick = doUndo;
$('ik').onchange = e => { st.ik = e.target.checked; };
$('play').onclick = () => setPlaying(!st.playing);
$('speed').onchange = e => { st.speed = +e.target.value; };
$('time').addEventListener('input', e => {
  setPlaying(false); if (st.view === 'fp' && sceneDef().slash) { labSlashT = +e.target.value * KNIFE_SLASH.dur; return; }
  const a = mainAction(); if (!a) return;
  a.time = a.getClip().duration * +e.target.value; mixer.update(0);
});
$('save').onclick = save;
function confirmBox(msg) { try { return confirm(msg); } catch { return true; } }

async function save() {
  const s = $('status'); s.className = 'hint'; s.textContent = 'Salvando…';
  const ok = await saveGrips(draft);
  if (ok) {
    // confere: lê o arquivo de volta e vê se a data gravada é a deste salvamento
    let ok2 = false; try { const f = await (await fetch(GRIPS_URL + '?t=' + Date.now(), { cache: 'no-store' })).json(); ok2 = f.saved === draft.saved; } catch {}
    st.dirty = !ok2; st.localOnly = false; st.savedAt = new Date(); if (ok2) savedSnap = structuredClone(draft); refresh();
    s.className = ok2 ? 'hint ok' : 'hint warn';
    s.textContent = ok2 ? 'Salvo no jogo ✓ (' + st.savedAt.toLocaleTimeString('pt-BR') + ') — conferi lendo o arquivo de volta. O jogo já usa este ajuste.' : 'O servidor respondeu, mas não consegui conferir o arquivo. Tente salvar de novo.';
  }
  else { st.dirty = false; st.localOnly = true; refresh(); s.className = 'hint warn'; s.textContent = 'Salvo só neste navegador. Para gravar no arquivo do jogo, abra pelo "1 - INICIAR SERVIDOR.bat" e salve de novo.'; }
}
addEventListener('beforeunload', e => { if (st.dirty || st.presetDirty) { e.preventDefault(); e.returnValue = ''; } });

function setPlaying(on) { st.playing = on; $('play').textContent = on ? '❚❚' : '▶'; }
function setTool(t) { st.tool = t; gizmo.setMode(t); gizmo.setSize(t === 'rotate' ? 1.1 : .8); refresh(); }
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type === 'number') return;
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); doUndo(); }
  else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); save(); }
  else if (e.code === 'KeyW') setTool('translate');
  else if (e.code === 'KeyE') setTool('rotate');
  else if (e.code === 'Space') { e.preventDefault(); setPlaying(!st.playing); }
  else if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && /^Arrow/.test(e.code)) {   // setas do teclado: aponta a ponta da arma
    e.preventDefault();
    if (st.view === 'fp' && st.fpEdit === 'cam') {   // modo Câmera: setas viram a câmera, Shift+setas movem
      const k = { ArrowUp: e.shiftKey ? 'y:1' : 'rx:1', ArrowDown: e.shiftKey ? 'y:-1' : 'rx:-1', ArrowLeft: e.shiftKey ? 'x:-1' : 'ry:1', ArrowRight: e.shiftKey ? 'x:1' : 'ry:-1' }[e.code];
      camStep(k, 1);
    } else nudge({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.code]);
  }
});

/* ---------- arrastar a arma com as setas/anéis ---------- */
function attachGizmo() {
  if (st.view === 'fp' && st.fpEdit === 'cam') gizmo.attach(fpProxy);   // 1ª pessoa: ajustando a câmera
  else if (held?.cur) gizmo.attach(held.cur); else gizmo.detach();
}
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();
gizmo.addEventListener('dragging-changed', e => {
  orbit.enabled = !e.value;
  if (e.value) { setPlaying(false); pushUndo(); lastUndoKey = 'gizmo-' + performance.now(); }
});
gizmo.addEventListener('objectChange', () => gizmo.object === fpProxy ? commitFpFromProxy() : commitFromWeapon());
/** Posição/giro atuais da arma -> deslocamento em cima da posição automática (no quadro da arma). */
function commitFromWeapon() {
  const c = held.cur, s = editScene();
  _q.copy(held.baseQ).invert();
  _v.subVectors(c.position, held.basePos).applyQuaternion(_q); s.p = [_v.x, _v.y, _v.z].map(x => +x.toFixed(5));
  _e.setFromQuaternion(_q.multiply(c.quaternion), 'XYZ'); s.r = [_e.x * DEG, _e.y * DEG, _e.z * DEG].map(x => +x.toFixed(3));
  markDirty();
  refreshSoon();
}

/* ---------- apontar a ponta da arma ---------- */
// bolinha laranja na ponta do cano: arrastar com o mouse gira a arma em volta da mão (o cabo fica no lugar)
const tip = new THREE.Mesh(new THREE.SphereGeometry(.02, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff8a1f, depthTest: false, transparent: true, opacity: .95 }));
tip.renderOrder = 11; scene.add(tip);
const tipHit = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); tip.add(tipHit);
// bolinha azul = onde a mão esquerda segura: arrastar muda o ponto (a mão vai até lá)
const lhHit = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); lhMark.add(lhHit);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), _p = new THREE.Vector3(), _d0 = new THREE.Vector3(), _d1 = new THREE.Vector3();
let drag = null;   // null | 'tip' (ponta da arma) | 'lh' (mão esquerda)
const muzzleWorld = out => { held.cur.updateMatrixWorld(); return out.copy(held.cur.userData.muzzle).applyMatrix4(held.cur.matrixWorld); };
function pointerRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
}
const handleAt = () => tip.visible && ray.intersectObject(tipHit, false).length ? 'tip' : lhMark.visible && ray.intersectObject(lhHit, false).length ? 'lh' : null;
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !held?.cur) return;
  pointerRay(e); const h = handleAt(); if (!h) return;
  e.stopImmediatePropagation(); e.preventDefault();   // não deixa a câmera nem as setas mexerem junto
  drag = h; orbit.enabled = false; setPlaying(false); pushUndo(); lastUndoKey = h + '-' + performance.now();
  plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(_p).negate(), (h === 'tip' ? tip : lhMark).position);
  renderer.domElement.setPointerCapture(e.pointerId); renderer.domElement.style.cursor = 'grabbing';
}, true);
renderer.domElement.addEventListener('pointermove', e => {
  if (!held?.cur) return;
  pointerRay(e);
  if (!drag) { if (!gizmo.dragging) renderer.domElement.style.cursor = handleAt() ? 'grab' : ''; return; }
  if (!ray.ray.intersectPlane(plane, _p)) return;
  const c = held.cur;
  if (drag === 'tip') {   // gira a arma em volta do cabo até a ponta ficar sob o mouse
    _d0.subVectors(muzzleWorld(_d0), c.position).normalize(); _d1.subVectors(_p, c.position).normalize();
    c.quaternion.premultiply(_q.setFromUnitVectors(_d0, _d1)); commitFromWeapon();
  } else {                // novo ponto da mão esquerda, no quadro da arma
    c.updateMatrixWorld(); c.worldToLocal(_p);
    const lh = editLH(); lh.s = +_p.x.toFixed(4); lh.d = +(-_p.y).toFixed(4); lh.f = +_p.z.toFixed(4); markDirty(); refreshSoon();
  }
}, true);
const endDrag = () => { if (!drag) return; drag = null; orbit.enabled = true; renderer.domElement.style.cursor = ''; };
renderer.domElement.addEventListener('pointerup', endDrag, true); renderer.domElement.addEventListener('pointercancel', endDrag, true);

/** Botões/teclado: gira a arma em volta do cabo, no quadro dela (+Z = cano, +Y = cima, +X = esquerda de quem segura). */
const ROTS = { up: ['x', -1], down: ['x', 1], left: ['y', 1], right: ['y', -1], rollL: ['z', -1], rollR: ['z', 1] };
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
function nudge(kind) {
  const r = ROTS[kind]; if (!r || !held?.cur) return;
  setPlaying(false); pushUndo('rot');
  held.cur.quaternion.multiply(_q.setFromAxisAngle(AX[r[0]], r[1] * (+$('step').value || 5) / DEG)); commitFromWeapon();
}
let refreshT = 0; const refreshSoon = () => { if (!refreshT) refreshT = requestAnimationFrame(() => { refreshT = 0; refresh(); }); };

/* ---------- câmeras ---------- */
function setView(v) {
  st.view = v;
  const hp = held?.basePos?.lengthSq() ? held.basePos.clone() : new THREE.Vector3(.2, 1.2, -.3);
  if (v !== 'fp') { st.fpBig = false; if (st.scene.startsWith('fp_')) { st.scene = 'all'; playScene(); } }
  orbit.enabled = !st.fpBig; $('fpBox').classList.toggle('hidden', v !== 'fp'); modeBanner(); $('fpInset').classList.toggle('hidden', v !== 'fp');
  $('help').classList.toggle('hidden', v === 'fp');
  if (v === 'fp') {
    // 1ª pessoa: a tela grande vira uma câmera de AJUSTE perto da arma (setas e anéis inteiros, girável com o mouse)
    // e a janela no canto mostra a 1ª pessoa ao vivo (câmera presa no ponto dos olhos, igual ao jogo)
    if (!st.scene.startsWith('fp_')) { st.scene = 'fp_walk'; playScene(); }
    if (!held?.cur || held.cur.position.lengthSq() < 1e-6) { requestAnimationFrame(() => setView('fp')); return; }
    held.cur.updateMatrixWorld(); const c = held.cur.localToWorld(new THREE.Vector3(0, .04, .15));
    camera.fov = 45; camera.position.copy(c).add(new THREE.Vector3(.8, .3, -.5)); orbit.target.copy(c);   // lado direito, um pouco à frente (o corpo não tampa)
    camera.updateProjectionMatrix(); orbit.update(); placeFp(); refresh(); return;
  }
  if (v === 'game' || v === 'aim') {   // mesma câmera do jogo (PlayerController.TPS), FOV 90° horizontal
    const a = v === 'aim' ? { d: .55, sh: .3, up: .08 } : { d: 2.05, sh: .48, up: .16 };
    const eyeH = /crouch/.test(st.scene) ? 1.05 : 1.62;   // agachado: câmera mais baixa, como no jogo
    camera.fov = vfov(90, camera.aspect);
    camera.position.set(a.sh, eyeH - .05 + a.up, a.d); orbit.target.set(a.sh, eyeH - .05 + a.up, a.d - 3);
  } else {
    camera.fov = 45;
    if (v === 'front') { camera.position.set(0, 1.35, -2.6); orbit.target.set(0, 1.1, 0); }
    else if (v === 'side') { camera.position.set(2.6, 1.35, 0); orbit.target.set(0, 1.1, 0); }
    else {   // centro da arma, visto do lado direito, um pouco da frente e de cima
      if (!held?.cur || held.cur.position.lengthSq() < 1e-6) { requestAnimationFrame(() => setView('hand')); return; }   // arma ainda não foi para a mão
      held.cur.updateMatrixWorld(); const c = held.cur.localToWorld(new THREE.Vector3(0, .03, .18));
      camera.position.copy(c).add(new THREE.Vector3(.85, .3, -.55)); orbit.target.copy(c);
    }
  }
  camera.updateProjectionMatrix(); orbit.update(); refresh();
}

/**
 * Copia os ajustes da Izzy para o bot: mede onde a arma fica em relação à PALMA da Izzy e põe no mesmo lugar da palma do bot
 * (escalado pelo tamanho da mão). A pegada é presa à mão, então não depende da pose: mede na pose de mira.
 */
function copyIzzyToBot() {
  const src = draft.chars.izzy; if (!src) return 0;
  const mk = kind => { const { obj, clips } = assets.instance(kind); obj.scale.setScalar(.01); obj.rotation.y = Math.PI; obj.updateMatrixWorld(true);
    const h = new HeldWeapon(obj, assets.weapons, kind); const ca = new CharacterAnimator(obj, clips); return { obj, h, ca }; };
  const I = mk('izzy'), B = mk('bot'), out = {};
  const Hq = new THREE.Quaternion(), Hp = new THREE.Vector3(), Ip = new THREE.Vector3(), e = new THREE.Euler(), R = n => +n.toFixed(5);
  const hand = h => { h.rh.getWorldQuaternion(Hq); h.rh.getWorldPosition(Hp); return Hp.distanceTo(h.ri.getWorldPosition(Ip)) || 1; };
  // 1) Izzy: arma no espaço da mão (giro + posição dividida pelo tamanho da mão)
  const loc = {};
  I.ca.withPose('fire', () => {
    I.h.calibrate();
    for (const [w, ent] of Object.entries(src)) for (const [s, g] of Object.entries(ent.scenes || {})) {
      I.h.set(w); if (!I.h.cur) continue; I.h.live = g; I.h.snap = true; I.h.update(true, null, 1);
      const len = hand(I.h), iq = Hq.clone().invert();
      (loc[w] ??= {})[s] = { q: iq.clone().multiply(I.h.cur.quaternion), p: I.h.cur.position.clone().sub(Hp).applyQuaternion(iq).divideScalar(len) };
    }
  });
  // 2) Bot: mesma posição na palma dele -> ajuste em cima da posição automática do bot
  B.ca.withPose('fire', () => {
    B.h.calibrate();
    for (const [w, scenes] of Object.entries(loc)) for (const [s, L] of Object.entries(scenes)) {
      B.h.set(w); if (!B.h.cur) continue; B.h.live = { p: [0, 0, 0], r: [0, 0, 0] }; B.h.snap = true; B.h.update(true, null, 1);
      const len = hand(B.h), wq = Hq.clone().multiply(L.q), wp = L.p.clone().multiplyScalar(len).applyQuaternion(Hq).add(Hp);
      const bq = B.h.baseQ.clone().invert(), p = wp.sub(B.h.basePos).applyQuaternion(bq);
      e.setFromQuaternion(bq.multiply(wq), 'XYZ');
      const ent = out[w] ??= { scenes: {} }; ent.scenes[s] = { p: [R(p.x), R(p.y), R(p.z)], r: [e.x * DEG, e.y * DEG, e.z * DEG].map(v => +v.toFixed(3)) };
      if (src[w].lh) ent.lh = { ...src[w].lh };   // ponto da mão esquerda fica no quadro da arma: igual
    }
  });
  for (const X of [I, B]) { X.ca.dispose(); X.h.dispose(); }
  draft.chars.bot = out;
  return Object.values(out).reduce((n, e) => n + Object.keys(e.scenes).length, 0);
}
$('copyBot').onclick = () => {
  if (draft.chars.bot && !confirmBox('O bot já tem ajustes próprios. Substituir pelos ajustes copiados da Izzy?')) return;
  pushUndo(); const n = copyIzzyToBot(); changed();
  $('status').className = 'hint warn'; $('status').textContent = n + ' ajustes copiados da Izzy para o bot. Confira no "Bot" e clique em Salvar.';
};

/** Câmera da 1ª pessoa a partir do ajuste salvo (personagem de costas para +z: frente = -z, direita = +x). */
function placeFp() {
  const f = fpView();
  // a câmera gira junto com o corpo virado pela correção de mira (o olho acompanha o giro em volta do pé)
  eyeNow.set(eye.x + f.x / 100, eye.y + f.y / 100, eye.z - f.z / 100);
  const c = Math.cos(fpYaw), s = Math.sin(fpYaw), x = eyeNow.x, z = eyeNow.z; eyeNow.x = x * c + z * s; eyeNow.z = -x * s + z * c;
  fpCam.position.copy(eyeNow);
  const R = Math.PI / 180; fpCam.quaternion.setFromEuler(_fpE.set(f.rx * R, f.ry * R, f.rz * R, 'YXZ'));
  fpCam.fov = f.fov; fpCam.near = Math.max(.005, f.near / 100); fpCam.updateProjectionMatrix();
}
const fpCam = new THREE.PerspectiveCamera(60, 16 / 9, .01, 100), _fpT = new THREE.Vector3(), _fpU = new THREE.Vector3();
const worldCam = new THREE.PerspectiveCamera(60, 16 / 9, .05, 300), _yAx = new THREE.Vector3(0, 1, 0);   // câmera de mira (mundo nivelado)
// "camerazinha" amarela no lugar dos olhos: as setas/anéis movem e giram a câmera da 1ª pessoa
const fpProxy = new THREE.Group();
{ const m = new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false });
  const body = new THREE.Mesh(new THREE.BoxGeometry(.05, .035, .06), m), lens = new THREE.Mesh(new THREE.CylinderGeometry(.012, .016, .03, 12).rotateX(Math.PI / 2), m);
  lens.position.z = -.045; body.renderOrder = lens.renderOrder = 12; fpProxy.add(body, lens); }
fpProxy.visible = false; scene.add(fpProxy);
const fpHelperCam = new THREE.PerspectiveCamera(), fpHelper = new THREE.CameraHelper(fpHelperCam);
// linhas da camerazinha: só o contorno laranja, sem a linha branca do meio, e por trás da arma (não tampa as setas/anéis)
{ const o = new THREE.Color(0xffaa00); fpHelper.setColors(o, o, o, o, o); }
fpHelper.material.depthTest = true; fpHelper.material.transparent = true; fpHelper.material.opacity = .45; fpHelper.visible = false; scene.add(fpHelper);
/** A câmerazinha foi movida/girada -> ajuste da câmera da 1ª pessoa (mesma conta do placeFp, ao contrário). */
function commitFpFromProxy() {
  const f = fpTarget(), p = fpProxy.position;
  const c = Math.cos(fpYaw), s = Math.sin(fpYaw), x = p.x * c - p.z * s, z = p.x * s + p.z * c;   // desfaz o giro do corpo
  f.x = +((x - eye.x) * 100).toFixed(2); f.y = +((p.y - eye.y) * 100).toFixed(2); f.z = +(-(z - eye.z) * 100).toFixed(2);
  const e = _fpE.setFromQuaternion(fpProxy.quaternion, 'YXZ'), D = 180 / Math.PI;
  f.rx = +(e.x * D).toFixed(2); f.ry = +(e.y * D).toFixed(2); f.rz = +(e.z * D).toFixed(2);
  markDirty(); refreshSoon();
}
/** Retângulo da janela da 1ª pessoa (pixels CSS dentro da área 3D) — mesmo formato da tela do jogo. */
function insetRect() {
  const W = host.clientWidth, H = host.clientHeight, asp = innerWidth / innerHeight;
  let w = Math.round(Math.min(W * .42, 560)), h = Math.round(w / asp); if (h > H * .45) { h = Math.round(H * .45); w = Math.round(h * asp); }
  return { x: W - w - 12, y: 64, w, h };   // y = do topo
}
function placeInsetEl() { const r = insetRect(), el = $('fpInset'); Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
const _fpE = new THREE.Euler();
// mouse na 1ª pessoa (fora das bolinhas/setas): esquerdo arrastando = girar a câmera; direito = mover para os lados/cima; roda = frente/trás; Shift+roda = zoom
let fpDrag = null;
const fpEl = $('fpArea');
const fpLocked = () => $('fpLock').checked;   // "travar": o mouse na tela da 1ª pessoa não mexe na câmera (não perde o encaixe com o guia)
fpEl.addEventListener('pointerdown', e => {
  if (st.view !== 'fp' || fpLocked()) return; e.preventDefault();
  fpDrag = { b: e.button, x: e.clientX, y: e.clientY }; fpEl.setPointerCapture(e.pointerId); pushUndo(); lastUndoKey = 'fpm-' + performance.now();
});
fpEl.addEventListener('pointermove', e => {
  if (!fpDrag || st.view !== 'fp') return;
  const mx = e.clientX - fpDrag.x, my = e.clientY - fpDrag.y; fpDrag.x = e.clientX; fpDrag.y = e.clientY;
  const f = fpTarget();
  if (fpDrag.b === 0) { f.ry = +(f.ry - mx * .15).toFixed(2); f.rx = +(f.rx - my * .15).toFixed(2); }
  else { f.x = +(f.x - mx * .05).toFixed(2); f.y = +(f.y + my * .05).toFixed(2); }
  markDirty(); refreshSoon();
});
const endFp = () => { fpDrag = null; }; fpEl.addEventListener('pointerup', endFp); fpEl.addEventListener('pointercancel', endFp);
fpEl.addEventListener('wheel', e => {
  if (st.view !== 'fp') return; e.preventDefault(); if (fpLocked()) return;
  const f = editFp(), s = Math.sign(e.deltaY);
  if (e.shiftKey) f.fov = Math.min(100, Math.max(30, f.fov + s * 2)); else f.z = +(f.z - s * 1).toFixed(1);
  markDirty(); refreshSoon();
}, { passive: false });
fpEl.addEventListener('contextmenu', e => e.preventDefault());
for (const b of document.querySelectorAll('[data-fpedit]')) b.onclick = () => {
  st.fpEdit = b.dataset.fpedit; attachGizmo(); modeBanner();
  document.querySelectorAll('[data-fpedit]').forEach(x => x.classList.toggle('on', x === b));
};
$('fpBig').onclick = () => { st.fpBig = !st.fpBig; $('fpBig').textContent = st.fpBig ? 'Voltar a ajustar' : 'Ver em tela cheia'; $('fpInset').classList.toggle('big', st.fpBig); orbit.enabled = !st.fpBig; };
/** Onde a mudança da câmera da 1ª pessoa é gravada: na própria arma (se "câmera só desta arma" estiver ligado) ou na geral. */
function fpTarget() {
  // cada cena da 1ª pessoa guarda a PRÓPRIA câmera (scenes.fp_x.cam): mexer em "atirando" não muda "correndo"
  if (st.view === 'fp' && st.scene.startsWith('fp_')) { const v = { ...fpView() }, sc = sceneEntry(); return sc.cam ??= v; }
  if (editingPreset()) { const P = preset(); return P.cam = { ...fpView(), ...P.cam }; }
  const cur = { ...fpFor(st.kind, st.wid) };
  if (draft.fpW?.[st.kind]?.[st.wid]) return draft.fpW[st.kind][st.wid];
  return (draft.fp ??= {})[st.kind] ??= cur;
}
function editFp() { pushUndo('fp'); return fpTarget(); }
$('camPin').onclick = () => { pushUndo(); fpTarget(); changed(); };   // cria a câmera própria da cena (cópia da que está aparecendo)
$('camAll').onclick = () => {
  if (!confirmBox('Copiar a câmera desta cena para as 4 cenas da 1ª pessoa desta arma?')) return;
  pushUndo(); const cam = { ...fpView() }, keep = st.scene;
  for (const s of SCENES[BLADE_ID(st.wid) ? 'fpKnife' : 'fpGun']) { st.scene = s.id; sceneEntry().cam = { ...cam }; }
  st.scene = keep; changed();
};
/** Aviso na tela quando as setas/anéis estão na CÂMERA (assim não parece que a arma "travou"). */
function modeBanner() {
  const on = st.view === 'fp' && st.fpEdit === 'cam'; $('camMode').classList.toggle('hidden', !on);
}
$('camModeOff').onclick = () => document.querySelector('[data-fpedit="gun"]').click();
/** Botões da câmera: "chave:passo" (x/y/z em cm, rx/ry/rz/fov em graus). */
function camStep(code, mul = 1) {
  const [k, s] = code.split(':'), f = editFp();
  let v = (+f[k] || 0) + (+s) * mul;
  if (k === 'fov') v = Math.min(100, Math.max(30, v));
  f[k] = +v.toFixed(2); setPlaying(false); markDirty(); refreshSoon();
}
for (const b of document.querySelectorAll('[data-cam]')) b.onclick = e => camStep(b.dataset.cam, e.shiftKey ? 5 : 1);
/**
 * Nivela a câmera da cena (zera os giros pedidos). Com "manter a arma no lugar", a câmera também anda um pouco para que
 * o meio da arma continue no mesmo ponto da tela (e na mesma distância): o horizonte fica reto sem perder o encaixe.
 */
const _lvP = new THREE.Vector3(), _lvV = new THREE.Vector3(), _lvQ = new THREE.Quaternion(), _lvE = new THREE.Euler();
function level(keys, undo = true) {
  const f = undo ? editFp() : fpTarget(), R = Math.PI / 180, keep = $('lvlKeep').checked && held?.cur;
  if (keep) {
    placeFp(); fpCam.updateMatrixWorld(); held.cur.updateMatrixWorld();
    held.cur.getWorldPosition(_lvP).add(held.muzzleWorld).multiplyScalar(.5);                         // meio da arma
    _lvV.copy(_lvP).sub(fpCam.position).applyQuaternion(_lvQ.copy(fpCam.quaternion).invert());      // onde ela está vista da câmera
  }
  for (const k of keys) f[k] = 0;
  if (keep) {
    const cp = _lvP.clone().sub(_lvV.applyQuaternion(_lvQ.setFromEuler(_lvE.set(f.rx * R, f.ry * R, f.rz * R, 'YXZ'))));
    const c = Math.cos(fpYaw), s = Math.sin(fpYaw), x = cp.x * c - cp.z * s, z = cp.x * s + cp.z * c;   // desfaz o giro do corpo (igual ao placeFp)
    f.x = +((x - eye.x) * 100).toFixed(2); f.y = +((cp.y - eye.y) * 100).toFixed(2); f.z = +(-(z - eye.z) * 100).toFixed(2);
  }
  markDirty(); refreshSoon();
}
// as 4 cenas da 1ª pessoa desta arma: toca cada cena, espera o corpo assentar e nivela
async function levelAllScenes() {
  if (!confirmBox('Deixar o horizonte reto (rolar 0° e inclinar 0°) nas cenas da 1ª pessoa desta arma?' + ($('lvlKeep').checked ? ' A arma fica no mesmo lugar da tela.' : ''))) return;
  pushUndo(); const keep = st.scene, play = st.playing; setPlaying(false);
  for (const s of SCENES[BLADE_ID(st.wid) ? 'fpKnife' : 'fpGun']) {
    st.scene = s.id; playScene();
    for (let i = 0; i < 25; i++) await new Promise(r => { requestAnimationFrame(r); setTimeout(r, 60); });   // corpo gira até o cano apontar para a frente
    level(['rx', 'rz'], false);
  }
  st.scene = keep; playScene(); setPlaying(play); changed();
  $('status').className = 'hint warn'; $('status').textContent = 'Horizonte reto nas cenas da 1ª pessoa da ' + (WEAPONS[st.wid]?.name || st.wid) + '. Confira e clique em Salvar.';
}
$('lvlRoll').onclick = () => level(['rz']); $('lvlPitch').onclick = () => level(['rx']); $('lvlAll').onclick = () => level(['rx', 'rz']); $('lvlScenes').onclick = levelAllScenes;
$('lvlOn').onchange = () => { if (!$('lvlOn').checked) { const c = $('lvlCv'); c.getContext('2d').clearRect(0, 0, c.width, c.height); } };
/* ---------- guia de referência: foto de outro jogo por cima da 1ª pessoa ---------- */
// Por arma: { src, op (opacidade), scale (1 = largura da tela), dx/dy = mira da foto (0..1 da largura/altura), ox/oy = empurrão fino (% da tela) }
const REF_LS = 'shadowops.refGuide', REF_DIR = 'assets/ref/';
const REF_DEF = { src: REF_DIR + 'viewmodel_cf_aug_recorte.png', op: .45, scale: 1, dx: .5009, dy: .3003, ox: 0, oy: 0 };   // foto do CrossFire recortada (só arma, braços e o ponto verde); ponto verde em (1281, 309) de 2557×1029
let REF = {}; try { REF = JSON.parse(localStorage.getItem(REF_LS) || '{}'); } catch {}
const refCfg = () => { const c = { ...REF_DEF, ...(REF[st.wid] || {}) }; if (c.src === REF_DIR + 'viewmodel_cf_aug.png' && !REF[st.wid]?.keepFull) c.src = REF_DEF.src; return c; };   // padrão novo: só arma, braços e mira
const refSet = patch => { REF[st.wid] = { ...refCfg(), ...patch }; try { localStorage.setItem(REF_LS, JSON.stringify(REF)); } catch {} refApply(true); };
const refImg = $('refImg'), refBlobs = {};   // fotos escolhidas do computador (só nesta sessão)
const RV = [['op', 'Transparência da foto', .05, 1, .05, '%'], ['scale', 'Tamanho da foto', .5, 2, .01, '×'], ['ox', 'Foto ← → (fino)', -20, 20, .1, '%'], ['oy', 'Foto ↑ ↓ (fino)', -20, 20, .1, '%']];
$('refVals').innerHTML = RV.map(([k, l, a, b, s, u]) => valRow('ref' + k, l, a, b, s, u)).join('');
for (const [k] of RV) {
  const r = $('ref' + k + '_r'), n = $('ref' + k + '_n'), set = v => { if (Number.isFinite(v)) refSet({ [k]: v }); };
  r.addEventListener('input', () => set(+r.value)); n.addEventListener('change', () => set(+n.value)); n.addEventListener('keydown', e => e.stopPropagation());
}
async function refList() {   // fotos da pasta assets/ref (lista do servidor)
  let files = [];
  try { const t = await (await fetch(REF_DIR + '?t=' + Date.now(), { cache: 'no-store' })).text(); files = [...t.matchAll(/href="([^"?]+\.(?:png|jpe?g|webp))"/gi)].map(m => REF_DIR + decodeURIComponent(m[1])); } catch {}
  if (!files.includes(REF_DEF.src)) files.unshift(REF_DEF.src);
  return files;
}
async function refFill() {
  const cur = refCfg().src, files = await refList(), blobs = Object.keys(refBlobs);
  $('refSel').innerHTML = [...files, ...blobs].map(f => `<option value="${f}" ${f === cur ? 'selected' : ''}>${refBlobs[f] ? '(seu PC) ' + f : f.replace(REF_DIR, '')}</option>`).join('');
}
$('refSel').onchange = () => refSet({ src: $('refSel').value, keepFull: $('refSel').value === REF_DIR + 'viewmodel_cf_aug.png' });
$('refFile').onclick = () => $('refInput').click();
$('refInput').onchange = () => { const f = $('refInput').files[0]; if (!f) return; refBlobs[f.name] = URL.createObjectURL(f); refSet({ src: f.name }); refFill(); };
$('refReset').onclick = () => { delete REF[st.wid]; try { localStorage.setItem(REF_LS, JSON.stringify(REF)); } catch {} refApply(true); refFill(); };
$('refOn').onchange = () => { try { localStorage.setItem(REF_LS + '.on', $('refOn').checked ? '1' : ''); } catch {} refApply(true); };
try { $('refOn').checked = !!localStorage.getItem(REF_LS + '.on'); } catch {}
let refPicking = false, refKey = '';
$('refPick').onclick = () => { refPicking = !refPicking; $('refPickHint').classList.toggle('hidden', !refPicking); $('fpInset').classList.toggle('picking', refPicking); if (refPicking && !$('refOn').checked) { $('refOn').checked = true; refApply(true); } };
// clique na foto (modo "marcar a mira"): esse ponto da foto passa a ficar no centro da tela
$('fpArea').addEventListener('pointerdown', e => {
  if (!refPicking || !refImg.naturalWidth) return; e.stopImmediatePropagation(); e.preventDefault();
  const r = refImg.getBoundingClientRect(); refPicking = false; $('refPickHint').classList.add('hidden'); $('fpInset').classList.remove('picking');
  refSet({ dx: (e.clientX - r.left) / r.width, dy: (e.clientY - r.top) / r.height, ox: 0, oy: 0 });
}, true);
/** Posiciona a foto: largura = tela × tamanho; a mira da foto fica no centro da tela (+ empurrão fino). */
function refApply(force = false) {
  const on = $('refOn').checked && st.view === 'fp', c = refCfg(), src = refBlobs[c.src] || c.src;
  refImg.hidden = !on; $('refDot').hidden = !on; if (!on) return;
  if (refImg.dataset.src !== src) { refImg.dataset.src = src; refImg.src = src; refImg.onerror = () => { $('status').className = 'hint warn'; $('status').textContent = 'Não achei a foto do guia: ' + c.src; }; }
  const el = $('fpInset'), W = el.clientWidth, H = el.clientHeight, key = [W, H, c.op, c.scale, c.dx, c.dy, c.ox, c.oy, src, refImg.naturalWidth].join();
  if (!force && key === refKey) return; refKey = key;
  if ([...$('refSel').options].some(o => o.value === c.src)) $('refSel').value = c.src;
  if (!refImg.naturalWidth) return;
  // a foto é um quadro 16:9 do outro jogo: o tamanho segue a ALTURA da tela (igual à câmera 3D, que tem zoom vertical).
  // Assim a foto não "anda" em relação à arma ao trocar entre a janela e a tela cheia (formatos diferentes).
  const w = H * 16 / 9 * c.scale, h = w * refImg.naturalHeight / refImg.naturalWidth, ox = c.ox / 100 * H, oy = c.oy / 100 * H;
  Object.assign(refImg.style, { width: w + 'px', height: h + 'px', left: (W / 2 - c.dx * w + ox) + 'px', top: (H / 2 - c.dy * h + oy) + 'px', opacity: c.op });
  Object.assign($('refDot').style, { left: (W / 2 + ox) + 'px', top: (H / 2 + oy) + 'px' });   // mira da foto: sempre bem visível
  for (const [k] of RV) { const r = $('ref' + k + '_r'), n = $('ref' + k + '_n'); r.value = c[k]; if (document.activeElement !== n) n.value = +(+c[k]).toFixed(2); }
}
refImg.addEventListener('load', () => refApply(true));
refFill();

/** Nível: linha verde = horizonte real (câmera de mira, sempre reta → meio da tela); laranja = horizonte visto pela câmera dos braços/arma. */
const _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3(), _hf = new THREE.Vector3();
function drawLevel() {
  const c = $('lvlCv'), el = $('fpInset'); if (!$('lvlOn').checked || el.classList.contains('hidden')) return;
  const w = el.clientWidth, h = el.clientHeight; if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d'); g.clearRect(0, 0, w, h);
  // horizonte da câmera dos braços: dois pontos bem longe, na altura da câmera, à frente dela
  fpCam.updateMatrixWorld(); fpCam.getWorldDirection(_hf); _hf.y = 0;
  let pts = null;
  if (_hf.lengthSq() > 1e-6) {
    _hf.normalize(); const rx = -_hf.z, rz = _hf.x;
    _h1.set(fpCam.position.x + _hf.x * 100 - rx * 60, fpCam.position.y, fpCam.position.z + _hf.z * 100 - rz * 60).project(fpCam);
    _h2.set(fpCam.position.x + _hf.x * 100 + rx * 60, fpCam.position.y, fpCam.position.z + _hf.z * 100 + rz * 60).project(fpCam);
    pts = [[(_h1.x + 1) / 2 * w, (1 - _h1.y) / 2 * h], [(_h2.x + 1) / 2 * w, (1 - _h2.y) / 2 * h]];
  }
  // No jogo o MAPA é desenhado com a câmera sempre reta e a arma é uma camada por cima: o horizonte do jogo é SEMPRE
  // a linha do centro (olhando reto). Os ângulos da câmera da arma só mudam COMO a arma aparece, nunca entortam o jogo.
  // Por isso a linha de referência é a do jogo (verde, no centro); a laranja (horizonte da camerazinha) só aparece em cinza fraco.
  const f = fpView();
  g.lineWidth = 1;
  if (pts && (Math.abs(f.rz) >= .25 || Math.abs(f.rx) >= .25)) {
    const [[x1, y1], [x2, y2]] = pts, m = (y2 - y1) / ((x2 - x1) || 1e-6);
    g.strokeStyle = 'rgba(255,154,60,.22)'; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(0, y1 - m * x1); g.lineTo(w, y1 + m * (w - x1)); g.stroke();
  }
  g.lineWidth = 2; g.strokeStyle = '#5fe07a'; g.setLineDash([]); g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(95,224,122,.6)'; g.beginPath(); g.moveTo(w / 2, h / 2 - 14); g.lineTo(w / 2, h / 2 + 14); g.stroke();
  g.font = 'bold 13px sans-serif';
  const t1 = 'horizonte do jogo ✓ (o mapa é sempre reto)', t2 = 'ângulo da arma na tela: rolar ' + (+f.rz).toFixed(1) + '° · inclinar ' + (+f.rx).toFixed(1) + '°';
  const tw = Math.max(g.measureText(t1).width, g.measureText(t2).width);
  g.fillStyle = '#000a'; g.fillRect(w - tw - 16, h / 2 + 8, tw + 10, 38); g.fillStyle = '#5fe07a'; g.fillText(t1, w - tw - 11, h / 2 + 23); g.fillStyle = '#c9b458'; g.fillText(t2, w - tw - 11, h / 2 + 40);
}
/** Câmera mostrada agora (com a prévia do ajuste do Claude, se ligada). */
const fpView = () => st.preview && preset() ? { ...fpFor(st.kind, st.wid), ...preset().cam, ...(preset().scenes?.[st.scene]?.cam || {}) } : fpFor(st.kind, st.wid, dataScene());

/* ---------- ajuste sugerido pelo Claude: comparar, ver e usar ---------- */
let PRESETS = {};
fetch(PRESETS_URL + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : {}).then(p => { PRESETS = p || {}; refresh(); }).catch(() => {});
const preset = () => PRESETS[st.kind]?.[st.wid] || (st.kind === 'bot' ? PRESETS.izzy?.[st.wid] : null);
const FPS = ['fp_walk', 'fp_fire', 'fp_reload'];   // (a cena "correndo" da 1ª pessoa não existe mais)
function cmpTable() {
  const P = preset(), box = $('cmpBox'); box.classList.toggle('hidden', !P || st.view !== 'fp'); if (!P) return;
  const sc = st.scene.startsWith('fp_') ? st.scene : 'fp_walk', mine = fpFor(st.kind, st.wid, sc), g = gripFor(st.kind, st.wid, sc);
  const pg = P.scenes?.[sc] || P.scenes?.fp_walk || { p: [0, 0, 0], r: [0, 0, 0] }, PC = { ...P.cam, ...(pg.cam || {}) };
  const n = v => (+v).toFixed(1), rows = [
    ['Câmera lado (cm)', mine.x, PC.x], ['Câmera altura (cm)', mine.y, PC.y], ['Câmera frente/trás (cm)', mine.z, PC.z],
    ['Câmera inclinar (°)', mine.rx, PC.rx], ['Câmera virar (°)', mine.ry, PC.ry], ['Câmera rolar (°)', mine.rz, PC.rz], ['Zoom (°)', mine.fov, PC.fov ?? mine.fov],
    ['Arma lado (cm)', g.p[0] * 100, pg.p[0] * 100], ['Arma altura (cm)', g.p[1] * 100, pg.p[1] * 100], ['Arma frente (cm)', g.p[2] * 100, pg.p[2] * 100],
    ['Arma inclinar (°)', g.r[0], pg.r[0]], ['Arma virar (°)', g.r[1], pg.r[1]], ['Arma rolar (°)', g.r[2], pg.r[2]]];
  $('cmpTbl').innerHTML = '<tr><th></th><th>Seu</th><th>Claude</th></tr>' + rows.map(([l, a, b]) => `<tr class="${Math.abs(a - b) > .05 ? 'diff' : ''}"><td>${l}</td><td>${n(a)}</td><td>${n(b)}</td></tr>`).join('');
  $('cmpNote').textContent = P.note || '';
  $('cmpView').textContent = st.preview ? 'Ver o meu' : 'Ver o do Claude';
  $('cmpView').classList.toggle('on', !!st.preview);
  $('cmpBack').disabled = !draft.backup?.[st.kind]?.[st.wid];
  $('cmpSave').disabled = !st.presetDirty; $('cmpSave').classList.toggle('dirty', !!st.presetDirty);
  $('cmpEdit').classList.toggle('hidden', !st.preview);
}
$('cmpView').onclick = () => { st.preview = !st.preview; refresh(); };
/** Salva o ajuste do Claude (com as suas mudanças) no arquivo dele. */
$('cmpSave').onclick = async () => {
  const s = $('status');
  try { const r = await fetch('api/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(PRESETS, null, 1) });
    if (!r.ok) throw new Error(r.status);
    st.presetDirty = false; s.className = 'hint ok'; s.textContent = 'Ajuste do Claude salvo ✓ (o anterior ficou em presets_claude.backup.json).';
  } catch { s.className = 'hint warn'; s.textContent = 'Não consegui salvar o ajuste do Claude: feche e abra de novo o "1 - INICIAR SERVIDOR.bat" (o servidor novo sabe salvar) e tente outra vez.'; }
  refresh();
};
$('cmpUse').onclick = () => {
  const P = preset(); if (!P) return;
  pushUndo(); const e = wEntry(true);
  // guarda o seu (só na primeira vez) para poder voltar
  draft.backup ??= {}; (draft.backup[st.kind] ??= {});
  if (!draft.backup[st.kind][st.wid]) draft.backup[st.kind][st.wid] = { cam: structuredClone(draft.fpW?.[st.kind]?.[st.wid] ?? null),
    scenes: Object.fromEntries(FPS.filter(s => e.scenes[s]).map(s => [s, structuredClone(e.scenes[s])])) };
  ((draft.fpW ??= {})[st.kind] ??= {})[st.wid] = { ...fpFor(st.kind), ...P.cam };
  for (const s of FPS) { delete e.scenes[s]; if (P.scenes?.[s]) e.scenes[s] = structuredClone(P.scenes[s]); }
  st.preview = false; changed();
  $('status').className = 'hint warn'; $('status').textContent = 'Ajuste do Claude aplicado na ' + st.wid.toUpperCase() + '. Clique em Salvar para o jogo usar (ou "Voltar ao meu").';
};
$('cmpBack').onclick = () => {
  const B = draft.backup?.[st.kind]?.[st.wid]; if (!B) return;
  pushUndo(); const e = wEntry(true);
  if (B.cam) draft.fpW[st.kind][st.wid] = B.cam; else if (draft.fpW?.[st.kind]) delete draft.fpW[st.kind][st.wid];
  for (const s of FPS) { delete e.scenes[s]; if (B.scenes[s]) e.scenes[s] = B.scenes[s]; }
  delete draft.backup[st.kind][st.wid]; st.preview = false; changed();
};
$('fpOwn').onchange = e => {
  pushUndo();
  if (e.target.checked) ((draft.fpW ??= {})[st.kind] ??= {})[st.wid] = { ...fpFor(st.kind, st.wid) };
  else if (draft.fpW?.[st.kind]) delete draft.fpW[st.kind][st.wid];
  changed();
};

const FP_POLE = new THREE.Vector3(0, -1, .35).normalize();   // cotovelo para baixo e um pouco para trás

/* ---------- laço ---------- */
const clock = new THREE.Clock(); let labBobT = 0, labSlashT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .1);
  if (char) {
    ensureWeaponEnv(renderer);
    forceMixerWrite(mixer); mixer.update(st.playing ? dt * st.speed : 0);   // pausado: reaplica a pose (a mão esquerda volta ao lugar se o IK for desligado)
    const slashOn = st.view === 'fp' && BLADE_ID(st.wid) && sceneDef().slash;
    const a = mainAction(); if (a && st.playing && !slashOn) $('time').value = (a.time % a.getClip().duration) / a.getClip().duration;
    // 1ª pessoa: igual ao jogo, o corpo gira até o cano apontar para a frente (a animação de tiro deixa o corpo de lado)
    if (st.view === 'fp' && !BLADE_ID(st.wid) && held.cur) {
      // usa a direção AUTOMÁTICA da arma (sem o seu ajuste): assim o corpo não "foge" quando você gira a arma
      const d = _fpT.set(0, 0, 1).applyQuaternion(held.baseQ), ey = Math.atan2(-d.x, -d.z);
      const err = ey - Math.round(ey / (Math.PI * 2)) * Math.PI * 2;
      fpYaw = THREE.MathUtils.clamp(fpYaw - THREE.MathUtils.clamp(err, -.6, .6) * .35, -1.3, 1.3);
    } else fpYaw *= .8;
    char.rotation.y = Math.PI + fpYaw;
    // faca na 1ª pessoa tocando: o mesmo balanço para frente/trás do jogo (andando e correndo)
    { const on = st.view === 'fp' && sceneDef().still && !sceneDef().slash && st.playing; labBobT = on ? labBobT + dt * st.speed * BOB_KNIFE.freq * Math.PI * 2 : 0;
      const bf = on ? Math.sin(labBobT) * BOB_KNIFE.fwd : 0; char.position.x = -Math.sin(fpYaw) * bf; char.position.z = -Math.cos(fpYaw) * bf; char.position.y = on ? Math.abs(Math.sin(labBobT)) * BOB_KNIFE.up : 0; }
    char.updateMatrixWorld(true);
    // golpe da faca (igual ao jogo): sai da pose parada, corta e volta; repete com uma pausa parada entre os golpes
    let slashP = null;
    if (slashOn) { if (st.playing) labSlashT = (labSlashT + dt * st.speed) % (KNIFE_SLASH.dur + .6); slashP = Math.min(1, labSlashT / KNIFE_SLASH.dur);
      if (st.playing) $('time').value = slashP; applyKnifeSlash(char, slashP); }
    held.scene = dataScene(); held.snap = true;
    held.live = st.preview && st.view === 'fp' && preset() ? ((preset().scenes?.[st.scene]?.p && preset().scenes[st.scene]) || preset().scenes?.fp_walk || null) : null;   // prévia do ajuste do Claude
    held.liveLH = held.live ? (held.live.lh || preset().scenes?.fp_walk?.lh || null) : null;
    // cenas de tiro: simula disparos (tranco + clarão; na sniper, o ferrolho) para você ver o movimento
    if (sceneDef().shots && st.playing && held.cur && !BLADE_ID(st.wid) && $('shotSim').checked) {
      shotT -= dt * st.speed;
      if (shotT <= 0) {
        const w = WEAPONS[st.wid]; shotN++;
        shotT = w.auto ? (shotN % 6 ? 60 / w.rpm : .9) : Math.max(60 / w.rpm, .6);   // automáticas: rajadas de 5
        held.shotKick(); held.muzzleFlash(!!w.auto && shotN % 6 > 1);
      }
    }
    held.update(true, null, dt * (st.playing ? st.speed : 0));
    // mão esquerda: solta enquanto você encaixa a arma (senão ela "gruda" e vai junto); presa só para conferir ou ao arrastar a bolinha azul
    const sc = st.scene, gun = !BLADE_ID(st.wid), moving = gizmo.dragging || drag === 'tip';
    // 1ª pessoa: arma com giro de mão salvo (AUG) segura sempre, como no jogo
    const lhOn = gun && (drag === 'lh' || ((st.ik || (st.view === 'fp' && fpUsesIK(st.kind, st.wid))) && !moving && !/reload/.test(sc)));
    held.leftHandIK(lhOn, 1, st.view === 'fp' ? FP_POLE : null);   // 1ª pessoa: cotovelo para baixo
    if (BLADE_ID(st.wid) && st.view === 'fp') { const F = gripFor(st.kind, st.wid, 'fp_walk').lhFree; if (F && F.on !== false) held.leftHandFree(leftDuringSlash(F, slashP), FP_POLE); }   // faca: mão esquerda livre
    lhMark.visible = !BLADE_ID(st.wid);
    if (lhMark.visible && held.cur) {
      const lh = effectiveLH(); lhMark.position.set(lh.s || 0, -lh.d, lh.f); held.cur.updateMatrixWorld(); held.cur.localToWorld(lhMark.position);
    }
    if (!gizmo.object && held.cur) attachGizmo();
    tip.visible = !!held.cur; if (tip.visible) muzzleWorld(tip.position);
  }
  if (st.view !== 'fp') {
    fpProxy.visible = fpHelper.visible = false; if (held?.cur && gizmo.object !== held.cur) attachGizmo();
    orbit.update(); renderer.render(scene, camera); return;
  }
  // 1ª pessoa: tela grande = câmera de ajuste (com setas/anéis); janela = como fica no jogo (sem setas, cabeça escondida)
  placeFp(); placeInsetEl();
  const camEdit = st.fpEdit === 'cam';
  if (!(gizmo.dragging && gizmo.object === fpProxy)) { fpProxy.position.copy(fpCam.position); fpProxy.quaternion.copy(fpCam.quaternion); }
  fpProxy.visible = fpHelper.visible = camEdit;
  if (camEdit) { tip.visible = lhMark.visible = false; fpHelperCam.copy(fpCam); fpHelperCam.near = Math.max(.01, fpCam.near); fpHelperCam.far = .45; fpHelperCam.updateProjectionMatrix(); fpHelperCam.updateMatrixWorld(); fpHelper.update(); }
  if (gizmo.object !== (camEdit ? fpProxy : held?.cur)) attachGizmo();
  const W = host.clientWidth, H = host.clientHeight;
  const fpOnly = () => {   // desenha a visão da 1ª pessoa sem os controles e sem a cabeça
    const vis = [gizmo.visible, tip.visible, lhMark.visible, fpProxy.visible, fpHelper.visible]; gizmo.visible = tip.visible = lhMark.visible = fpProxy.visible = fpHelper.visible = false;
    char?.userData.arms?.on();   // só os braços aparecem (o corpo não tapa a câmera)
    // mundo com a câmera de mira (nivelada, nos olhos) + braços/arma com a câmera do viewmodel por cima
    worldCam.position.copy(eye).applyAxisAngle(_yAx, fpYaw); worldCam.quaternion.identity();
    worldCam.aspect = fpCam.aspect; worldCam.fov = vfov(90, fpCam.aspect); worldCam.updateProjectionMatrix();
    renderFirstPerson(renderer, scene, worldCam, fpCam, [char, held.holder], [gizmo, tip, lhMark, fpProxy, fpHelper]);
    char?.userData.arms?.off();
    [gizmo.visible, tip.visible, lhMark.visible, fpProxy.visible, fpHelper.visible] = vis;
  };
  if (st.fpBig) { fpCam.aspect = W / H; fpCam.updateProjectionMatrix(); renderer.setViewport(0, 0, W, H); fpOnly(); drawLevel(); refApply(); return; }
  // a câmera de ajuste acompanha a arma (o corpo ainda gira alguns quadros ao entrar na 1ª pessoa); dá para girar em volta à vontade
  if (held?.cur && !gizmo.dragging && !drag) {
    // no modo "Câmera" a câmera de ajuste acompanha a camerazinha (olhos); no modo "Arma", a arma
    held.cur.updateMatrixWorld(); const c = camEdit ? _fpT.copy(fpProxy.position).add(_fpU.set(0, -.05, -.12)) : held.cur.localToWorld(_fpT.set(0, .04, .15)), d = c.sub(orbit.target);
    if (d.lengthSq() > 1e-8) { camera.position.add(d); orbit.target.add(d); }
  }
  orbit.update(); renderer.setViewport(0, 0, W, H); renderer.render(scene, camera);
  const r = insetRect(); fpCam.aspect = r.w / r.h; fpCam.updateProjectionMatrix();
  renderer.setScissorTest(true); renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h); renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h);
  renderer.setClearColor(0x2a3238, 1); fpOnly();
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); drawLevel(); refApply();
}

window.__lab = () => ({ worldCam, renderFirstPerson, eyeYaw: () => fpYaw, placeFp, fpView, preset, setView, playScene, mixer: () => mixer, mainAction, fpCam, insetRect, copyIzzyToBot, held, gizmo, st, draft, char, tip, lhMark, nudge, camera, eye });   // para testes pelo console

/* ---------- início ---------- */
assets.load(p => { $('loadInfo').textContent = 'Carregando personagens, animações e armas… ' + Math.round(p * 100) + '%'; }, { map: false })
  .then(() => {
    draft = structuredClone(grips()); draft.chars ??= {}; setGrips(draft); savedSnap = structuredClone(draft);   // edita uma cópia; o jogo só vê depois de salvar
    $('loading').classList.add('hidden');
    resize(); makeChar(); setTool('translate'); setView('game');
    $('status').textContent = grips().saved ? 'Último salvamento: ' + new Date(grips().saved).toLocaleString('pt-BR') : 'Nada salvo ainda: tudo na posição automática.';
    refresh(); frame();
    initVmLab({ assets, draft: () => draft, changed });   // viewmodel novo da pistola (prévia + ajustes, mesmo Salvar)
  })
  .catch(e => { $('loadInfo').textContent = 'Falha ao carregar: ' + (e?.message || e); });
