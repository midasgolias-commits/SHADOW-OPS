/**
 * AVATARES (a "fotinha" do jogador, como o emblema/ícone de perfil do PUBG): emblemas desenhados em SVG, sem arquivos de imagem.
 * Aparecem no canto de cima (perfil), nas vagas do grupo e no Customizar → Perfil. A escolha fica salva no navegador.
 */
const PERFIL = (new URLSearchParams(location.search).get('perfil') || '').replace(/[^a-z0-9]/gi, '').slice(0, 8);
const LS = 'shadowops.profile' + (PERFIL ? '.' + PERFIL : '');

// glyph = desenho (viewBox 0 0 64 64), bg = duas cores do fundo, rarity igual às skins
export const AVATARS = [
  { id: 'mira', name: 'Mira', bg: ['#2b3a4a', '#11171d'], fg: '#e6c766', rarity: 'comum',
    glyph: '<circle cx="32" cy="32" r="15" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 8v14M32 42v14M8 32h14M42 32h14" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="32" r="3" fill="currentColor"/>' },
  { id: 'caveira', name: 'Caveira', bg: ['#3b2230', '#140b10'], fg: '#f1e9e9', rarity: 'raro',
    glyph: '<path d="M32 10c-11 0-19 8-19 18 0 6 3 10 7 12v8h24v-8c4-2 7-6 7-12 0-10-8-18-19-18Z" fill="currentColor"/><circle cx="24.5" cy="29" r="5" fill="#140b10"/><circle cx="39.5" cy="29" r="5" fill="#140b10"/><path d="M29 38l3-5 3 5Z" fill="#140b10"/><path d="M26 48v6M32 48v6M38 48v6" stroke="#140b10" stroke-width="2.5"/>' },
  { id: 'lobo', name: 'Lobo', bg: ['#1f3346', '#0b131a'], fg: '#9fc7ff', rarity: 'epico',
    glyph: '<path d="M14 12l10 10h16l10-10 2 20-6 10-14 12-14-12-6-10Z" fill="currentColor"/><path d="M23 33l6 3M41 33l-6 3" stroke="#0b131a" stroke-width="3.5" stroke-linecap="round"/><path d="M28 45h8l-4 4Z" fill="#0b131a"/>' },
  { id: 'aguia', name: 'Águia', bg: ['#4a3a1c', '#17110a'], fg: '#e6c766', rarity: 'lendario',
    glyph: '<path d="M6 26c8-2 16 0 22 6l4-10 4 10c6-6 14-8 22-6-6 4-10 10-12 16l-6-4-8 12-8-12-6 4c-2-6-6-12-12-16Z" fill="currentColor"/><circle cx="32" cy="18" r="5" fill="currentColor"/>' },
  { id: 'raio', name: 'Raio', bg: ['#3a2f12', '#120f06'], fg: '#ffd84a', rarity: 'comum',
    glyph: '<path d="M36 6 14 36h14l-4 22 24-32H34Z" fill="currentColor"/>' },
  { id: 'chamas', name: 'Chamas', bg: ['#4a1d12', '#160805'], fg: '#ff8a3d', rarity: 'raro',
    glyph: '<path d="M32 6c4 10 14 14 14 28a14 14 0 0 1-28 0c0-7 4-11 7-14 0 6 3 9 6 9-4-8-2-16 1-23Z" fill="currentColor"/><path d="M32 34c3 4 6 6 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z" fill="#160805"/>' },
  { id: 'adaga', name: 'Adaga', bg: ['#26323a', '#0c1114'], fg: '#d7e0e6', rarity: 'comum',
    glyph: '<path d="M32 4l6 30H26Z" fill="currentColor"/><path d="M20 34h24v4H20Z" fill="currentColor"/><path d="M29 38h6v14h-6Z" fill="currentColor"/><circle cx="32" cy="56" r="4" fill="currentColor"/>' },
  { id: 'coroa', name: 'Coroa', bg: ['#3d2c4f', '#120c18'], fg: '#e6c766', rarity: 'lendario',
    glyph: '<path d="M10 22l12 10 10-18 10 18 12-10-6 26H16Z" fill="currentColor"/><path d="M16 52h32v4H16Z" fill="currentColor"/>' },
  { id: 'escudo', name: 'Escudo', bg: ['#1c3a2c', '#09140f'], fg: '#7fdc9a', rarity: 'raro',
    glyph: '<path d="M32 6l20 7v15c0 14-9 25-20 30C21 53 12 42 12 28V13Z" fill="currentColor"/><path d="M32 16l3 7h7l-6 5 2 8-6-4-6 4 2-8-6-5h7Z" fill="#09140f"/>' },
  { id: 'alvo', name: 'Alvo', bg: ['#40171b', '#150708'], fg: '#ff5a5f', rarity: 'comum',
    glyph: '<circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="32" r="12" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="32" r="4" fill="currentColor"/>' },
  { id: 'cobra', name: 'Cobra', bg: ['#22361a', '#0a1207'], fg: '#a7e05a', rarity: 'epico',
    glyph: '<path d="M44 12c-8-4-20 0-20 8s20 6 20 16-14 14-24 10" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="46" cy="13" r="5" fill="currentColor"/><path d="M50 12l6-2-4 5" fill="currentColor"/>' },
  { id: 'fantasma', name: 'Fantasma', bg: ['#2a2f3d', '#0d0f15'], fg: '#e9edf1', rarity: 'epico',
    glyph: '<path d="M14 54V28a18 18 0 0 1 36 0v26l-6-5-6 5-6-5-6 5-6-5Z" fill="currentColor"/><ellipse cx="25" cy="29" rx="3.5" ry="5" fill="#0d0f15"/><ellipse cx="39" cy="29" rx="3.5" ry="5" fill="#0d0f15"/>' }
];
export const RARITY = { lendario: { name: 'Lendário', c: '#e6b84a' }, epico: { name: 'Épico', c: '#b678f0' }, raro: { name: 'Raro', c: '#5aa0ff' }, comum: { name: 'Comum', c: '#9aa4ad' } };

export function getProfile() { let p = {}; try { p = JSON.parse(localStorage.getItem(LS) || '{}'); } catch {} if (!AVATARS.some(a => a.id === p.avatar)) p.avatar = AVATARS[0].id; return p; }
export function setProfile(patch) { const p = { ...getProfile(), ...patch }; try { localStorage.setItem(LS, JSON.stringify(p)); } catch {} return p; }

/** SVG do avatar (quadrado), pronto para innerHTML */
export function avatarSVG(id, size = 40) {
  const a = AVATARS.find(x => x.id === id) || AVATARS[0], g = 'g' + a.id;
  return `<svg class="avatar" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" style="color:${a.fg}">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.bg[0]}"/><stop offset="1" stop-color="${a.bg[1]}"/></linearGradient></defs>
    <rect width="64" height="64" fill="url(#${g})"/>${a.glyph}</svg>`;
}
