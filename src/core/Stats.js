/**
 * Estatísticas de carreira (como a aba "Carreira" do PUBG): soma de todas as partidas + as últimas partidas.
 * Game.js chama recordMatch() uma vez por partida (no stop(): fim da partida ou saída no meio). O menu lê getStats().
 * Guardado no localStorage em 'shadowops.stats' (+ '.perfil' com ?perfil=, igual ao Net.js: duas abas de teste não se misturam).
 * O treino não conta; partida com menos de 30 s e nenhum abate também não.
 */
const PERFIL = typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('perfil') || '').replace(/[^a-z0-9]/gi, '').slice(0, 8) : '';
const KEY = 'shadowops.stats' + (PERFIL ? '.' + PERFIL : '');
const MODES = ['competitive', 'deathmatch'];
const MAX_RECENT = 50;   // guardadas; getStats() devolve só as 20 mais novas
const SHOW_RECENT = 20;
const MIN_MINUTES = .5;  // 30 s

const blank = () => ({ matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0, headshots: 0, damage: 0, minutes: 0, bestKills: 0 });
const empty = () => ({ total: blank(), byMode: { competitive: blank(), deathmatch: blank() }, recent: [] });
const num = v => (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0;
const fixS = s => { const o = blank(); if (s && typeof s === 'object') for (const k in o) o[k] = num(s[k]); return o; };

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (!d || typeof d !== 'object') return empty();
    return { total: fixS(d.total), byMode: { competitive: fixS(d.byMode?.competitive), deathmatch: fixS(d.byMode?.deathmatch) },
      recent: Array.isArray(d.recent) ? d.recent.filter(r => r && typeof r === 'object').slice(0, MAX_RECENT) : [] };
  } catch { return empty(); }
}
function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }

function add(S, r) {
  S.matches++; if (r.won === true) S.wins++;
  S.kills += r.kills; S.deaths += r.deaths; S.assists += r.assists; S.headshots += r.headshots; S.damage += r.damage;
  S.minutes = Math.round((S.minutes + r.minutes) * 100) / 100;
  if (r.kills > S.bestKills) S.bestKills = r.kills;
}

/** r = { mode:'competitive'|'deathmatch'|'training', map, kills, deaths, assists, headshots, damage, won: bool|null, minutes: float, online: bool } */
export function recordMatch(r) {
  if (!r || !MODES.includes(r.mode)) return false;   // treino (ou modo desconhecido): não conta
  const int = v => Math.round(num(v));
  const rec = { mode: r.mode, map: String(r.map || ''), kills: int(r.kills), deaths: int(r.deaths), assists: int(r.assists),
    headshots: int(r.headshots), damage: int(r.damage), won: typeof r.won === 'boolean' ? r.won : null,
    minutes: Math.round(num(r.minutes) * 100) / 100, online: !!r.online, t: Date.now() };
  if (rec.headshots > rec.kills) rec.headshots = rec.kills;   // headshots = abates na cabeça
  if (num(r.minutes) < MIN_MINUTES && !rec.kills) return false;   // entrou e saiu na hora: não conta
  const d = load();
  add(d.total, rec); add(d.byMode[rec.mode], rec);
  d.recent.unshift(rec); d.recent.length = Math.min(d.recent.length, MAX_RECENT);
  save(d);
  return true;
}

/** { total: S, byMode: { competitive: S, deathmatch: S }, recent: [até 20, mais nova primeiro] }. Sempre com todas as chaves (zeros se vazio). */
export function getStats() {
  const d = load();
  return { total: d.total, byMode: d.byMode, recent: d.recent.slice(0, SHOW_RECENT).map(r => ({ ...r })) };
}

/** KDA = (abates + assistências) / mortes (mínimo 1), com 2 casas. */
export function kda(S) { return Math.round((num(S?.kills) + num(S?.assists)) / Math.max(1, num(S?.deaths)) * 100) / 100; }
/** % de abates na cabeça (0..100, inteiro). */
export function hsRate(S) { const k = num(S?.kills); return k ? Math.min(100, Math.round(num(S?.headshots) / k * 100)) : 0; }

export function resetStats() { try { localStorage.removeItem(KEY); } catch {} }
