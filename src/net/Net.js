/**
 * ONLINE (gratuito): conexão direta entre os navegadores (WebRTC) usando o PeerJS e o servidor público grátis dele
 * só para os navegadores se encontrarem. Sem servidor nosso, sem conta, sem custo.
 *
 *  - ID: cada navegador gera um ID uma vez (ex.: SO-7K4Q-92XM) e guarda (localStorage). É o "número" para te adicionarem.
 *  - Amigos: lista salva no navegador (adicionar por ID). Dá para ver quem está online e convidar para a sua sala.
 *  - Sala: quem cria a sala é o ANFITRIÃO; os amigos se conectam a ele (estrela: o anfitrião repassa as mensagens da partida).
 *
 * Mensagens (campo t): hello/ack (está online?), invite (convite), join/room/kick/start/leave (sala), e na partida
 * st (estado do jogador), ev (eventos: tiro, recarga, golpe, acerto, morte) — repassadas pelo anfitrião.
 */
const PEER_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm';
// ?perfil=2 no endereço = outro jogador no mesmo navegador (para testar com duas abas/janelas no mesmo PC)
const PERFIL = typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('perfil') || '').replace(/[^a-z0-9]/gi, '').slice(0, 8) : '';
const SUF = PERFIL ? '.' + PERFIL : '';
const LS_ID = 'shadowops.netId' + SUF, LS_NAME = 'shadowops.netName' + SUF, LS_FRIENDS = 'shadowops.friends' + SUF;
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem 0/O/1/I (fácil de ditar)
const PREFIX = 'shadowops-';

const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
/** "SO-7K4Q-92XM" (o que aparece) <-> "shadowops-7k4q92xm" (o ID na rede) */
export const normId = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SO/, '').slice(0, 8);
export const showId = s => { const n = normId(s); return n.length === 8 ? `SO-${n.slice(0, 4)}-${n.slice(4)}` : ''; };
const peerOf = s => PREFIX + normId(s).toLowerCase();
const idOfPeer = p => showId(String(p).replace(PREFIX, ''));

