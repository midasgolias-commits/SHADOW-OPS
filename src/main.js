import { Game, getFavela } from './core/Game.js';
import { Minimap } from './ui/Minimap.js';
import { Lobby } from './ui/Lobby.js';
import { WeaponSwitch } from './ui/WeaponSwitch.js';
import { KillFeed } from './ui/KillFeed.js';
import { SettingsPanel, applyCrosshair } from './ui/Settings.js';
import { getLoadout } from './ui/Loadout.js';
import { net } from './net/Net.js';
import { OnlinePanel } from './ui/OnlinePanel.js';
import { setupInstall } from './ui/Install.js';
import { MenuFx } from './ui/MenuFx.js';
import { setPlayerId, addXp, myRankCell } from './ui/Ranks.js';
import { CustomRoom } from './ui/CustomRoom.js';
import { PartyBar } from './ui/PartyBar.js';
import { NotifyCenter } from './ui/NotifyCenter.js';
import { Wardrobe } from './ui/Wardrobe.js';
import { getProfile } from './ui/Avatars.js';
import { Boot } from './ui/Boot.js';
import { FrontMenu } from './ui/FrontMenu.js';
import { TeamPicker } from './ui/TeamPicker.js';

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
// modelos (mapa, Izzy, bot, animações) carregam uma vez ao abrir a página.
// A tela de carregamento fica na frente até tudo chegar; só depois o menu principal aparece.
const boot = new Boot($('boot'));
const loadInfo = $('loadInfo');
let front = null;   // menu principal novo (criado mais abaixo, depois da sala)
const TITLE_LOAD = '';   // tela de carregamento: sem texto fixo, usa as etapas automáticas do Boot.js
boot.show(TITLE_LOAD);
game.assets.load(p => boot.set(p, TITLE_LOAD))
  .then(() => { boot.done(); loadInfo.textContent = ''; loadInfo.classList.add('ok');
    front?.show();
    // já baixa em segundo plano os braços+arma de 1ª pessoa do personagem escolhido (pistola e AK): na partida eles já estão prontos
    const sk = getLoadout().skin; game.assets.loadKit?.('p9', sk).catch(() => {}); game.assets.loadKit?.('ak', sk).catch(() => {}); })
  .catch(e => { loadInfo.textContent = 'Falha ao carregar os modelos.';
    boot.error('Falha ao carregar os modelos: ' + (e?.message || e) + ' — confira a pasta assets e se o servidor foi aberto na pasta do jogo.');
    report('Falha ao carregar modelos: ' + (e?.message || e) + ' (confira a pasta assets e se o servidor foi aberto na pasta do jogo)'); });
// ir e voltar do menu principal (liga/desliga o personagem 3D junto)
const showMenu = () => { show('menu', true); front?.show(); };
const hideMenu = () => { show('menu', false); front?.hide(); };
let settingsFrom = 'menu', minimap = null, slotsKey = '', hitTimer = 0;
const wSwitch = new WeaponSwitch($('wswitch'));
const killFeed = new KillFeed($('feed'), $('killbanner'), game.audio, game.announcer);
const NAMES = { competitive: 'MODO FAVELA', deathmatch: 'MATA-MATA', training: 'TREINO' };

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
  const nh = $('nadeHud'), n = s.nade;   // granada: quantidade e dica (tecla 4 / G)
  if (!n) nh.innerHTML = ''; else {
    const key = (n.equipped ? 'on' : '') + n.left + (n.cooking ? 'c' : '');
    if (nh.dataset.k !== key) { nh.dataset.k = key; nh.className = 'nade-hud' + (n.equipped ? ' on' : '') + (n.left <= 0 ? ' empty' : '');
      nh.innerHTML = `<b>4</b> GRANADA <i>${n.left === Infinity ? '∞' : '×' + n.left}</i>` + (n.equipped ? `<small>${n.cooking ? 'solte para lançar · botão direito cancela' : 'segure o botão esquerdo para mirar o arco'}</small>` : ''); }
  }
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
setupInstall($('installBtn'), t => { const el = $('loadInfo'); el.textContent = t; });

