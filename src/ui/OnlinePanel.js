import { showId } from '../net/Net.js';
import { getLoadout } from './Loadout.js';

/**
 * Tela ONLINE (menu principal → Online): seu ID (para os amigos te adicionarem), lista de amigos (adicionar por ID,
 * quem está online, convidar / entrar), e a sala (o anfitrião vê quem entrou e inicia a partida).
 * Convites chegam como um aviso em qualquer tela (fora da partida).
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { off: 'desligado', connecting: 'conectando…', reconnecting: 'reconectando…', on: 'online', error: 'sem conexão', dup: 'este ID já está aberto em outra aba' };

export class OnlinePanel {
  /** hooks: { onBack, onStart(cfg), beep } */
  constructor(root, toastRoot, net, hooks) {
    this.root = root; this.toast = toastRoot; this.net = net; this.hooks = hooks; this.msg = ''; this.isOpen = false;
    root.innerHTML = `<div class="on-wrap">
      <header class="on-top"><div><h2>ONLINE <small>beta · grátis, direto entre navegadores</small></h2><p>Jogue com amigos: crie a sala e, dentro dela, adicione e convide seus amigos pelo ID.</p></div>
        <button class="ghost" data-act="back">Voltar</button></header>
      <div class="on-grid">
        <section class="on-card on-me">
          <h3>Você</h3>
          <label>Seu nome no jogo<input class="on-name" maxlength="16" autocomplete="off"></label>
          <div class="on-id"><small>Seu ID (passe para os amigos)</small><b class="on-myid"></b><button data-act="copy">Copiar</button></div>
          <p class="on-status"></p>
        </section>
        <section class="on-card on-friends">
          <h3>Amigos <button class="mini" data-act="refresh" title="Ver quem está online">↻</button></h3>
          <div class="on-add"><input class="on-fid" placeholder="ID do amigo (ex.: SO-7K4Q-92XM)" autocomplete="off" maxlength="14"><button data-act="add">Adicionar</button></div>
          <ul class="on-list"></ul>
        </section>
        <section class="on-card on-room"></section>
      </div>
      <p class="on-msg"></p>
    </div>`;
    root.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) this._act(b.dataset); });
    root.querySelector('.on-name').addEventListener('change', e => { net.setName(e.target.value); this.render(); });
    root.querySelector('.on-fid').addEventListener('keydown', e => { if (e.key === 'Enter') this._act({ act: 'add' }); });
    net.on('status', () => this.render()); net.on('friends', () => this.render()); net.on('room', () => this.render());
    net.on('invite', inv => this._invite(inv));
    net.on('lost', why => { this.say(why, 'warn'); this.hooks.onLost?.(why); });
    net.on('start', cfg => this.hooks.onStart?.(cfg));
    this.toast.addEventListener('click', e => { const b = e.target.closest('[data-inv]'); if (!b) return; const inv = this._inv; this.toast.innerHTML = ''; if (b.dataset.inv === 'yes' && inv) this._join(inv.from); });
  }
  open() { this.isOpen = true; this.root.classList.remove('hidden'); this.net.start().then(() => { this.net.pingAll(); this.render(); }); this.render(); clearInterval(this._pt); this._pt = setInterval(() => this.isOpen && this.net.pingAll(), 12000); }
  close() { this.isOpen = false; clearInterval(this._pt); this.root.classList.add('hidden'); }
  say(t, cls = '') { this.msg = { t, cls }; this.render(); clearTimeout(this._mt); this._mt = setTimeout(() => { this.msg = ''; this.render(); }, 6000); }

  async _join(hostId) {
    await this.net.start(); this.say('Entrando na sala…');
    const r = await this.net.joinRoom(hostId, { skin: getLoadout().skin });
    this.say(r.ok ? 'Você entrou na sala. Espere o anfitrião iniciar.' : r.why, r.ok ? 'ok' : 'warn');
    if (r.ok && !this.isOpen) this.hooks.onShow?.();
  }
  _invite(inv) {
    this._inv = inv; this.hooks.beep?.();
    this.toast.innerHTML = `<div class="on-toast"><b>${esc(inv.name || inv.from)}</b> te convidou para a sala online<span>${esc(inv.from)}</span><div><button data-inv="yes">Entrar</button><button class="ghost" data-inv="no">Agora não</button></div></div>`;
  }
  _act(d) {
    const n = this.net;
    switch (d.act) {
      case 'back': this.hooks.onBack?.(); return;
      case 'copy': navigator.clipboard?.writeText(n.id).then(() => this.say('ID copiado: ' + n.id, 'ok'), () => this.say('Copie à mão: ' + n.id)); return;
      case 'refresh': n.pingAll(); this.say('Procurando quem está online…'); return;
      case 'add': { const inp = this.root.querySelector('.on-fid'); const id = showId(inp.value);
        if (!id) { this.say('ID inválido. É no formato SO-XXXX-XXXX.', 'warn'); return; }
        if (id === n.id) { this.say('Esse é o seu próprio ID.', 'warn'); return; }
        n.addFriend(id); inp.value = ''; this.say('Amigo adicionado: ' + id, 'ok'); this.hooks.beep?.(); return; }
      case 'del': n.removeFriend(d.id); return;
      case 'invite': if (n.invite(d.id)) this.say('Convite enviado.', 'ok'); return;
      case 'join': this._join(d.id); return;
      case 'create': n.start().then(() => { n.createRoom('deathmatch', { skin: getLoadout().skin }); this.say('Sala criada. Convide os amigos.', 'ok'); }); return;
      case 'leave': n.leaveRoom(); return;
      case 'kick': n.kick(d.id); return;
      case 'go': { if (!n.isHost()) return; if (n.room.players.length < 2) { this.say('Espere pelo menos 1 amigo entrar.', 'warn'); return; } n.startMatch({ mode: 'deathmatch' }); return; }
    }
  }
  render() {
    const n = this.net, R = this.root;
    if (document.activeElement !== R.querySelector('.on-name')) R.querySelector('.on-name').value = n.name;
    R.querySelector('.on-myid').textContent = n.id;
    const st = R.querySelector('.on-status'); st.textContent = '● ' + (STATUS[n.status] || n.status); st.className = 'on-status ' + n.status;
    const room = n.room, host = n.isHost();
    R.querySelector('.on-list').innerHTML = n.friends.length ? n.friends.map(f => {
      const o = n.online[f.id], on = o?.online, hasRoom = on && o.room && o.room.open && o.room.host === f.id, inMine = room?.players.some(p => p.id === f.id);
      return `<li class="${on ? 'on' : on === false ? 'off' : ''}"><i></i><span><b>${esc(f.name || 'Amigo')}</b><small>${esc(f.id)} · ${on ? (inMine ? 'na sua sala' : hasRoom ? `sala aberta (${o.room.count})` : o.room?.inGame ? 'jogando' : 'online') : on === false ? 'offline' : '…'}</small></span>
        ${host && on && !inMine ? `<button class="mini" data-act="invite" data-id="${f.id}">Convidar</button>` : ''}
        ${!room && hasRoom ? `<button class="mini" data-act="join" data-id="${f.id}">Entrar</button>` : ''}
        <button class="mini x" data-act="del" data-id="${f.id}" title="Remover">✕</button></li>`; }).join('')
      : '<li class="empty">Nenhum amigo ainda. Peça o ID deles e adicione acima.</li>';
    R.querySelector('.on-friends').classList.toggle('hidden', !room);   // adicionar/convidar amigos: só dentro da sala
    R.querySelector('.on-grid').classList.toggle('noroom', !room);
    const rc = R.querySelector('.on-room');
    if (!room) rc.innerHTML = `<h3>Sala</h3><p class="on-hint">Crie uma sala e convide seus amigos. Modo: <b>mata-mata entre jogadores</b> (mapa WAREHOUSE).</p>
      <button class="on-go" data-act="create"${n.status !== 'on' ? ' disabled' : ''}>Criar sala</button><p class="on-hint">Para entrar na sala de um amigo: passe o seu ID para ele e espere o convite aparecer na tela.</p>`;
    else rc.innerHTML = `<h3>Sala de ${esc(room.hostName)} <small>${room.inGame ? 'em partida' : 'esperando'}</small></h3>
      <ul class="on-players">${room.players.map(p => `<li><b>${esc(p.name)}</b><small>${esc(p.id)}${p.id === room.host ? ' · anfitrião' : ''}${p.id === n.id ? ' · você' : ''}</small>${host && p.id !== n.id ? `<button class="mini x" data-act="kick" data-id="${p.id}">✕</button>` : ''}</li>`).join('')}</ul>
      ${host ? `<button class="on-go" data-act="go"${room.players.length < 2 || room.inGame ? ' disabled' : ''}>INICIAR PARTIDA</button><p class="on-hint">${room.players.length < 2 ? 'Convide pelo menos 1 amigo (lista ao lado).' : 'Todos prontos.'}</p>` : '<p class="on-hint">Esperando o anfitrião iniciar…</p>'}
      <button class="ghost" data-act="leave">${host ? 'Fechar a sala' : 'Sair da sala'}</button>`;
    const m = R.querySelector('.on-msg'); m.textContent = this.msg?.t || ''; m.className = 'on-msg ' + (this.msg?.cls || '');
  }
}
