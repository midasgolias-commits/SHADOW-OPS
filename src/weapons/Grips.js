/**
 * Pegadas da arma ajustadas à mão no Lab de Armas (lab.html), salvas em assets/config/grips.json.
 *
 * Formato do arquivo:
 * { version: 1, saved: "data", chars: { izzy: { rifle: { scenes: { all: {p,r}, fire: {p,r}, ... }, lh: { f, d, s } } }, bot: {...} } }
 *   p = deslocamento da arma em metros [x direita, y cima, z frente do cano], no quadro da arma calculado automaticamente
 *   r = giro extra em graus [x, y, z] (ordem XYZ), no mesmo quadro
 *   cam = (só cenas da 1ª pessoa) câmera própria da cena { x, y, z, fov, rx, ry, rz, near }
 *   lh = mão esquerda: f = distância ao longo do cano (m), d = abaixo do cano (m), s = para o lado (m)
 * Cena sem ajuste próprio usa "all" (Geral). O bot usa o ajuste da Izzy enquanto a arma dele não tiver ajuste próprio.
 */
export const GRIPS_URL = 'assets/config/grips.json';
export const GRIPS_SAVE_URL = 'api/grips';
const LS = 'shadowops.grips';

/** Cenas que podem ter ajuste próprio. clip = animação do corpo inteiro; over = animação só do tronco por cima (como no jogo). */
export const SCENES = {
  gun: [
    { id: 'all', label: 'Geral (todas as cenas)', clip: 'idle' },
    { id: 'idle', label: 'Parado', clip: 'idle' },
    { id: 'walk', label: 'Andando', clip: 'walk_f' },
    { id: 'run', label: 'Correndo', clip: 'run_f' },
    { id: 'jump', label: 'Pulando', clip: 'jump' },
    { id: 'fire', label: 'Atirando / mirando', clip: 'idle', over: 'fire', shots: true },
    { id: 'reload', label: 'Recarregando', clip: 'idle', over: 'reload' },
    { id: 'crouch', label: 'Agachado parado', clip: 'crouch_idle' },
    { id: 'crouch_walk', label: 'Agachado andando', clip: 'crouch_f' },
    { id: 'crouch_fire', label: 'Agachado atirando', clip: 'crouch_idle', over: 'crouch_fire', shots: true },
    { id: 'crouch_reload', label: 'Agachado recarregando', clip: 'crouch_idle', over: 'crouch_reload' }
  ],
  knife: [
    { id: 'all', label: 'Geral (todas as cenas)', clip: 'knife_idle' },
    { id: 'knife_idle', label: 'Faca parado', clip: 'knife_idle' },
    { id: 'knife_run', label: 'Faca correndo', clip: 'knife_f' },
    { id: 'knife_hit', label: 'Golpe de faca', clip: 'knife_idle', over: 'knife_hit' },
    { id: 'jump', label: 'Pulando', clip: 'knife_jump' },
    { id: 'vault', label: 'Salto por cima (Big Jump)', clip: 'knife_vault' }
  ],
  // 1ª pessoa: só 4 situações (pulo, salto por cima, agachar e andar de lado bagunçariam a arma na tela)
  fpGun: [
    // andando: braços na pose de mira (arma erguida no ombro, como nos jogos de tiro); as pernas andam por baixo, fora da tela
    // andando vale também para correr (na 1ª pessoa não existe mais a cena "correndo": a arma fica sempre erguida)
    { id: 'fp_walk', label: '1ª pessoa · andando e correndo (e parado)', clip: 'walk_f', over: 'fire', hold: true },
    { id: 'fp_fire', label: '1ª pessoa · atirando / mirando (com o tranco do tiro)', clip: 'walk_f', over: 'fire', hold: true, shots: true },
    { id: 'fp_reload', label: '1ª pessoa · recarregando', clip: 'walk_f', over: 'reload' }
  ],
  fpKnife: [
    { id: 'fp_walk', label: '1ª pessoa · andando e correndo (e parado)', clip: 'knife_f', still: true },   // still: pose inicial parada + balanço (igual ao jogo)
    // golpe: a MESMA pose de "andando" (parada) com o golpe por cima — braço direito corta, o esquerdo recua (KnifeSlash.js)
    { id: 'fp_fire', label: '1ª pessoa · golpe (usa a pose de "andando")', clip: 'knife_f', still: true, slash: true }
  ]
};

