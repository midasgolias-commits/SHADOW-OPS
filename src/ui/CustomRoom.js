import { showId } from '../net/Net.js';
import { MAPS } from '../world/MapData.js';
import { getLoadout } from './Loadout.js';

/**
 * Aba CUSTOM do menu iniciar (no lugar do antigo "Online"): janela de vidro à esquerda, o personagem 3D continua no lugar.
 * Abas internas:
 *  - PARTIDA: modo (Competitivo / Mata-mata / Treino), mapa, quantidade de bots, dificuldade e regra (tempo da rodada ou limite de abates);
 *  - SALA: máximo de pessoas, sala fechada (ninguém novo entra), senha, encerrar a sala;
 *  - AMIGOS: seu ID, adicionar amigo pelo ID, convidar / entrar, e quem está na sala (o anfitrião pode remover).
 * Sozinho na sala: a partida roda no seu PC com bots (qualquer modo). Com amigos na sala: partida online (Net.js / OnlineMatch.js),
 * que por enquanto é só Mata-mata e sem bots.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = 'shadowops.custom';
const MODES = [['competitive', 'Competitivo'], ['deathmatch', 'Mata-mata'], ['training', 'Treino']];
const DIFFS = [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']];
const SLOTS_OF = { competitive: 10, deathmatch: 8, training: 1 };   // vagas da partida (pessoas + bots)
const DEF = { mode: 'deathmatch', map: 'warehouse', bots: 7, diff: 'normal', round: 100, kills: 30, max: 8, locked: false };
const meInfo = () => { const L = getLoadout(); return { skin: L.skin, primary: L.primary, secondary: L.secondary, melee: L.melee }; };

const HTML = `
  <header class="fc-head cr-head">
    <div class="fc-tabs"><span class="fc-tab cr-title">Sala custom</span><small class="cr-badges"></small></div>
    <span class="cr-count" title="Pessoas na sala"></span>
  </header>
  <nav class="cr-tabs" role="tablist">
    <button type="button" class="fm-hover on" data-cr-tab="match" role="tab">Partida</button>
    <button type="button" class="fm-hover" data-cr-tab="room" role="tab">Sala</button>
    <button type="button" class="fm-hover" data-cr-tab="friends" role="tab">Amigos <b class="cr-fcount"></b></button>
  </nav>
  <div class="cr-body">
    <section class="cr-pane" data-pane="match">
      <div class="cr-row"><small>Modo</small><div class="cr-seg cr-mode"></div></div>
      <div class="cr-row cr-only-map"><small>Mapa</small><div class="cr-seg cr-map"></div></div>
      <div class="cr-row cr-only-bots"><small>Bots</small><div class="cr-step" data-step="bots"><button type="button" class="fm-hover" data-dec aria-label="Menos bots">−</button><b class="cr-bots"></b><button type="button" class="fm-hover" data-inc aria-label="Mais bots">+</button></div><span class="cr-note cr-botnote"></span></div>
      <div class="cr-row cr-only-bots"><small>Dificuldade</small><div class="cr-seg cr-diff"></div></div>
      <div class="cr-row cr-only-rule"><small class="cr-rulelabel"></small><div class="cr-seg cr-rule"></div></div>
    </section>
    <section class="cr-pane" data-pane="room" hidden>
      <div class="cr-row"><small>Pessoas (máx.)</small><div class="cr-step" data-step="max"><button type="button" class="fm-hover" data-dec aria-label="Menos pessoas">−</button><b class="cr-max"></b><button type="button" class="fm-hover" data-inc aria-label="Mais pessoas">+</button></div></div>
      <div class="cr-row"><small>Fechar a sala</small><button type="button" class="cr-toggle fm-hover" data-cr="lock" role="switch"><i></i><span></span></button></div>
      <div class="cr-row cr-col"><small>Senha da sala</small>
        <div class="cr-inline"><input class="cr-pass" type="text" maxlength="16" placeholder="Sem senha" autocomplete="off" spellcheck="false"><button type="button" class="fm-hover" data-cr="pass">Definir</button><button type="button" class="fm-hover cr-ghost" data-cr="nopass">Tirar</button></div>
        <span class="cr-note">Amigos que você convidar entram sem precisar da senha.</span></div>
      <div class="cr-row cr-col"><small>Encerrar</small><button type="button" class="fm-hover cr-danger" data-cr="close">Encerrar sala (tira todo mundo)</button></div>
    </section>
    <section class="cr-pane" data-pane="friends" hidden>
      <div class="cr-id"><small>Seu ID</small><b class="cr-myid"></b><button type="button" class="fm-hover" data-cr="copy">Copiar</button><span class="cr-net"></span></div>
      <div class="cr-inline"><input class="cr-fid" placeholder="ID do amigo (ex.: SO-7K4Q-92XM)" maxlength="14" autocomplete="off" spellcheck="false"><button type="button" class="fm-hover" data-cr="add">Adicionar</button></div>
      <h5>Na sala</h5><ul class="cr-list cr-players"></ul>
      <h5>Amigos</h5><ul class="cr-list cr-friends"></ul>
      <div class="cr-join" hidden><small>Senha da sala de <b class="cr-jname"></b></small><div class="cr-inline"><input class="cr-jpass" maxlength="16" autocomplete="off" spellcheck="false"><button type="button" class="fm-hover" data-cr="joinpass">Entrar</button></div></div>
    </section>
  </div>
  <p class="cr-msg" aria-live="polite"></p>
  <footer class="cr-foot">
    <button type="button" class="fm-big fm-hover cr-go" data-cr="go"><span>Iniciar partida</span><b>→</b></button>
    <button type="button" class="fm-hover cr-leave" data-cr="leave" hidden>Sair da sala</button>
  </footer>`;

export class CustomRoom {
  /** hooks: { beep, startOffline(cfg), startTraining(), startOnline(cfg) } */
  constructor(panel, net, hooks) {
    this.el = panel; this.net = net; this.hooks = hooks; this.tab = 'match'; this.joinId = null; this.open = false;
    let s = {}; try { s = JSON.parse(localStorage.getItem(LS) || '{}'); } catch {}
    this.cfg = { ...DEF, ...s }; this._fix();
    panel.innerHTML = HTML;
    panel.addEventListener('click', e => this._click(e));
    panel.querySelector('.cr-fid').addEventListener('keydown', e => { if (e.key === 'Enter') this._act('add'); });
    panel.querySelector('.cr-pass').addEventListener('keydown', e => { if (e.key === 'Enter') this._act('pass'); });
    panel.querySelector('.cr-jpass').addEventListener('keydown', e => { if (e.key === 'Enter') this._act('joinpass'); });
    for (const ev of ['status', 'friends', 'room']) net.on(ev, () => { if (ev === 'room') this._syncFromRoom(); this.render(); });
    setInterval(() => { if (this.open) net.pingAll(); }, 12000);
  }

  /* ---------- estado ---------- */
  get room() { return this.net.room; }
  get host() { return !this.room || this.net.isHost(); }
  get guests() { return this.room ? this.room.players.length - 1 : 0; }
  _fix() {
    const c = this.cfg;
    if (!MODES.some(m => m[0] === c.mode)) c.mode = DEF.mode;
    if (!MAPS.some(m => m.id === c.map)) c.map = MAPS[0].id;
    c.max = Math.max(2, Math.min(8, c.max | 0 || 8));
    c.bots = Math.max(0, Math.min(this._maxBots(), c.bots | 0));
  }
  _maxBots() { return Math.max(0, (SLOTS_OF[this.cfg.mode] || 8) - 1 - this.guests); }
  _save() { try { localStorage.setItem(LS, JSON.stringify(this.cfg)); } catch {} }
  /** anfitrião: manda a configuração para os amigos da sala */
  _push() { this._fix(); this._save(); if (this.room && this.net.isHost()) this.net.setRoomCfg?.({ mode: this.cfg.mode, map: this.cfg.map, bots: this.cfg.bots, diff: this.cfg.diff, max: this.cfg.max, locked: this.cfg.locked }); }
  /** convidado: mostra a configuração do anfitrião */
  _syncFromRoom() { const r = this.room; if (r && !this.net.isHost() && r.cfg) Object.assign(this.cfg, r.cfg); }

  show() {
    this.open = true;
    this.net.start().then(() => { this._ensureRoom(); this.net.pingAll(); this.render(); });
    this._ensureRoom(); this.render();
  }
  hide() { this.open = false; }
  /** já cria a sala online (quando conectado) para os amigos poderem entrar */
  ensureRoom() { this._ensureRoom(); }
  _ensureRoom() { if (!this.room && this.net.status === 'on') { this.net.createRoom(this.cfg.mode, meInfo(), { mode: this.cfg.mode, map: this.cfg.map, bots: this.cfg.bots, diff: this.cfg.diff, max: this.cfg.max, locked: this.cfg.locked }); } }
  say(t, cls = '') { const m = this.el.querySelector('.cr-msg'); if (!m) return; m.textContent = t; m.className = 'cr-msg ' + cls; clearTimeout(this._mt); this._mt = setTimeout(() => { m.textContent = ''; }, 4500); }

  /* ---------- cliques ---------- */
  _click(e) {
    const t = e.target.closest('[data-cr-tab]'); if (t) { this.tab = t.dataset.crTab; this.hooks.beep?.(); this.render(); return; }
    const opt = e.target.closest('[data-opt]');
    if (opt && !opt.disabled) { const [k, v] = opt.dataset.opt.split(':'); this.cfg[k] = /^\d+$/.test(v) ? +v : v; this.hooks.beep?.(); this._push(); this.render(); return; }
    const st = e.target.closest('[data-step] button');
    if (st && !st.disabled) { const k = st.parentNode.dataset.step; this.cfg[k] += st.hasAttribute('data-inc') ? 1 : -1; this.hooks.beep?.(); this._push(); this.render(); return; }
    const b = e.target.closest('[data-cr]'); if (b && !b.disabled) this._act(b.dataset.cr, b.dataset);
  }
  async _act(k, d = {}) {
    const n = this.net, el = this.el;
    switch (k) {
      case 'lock': if (!this.host) return; this.cfg.locked = !this.cfg.locked; this.hooks.beep?.(); this._push(); this.say(this.cfg.locked ? 'Sala fechada: ninguém novo entra.' : 'Sala aberta.', 'ok'); break;
      case 'pass': {
        if (!this.host) return; const v = el.querySelector('.cr-pass').value.trim();
        if (!v) { this.say('Digite a senha.', 'warn'); return; }
        if (!this.room) { this.say('Conecte-se primeiro (a sala online ainda não existe).', 'warn'); return; }
        n.setRoomCfg?.({ password: v }); this.hooks.beep?.(); this.say('Senha definida.', 'ok'); break; }
      case 'nopass': if (!this.host || !this.room) return; n.setRoomCfg?.({ password: '' }); el.querySelector('.cr-pass').value = ''; this.hooks.beep?.(); this.say('Sala sem senha.', 'ok'); break;
      case 'close': if (!this.host) return; n.leaveRoom(); this.hooks.beep?.(); this.say('Sala encerrada. Uma sala nova foi aberta.', 'ok'); this._ensureRoom(); break;
      case 'leave': n.leaveRoom(); this.hooks.beep?.(); this._ensureRoom(); this.say('Você saiu da sala.', 'ok'); break;
      case 'copy': try { await navigator.clipboard.writeText(n.id); this.say('ID copiado.', 'ok'); } catch { this.say('Seu ID: ' + n.id); } return;
      case 'add': {
        const inp = el.querySelector('.cr-fid'), id = showId(inp.value);
        if (!id) { this.say('ID inválido. Ex.: SO-7K4Q-92XM', 'warn'); return; }
        if (id === n.id) { this.say('Esse é o seu ID.', 'warn'); return; }
        n.addFriend(id); n.ping(id); inp.value = ''; this.hooks.beep?.(); this.say('Amigo adicionado.', 'ok'); return; }
      case 'del': n.removeFriend(d.id); this.hooks.beep?.(); return;
      case 'invite': this._ensureRoom(); if (n.invite(d.id)) { this.hooks.beep?.(); this.say('Convite enviado.', 'ok'); } else this.say('Só o anfitrião convida.', 'warn'); return;
      case 'kick': n.kick(d.id); this.hooks.beep?.(); return;
      case 'join': this._join(d.id, ''); return;
      case 'joinpass': this._join(this.joinId, el.querySelector('.cr-jpass').value.trim()); return;
      case 'go': this.start(); return;
    }
    this.render();
  }
  async _join(id, pass) {
    if (!id) return;
    this.say('Entrando na sala…');
    const r = await this.net.joinRoom(id, meInfo(), pass);
    const box = this.el.querySelector('.cr-join');
    if (r.ok) { this.joinId = null; box.hidden = true; this.tab = 'friends'; this.say('Você entrou na sala.', 'ok'); this.render(); return; }
    if (r.needPass) { this.joinId = id; box.hidden = false; this.el.querySelector('.cr-jname').textContent = this.net.friends.find(f => f.id === id)?.name || id; this.el.querySelector('.cr-jpass').focus(); }
    this.say(r.why || 'Não deu para entrar.', 'warn'); this._ensureRoom(); this.render();
  }

  /** INICIAR PARTIDA */
  start() {
    const c = this.cfg;
    if (!this.host) { this.say('Só o anfitrião inicia a partida.', 'warn'); return; }
    this.hooks.beep?.();
    if (c.mode === 'training') { if (this.guests) { this.say('Treino é só para você: tire os amigos da sala ou escolha outro modo.', 'warn'); return; } this.hooks.startTraining?.(); return; }
    if (this.guests) {
      if (c.mode !== 'deathmatch') { this.say('Com amigos na sala, por enquanto só dá Mata-mata.', 'warn'); return; }
      this.hooks.startOnline?.({ mode: 'deathmatch', map: c.map, kills: c.kills }); return;
    }
    this.hooks.startOffline?.({ mode: c.mode, map: c.map, bots: c.bots, diff: c.diff, round: c.round, kills: c.kills });
  }

  /* ---------- desenho ---------- */
  render() {
    const el = this.el, n = this.net, c = this.cfg, host = this.host, r = this.room;
    this._fix();
    const seg = (k, opts) => opts.map(([v, l]) => `<button type="button" class="fm-hover${String(c[k]) === String(v) ? ' on' : ''}" data-opt="${k}:${v}" ${host ? '' : 'disabled'} aria-pressed="${String(c[k]) === String(v)}">${esc(l)}</button>`).join('');
    el.querySelectorAll('[data-cr-tab]').forEach(b => { const on = b.dataset.crTab === this.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    el.querySelectorAll('.cr-pane').forEach(p => { p.hidden = p.dataset.pane !== this.tab; });
    // cabeçalho
    el.querySelector('.cr-title').textContent = r && !host ? `Sala de ${r.hostName || 'amigo'}` : 'Sala custom';
    const people = r ? r.players.length : 1, max = c.max;
    el.querySelector('.cr-count').textContent = `${people}/${max}`;
    el.querySelector('.cr-badges').innerHTML = [c.locked ? '<em class="b-lock">Fechada</em>' : '', r?.cfg?.pass ? '<em class="b-pass">Senha</em>' : '', !r ? '<em class="b-off">Só você</em>' : ''].join('');
    // partida
    el.querySelector('.cr-mode').innerHTML = seg('mode', MODES);
    el.querySelector('.cr-map').innerHTML = seg('map', MAPS.map(m => [m.id, m.name]));
    el.querySelector('.cr-diff').innerHTML = seg('diff', DIFFS);
    const comp = c.mode === 'competitive', train = c.mode === 'training';
    el.querySelectorAll('.cr-only-map, .cr-only-bots, .cr-only-rule').forEach(x => { x.hidden = train; });
    el.querySelector('.cr-rulelabel').textContent = comp ? 'Tempo da rodada' : 'Limite de abates';
    el.querySelector('.cr-rule').innerHTML = comp ? seg('round', [[100, '1:40'], [120, '2:00']]) : seg('kills', [[20, '20'], [30, '30'], [50, '50']]);
    const mb = this._maxBots();
    el.querySelector('.cr-bots').textContent = c.bots;
    const bs = el.querySelector('[data-step="bots"]');
    bs.querySelector('[data-dec]').disabled = !host || c.bots <= 0; bs.querySelector('[data-inc]').disabled = !host || c.bots >= mb;
    el.querySelector('.cr-botnote').textContent = this.guests ? 'Com amigos na sala os bots ficam de fora (por enquanto).' : comp ? `Até ${mb} (times de 5 contra 5).` : `Até ${mb}.`;
    // sala
    el.querySelector('.cr-max').textContent = c.max;
    const ms = el.querySelector('[data-step="max"]');
    ms.querySelector('[data-dec]').disabled = !host || c.max <= Math.max(2, people); ms.querySelector('[data-inc]').disabled = !host || c.max >= 8;
    const tg = el.querySelector('[data-cr="lock"]'); tg.classList.toggle('on', !!c.locked); tg.setAttribute('aria-checked', !!c.locked); tg.disabled = !host;
    tg.querySelector('span').textContent = c.locked ? 'Fechada' : 'Aberta';
    el.querySelectorAll('[data-pane="room"] input, [data-cr="pass"]').forEach(x => { x.disabled = !host; });
    el.querySelector('[data-cr="nopass"]').disabled = !host || !r?.cfg?.pass;
    el.querySelector('[data-cr="close"]').disabled = !host || !r;
    // amigos
    el.querySelector('.cr-myid').textContent = n.id;
    const ST = { on: 'online', connecting: 'conectando…', reconnecting: 'reconectando…', off: 'desligado', error: 'sem conexão', dup: 'ID aberto em outra aba' };
    const ne = el.querySelector('.cr-net'); ne.textContent = ST[n.status] || n.status; ne.className = 'cr-net ' + (n.status === 'on' ? 'ok' : 'warn');
    const players = r ? r.players : [{ id: n.id, name: n.name }];
    el.querySelector('.cr-players').innerHTML = players.map(p => `<li><i class="dot on"></i><b>${esc(p.name)}</b><small>${p.id === (r?.host ?? n.id) ? 'anfitrião' : ''}${p.id === n.id ? (p.id === (r?.host ?? n.id) ? ' · ' : '') + 'você' : ''}</small>${host && p.id !== n.id ? `<button type="button" class="fm-hover cr-x" data-cr="kick" data-id="${esc(p.id)}" title="Remover da sala">✕</button>` : ''}</li>`).join('')
      + (c.bots && !this.guests && !train ? `<li class="bots"><i class="dot bot"></i><b>${c.bots} bot${c.bots > 1 ? 's' : ''}</b><small>${DIFFS.find(x => x[0] === c.diff)[1]}</small></li>` : '');
    const inRoom = new Set(players.map(p => p.id));
    el.querySelector('.cr-friends').innerHTML = n.friends.length ? n.friends.map(f => {
      const o = n.online[f.id], on = o?.online, hasRoom = o?.room && o.room.host === f.id && !inRoom.has(f.id);
      return `<li><i class="dot ${on ? 'on' : o?.online === false ? 'off' : ''}"></i><b>${esc(f.name || f.id)}</b><small>${esc(f.id)}${hasRoom ? ' · com sala' : ''}</small>
        ${host && on && !inRoom.has(f.id) ? `<button type="button" class="fm-hover" data-cr="invite" data-id="${esc(f.id)}">Convidar</button>` : ''}
        ${hasRoom && (!r || host) ? `<button type="button" class="fm-hover cr-ghost" data-cr="join" data-id="${esc(f.id)}">Entrar</button>` : ''}
        <button type="button" class="fm-hover cr-x" data-cr="del" data-id="${esc(f.id)}" title="Remover amigo">✕</button></li>`;
    }).join('') : '<li class="empty">Nenhum amigo ainda. Peça o ID dele e adicione acima.</li>';
    el.querySelector('.cr-fcount').textContent = n.friends.length ? n.friends.length : '';
    // rodapé
    const go = el.querySelector('.cr-go'); go.hidden = !host; el.querySelector('.cr-leave').hidden = host;
    go.querySelector('span').textContent = train ? 'Iniciar treino' : this.guests ? 'Iniciar online' : 'Iniciar partida';
    if (!host) this.say('Esperando o anfitrião iniciar…');
  }
}