export class Net {
  constructor() {
    let id = load(LS_ID, null);
    if (!id || normId(id).length !== 8) { id = showId(Array.from({ length: 8 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('')); save(LS_ID, id); }
    this.id = id; this.name = load(LS_NAME, '') || 'Jogador'; this.friends = load(LS_FRIENDS, []);
    this.status = 'off'; this.peer = null; this.listeners = {};
    this.room = null;          // { host: id, hostName, players: [{id,name,skin}], mode, open, inGame }
    this.hostConns = new Map(); // anfitrião: id -> conexão de cada amigo na sala
    this.hostConn = null;       // amigo: conexão com o anfitrião
    this.online = {};           // id -> { online, room, name, t }
  }
  on(ev, fn) { (this.listeners[ev] ??= []).push(fn); return () => { this.listeners[ev] = this.listeners[ev].filter(f => f !== fn); }; }
  emit(ev, ...a) { for (const f of this.listeners[ev] || []) try { f(...a); } catch (e) { console.error(e); } }
  setName(n) { this.name = String(n || '').trim().slice(0, 16) || 'Jogador'; save(LS_NAME, this.name); }

  /** Liga na rede (uma vez). Se o ID já estiver aberto em outra aba, avisa. */
  async start() {
    if (this.peer && !this.peer.destroyed) return this._ready;
    this.status = 'connecting'; this.emit('status', this.status);
    const m = await import(PEER_URL); const Peer = m.Peer || m.default;
    this._ready = new Promise(res => {
      const p = this.peer = new Peer(peerOf(this.id), { debug: 0 });
      p.on('open', () => { this.status = 'on'; this.emit('status', this.status); res(true); });
      p.on('connection', c => this._incoming(c));
      p.on('disconnected', () => { this.status = 'reconnecting'; this.emit('status', this.status); setTimeout(() => { if (!p.destroyed) p.reconnect(); }, 1500); });
      p.on('error', e => {
        if (e.type === 'peer-unavailable') { const who = /shadowops-[a-z0-9]+/.exec(e.message)?.[0]; if (who) this._unavailable(idOfPeer(who)); return; }
        if (e.type === 'unavailable-id') { this.status = 'dup'; this.emit('status', this.status); res(false); return; }
        console.warn('rede:', e.type, e.message);
        if (this.status === 'connecting') { this.status = 'error'; this.emit('status', this.status); res(false); }
      });
      p.on('open', () => { if (this.status !== 'on') { this.status = 'on'; this.emit('status', this.status); } });
    });
    return this._ready;
  }

  /* ---------- amigos ---------- */
  addFriend(id, name = '') {
    const s = showId(id); if (!s || s === this.id) return false;
    const f = this.friends.find(x => x.id === s);
    if (f) { if (name && f.name !== name) { f.name = name; save(LS_FRIENDS, this.friends); this.emit('friends'); } return true; }
    this.friends.push({ id: s, name: name || '' }); save(LS_FRIENDS, this.friends); this.emit('friends'); this.ping(s); return true;
  }
  removeFriend(id) { this.friends = this.friends.filter(f => f.id !== id); save(LS_FRIENDS, this.friends); this.emit('friends'); }
  /** Pergunta a um amigo se ele está online (e se tem sala aberta). */
  ping(id) {
    if (this.status !== 'on') return;
    const c = this._quick(id, { t: 'hello', name: this.name }, ack => { this.online[id] = { online: true, room: ack.room, name: ack.name, t: Date.now() }; if (ack.name) this.addFriend(id, ack.name); this.emit('friends'); });
    if (!c) return;
  }
  pingAll() { for (const f of this.friends) this.ping(f.id); }
  _unavailable(id) { if (this.online[id]?.online !== false) { this.online[id] = { online: false, t: Date.now() }; this.emit('friends'); } this._pending?.get(id)?.forEach(fn => fn(null)); this._pending?.delete(id); }
  /** Conexão curta: manda uma mensagem, espera a resposta (ou desiste) e fecha. */
  _quick(id, msg, onAck, ms = 7000) {
    if (!this.peer || this.status !== 'on') return null;
    const c = this.peer.connect(peerOf(id), { reliable: true, metadata: { quick: true } });
    let done = false; const end = ok => { if (done) return; done = true; clearTimeout(tm); try { c.close(); } catch {} if (!ok && this.online[id]?.online !== false) { this.online[id] = { online: false, t: Date.now() }; this.emit('friends'); } };
    const tm = setTimeout(() => end(false), ms);
    (this._pending ??= new Map()).set(id, [...(this._pending.get(id) || []), () => end(false)]);
    c.on('open', () => c.send(msg));
    c.on('data', d => { if (d?.t === 'ack') { onAck?.(d); end(true); } });
    c.on('error', () => end(false));
    return c;
  }

  /* ---------- convites ---------- */
  invite(id) {
    if (!this.room || this.room.host !== this.id) return false;
    this._quick(id, { t: 'invite', name: this.name, room: this._roomInfo() }, () => {});
    return true;
  }

  /* ---------- sala ---------- */
  _roomInfo() { const r = this.room; return r ? { host: r.host, hostName: r.hostName, count: r.players.length, mode: r.mode, open: !r.inGame, inGame: !!r.inGame } : null; }
  createRoom(mode = 'deathmatch', me = {}) {
    this.leaveRoom(true);
    this.room = { host: this.id, hostName: this.name, mode, inGame: false, players: [{ id: this.id, name: this.name, skin: me.skin || 'izzy' }] };
    this.emit('room', this.room); return this.room;
  }
  /** Entrar na sala de um amigo (pelo ID dele). */
  joinRoom(hostId, me = {}) {
    return new Promise(res => {
      if (this.status !== 'on') return res({ ok: false, why: 'Você ainda não está conectado.' });
      this.leaveRoom(true);
      const c = this.peer.connect(peerOf(hostId), { reliable: true, metadata: { game: true } });
      const tm = setTimeout(() => { try { c.close(); } catch {} res({ ok: false, why: 'O anfitrião não respondeu (está offline?).' }); }, 9000);
      c.on('open', () => c.send({ t: 'join', id: this.id, name: this.name, skin: me.skin || 'izzy' }));
      c.on('data', d => {
        if (d?.t === 'room') { clearTimeout(tm); if (!this.hostConn) { this.hostConn = c; res({ ok: true }); } this.room = d.room; this.emit('room', this.room); return; }
        if (d?.t === 'full') { clearTimeout(tm); res({ ok: false, why: d.why || 'Sala cheia.' }); try { c.close(); } catch {} return; }
        this._gameMsg(d, c);
      });
      c.on('close', () => { if (this.hostConn === c) { this.hostConn = null; const was = this.room; this.room = null; this.emit('room', null); if (was) this.emit('lost', 'O anfitrião saiu ou caiu.'); } });
      c.on('error', () => {});
    });
  }
  leaveRoom(silent = false) {
    if (this.hostConn) { try { this.hostConn.send({ t: 'leave' }); this.hostConn.close(); } catch {} this.hostConn = null; }
    if (this.room?.host === this.id) for (const c of this.hostConns.values()) { try { c.send({ t: 'closed' }); c.close(); } catch {} }
    this.hostConns.clear();
    if (this.room) { this.room = null; if (!silent) this.emit('room', null); }
  }
  isHost() { return !!this.room && this.room.host === this.id; }
  _broadcastRoom() { const msg = { t: 'room', room: this.room }; for (const c of this.hostConns.values()) try { c.send(msg); } catch {} this.emit('room', this.room); }
  kick(id) { const c = this.hostConns.get(id); if (c) { try { c.send({ t: 'closed', why: 'Você foi removido da sala.' }); c.close(); } catch {} } }
  /** Anfitrião começa a partida: todos recebem 'start' com a lista de jogadores. */
  startMatch(cfg = {}) {
    if (!this.isHost()) return null;
    this.room.inGame = true; const start = { t: 'start', cfg: { ...cfg, roster: this.room.players, seed: Math.floor(Math.random() * 1e9) } };
    for (const c of this.hostConns.values()) try { c.send(start); } catch {}
    this._broadcastRoom(); this.emit('start', start.cfg); return start.cfg;
  }
  endMatch() { if (!this.isHost()) return; this.room.inGame = false; for (const c of this.hostConns.values()) try { c.send({ t: 'end' }); } catch {} this._broadcastRoom(); }

  /* ---------- partida: mensagens do jogo ---------- */
  /** Manda uma mensagem da partida para todos (amigo -> anfitrião -> outros; anfitrião -> todos). */
  sendGame(msg) {
    msg.from = this.id;
    if (this.hostConn) { try { this.hostConn.send(msg); } catch {} return; }
    if (this.isHost()) for (const c of this.hostConns.values()) try { c.send(msg); } catch {}
  }
  _gameMsg(d, c) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'start') { this.emit('start', d.cfg); return; }
    if (d.t === 'end') { this.emit('end'); return; }
    if (d.t === 'closed') { const was = this.room; this.room = null; this.hostConn = null; try { c.close(); } catch {} this.emit('room', null); if (was) this.emit('lost', d.why || 'O anfitrião fechou a sala.'); return; }
    if (d.t === 'st' || d.t === 'ev') {
      // anfitrião repassa para os outros amigos da sala
      if (this.isHost()) for (const [id, cc] of this.hostConns) if (id !== d.from) try { cc.send(d); } catch {}
      this.emit('game', d);
    }
  }