/* ---------- ONLINE (amigos pela internet, grátis: src/net/Net.js) ---------- */
window.__net = net;
// ONLINE: fica dentro da sala, na aba "Adicionar" (ID, amigos, convites). O anfitrião aperta JOGAR para jogar com os amigos.
const addEl = document.createElement('div');
// ONLINE agora fica na aba CUSTOM do menu iniciar (CustomRoom.js): volta para o menu com a aba CUSTOM aberta
const openRoomLobby = () => { ['lobby', 'online', 'pause', 'hud', 'dead', 'settings'].forEach(id => show(id, false)); showMenu(); front?.goCustom(); };
const onlinePanel = new OnlinePanel(addEl, $('onToast'), net, {
  beep: () => { game.audio.init(); game.audio.play('beep'); },
  onShow: () => { if (!game.running) openRoomLobby(); },   // aceitou um convite: vai para a sala, aba Adicionar
  onStart: cfg => {   // o anfitrião apertou JOGAR: todos entram na partida
    if (!game.assets.ready) { onlinePanel.say('Ainda carregando os modelos… tente de novo em instantes.', 'warn'); return; }
    lobby.close(); show('lobby', false);
    const slot = Math.max(0, (cfg.roster || []).findIndex(p => p.id === net.id));
    startMode('deathmatch', { mode: 'deathmatch', title: 'ONLINE · MATA-MATA', me: { name: net.name, team: 'ffa' }, loadout: getLoadout(), players: [],
      mapId: cfg.map || 'warehouse', map: cfg.map || 'warehouse', kills: cfg.kills || 30, online: { net, roster: cfg.roster || [], slot } });
  },
  onLost: why => { if (game.running && game.online) { game.stop(); openRoomLobby(); } onlinePanel.say(why, 'warn'); }
}, { compact: true });
onlinePanel.isOpen = true; onlinePanel.render(); setInterval(() => { if (!game.running) net.pingAll(); }, 12000);
net.on('end', () => { if (game.running && game.online) { game.stop(); openRoomLobby(); onlinePanel.say('A partida online terminou.', 'warn'); } });
// PATENTES: conta do criador (ID do dono) tem todas; XP entra ao sair de cada partida
setPlayerId(net.id);
const pushMe = () => { const L = getLoadout(); net.updateMe({ skin: L.skin, primary: L.primary, secondary: L.secondary, melee: L.melee, rank: myRankCell(), avatar: getProfile().avatar }); };
game.onXp = r => {
  notify.push({ kind: 'game', text: `Partida encerrada: ${r.kills} abate${r.kills === 1 ? '' : 's'} em ${r.minutes} min.` });
  const ups = addXp(r.xp);
  setTimeout(() => {   // aparece no chat da sala ao voltar
    lobby.note(`+${r.xp} XP (${r.kills} abate${r.kills === 1 ? '' : 's'}, ${r.minutes} min).`, 'ok');
    ups.forEach(u => lobby.note(`NOVA PATENTE: ${u.name}!`, 'ok'));
    if (ups.length) { lobby.refresh(); pushMe(); }
  }, 300);
};
let roomIds = [], roomHost = null;
net.on('room', r => {
  const same = r && r.host === roomHost;   // mesmo grupo de antes (se mudou de grupo, ninguém "entrou" no seu)   // avisos no chat da sala: quem entrou / saiu
  const ids = r ? r.players.map(p => p.id) : [];
  if (r) { r.players.filter(p => !roomIds.includes(p.id) && p.id !== net.id).forEach(p => { lobby.note(`${p.name} entrou na sala.`, 'ok'); if (same) notify.push({ kind: 'group', text: `${p.name} entrou no seu grupo.` }); }); }
  if (r && !same && r.host !== net.id) notify.push({ kind: 'group', text: `Você entrou no grupo de ${r.hostName || 'um amigo'}.` });
  roomIds.filter(id => !ids.includes(id) && id !== net.id).forEach(id => { lobby.note('Um jogador saiu da sala.'); if (same) notify.push({ kind: 'group', text: `${net.friends.find(f => f.id === id)?.name || 'Um amigo'} saiu do grupo.` }); });
  if (!r && roomIds.length) lobby.note('Sala online fechada.');
  roomIds = ids; roomHost = r?.host ?? null; lobby.refresh();
});
net.on('chat', m => lobby.addChat(m.name || 'Amigo', m.text, m.from === net.id || !m.from));
net.start().then(() => { net.pingAll(); onlinePanel.render(); });   // fica online já ao abrir o jogo (para receber convites)
// versão do site (carimbada ao publicar): mostra no menu e avisa se o navegador está com uma cópia velha
(() => {
  const mine = document.querySelector('meta[name="build"]')?.content || 'dev', el = document.querySelector('.mm-ver');
  if (el) el.textContent = mine === 'dev' ? 'versão local (PC do dono)' : 'versão ' + mine;
  if (mine === 'dev') return;
  // ATUALIZAÇÃO AUTOMÁTICA (app instalado na área de trabalho dos amigos): se o site tem versão nova e a pessoa não está jogando
  // nem num grupo com amigos, recarrega sozinho (uma vez por versão, para nunca entrar em loop). Senão, avisa no menu e no sino.
  let warned = '';
  const check = startup => fetch('version.json?x=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(j => {
    if (!j.v || j.v === mine) return;
    const busy = game.running || (net.room && net.room.players.length > 1);
    let tried = ''; try { tried = sessionStorage.getItem('shadowops.upd') || ''; } catch {}
    if (!busy && tried !== j.v) {
      try { sessionStorage.setItem('shadowops.upd', j.v); } catch {}
      if (el) el.textContent = 'Atualizando para a versão ' + j.v + '…';
      setTimeout(() => location.reload(), startup ? 200 : 1500); return;
    }
    if (el) { el.textContent = 'Versão nova (' + j.v + '): feche e abra o jogo para atualizar'; el.classList.add('old'); }
    if (warned !== j.v) { warned = j.v; notify.push({ kind: 'game', text: 'Versão nova do jogo (' + j.v + '). Feche e abra o jogo para atualizar.' }); }
  }).catch(() => {});
  check(true);
  setInterval(() => { if (!document.hidden) check(false); }, 5 * 60e3);   // a cada 5 min (jogo aberto por muito tempo)
})();
window.__menuFx = new MenuFx($('menu'), () => game.settings.volume * (game.settings.volAmbiente ?? 1));   // faíscas, luzes e som ao passar o mouse
// (música do jogo removida a pedido do usuário: Music.js e assets/music foram para _to_delete)
const lobby = new Lobby($('lobby'), {
  assets: game.assets,   // personagem em 3D na sala
  onStart: cfg => { if (net.isHost() && net.room.players.length >= 2) { net.setName(cfg.me?.name || net.name); net.startMatch({}); } else startMode(cfg.mode, cfg); },
  onExit: () => { if (net.room) net.leaveRoom(); show('lobby', false); showMenu(); },
  onSettings: () => openSettings('lobby'),
  beep: () => { game.audio.init(); game.audio.play('beep'); },
  addPanel: () => addEl,
  getName: () => net.name !== 'Jogador' ? net.name : null,
  onName: v => { net.setName(v); clearTimeout(window.__nmT); window.__nmT = setTimeout(pushMe, 600); },
  online: () => net.room ? { host: net.isHost(), hostName: net.room.hostName, count: net.room.players.length, players: net.room.players, myId: net.id, hostId: net.room.host } : null,
  sendChat: (who, t) => net.room ? net.sendChat(who, t) : false
});

