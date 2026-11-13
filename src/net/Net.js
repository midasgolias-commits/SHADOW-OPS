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
    this.room = null;          // { host: id, hostName, players: [{id,name,skin}], mode, cfg: {mode,map,bots,diff,max,locked,pass}, inGame }
    this.hostConns = new Map(); // anfitrião: id -> conexão de cada amigo na sala
    this.hostConn = null;       // amigo: conexão com o anfitrião
    this.online = {};           // id -> { online, room, name, t }
    this._roomPass = '';        // anfitrião: senha da sala (NUNCA vai na rede)
    this._invited = new Set();  // anfitrião: IDs convidados (entram sem senha)
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
    const s = showId(id); if (s) this._invited.add(s);   // convidado entra sem senha (mas respeita fechada/limite)
    this._quick(id, { t: 'invite', name: this.name, room: this._roomInfo() }, () => {});
    return true;
  }

  /* ---------- sala ---------- */
  _roomInfo() { const r = this.room; if (!r) return null; const cfg = { ...(r.cfg || {}) }; delete cfg.password; const locked = !!cfg.locked;
    return { host: r.host, hostName: r.hostName, count: r.players.length, mode: r.mode, cfg, locked, pass: !!cfg.pass, open: !r.inGame && !locked, inGame: !!r.inGame }; }
  /** Sala CUSTOM do anfitrião: cfg = { mode, map, bots, diff, max, locked, pass } (pass = só "tem senha"; a senha fica em this._roomPass) */
  createRoom(mode = 'deathmatch', me = {}, cfg = {}) {
    this.leaveRoom(true);
    this._roomPass = ''; this._invited = new Set();
    const c = { mode: 'deathmatch', map: 'warehouse', bots: 0, diff: 'normal', max: 8, locked: false, pass: false };
    roomCfg(c, { mode, ...(cfg || {}) }, 1, this);
    this.room = { host: this.id, hostName: this.name, mode: c.mode, cfg: c, inGame: false, players: [{ id: this.id, name: this.name, ...pub(me) }] };
    this.emit('room', this.room); return this.room;
  }
  /** Anfitrião muda as opções da sala (modo, mapa, bots, dificuldade, limite, fechada, senha). Senha '' = sem senha. */
  setRoomCfg(patch = {}) {
    if (!this.isHost()) return false;
    roomCfg(this.room.cfg ??= { mode: this.room.mode || 'deathmatch', map: 'warehouse', bots: 0, diff: 'normal', max: 8, locked: false, pass: false }, patch || {}, this.room.players.length, this);
    this.room.mode = this.room.cfg.mode; this._broadcastRoom(); return true;
  }
  /** Entrar na sala de um amigo (pelo ID dele). */
  joinRoom(hostId, me = {}, pass = '') {
    return new Promise(res => {
      if (this.status !== 'on') return res({ ok: false, why: 'Você ainda não está conectado.' });
      this.leaveRoom(true);
      const c = this.peer.connect(peerOf(hostId), { reliable: true, metadata: { game: true } });
      const tm = setTimeout(() => { try { c.close(); } catch {} res({ ok: false, why: 'O anfitrião não respondeu (está offline?).' }); }, 9000);
      c.on('open', () => c.send({ t: 'join', id: this.id, name: this.name, pass: String(pass || '').trim().slice(0, 16), ...pub(me) }));
      c.on('data', d => {
        if (d?.t === 'room') { clearTimeout(tm); if (!this.hostConn) { this.hostConn = c; res({ ok: true }); } this.room = d.room; this.emit('room', this.room); return; }
        if (d?.t === 'full') { clearTimeout(tm); res({ ok: false, why: d.why || 'Sala cheia.', needPass: !!d.needPass }); try { c.close(); } catch {} return; }
        this._gameMsg(d, c);
      });
      c.on('close', () => { if (this.hostConn === c) { this.hostConn = null; const was = this.room; this.room = null; this.emit('room', null); if (was) this.emit('lost', 'O anfitrião saiu ou caiu.'); } });
      c.on('error', () => {});
    });
  }
  leaveRoom(silent = false) {
    if (this.hostConn) { try { this.hostConn.send({ t: 'leave' }); this.hostConn.close(); } catch {} this.hostConn = null; }
    if (this.room?.host === this.id) for (const c of this.hostConns.values()) { try { c.send({ t: 'closed' }); c.close(); } catch {} }
    this.hostConns.clear(); this._roomPass = ''; this._invited = new Set();
    if (this.room) { this.room = null; if (!silent) this.emit('room', null); }
  }
  isHost() { return !!this.room && this.room.host === this.id; }
  _broadcastRoom() { const msg = { t: 'room', room: this.room }; for (const c of this.hostConns.values()) try { c.send(msg); } catch {} this.emit('room', this.room); }
  kick(id) { const c = this.hostConns.get(id); if (c) { try { c.send({ t: 'closed', why: 'Você foi removido da sala.' }); c.close(); } catch {} } }
  /** Anfitrião começa a partida: todos recebem 'start' com a lista de jogadores. */
  startMatch(cfg = {}) {
    if (!this.isHost()) return null;
    this.room.inGame = true; const rc = { ...(this.room.cfg || {}) }; delete rc.password;
    const start = { t: 'start', cfg: { ...rc, ...cfg, roster: this.room.players, seed: Math.floor(Math.random() * 1e9) } };
    for (const c of this.hostConns.values()) try { c.send(start); } catch {}
    this._broadcastRoom(); this.emit('start', start.cfg); return start.cfg;
  }
  endMatch() { if (!this.isHost()) return; this.room.inGame = false; for (const c of this.hostConns.values()) try { c.send({ t: 'end' }); } catch {} this._broadcastRoom(); }

  /* ---------- partida: mensagens do jogo ---------- */
  /** Manda uma mensagem da partida para todos (amigo -> anfitrião -> outros; anfitrião -> todos). */
  /** atualiza o que os outros veem de mim na sala (skin, armas, patente, nome) */
  updateMe(me = {}) {
    if (!this.room) return;
    if (this.isHost()) { const p = this.room.players.find(x => x.id === this.id); if (p) { Object.assign(p, pub(me)); p.name = this.name; this._broadcastRoom(); } }
    else if (this.hostConn) try { this.hostConn.send({ t: 'upd', name: this.name, ...pub(me) }); } catch {}
  }
  /** chat de texto da sala (vai para todos da sala online) */
  sendChat(name, text) { if (!this.room) return false; const m = { t: 'chat', name, text: String(text).slice(0, 120) }; this.sendGame(m); this.emit('chat', m); return true; }
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
    if (d.t === 'chat') {   // chat da sala: o anfitrião repassa para todos
      if (this.isHost()) for (const [id, cc] of this.hostConns) if (id !== d.from) try { cc.send(d); } catch {}
      this.emit('chat', d); return;
    }
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
      if (d.t === 'hello') {
        c.send({ t: 'ack', name: this.name, room: this._roomInfo() });
        const novo = !this.friends.some(f => f.id === from);
        if (d.name) this.addFriend(from, d.name);
        if (novo) this.emit('newFriend', { id: from, name: d.name || from });   // alguém te adicionou: vira notificação no sino
        return;
      }
      if (d.t === 'invite') { c.send({ t: 'ack', name: this.name }); this.addFriend(from, d.name); this.emit('invite', { from, name: d.name, room: d.room }); return; }
      if (d.t === 'join') {
        if (!this.isHost()) { c.send({ t: 'full', why: 'Essa pessoa não está com sala aberta.' }); return; }
        if (this.room.inGame) { c.send({ t: 'full', why: 'A partida já começou. Espere acabar.' }); return; }
        const rc = this.room.cfg || {}, max = rc.max || 8;
        if (rc.locked) { c.send({ t: 'full', why: 'A sala está fechada.' }); return; }
        if (this.room.players.length >= max && !this.room.players.some(p => p.id === from)) { c.send({ t: 'full', why: `Sala cheia (${max}).` }); return; }
        if (this._roomPass && !this._invited?.has(from) && d.pass !== this._roomPass) { c.send({ t: 'full', needPass: true, why: d.pass ? 'Senha errada.' : 'Esta sala tem senha.' }); return; }
        this.hostConns.get(from)?.close(); this.hostConns.set(from, c);
        this.room.players = this.room.players.filter(p => p.id !== from).concat({ id: from, name: d.name || 'Amigo', ...pub(d) });
        this.addFriend(from, d.name); this._broadcastRoom(); this.emit('joined', from);
        c.on('close', () => { if (this.hostConns.get(from) !== c) return; this.hostConns.delete(from); if (this.room) { this.room.players = this.room.players.filter(p => p.id !== from); this._broadcastRoom(); this.emit('left', from); } });
        return;
      }
      if (d.t === 'upd') { const p = this.room?.players.find(x => x.id === from); if (p && this.isHost()) { Object.assign(p, pub(d)); if (d.name) p.name = String(d.name).slice(0, 16); this._broadcastRoom(); } return; }
      if (d.t === 'leave') { try { c.close(); } catch {} return; }
      this._gameMsg(d, c);
    });
    c.on('error', () => {});
  }
}

