import * as THREE from 'three';
import { PistolViewmodel, VM_CLIPS } from '../player/PistolViewmodel.js';
import { VM_DEFAULT, vmFor } from '../weapons/Grips.js';

/**
 * Lab de Armas → "Viewmodel novo da pistola": prévia ao vivo do viewmodel do pacote (braços + Glock) com a mira do jogo
 * no centro, botões para tocar cada animação e controles da câmera dele. Grava no MESMO arquivo e com o MESMO botão
 * "Salvar" do Lab (grips.json → vm.pistol). Só mexe nesta arma: as outras continuam com os ajustes delas.
 */
const FIELDS = [
  ['x', 'Lado (cm)', -30, 30, .1], ['y', 'Altura (cm)', -30, 30, .1], ['z', 'Frente/trás (cm)', -40, 40, .1],
  ['rx', 'Inclinar (°)', -45, 45, .5], ['ry', 'Virar (°)', -45, 45, .5], ['rz', 'Rolar (°)', -45, 45, .5],
  ['fov', 'Campo de visão (°)', 35, 90, .5], ['near', 'Corte perto (cm)', .3, 20, .1], ['camK', 'Balanço da câmera animada (0–1)', 0, 1, .05]
];
const ACTIONS = [['idle', 'Parado'], ['walk', 'Andando'], ['run', 'Correndo'], ['shot', 'Tiro'], ['reloadT', 'Recarga (com bala)'], ['reloadF', 'Recarga (vazia)'], ['inspect', 'Inspecionar (F)']];

export function initVmLab({ assets, draft, changed }) {
  const box = document.getElementById('vmBox'); if (!box) return;
  const $ = id => document.getElementById(id), D = () => { const d = draft(); d.vm ??= {}; return d.vm.pistol ??= { ...VM_DEFAULT }; };
  $('vmFields').innerHTML = FIELDS.map(([k, l, a, b, s]) => `<label class="vmrow"><span>${l}</span><input type="range" id="vm_${k}" min="${a}" max="${b}" step="${s}"><input type="number" id="vmn_${k}" min="${a}" max="${b}" step="${s}"></label>`).join('');
  $('vmActs').innerHTML = ACTIONS.map(([k, l]) => `<button data-vmact="${k}">${l}</button>`).join('');
  const show = () => { const c = vmFor('pistol'); $('vmOn').checked = !!c.on; for (const [k] of FIELDS) { $('vm_' + k).value = c[k]; $('vmn_' + k).value = c[k]; } };
  const set = (k, v) => { D()[k] = v; changed(); show(); };
  for (const [k, , a, b] of FIELDS) for (const id of ['vm_' + k, 'vmn_' + k]) $(id).addEventListener('input', e => { const v = Math.min(b, Math.max(a, +e.target.value)); if (isFinite(v)) set(k, v); });
  $('vmOn').addEventListener('change', e => set('on', e.target.checked));
  $('vmReset').onclick = () => { const d = draft(); d.vm ??= {}; d.vm.pistol = { ...VM_DEFAULT }; changed(); show(); };
  show();

  // prévia (abre sob demanda: carrega o pacote só quando precisa)
  let vm = null, ren = null, open = false, last = 0, sim = { speed: 0, reloading: false, until: 0, mag: 13 };
  const wrap = $('vmPrev'), cv = $('vmCanvas'), msg = $('vmMsg');
  const loop = t => {
    if (!open) return; requestAnimationFrame(loop);
    const dt = Math.min(.05, (t - (last || t)) / 1000); last = t;
    if (sim.reloading && performance.now() > sim.until) sim.reloading = false;
    vm.update(dt, { speed: sim.speed, air: false, reloading: sim.reloading, reloadTime: 1.7, reloadTotal: 1.7, mag: sim.mag, switchK: 0 });
    const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w * devicePixelRatio || cv.height !== h * devicePixelRatio) ren.setSize(w, h, false);
    ren.setClearColor(0x3a4652); ren.clear(); vm.render(ren, w / h);
    $('vmInfo').textContent = `animação: ${vm.one || vm.base}`;
  };
  $('vmShow').onclick = async () => {
    open = !open; wrap.classList.toggle('hidden', !open); $('vmShow').textContent = open ? 'Fechar a prévia' : 'Abrir a prévia';
    if (!open) return;
    if (!vm) {
      msg.textContent = 'Carregando o pacote (braços + Glock)…';
      try { const rig = await assets.loadPistolVM(); ren = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); ren.outputColorSpace = THREE.SRGBColorSpace; ren.toneMapping = THREE.ACESFilmicToneMapping; ren.setPixelRatio(devicePixelRatio); vm = new PistolViewmodel(rig, 'pistol'); msg.textContent = ''; }
      catch (e) { msg.textContent = 'Não carregou: ' + (e?.message || e); open = false; return; }
    }
    last = 0; requestAnimationFrame(loop);
  };
  $('vmClose').onclick = () => { if (open) $('vmShow').click(); };
  $('vmActs').addEventListener('click', e => {
    const k = e.target.closest('[data-vmact]')?.dataset.vmact; if (!k || !vm) return;
    if (k === 'idle') { sim.speed = 0; vm.cancel(); }
    else if (k === 'walk') sim.speed = 3; else if (k === 'run') sim.speed = 6.5;
    else if (k === 'shot') vm.shot(); else if (k === 'inspect') { sim.speed = 0; vm.inspect(); }
    else { sim.mag = k === 'reloadF' ? 0 : 5; sim.reloading = true; sim.until = performance.now() + 1700; }
  });
  return { refresh: show };
}
export { VM_CLIPS };
