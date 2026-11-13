import { showId } from '../net/Net.js';
import { SKINS } from './Loadout.js';
import { avatarSVG, getProfile } from './Avatars.js';

/**
 * Barra do GRUPO no canto de baixo à direita do menu iniciar (como no PUBG):
 *  - ícone de AMIGOS (com quantos estão online): abre a tela de amigos (seu ID, adicionar por ID, convidar, entrar na sala de um amigo);
 *  - 5 vagas do grupo: a 1ª é você; quando um amigo entra na sala, ele preenche a próxima vaga. Vaga vazia (+) também abre a tela de amigos.
 * O grupo é a sala online do Net.js (a mesma da aba CUSTOM). Convidar já cria a sala se ainda não existir.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SLOTS = 5;   // grupo de 5: você + 4 amigos
const ICON_FRIENDS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-7 1.7-7 4.5V20h14v-2.5C16 14.7 12.3 13 9 13Zm7.5-2.2a3.3 3.3 0 1 0-1.2-6.4 5.9 5.9 0 0 1 0 6.2c.4.1.8.2 1.2.2Zm1.6 2.4c1.2.9 1.9 2.1 1.9 3.6V20h3v-2.4c0-2.2-2.4-3.8-4.9-4.4Z"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z"/></svg>';
const ST = { on: 'Online', connecting: 'Conectando…', reconnecting: 'Reconectando…', off: 'Desligado', error: 'Sem conexão', dup: 'ID aberto em outra aba' };

export class PartyBar {
  /** hooks: { beep, ensureRoom(), meInfo() } */
  constructor(menu, net, hooks) {
    this.menu = menu; this.net = net; this.hooks = hooks; this.isOpen = false; this.prev = [];
    const bar = this.bar = document.createElement('div'); bar.className = 'pb-bar';
    bar.innerHTML = `<button type="button" class="pb-friends fm-hover" data-pb="toggle" aria-label="Amigos" aria-expanded="false">${ICON_FRIENDS}<b class="pb-on"></b><span class="pb-nm" aria-hidden="true">AMIGOS</span></button>
      <div class="pb-slots" aria-label="Seu grupo"></div>`;
    const panel = this.panel = document.createElement('aside'); panel.className = 'pb-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Amigos');
    panel.innerHTML = `
      <header class="pb-head"><b>Amigos</b><span class="pb-st"></span><button type="button" class="pb-x fm-hover" data-pb="close" aria-label="Fechar">✕</button></header>
      <div class="pb-id"><small>Seu ID — passe para os amigos</small><b class="pb-myid"></b><button type="button" class="fm-hover" data-pb="copy">Copiar</button></div>
      <div class="pb-add"><input class="pb-fid" placeholder="ID do amigo (ex.: SO-7K4Q-92XM)" maxlength="14" autocomplete="off" spellcheck="false"><button type="button" class="fm-hover" data-pb="add">Adicionar</button></div>
      <h5>Grupo <span class="pb-gcount"></span></h5><ul class="pb-list pb-group"></ul>
      <h5>Amigos <span class="pb-fcount"></span></h5><ul class="pb-list pb-flist"></ul>
      <div class="pb-join" hidden><small>Senha da sala de <b class="pb-jname"></b></small><div class="pb-add"><input class="pb-jpass" maxlength="16" autocomplete="off" spellcheck="false"><button type="button" class="fm-hover" data-pb="joinpass">Entrar</button></div></div>
      <p class="pb-msg" aria-live="polite"></p>`;
    menu.append(bar, panel);
    const click = e => { const b = e.target.closest('[data-pb]'); if (b && !b.disabled) this._act(b.dataset.pb, b.dataset); };
    bar.addEventListener('click', click); panel.addEventListener('click', click);
    panel.querySelector('.pb-fid').addEventListener('keydown', e => { if (e.key === 'Enter') this._act('add'); });
    panel.querySelector('.pb-jpass').addEventListener('keydown', e => { if (e.key === 'Enter') this._act('joinpass'); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen && !e.defaultPrevented) { e.preventDefault(); this.close(); } });
    addEventListener('pointerdown', e => { if (this.isOpen && !panel.contains(e.target) && !bar.contains(e.target)) this.close(); }, true);
    for (const ev of ['status', 'friends', 'room']) net.on(ev, () => this.render());
    net.on('room', r => this._diff(r));
    setInterval(() => { if (!menu.classList.contains('hidden') && !document.hidden) net.pingAll(); }, 15000);
    this.render();
  }

  open() { this.hooks.onOpen?.(); this.isOpen = true; this.panel.hidden = false; this.bar.querySelector('.pb-friends').setAttribute('aria-expanded', 'true'); this.net.start().then(() => { this.net.pingAll(); this.render(); }); this.render(); this.panel.querySelector('.pb-fid').focus({ preventScroll: true }); }
  close() { const had = this.panel.contains(document.activeElement); this.isOpen = false; this.panel.hidden = true; const t = this.bar.querySelector('.pb-friends'); t.setAttribute('aria-expanded', 'false'); if (had) t.focus({ preventScroll: true }); }
  say(t, cls = '') { const m = this.panel.querySelector('.pb-msg'); m.textContent = t; m.className = 'pb-msg ' + cls; clearTimeout(this._mt); this._mt = setTimeout(() => { m.textContent = ''; }, 4500); }

  /** jogadores do grupo, você sempre primeiro */
  _members() {
    const n = this.net, r = n.room;
    const all = (r ? r.players : [{ id: n.id, name: n.name, skin: this.hooks.meInfo?.().skin }]).map(p => p.id === n.id ? { ...p, name: n.name, avatar: getProfile().avatar } : p);
    return [...all.filter(p => p.id === n.id), ...all.filter(p => p.id !== n.id)];
  }
  /** quem entrou/saiu do grupo: animação na vaga e aviso */
  _diff(r) {   // só conta "entrou" quando o dono do grupo é o mesmo (ao entrar no grupo de outro, ninguém "entrou" no seu)
    const ids = r ? r.players.map(p => p.id) : [this.net.id], same = r && r.host === this.prevHost;
    const joined = same ? r.players.filter(p => !this.prev.includes(p.id) && p.id !== this.net.id) : [];
    this.prev = ids; this.prevHost = r?.host;
    joined.forEach(p => { this.flash = p.id; if (!this.isOpen) this._toast(`${p.name} entrou no grupo`); this.hooks.beep?.(); });
    setTimeout(() => { this.flash = null; }, 900);
  }
  _toast(t) {
    let el = this.menu.querySelector('.pb-toast'); if (!el) { el = document.createElement('p'); el.className = 'pb-toast'; this.menu.append(el); }
    el.setAttribute('role', 'status'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), 2600);
  }

  async _act(k, d = {}) {
    const n = this.net, P = this.panel;
    switch (k) {
      case 'toggle': this.hooks.beep?.(); this.isOpen ? this.close() : this.open(); return;
      case 'slot': {
        this.hooks.beep?.(); this.open();
        const b = P.querySelector('[data-pb="invite"]');
        if (b) b.focus(); else this.say(n.friends.length ? 'Nenhum amigo online para convidar agora.' : 'Adicione um amigo pelo ID dele para poder convidar.', 'warn');
        return; }
      case 'close': this.hooks.beep?.(); this.close(); return;
      case 'copy': try { await navigator.clipboard.writeText(n.id); this.say('ID copiado.', 'ok'); } catch { this.say('Seu ID: ' + n.id); } return;
      case 'add': {
        const inp = P.querySelector('.pb-fid'), id = showId(inp.value);
        if (!id) { this.say('ID inválido. Ex.: SO-7K4Q-92XM', 'warn'); return; }
        if (id === n.id) { this.say('Esse é o seu ID.', 'warn'); return; }
        n.addFriend(id); n.ping(id); inp.value = ''; this.hooks.beep?.(); this.say('Amigo adicionado.', 'ok'); return; }
      case 'del': n.removeFriend(d.id); this.hooks.beep?.(); return;
      case 'invite':
        if (n.room && !n.isHost()) { this.say('Só o dono da sala convida.', 'warn'); return; }
        if (this._members().length >= (n.room?.cfg?.max || 8)) { this.say('O grupo está cheio.', 'warn'); return; }
        this.hooks.ensureRoom?.();
        if (n.invite(d.id)) { this.hooks.beep?.(); this.say('Convite enviado. Quando ele aceitar, preenche uma vaga.', 'ok'); } else this.say('Ainda conectando… tente de novo.', 'warn');
        return;
      case 'kick': n.kick(d.id); this.hooks.beep?.(); return;
      case 'leave': n.leaveRoom(); this.hooks.beep?.(); this.hooks.ensureRoom?.(); this.say('Você saiu do grupo.', 'ok'); return;
      case 'join': this._join(d.id, ''); return;
      case 'joinpass': this._join(this.joinId, P.querySelector('.pb-jpass').value.trim()); return;
    }
  }
  async _join(id, pass) {
    if (!id) return; this.say('Entrando…');
    const r = await this.net.joinRoom(id, this.hooks.meInfo?.() || {}, pass), box = this.panel.querySelector('.pb-join');
    if (r.ok) { this.joinId = null; box.hidden = true; this.say('Você entrou no grupo.', 'ok'); this.hooks.onJoined?.(); return true; }
    if (r.needPass) { this.joinId = id; box.hidden = false; this.panel.querySelector('.pb-jname').textContent = this.net.friends.find(f => f.id === id)?.name || id; this.panel.querySelector('.pb-jpass').focus(); }
    this.say(r.why || 'Não deu para entrar.', 'warn'); this.hooks.ensureRoom?.(); return false;
  }

  /** desenha de novo sem perder o foco do teclado (a lista é refeita a cada atualização dos amigos) */
  render() {
    const a = document.activeElement, had = a && (this.panel.contains(a) || this.bar.contains(a));
    const sel = a?.dataset?.pb ? `[data-pb="${a.dataset.pb}"]${a.dataset.id ? `[data-id="${CSS.escape(a.dataset.id)}"]` : ''}` : null;
    this._render();
    if (had && !(this.panel.contains(document.activeElement) || this.bar.contains(document.activeElement)))
      ((sel && (this.panel.querySelector(sel) || this.bar.querySelector(sel))) || (this.isOpen ? this.panel.querySelector('.pb-x') : this.bar.querySelector('.pb-friends')))?.focus({ preventScroll: true });
  }

  _render() {
    const n = this.net, r = n.room, host = !r || n.isHost(), mem = this._members();
    const onCount = n.friends.filter(f => n.online[f.id]?.online).length;
    const onB = this.bar.querySelector('.pb-on'); onB.textContent = onCount || ''; onB.hidden = !onCount;
    const fb = this.bar.querySelector('.pb-friends'); fb.title = `Amigos (${onCount} online)`; fb.setAttribute('aria-label', fb.title);
    // 4 vagas: você + amigos; vazias com "+"
    const skinName = id => SKINS.find(s => s.id === id)?.name || '';
    const cells = [];
    for (let i = 0; i < SLOTS; i++) {
      const p = mem[i];
      if (p) {
        const me = p.id === n.id, isHost = r ? p.id === r.host : me, extra = i === SLOTS - 1 && mem.length > SLOTS ? mem.length - SLOTS + 1 : 0;
        cells.push(`<div class="pb-slot full${me ? ' me' : ''}${this.flash === p.id ? ' pop' : ''}" tabindex="0" aria-label="${esc(p.name)}${me ? ' (você)' : ''}${isHost ? ', dono do grupo' : ''}" title="${esc(p.name)}${me ? ' (você)' : ''}${isHost ? ' · dono da sala' : ''} · ${esc(skinName(p.skin))}">
          ${p.avatar ? `<span class="pb-av pb-img">${avatarSVG(p.avatar, 36)}</span>` : `<span class="pb-av s-${p.skin === 'bot' ? 'bot' : 'izzy'}">${esc((p.name || '?').trim()[0] || '?').toUpperCase()}</span>`}
          ${isHost ? '<i class="pb-crown" aria-hidden="true"></i>' : ''}${extra ? `<em class="pb-more">+${extra}</em>` : ''}
          <span class="pb-nm" aria-hidden="true">${me ? 'VOCÊ' : esc(p.name)}</span></div>`);
      } else cells.push(host
        ? `<button type="button" class="pb-slot empty fm-hover" data-pb="slot" aria-label="Vaga livre: convidar amigo" title="Convidar amigo">${ICON_PLUS}</button>`
        : `<div class="pb-slot empty locked" title="Só o dono do grupo convida" aria-label="Vaga livre (só o dono do grupo convida)">${ICON_PLUS}</div>`);
    }
    this.bar.querySelector('.pb-slots').innerHTML = cells.join('');
    if (!this.isOpen) return;
    // tela de amigos
    const P = this.panel;
    const st = P.querySelector('.pb-st'); st.textContent = ST[n.status] || n.status; st.className = 'pb-st ' + (n.status === 'on' ? 'ok' : 'warn');
    P.querySelector('.pb-myid').textContent = n.id;
    P.querySelector('.pb-gcount').textContent = `${mem.length}/${Math.min(r?.cfg?.max || 8, 8)}`;
    P.querySelector('.pb-group').innerHTML = mem.map(p => {
      const me = p.id === n.id, isHost = r ? p.id === r.host : me;
      return `<li><i class="dot on"></i><b>${esc(p.name)}</b><small>${me ? 'você' : esc(p.id)}${isHost ? ' · dono da sala' : ''}</small>
        ${host && !me ? `<button type="button" class="fm-hover pb-xs" data-pb="kick" data-id="${esc(p.id)}" title="Tirar do grupo">✕</button>` : ''}
        ${me && r && !host ? `<button type="button" class="fm-hover" data-pb="leave">Sair</button>` : ''}</li>`;
    }).join('');
    const inGroup = new Set(mem.map(p => p.id));
    const sorted = [...n.friends].sort((a, b) => (n.online[b.id]?.online ? 1 : 0) - (n.online[a.id]?.online ? 1 : 0));
    P.querySelector('.pb-fcount').textContent = n.friends.length ? `${onCount} online` : '';
    P.querySelector('.pb-flist').innerHTML = sorted.length ? sorted.map(f => {
      const o = n.online[f.id], on = o?.online, there = inGroup.has(f.id), hasRoom = o?.room && o.room.host === f.id && !there;
      return `<li><i class="dot ${on ? 'on' : o?.online === false ? 'off' : ''}"></i><b>${esc(f.name || f.id)}</b><small>${there ? 'no seu grupo' : on ? (hasRoom ? 'online · com sala' : 'online') : o?.online === false ? 'offline' : 'verificando…'}</small>
        ${on && !there && host ? `<button type="button" class="fm-hover" data-pb="invite" data-id="${esc(f.id)}">Convidar</button>` : ''}
        ${hasRoom && host ? `<button type="button" class="fm-hover pb-ghost" data-pb="join" data-id="${esc(f.id)}">Entrar</button>` : ''}
        <button type="button" class="fm-hover pb-xs" data-pb="del" data-id="${esc(f.id)}" title="Remover amigo">✕</button></li>`;
    }).join('') : '<li class="empty">Nenhum amigo ainda. Peça o ID dele e adicione acima.</li>';
  }
}