/**
 * Cena da 1ª pessoa (para o jogo): só andar, correr, atirar e recarregar.
 * s = { reloading, firing (atirando ou mirando/golpe), speed (m/s) }. Parado, andando, correndo, pulando, agachado ou de lado:
 * fica em "andando" — a arma não sai da tela.
 */
export function fpSceneOf(s) {
  if (s.reloading) return 'fp_reload';
  if (s.firing) return 'fp_fire';
  return 'fp_walk';   // correndo usa a cena "andando" (pedido: a cena de correr da 1ª pessoa deixou de existir)
}

/** Cena atual a partir das animações tocando (nome do clipe base e do clipe de tronco). */
export function sceneOf(base, over) {
  if (over) return over;   // fire, crouch_fire, reload, crouch_reload, knife_hit
  if (!base) return 'idle';
  if (base === 'idle') return 'idle';
  if (base.startsWith('walk_')) return 'walk';
  if (base.startsWith('run_')) return 'run';
  if (base === 'knife_vault') return 'vault';
  if (base.startsWith('pistol_')) {   // pistola: mesmas cenas das outras armas
    const b = base.slice(7);
    return b.includes('jump') ? 'jump' : b === 'idle' ? 'idle' : b.startsWith('run_') ? 'run' : b === 'crouch' || b.startsWith('kneel') ? 'crouch' : 'walk';
  }
  if (base.includes('jump')) return 'jump';
  if (base === 'crouch_idle') return 'crouch';
  if (base.startsWith('crouch_')) return 'crouch_walk';
  if (base === 'knife_idle') return 'knife_idle';
  if (base.startsWith('knife_')) return 'knife_run';
  return 'idle';
}

let DATA = { version: 1, chars: {} };
export const grips = () => DATA;
export function setGrips(d) { DATA = d && d.chars ? d : { version: 1, chars: {} }; }

/** Carrega o arquivo salvo. Se o navegador tiver uma cópia mais nova (salva sem o servidor), usa ela. */
export async function loadGrips() {
  let file = null, local = null;
  try { const r = await fetch(GRIPS_URL + '?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) file = await r.json(); } catch {}
  try { local = JSON.parse(localStorage.getItem(LS) || 'null'); } catch {}
  const t = d => Date.parse(d?.saved || 0) || 0;
  setGrips(local && local.pending && t(local) > t(file) ? local : file);
  return DATA;
}

/** Salva no arquivo do jogo (pelo servidor). Retorna true se gravou no arquivo; senão guarda no navegador. */
export async function saveGrips(d) {
  // proteção: arma que está no arquivo mas não neste rascunho (ex.: adicionada por outra aba ou pelo Claude) não é apagada
  try {
    const f = await (await fetch(GRIPS_URL + '?t=' + Date.now(), { cache: 'no-store' })).json();
    // (só armas que este rascunho nem conhece: assim desmarcar "câmera só desta arma" continua funcionando)
    for (const [kind, ws] of Object.entries(f.fpW || {})) for (const [w, e] of Object.entries(ws || {})) if (!d.fpW?.[kind]?.[w] && !d.chars?.[kind]?.[w]) ((d.fpW ??= {})[kind] ??= {})[w] = e;
    for (const [kind, ws] of Object.entries(f.chars || {})) for (const [w, e] of Object.entries(ws || {})) if (!d.chars?.[kind]?.[w]) ((d.chars ??= {})[kind] ??= {})[w] = e;
  } catch {}
  d.version = 1; d.saved = new Date().toISOString(); setGrips(d);
  try {
    const r = await fetch(GRIPS_SAVE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d, null, 1) });
    if (r.ok) { try { localStorage.removeItem(LS); } catch {} return true; }
  } catch {}
  try { localStorage.setItem(LS, JSON.stringify({ ...d, pending: true })); } catch {}
  return false;
}