// aba CUSTOM: sala com modo, mapa, bots, pessoas, senha e amigos
const customRoom = new CustomRoom(document.querySelector('#menu .cr-panel'), net, {
  beep: () => { game.audio.init(); game.audio.play('beep'); },
  startTraining: () => enterMode('training'),
  startOffline: c => { if (!game.assets.ready) return; lobby.quickStart(c.mode, c.map, net.name && net.name !== 'Jogador' ? net.name : null, { bots: c.bots, diff: c.diff, round: c.round, kills: c.kills }); },
  startOnline: c => { if (!game.assets.ready) return; net.startMatch({ mode: 'deathmatch', map: c.map, kills: c.kills }); }
});

// GRUPO (canto de baixo à direita): ícone de amigos + 5 vagas; amigos do grupo aparecem em 3D ao lado do seu personagem
const meInfoNet = () => { const L = getLoadout(); return { skin: L.skin, primary: L.primary, secondary: L.secondary, melee: L.melee, avatar: getProfile().avatar }; };
const partyBar = new PartyBar($('menu'), net, {
  beep: () => { game.audio.init(); game.audio.play('beep'); },
  ensureRoom: () => customRoom.ensureRoom(),
  meInfo: meInfoNet
});
net.on('status', () => { if (net.status === 'on') customRoom.ensureRoom(); });
// SINO (canto de cima à direita): amizade, convites (aceitar/recusar), grupo e avisos do jogo
const notify = window.__notify = new NotifyCenter(document.querySelector('#menu .fm-bell'), document.querySelector('#menu .nt-panel'), {
  beep: () => { game.audio.init(); game.audio.play('beep'); },
  onAccept: async from => {   // aceitar convite: avisa se isso desfaz o grupo atual; só conta como aceito se entrou
    if (game.running) return false;
    const r = net.room;
    if (r && r.players.length > 1 && !confirm(r.host === net.id ? 'Aceitar desfaz o seu grupo atual (seus amigos saem). Continuar?' : 'Você vai sair do grupo atual. Continuar?')) return false;
    showMenu(); partyBar.open(); return partyBar._join(from, '');
  }
});
partyBar.hooks.onOpen = () => notify.close(); notify.hooks.onOpen = () => partyBar.close();   // um painel da direita por vez
net.on('newFriend', f => notify.push({ kind: 'friend', text: `${f.name} te adicionou como amigo.`, from: f.id }));
net.on('invite', inv => notify.push({ kind: 'invite', text: `${inv.name || inv.from} te convidou para o grupo.`, from: inv.from }));
net.on('lost', why => notify.push({ kind: 'group', text: why || 'Você saiu do grupo.' }));   // ao ficar online (ou reconectar) já abre a sala/grupo para os amigos entrarem
net.on('room', r => front?.setSquad(r ? r.players.filter(p => p.id !== net.id) : []));