  /* ---------- conexões que chegam ---------- */
  _incoming(c) {
    c.on('data', d => {
      if (!d || typeof d !== 'object') return;
      const from = idOfPeer(c.peer);
      if (d.t === 'hello') { c.send({ t: 'ack', name: this.name, room: this._roomInfo() }); if (d.name) this.addFriend(from, d.name); return; }
      if (d.t === 'invite') { c.send({ t: 'ack', name: this.name }); this.addFriend(from, d.name); this.emit('invite', { from, name: d.name, room: d.room }); return; }
      if (d.t === 'join') {
        if (!this.isHost()) { c.send({ t: 'full', why: 'Essa pessoa não está com sala aberta.' }); return; }
        if (this.room.inGame) { c.send({ t: 'full', why: 'A partida já começou. Espere acabar.' }); return; }
        if (this.room.players.length >= 8) { c.send({ t: 'full', why: 'Sala cheia (8).' }); return; }
        this.hostConns.get(from)?.close(); this.hostConns.set(from, c);
        this.room.players = this.room.players.filter(p => p.id !== from).concat({ id: from, name: d.name || 'Amigo', skin: d.skin || 'izzy' });
        this.addFriend(from, d.name); this._broadcastRoom(); this.emit('joined', from);
        c.on('close', () => { if (this.hostConns.get(from) !== c) return; this.hostConns.delete(from); if (this.room) { this.room.players = this.room.players.filter(p => p.id !== from); this._broadcastRoom(); this.emit('left', from); } });
        return;
      }
      if (d.t === 'leave') { try { c.close(); } catch {} return; }
      this._gameMsg(d, c);
    });
    c.on('error', () => {});
  }
}

export const net = new Net();