/** junta no cfg da sala só os campos válidos do patch (a senha vai para net._roomPass, nunca para o cfg) */
const MODES = ['competitive', 'deathmatch', 'training'], MAPS = ['warehouse', 'celeiro'], DIFFS = ['easy', 'normal', 'hard'];
function roomCfg(c, p, count, net) {
  const int = (v, a, b) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : undefined; };
  if (MODES.includes(p.mode)) c.mode = p.mode;
  if (MAPS.includes(p.map)) c.map = p.map;
  if (DIFFS.includes(p.diff)) c.diff = p.diff;
  if (p.bots != null) { const n = int(p.bots, 0, 9); if (n != null) c.bots = n; }
  if (p.max != null) { const n = int(p.max, 2, 8); if (n != null) c.max = Math.max(n, Math.min(8, count || 1)); }
  if (p.locked != null) c.locked = !!p.locked;
  if (typeof p.password === 'string') { net._roomPass = p.password.trim().slice(0, 16); c.pass = !!net._roomPass; }
  delete c.password; return c;
}

/** dados públicos do jogador na sala: skin, armas equipadas e patente (para os outros verem e inspecionarem) */
function pub(m = {}) {
  const w = v => typeof v === 'string' && /^[a-z0-9_]{1,20}$/.test(v) ? v : undefined;
  return { skin: w(m.skin) || 'izzy', avatar: w(m.avatar), primary: w(m.primary), secondary: w(m.secondary), melee: w(m.melee), rank: Number.isInteger(m.rank) && m.rank >= 0 && m.rank < 91 ? m.rank : 0 };
}
export const net = new Net();