/**
 * Câmera da 1ª pessoa (por personagem): x lado, y cima, z frente em cm a partir do olho; fov = zoom dos braços (graus, vertical);
 * rx/ry/rz = giro da câmera (graus: inclinar, virar, rolar); near = corte perto da câmera (cm): esconde o que está colado nela (braço).
 */
export const FP_DEFAULT = { x: 0, y: 0, z: 0, fov: 60, rx: 0, ry: 0, rz: 0, near: 1 };
/** Câmera da 1ª pessoa: a geral do personagem + (se existir) a própria da arma (fpW), como o "viewmodel" por arma dos jogos de tiro. */
/**
 * Ponto de partida de uma arma nova no Lab: se ela ainda não tem ajuste, o Lab copia o desta arma (ex.: AUG ← VX-47).
 * É só uma cópia na primeira vez: depois cada arma tem o seu ajuste, separado.
 */
export const GRIP_BASE = { aug: 'rifle', karambit: 'knife' };
export const fpFor = (kind, wid, scene) => ({ ...FP_DEFAULT, ...(DATA.fp?.[kind] || {}), ...((wid && DATA.fpW?.[kind]?.[wid]) || {}), ...(fpSceneCam(kind, wid, scene) || {}) });
/** Câmera própria de uma cena da 1ª pessoa (salva junto da pegada da cena: scenes.fp_walk.cam). Sem ela, a cena usa a câmera da arma. */
export function fpSceneCam(kind, wid, scene) {
  if (!wid || !scene?.startsWith('fp_')) return null;
  const e = weaponOf(kind, wid) || (kind !== 'izzy' ? weaponOf('izzy', wid) : null);
  return e?.scenes?.[scene]?.cam || null;
}
/** Ajustes sugeridos pelo Claude (arquivo separado, nunca sobrescreve os seus). */
export const PRESETS_URL = 'assets/config/presets_claude.json';

const ZERO = { p: [0, 0, 0], r: [0, 0, 0] };
function weaponOf(kind, w) { return DATA.chars?.[kind]?.[w]; }
/** Ajuste a usar para personagem/arma/cena (nunca nulo). */
export function gripFor(kind, w, scene) {
  let e = weaponOf(kind, w);
  if (!e && kind !== 'izzy') e = weaponOf('izzy', w);
  const S = e?.scenes;
  // 1ª pessoa: cena sem ajuste usa "andando" da 1ª pessoa (depois o ajuste antigo "fp" e, por último, o Geral)
  const has = k => S?.[k]?.p ? S[k] : null;   // cena só com câmera (sem pegada) usa a pegada de reserva
  if (scene?.startsWith('fp_')) return has(scene) || has('fp_walk') || has('fp') || has('all') || ZERO;
  return has(scene) || has('all') || ZERO;
}
/** Mão esquerda salva (ou null = usa o padrão da arma). */
export function leftHandFor(kind, w, scene) {
  let e = weaponOf(kind, w);
  if (!e && kind !== 'izzy') e = weaponOf('izzy', w);
  // 1ª pessoa tem o próprio ponto da mão esquerda (guardado na cena "andando" da 1ª pessoa)
  if (scene?.startsWith('fp_')) { const v = e?.scenes?.[scene]?.lh || e?.scenes?.fp_walk?.lh; if (v) return v; }
  if (!e?.lh && kind !== 'izzy') e = weaponOf('izzy', w);
  return e?.lh || null;
}
