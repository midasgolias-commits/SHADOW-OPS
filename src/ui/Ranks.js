/**
 * PATENTES: recompensas por jogar. Cada partida dá XP (abates, tempo jogado, terminar a partida);
 * com XP suficiente a próxima patente é desbloqueada, e cada patente pede mais XP que a anterior.
 * Ícones: assets/ui/ranks/ranks.jpg (13 colunas x 7 linhas, recortados da arte). A conta do criador tem todas liberadas.
 * Fica salvo no navegador (como o ID). No online, cada jogador manda a patente que está usando.
 */
const KEY_XP = 'so_xp', KEY_PICK = 'so_rank_pick';
/** IDs do dono do jogo (conta de criador). No PC do dono (servidor local) também vale. */
export const OWNER_IDS = ['SO-F2YG-6KVN'];

const roman = n => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'][n - 1];
// [linha, primeira coluna, quantidade, nome, grupo]
const PLAN = [
  [0, 0, 1, 'Novato', 'Categorias'], [0, 1, 4, 'Recruta', 'Categorias'], [0, 5, 8, 'Soldado', 'Categorias'],
  [1, 0, 8, 'Cabo', 'Patentes azuis'], [1, 8, 5, 'Sargento', 'Patentes azuis'],
  [2, 0, 7, 'Subtenente', 'Patentes azuis'], [2, 7, 6, 'Tenente', 'Patentes azuis'],
  [3, 0, 7, 'Capitão', 'Patentes vermelhas'], [3, 7, 6, 'Major', 'Patentes vermelhas'],
  [4, 0, 4, 'Tenente-Coronel', 'Alto escalão'], [4, 4, 9, 'Coronel', 'Alto escalão'],
  [5, 0, 9, 'General', 'Mestre'], [6, 0, 13, 'Mestre Supremo', 'Supremo mestre']
];
/** patentes em ordem de progressão (87) */
export const RANKS = [];
for (const [r, c0, n, name, group] of PLAN) for (let i = 0; i < n; i++) RANKS.push({ cell: r * 13 + c0 + i, name: n > 1 ? `${name} ${roman(i + 1)}` : name, group });
/** funções especiais (só o criador): não fazem parte da progressão */
export const FUNCS = [{ cell: 5 * 13 + 9, name: 'Médico de Combate' }, { cell: 5 * 13 + 10, name: 'Granadeiro' }, { cell: 5 * 13 + 11, name: 'GM (Game Master)' }, { cell: 5 * 13 + 12, name: 'Moderador' }];
RANKS.forEach((r, i) => { r.i = i; r.need = totalXp(i); });

/** XP para ir da patente i para a i+1 (vai aumentando) */
export function stepXp(i) { return 400 + 200 * i; }
/** XP total para chegar na patente i */
export function totalXp(i) { return 400 * i + 100 * i * (i - 1); }

const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let ownerId = null;
export function setPlayerId(id) { ownerId = id; }
export function isOwner() { return OWNER_IDS.includes(ownerId) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname); }
export const getXp = () => Math.max(0, +get(KEY_XP, 0) || 0);
/** patente conquistada (pelo XP) */
export function earnedRank(xp = getXp()) { let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1].need) i++; return i; }
/** a célula do ícone está liberada? */
export function unlocked(cell) {
  if (isOwner()) return true;
  const r = RANKS.find(x => x.cell === cell); return !!r && r.i <= earnedRank();
}
/** ícone que o jogador está usando (o escolhido, se liberado; senão o maior conquistado; criador: o maior de todos) */
export function myRankCell() {
  const p = get(KEY_PICK, null);
  if (p != null && unlocked(p)) return p;
  return isOwner() ? RANKS[RANKS.length - 1].cell : RANKS[earnedRank()].cell;
}
export function pickRank(cell) { if (unlocked(cell)) put(KEY_PICK, cell); }
export function rankName(cell) { return (RANKS.find(r => r.cell === cell) || FUNCS.find(r => r.cell === cell))?.name || ''; }
/** soma XP; devolve as patentes novas conquistadas */
export function addXp(n) {
  const before = earnedRank(); put(KEY_XP, getXp() + Math.max(0, Math.round(n))); const after = earnedRank();
  return RANKS.slice(before + 1, after + 1);
}
/** ícone para o HTML (recorte do atlas). size em px. */
export function rankIcon(cell, size = 26, title = true) {
  const c = cell % 13, r = Math.floor(cell / 13);
  return `<i class="rk" style="width:${size}px;height:${size}px;background-position:${(c * 100 / 12).toFixed(3)}% ${(r * 100 / 6).toFixed(3)}%"${title ? ` title="${rankName(cell)}"` : ''}></i>`;
}
/** patente "de enfeite" para os bots (fixa pelo nome) */
export function botRankCell(name) { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return RANKS[3 + h % 40].cell; }