// CUSTOMIZAR (janela grande): personagem, skins de arma, perfil (nome + avatar) e carreira (KDA)
const wardrobe = new Wardrobe(document.querySelector('#menu .wr-tabs'), document.querySelector('#menu .wr-panel'), {
  beep: () => { game.audio.init(); game.audio.play('beep'); },
  preview: () => front?.preview, net,
  onSkin: () => pushMe(),
  onProfile: () => { pushMe(); front?.refresh(); partyBar.render(); customRoom.render?.(); }
});

// menu principal novo (estilo PUBG): abas, modos, personagem 3D e o botão JOGAR.
// Ele só escolhe o modo; a sala (mapa, bots, dificuldade) continua no Lobby.
front = new FrontMenu($('menu'), {
  assets: game.assets,
  name: () => net.name,
  onPlay: m => enterMode(m),
  onSkin: () => pushMe(),   // trocou o personagem no Customizar: avisa a sala online (se houver)
  netId: () => net.id,
  custom: customRoom,
  wardrobe,
  onSettings: () => openSettings('menu'),
  beep: () => { game.audio.init(); game.audio.play('beep'); }
});
if (game.assets.ready) front.show();   // já carregou: entra no menu sem esperar

const teamPicker = new TeamPicker();

/** escolheu um modo no menu: treino começa na hora; online abre a sala em "Adicionar"; os outros abrem a sala. */
function enterMode(m) {
  if (!game.assets.ready) return;
  if (m === 'custom') { customRoom.start(); return; }
  if (m === 'training') { startMode('training', { mode: 'training', title: 'TREINO', me: { name: net.name || 'Jogador' }, loadout: getLoadout() }); return; }
  // competitivo e mata-mata: entra direto no mapa escolhido no menu (sem sala)
  const nome = net.name && net.name !== 'Jogador' ? net.name : null;
  // MODO FAVELA (competitivo): antes de entrar, escolhe o lado — Polícia (ataque) ou Bandido (defesa)
  if (m === 'competitive') { teamPicker.open(team => lobby.quickStart(m, front?.mapId, nome, { team })); return; }
  lobby.quickStart(m, front?.mapId, nome);
}

