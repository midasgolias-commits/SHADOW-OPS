import { WEAPONS } from '../weapons/Weapons.js';

/**
 * Mochila: o que o jogador leva para a partida (salvo no navegador).
 * Na partida só existem 3 armas: principal (tecla 1), secundária (2) e arma branca (3).
 * Trocar o que está equipado só fora da partida (sala → Mochila).
 */
export const SKINS = [
  { id: 'izzy', name: 'IZZY', desc: 'Operadora de assalto. Sua personagem.' },
  { id: 'bot', name: 'AGENTE MASCARADO', desc: 'O uniforme dos bots.' }
];
export const SLOTS = [
  { k: 'primary', label: 'Principal', key: 1, ids: ['rifle', 'aug', 'smg', 'sniper', 'shotgun'] },
  { k: 'secondary', label: 'Secundária', key: 2, ids: ['pistol'] },
  { k: 'melee', label: 'Arma branca', key: 3, ids: ['knife', 'karambit'] }
];
const LS = 'shadowops.loadout';
const DEF = { skin: 'izzy', primary: 'rifle', secondary: 'pistol', melee: 'knife' };

export function getLoadout() {
  let s = {}; try { s = JSON.parse(localStorage.getItem(LS) || '{}'); } catch {}
  const L = { ...DEF, ...s };
  for (const sl of SLOTS) if (!sl.ids.includes(L[sl.k])) L[sl.k] = DEF[sl.k];
  if (!SKINS.some(x => x.id === L.skin)) L.skin = DEF.skin;
  return L;
}
export function setLoadout(patch) {
  const L = { ...getLoadout(), ...patch };
  try { localStorage.setItem(LS, JSON.stringify(L)); } catch {}
  return L;
}
/** Lista de armas na ordem das teclas 1, 2, 3. */
export const loadoutWeapons = L => SLOTS.map(s => L[s.k]).filter(id => WEAPONS[id]);
