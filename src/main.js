import { Game } from './core/Game.js';
import { Minimap } from './ui/Minimap.js';
import { Lobby } from './ui/Lobby.js';
import { WeaponSwitch } from './ui/WeaponSwitch.js';
import { KillFeed } from './ui/KillFeed.js';
import { SettingsPanel, applyCrosshair } from './ui/Settings.js';
import { getLoadout } from './ui/Loadout.js';
import { Inventory } from './ui/Inventory.js';
import { net } from './net/Net.js';
import { OnlinePanel } from './ui/OnlinePanel.js';
import { setupInstall } from './ui/Install.js';
import { Music } from './ui/Music.js';
import { MenuFx } from './ui/MenuFx.js';
import { setPlayerId, addXp, myRankCell } from './ui/Ranks.js';
import { RanksPanel } from './ui/RanksPanel.js';

const $ = id => document.getElementById(id);
const show = (id, on) => $(id).classList.toggle('hidden', !on);
const err = $('err');
const report = m => { err.textContent = 'Erro: ' + m; err.classList.remove('hidden'); };
addEventListener('error', e => report(e.message));
addEventListener('unhandledrejection', e => report(String(e.reason)));

const game = new Game($('view'));
window.__game = game;
// teste automático (só com ?autotest na URL): roda tools/fpcheck.js e escreve o resultado na página (para rodar sem ninguém olhando)
if (new URLSearchParams(location.search).has('autotest')) import('../tools/fpcheck.js').then(async T => {
  const out = document.createElement('pre'); out.id = '__report'; document.body.appendChild(out);
  let r; try { const ids = new URLSearchParams(location.search).get('autotest'); r = await T.run(ids ? ids.split(',') : undefined); }
  catch (e) { r = { erro: String(e && e.stack || e) }; }
  r.quando = new Date().toISOString(); out.textContent = 'REPORT ' + JSON.stringify(r);
  fetch('api/test-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) }).catch(() => {});
});
if (new URLSearchParams(location.search).has('autoshot')) import('../tools/fpcheck.js').then(async T => {
  let r; try { r = { shots: await T.shots(new URLSearchParams(location.search).get('autoshot') || 'knife') }; } catch (e) { r = { erro: String(e && e.stack || e) }; }
  r.quando = new Date().toISOString();
  fetch('api/test-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) }).catch(() => {});
});
// modelos (mapa, Izzy, bot, animações) carregam uma vez ao abrir a página
const loadInfo = $('loadInfo');
game.assets.load(p => { loadInfo.textContent = 'Carregando mapa, personagens e animações… ' + Math.round(p * 100) + '%'; })
  .then(() => { loadInfo.textContent = 'Pronto para jogar.'; loadInfo.classList.add('ok'); })
  .catch(e => { loadInfo.textContent = 'Falha ao carregar os modelos.'; report('Falha ao carregar modelos: ' + (e?.message || e) + ' (confira a pasta assets e se o servidor foi aberto na pasta do jogo)'); });
let settingsFrom = 'menu', minimap = null, slotsKey = '', hitTimer = 0;
const wSwitch = new WeaponSwitch($('wswitch'));
const killFeed = new KillFeed($('feed'), $('killbanner'), game.audio, game.announcer);
const NAMES = { competitive: 'COMPETITIVO', deathmatch: 'MATA-MATA', training: 'TREINO' };

game.hooks.onPause = () => { pausePanel.refresh(); $('restart').classList.toggle('hidden', !!game.online); show('pause', true); };   // online: sem 'Reiniciar' (só reiniciaria para você)
game.hooks.onResume = () => show('pause', false);
game.hooks.onStart = map => { minimap = new Minimap($('minimap'), map); slotsKey = ''; };
game.hooks.onHit = e => {   // marcador de acerto no centro da tela
  const el = $('hitmark'); el.classList.toggle('kill', e.kill); el.classList.toggle('head', e.zone === 'head');
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(hitTimer); hitTimer = setTimeout(() => el.classList.remove('on'), 160);
  game.audio.play('hit', { gain: e.zone === 'head' ? .6 : .35 });
};
const retrigger = (el, cls = 'on') => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
game.hooks.onDamage = e => {   // vinheta vermelha e seta apontando de onde veio o tiro
  retrigger($('dmg')); $('dmgdir').style.setProperty('--r', e.angle.toFixed(3) + 'rad'); retrigger($('dmgdir'));
  game.audio.play(game.audio.has('bullet_onme_sound') ? 'bullet_onme_sound' : 'hurt', { gain: 1 });   // som de levar tiro
};
game.hooks.onKill = e => killFeed.add(e);   // feed estilizado + selo de abate do jogador (ui/KillFeed.js)
game.hooks.onPlayerDeath = e => {
  $('deadBy').textContent = e.by ? 'por ' + e.by + (e.head ? ' (tiro na cabeça)' : '') : ''; show('dead', true);
};
game.hooks.onRespawn = () => show('dead', false);

/* ---------- treino no stand de tiro: aviso do E, dano nos bots e menu (bots e armas) ---------- */
const ZONE = { head: 'CABEÇA', body: 'CORPO', limb: 'BRAÇO/PERNA' };
game.hooks.onRangePrompt = on => show('rangePrompt', on && !game.range?.menuOpen);
game.hooks.onRangeHit = e => {
  const box = $('rangeHits'), el = document.createElement('div');
  el.className = 'rh' + (e.zone === 'head' ? ' head' : ''); el.innerHTML = `-${e.damage}<small>${ZONE[e.zone] || ''} · total ${e.total}</small>`;
  box.appendChild(el); while (box.children.length > 5) box.firstChild.remove(); setTimeout(() => el.remove(), 900);
};
function drawRangeMenu(st) {
  if (!st) return;
  const bot = (id, on, name, desc) => `<button class="rm-bot${on ? ' on' : ''}" data-bot="${id}"><b>${name}</b><span>${desc}</span><i>${on ? '● LIGADO' : '○ desligado'}</i></button>`;
  const stat = id => { const s = st.stats.find(x => x.id === id); return s && s.hits ? ` · ${s.hits} acertos, ${s.total} de dano` : ''; };
  $('rmBots').innerHTML = bot('still', st.still, 'BOT PARADO', 'No fundo do corredor, na frente do alvo' + stat('still'))
    + bot('walk', st.walk, 'BOT ANDANDO', 'Anda de um lado para o outro (só para os lados)' + stat('walk'));
  $('rmWeapons').innerHTML = st.weapons.map(w => `<button class="rm-w${w.id === st.weapon ? ' cur' : ''}${st.loadout.includes(w.id) ? ' have' : ''}" data-w="${w.id}">${w.name}<small>${w.kind}${st.loadout.includes(w.id) ? ' · tecla ' + (st.loadout.indexOf(w.id) + 1) : ''}</small></button>`).join('');
}
game.hooks.onRangeMenu = (open, st) => {
  show('rangeMenu', open); if (open) show('rangePrompt', false); else if (game.range?.near) show('rangePrompt', true);
  drawRangeMenu(st);
};
$('rangeMenu').addEventListener('click', e => {
  const r = game.range; if (!r) return;
  const b = e.target.closest('[data-bot]'), w = e.target.closest('[data-w]');
  if (b) { r.setBot(b.dataset.bot, !(b.dataset.bot === 'still' ? r.still.on : r.walker.on)); game.audio.play('beep', { gain: .3 }); }
  else if (w) { r.giveWeapon(w.dataset.w); game.audio.play('beep', { gain: .3 }); r.closeMenu(); }   // escolheu a arma: volta ao treino já sacando ela
  else if (e.target.id === 'rmClose') r.closeMenu();
});
addEventListener('keydown', e => {   // menu do treino aberto: E ou Esc fecham e voltam ao jogo
  if (!game.range?.menuOpen || e.repeat) return;
  if (e.code === 'KeyE' || e.code === 'Escape') { e.preventDefault(); game.range.closeMenu(); }
});
game.hooks.onFrame = s => {
  minimap?.draw({ x: s.x, z: s.z, yaw: s.yaw });
  $('hudFps').textContent = s.fps + ' FPS';
  const t = Math.floor(s.time);
  $('hudTime').textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  $('hudHealth').textContent = s.health; $('hudHealth').classList.toggle('low', s.health < 30);
  if (s.deadIn > 0) $('deadT').textContent = 'Reaparece em ' + Math.ceil(s.deadIn);
  if (s.score) $('hudScore').textContent = s.score.kills + ' abates · ' + s.score.deaths + ' mortes';
  $('hudInfo').textContent = s.speed.toFixed(1) + ' m/s' + (s.crouch ? ' · agachado' : '') + (s.grounded ? '' : ' · no ar');
  if (s.weapon) drawWeapon(s.weapon);
};

function drawWeapon(w) {
  wSwitch.update(w);
  $('wName').textContent = w.name; $('wKind').textContent = w.kind;
  $('wMag').textContent = w.melee ? '' : w.mag; $('wRes').textContent = w.melee ? '' : '/ ' + w.reserve;
  $('wMag').classList.toggle('low', !w.melee && w.mag <= Math.ceil(w.cap * .25));
  const key = w.slots.map(x => x.id + (x.cur ? '*' : '')).join();
  if (key !== slotsKey) {   // só reconstrói a barra quando a arma muda
    slotsKey = key;
    $('wSlots').innerHTML = w.slots.map(x => `<li class="${x.cur ? 'cur' : ''}${x.owned ? '' : ' off'}"><b>${x.n}</b>${x.name}</li>`).join('');
  }
  const rb = $('hudReload'); rb.classList.toggle('hidden', w.reloadP < 0); if (w.reloadP >= 0) rb.firstElementChild.style.width = (w.reloadP * 100).toFixed(0) + '%';
  const dot = w.aiming && game.player?.aim > .95 && w.zoomed;   // ponto vermelho só com o zoom já assentado (a janela não muda de tamanho)   // mira pela Vector: ponto vermelho no lugar da cruz
  $('scope').classList.toggle('hidden', !w.scoped); $('cross').classList.toggle('hidden', w.scoped || dot); $('reddot').classList.toggle('hidden', !dot);
  const pxPerRad = innerHeight / (2 * Math.tan(game.camera.fov * Math.PI / 360));   // abertura da mira = dispersão atual
  $('cross').style.setProperty('--g', game.settings.chDynamic ? Math.min(60, w.spread * pxPerRad).toFixed(1) + 'px' : '0px');
  // a mira fica fixa no centro da tela: o recuo mexe a câmera (o centro é sempre para onde o tiro vai)
}

function openSettings(from) { settingsFrom = from; menuPanel.refresh(); show(from, false); show('settings', true); }
// mochila / inventário (tela cheia): abre pela sala (aba Mochila) e pelo menu principal
let bagFrom = null;
const inventory = new Inventory($('inventory'), {
  assets: game.assets, beep: () => { game.audio.init(); game.audio.play('beep'); },
  onEquip: (L, name) => { if (bagFrom === 'lobby') lobby.logEquip(name); },
  onClose: () => { if (bagFrom === 'lobby') { lobby.afterBag(); pushMe(); } else show('menu', true); bagFrom = null; }
});
function openBag(from) { bagFrom = from; if (from === 'menu') show('menu', false); inventory.open(); }
$('openBag').onclick = () => openBag('menu');
setupInstall($('installBtn'), t => { const el = $('loadInfo'); el.textContent = t; });

/* ---------- ONLINE (amigos pela internet, grátis: src/net/Net.js) ---------- */
window.__net = net;
// ONLINE: fica dentro da sala, na aba "Adicionar" (ID, amigos, convites). O anfitrião aperta JOGAR para jogar com os amigos.
const addEl = document.createElement('div');
const openRoomLobby = () => { ['menu', 'online', 'pause', 'hud', 'dead', 'settings'].forEach(id => show(id, false)); lobby.open('deathmatch', 'add'); show('lobby', true); };
const onlinePanel = new OnlinePanel(addEl, $('onToast'), net, {
  beep: () => { game.audio.init(); game.audio.play('beep'); },
  onShow: () => { if (!game.running) openRoomLobby(); },   // aceitou um convite: vai para a sala, aba Adicionar
  onStart: cfg => {   // o anfitrião apertou JOGAR: todos entram na partida
    if (!game.assets.ready) { onlinePanel.say('Ainda carregando os modelos… tente de novo em instantes.', 'warn'); return; }
    lobby.close(); show('lobby', false);
    const slot = Math.max(0, (cfg.roster || []).findIndex(p => p.id === net.id));
    startMode('deathmatch', { mode: 'deathmatch', title: 'ONLINE · MATA-MATA', me: { name: net.name, team: 'ffa' }, loadout: getLoadout(), players: [],
      online: { net, roster: cfg.roster || [], slot } });
  },
  onLost: why => { if (game.running && game.online) { game.stop(); openRoomLobby(); } onlinePanel.say(why, 'warn'); }
}, { compact: true });
onlinePanel.isOpen = true; onlinePanel.render(); setInterval(() => { if (!game.running) net.pingAll(); }, 12000);
net.on('end', () => { if (game.running && game.online) { game.stop(); openRoomLobby(); onlinePanel.say('A partida online terminou.', 'warn'); } });
// PATENTES: conta do criador (ID do dono) tem todas; XP entra ao sair de cada partida
setPlayerId(net.id);
const pushMe = () => { const L = getLoadout(); net.updateMe({ skin: L.skin, primary: L.primary, secondary: L.secondary, melee: L.melee, rank: myRankCell() }); };
const ranksPanel = new RanksPanel($('ranks'), { beep: () => { game.audio.init(); game.audio.play('beep'); }, onPick: () => { lobby.refresh(); pushMe(); } });
game.onXp = r => {
  const ups = addXp(r.xp);
  setTimeout(() => {   // aparece no chat da sala ao voltar
    lobby.note(`+${r.xp} XP (${r.kills} abate${r.kills === 1 ? '' : 's'}, ${r.minutes} min).`, 'ok');
    ups.forEach(u => lobby.note(`NOVA PATENTE: ${u.name}!`, 'ok'));
    if (ups.length) { lobby.refresh(); pushMe(); }
  }, 300);
};
let roomIds = [];
net.on('room', r => {   // avisos no chat da sala: quem entrou / saiu
  const ids = r ? r.players.map(p => p.id) : [];
  if (r) { r.players.filter(p => !roomIds.includes(p.id) && p.id !== net.id).forEach(p => lobby.note(`${p.name} entrou na sala.`, 'ok')); }
  roomIds.filter(id => !ids.includes(id) && id !== net.id).forEach(() => lobby.note('Um jogador saiu da sala.'));
  if (!r && roomIds.length) lobby.note('Sala online fechada.');
  roomIds = ids; lobby.refresh();
});
net.on('chat', m => lobby.addChat(m.name || 'Amigo', m.text, m.from === net.id || !m.from));
net.start().then(() => { net.pingAll(); onlinePanel.render(); });   // fica online já ao abrir o jogo (para receber convites)
window.__menuFx = new MenuFx($('menu'), () => game.settings.volume);   // faíscas, luzes e som ao passar o mouse
window.__music = new Music(() => game.settings.volume);   // música ambiente: sala e partida
const lobby = new Lobby($('lobby'), {
  assets: game.assets,   // personagem em 3D na sala
  openInventory: () => openBag('lobby'),
  onStart: cfg => { if (net.isHost() && net.room.players.length >= 2) { net.setName(cfg.me?.name || net.name); net.startMatch({ mode: 'deathmatch' }); } else startMode(cfg.mode, cfg); },
  onExit: () => { if (net.room) net.leaveRoom(); show('lobby', false); show('menu', true); },
  onSettings: () => openSettings('lobby'),
  beep: () => { game.audio.init(); game.audio.play('beep'); },
  addPanel: () => addEl,
  getName: () => net.name !== 'Jogador' ? net.name : null,
  onName: v => { net.setName(v); clearTimeout(window.__nmT); window.__nmT = setTimeout(pushMe, 600); },
  openRanks: () => ranksPanel.open(),
  online: () => net.room ? { host: net.isHost(), hostName: net.room.hostName, count: net.room.players.length, players: net.room.players, myId: net.id, hostId: net.room.host } : null,
  sendChat: (who, t) => net.room ? net.sendChat(who, t) : false
});

async function startMode(mode, cfg) {
  if (!game.assets.ready) return;
  if (mode === 'training' && !game.assets.range) {   // treino: o mapa do stand de tiro carrega na primeira vez
    show('menu', true); loadInfo.classList.remove('ok'); loadInfo.textContent = 'Carregando o stand de tiro… 0%';
    try { await game.assets.loadRange(p => { loadInfo.textContent = 'Carregando o stand de tiro… ' + Math.round(p * 100) + '%'; }); }
    catch (e) { loadInfo.textContent = 'Falha ao carregar o stand de tiro.'; report('Falha ao carregar o stand de tiro: ' + (e?.message || e)); return; }
    loadInfo.textContent = 'Pronto para jogar.'; loadInfo.classList.add('ok');
  }
  ['menu', 'lobby', 'pause', 'settings', 'dead'].forEach(id => show(id, false)); show('hud', true);
  killFeed.reset(); wSwitch.reset(); $('hudScore').textContent = '';
  $('hudMode').textContent = cfg?.title || NAMES[mode];
  game.start(mode, cfg);
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  if (!game.assets.ready) { loadInfo.classList.remove('pulse'); void loadInfo.offsetWidth; loadInfo.classList.add('pulse'); return; }   // espera os modelos
  const m = b.dataset.mode; show('menu', false);
  if (m === 'training') startMode(m, { mode: m, title: 'TREINO', me: { name: 'Jogador' }, loadout: getLoadout() });  // treino é solo: sem sala
  else { lobby.open(m); show('lobby', true); }
}));
$('resume').onclick = () => game.resume();
$('restart').onclick = () => startMode(game.mode, game.config);
$('toLobby').onclick = () => {
  if (game.online) { if (net.isHost()) net.endMatch(); game.stop(); openRoomLobby(); return; }   // online: volta para a tela Online (a sala continua)
  game.stop(); show('pause', false); show('hud', false);
  if (game.mode === 'training') show('menu', true); else { lobby.open(game.mode); show('lobby', true); }
};
$('toMenu').onclick = () => { if (game.online && net.isHost()) net.endMatch(); game.stop(); lobby.close(); show('pause', false); show('hud', false); show('menu', true); };
$('openSettings').onclick = () => openSettings('menu');
// Lab: só aparece no PC do dono (jogo aberto pelo servidor local); no site publicado ele nem é enviado.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) $('openLab').classList.remove('hidden');
$('openLab').onclick = () => { location.href = 'lab.html?v=' + Date.now(); };   // ajustar a arma na mão (cena por cena)
$('closeSettings').onclick = () => { show('settings', false); show(settingsFrom, true); };

// configurações: no menu e na pausa (Esc) — a mira do HUD muda junto
const onSet = k => { if (k.startsWith('ch')) applyCrosshair($('cross'), game.settings); };
const menuPanel = new SettingsPanel($('settingsBody'), game, onSet);
const pausePanel = new SettingsPanel($('pauseSettingsBody'), game, onSet);
applyCrosshair($('cross'), game.settings);