async function startMode(mode, cfg) {
  if (!game.assets.ready) return;
  if (mode === 'training' && !game.assets.range) {   // treino: o mapa do stand de tiro carrega na primeira vez
    hideMenu(); boot.show('Carregando o stand de tiro');
    try { await game.assets.loadRange(p => boot.set(p, 'Carregando o stand de tiro')); }
    catch (e) {
      boot.error('Falha ao carregar o stand de tiro: ' + (e?.message || e));
      report('Falha ao carregar o stand de tiro: ' + (e?.message || e));
      setTimeout(() => { boot.hide(); showMenu(); }, 3200); return;
    }
    boot.done();
  }
  if (cfg?.mapId === 'favela' && !getFavela().ready) {   // FAVELA: o mapa (≈60 MB) carrega na primeira partida nele
    hideMenu(); boot.show('Carregando a favela');
    try { await getFavela().load((p, t) => boot.set(p, t || 'Carregando a favela')); }
    catch (e) {
      boot.error('Falha ao carregar a favela: ' + (e?.message || e));
      report('Falha ao carregar a favela: ' + (e?.message || e));
      setTimeout(() => { boot.hide(); showMenu(); }, 3200); return;
    }
    boot.done();
  }
  ['menu', 'lobby', 'pause', 'settings', 'dead'].forEach(id => show(id, false)); front?.hide(); show('hud', true);
  killFeed.reset(); wSwitch.reset(); $('hudScore').textContent = '';
  $('hudMode').textContent = cfg?.title || NAMES[mode];
  $('toLobby').classList.toggle('hidden', !cfg?.online);   // "Voltar à sala" só existe no online
  game.start(mode, cfg);
}
$('resume').onclick = () => game.resume();
$('restart').onclick = () => startMode(game.mode, game.config);
$('toLobby').onclick = () => {
  if (game.online) { if (net.isHost()) net.endMatch(); game.stop(); openRoomLobby(); return; }   // online: volta para a tela Online (a sala continua)
  game.stop(); show('pause', false); show('hud', false);
  showMenu();   // fora do online tudo volta para o menu iniciar
};
$('toMenu').onclick = () => { if (game.online && net.isHost()) net.endMatch(); game.stop(); lobby.close(); show('pause', false); show('hud', false); showMenu(); };
// Lab: só aparece no PC do dono (jogo aberto pelo servidor local); no site publicado ele nem é enviado.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) $('openLab').classList.remove('hidden');
$('openLab').onclick = () => { location.href = 'lab.html?v=' + Date.now(); };   // ajustar a arma na mão (cena por cena)
$('closeSettings').onclick = () => { show('settings', false); if (settingsFrom === 'menu') showMenu(); else show(settingsFrom, true); };

// configurações: no menu e na pausa (Esc) — a mira do HUD muda junto
const onSet = k => { if (k.startsWith('ch')) applyCrosshair($('cross'), game.settings); };
const menuPanel = new SettingsPanel($('settingsBody'), game, onSet);
const pausePanel = new SettingsPanel($('pauseSettingsBody'), game, onSet);
applyCrosshair($('cross'), game.settings);
