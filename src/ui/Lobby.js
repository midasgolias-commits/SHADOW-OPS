import { buildMapData } from '../world/MapData.js';
import { Minimap } from './Minimap.js';
import { WEAPONS } from '../weapons/Weapons.js';
import { SKINS, SLOTS, getLoadout, setLoadout } from './Loadout.js';
import { CharacterPreview } from './CharacterPreview.js';
import { weaponPhoto } from './Inventory.js';

const AGENTS = [
  { id: 'viper', name: 'VIPER', role: 'Assalto', c: '#d9482b', desc: 'Pressiona os corredores e abre espaço para o time entrar.' },
  { id: 'ghost', name: 'GHOST', role: 'Furtivo', c: '#3d8bd9', desc: 'Silencioso e paciente, flanqueia pelas rotas laterais.' },
  { id: 'rook', name: 'ROOK', role: 'Defensor', c: '#c9b458', desc: 'Segura o bombsite e trava a entrada do inimigo.' },
  { id: 'nova', name: 'NOVA', role: 'Suporte', c: '#53d36e', desc: 'Coordena o time e cobre os companheiros.' }
];
const BOT_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'Indigo', 'Juliet', 'Kilo', 'Lima', 'Mike', 'Nash', 'Oscar'];
const DIFF = { k: 'diff', label: 'Dificuldade dos bots', v: 'normal', opts: [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']] };
const MODES = {
  competitive: {
    title: 'COMPETITIVO', sub: 'Ataque contra defesa, 5v5, C4, 13 rodadas e prorrogação.', teams: { att: 5, def: 5 },
    cfg: [DIFF, { k: 'round', label: 'Tempo da rodada', v: 100, opts: [[100, '1:40'], [120, '2:00']] },
      { k: 'ot', label: 'Prorrogação', v: 1, opts: [[1, 'Ativada'], [0, 'Desativada']] }]
  },
  deathmatch: {
    title: 'MATA-MATA', sub: 'Todos contra todos, com respawn contínuo.', teams: { ffa: 8 },
    cfg: [DIFF, { k: 'kills', label: 'Limite de abates', v: 30, opts: [[20, '20'], [30, '30'], [50, '50']] },
      { k: 'minutes', label: 'Duração', v: 10, opts: [[5, '5 min'], [10, '10 min']] }]
  }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badge = a => `<svg viewBox="0 0 84 96" aria-hidden="true"><path d="M42 4 80 18V50C80 74 62 88 42 93 22 88 4 74 4 50V18Z" fill="#0f1519" stroke="${a.c}" stroke-width="5"/><text x="42" y="62" text-anchor="middle" font-size="44" font-weight="700" fill="${a.c}" font-family="Impact,Arial Narrow,sans-serif">${a.name[0]}</text></svg>`;

export class Lobby {
  constructor(root, hooks) {
    this.root = root; this.hooks = hooks; this.s = null; this.cd = 0; this.timer = null; this.logs = []; this.tab = 'info'; this.preview = null;
    this.map = buildMapData();
    root.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) this._act(b.dataset); });
    root.addEventListener('input', e => { if (e.target.id === 'lbName') this.s.name = e.target.value; });
    root.addEventListener('change', e => {
      const k = e.target.dataset.k; if (!k) return;
      const o = MODES[this.s.mode].cfg.find(c => c.k === k).opts.find(o => String(o[0]) === e.target.value);
      this.s.cfg[k] = o[0];
    });
  }

  open(mode) {
    this._stop();
    if (!this.s || this.s.mode !== mode) { this._init(mode); }
    this._shell(); this._render(); this._startPreview();
  }
  close() { this._stop(); this.preview?.stop(); }
  /** Estrutura fixa: palco do personagem (canvas 3D não é recriado) + painel da esquerda + sala à direita. */
  _shell() {
    if (this.root.querySelector('.lb2')) return;
    this.root.innerHTML = `<div class="lb2">
      <aside class="lb2-left">
        <div class="lb2-stage"><canvas class="lb2-char" aria-label="Seu personagem"></canvas>
          <div class="lb2-who"><small>SKIN</small><b class="lb2-skin"></b></div>
          <ul class="lb2-eq"></ul><p class="lb2-tip">arraste para girar</p><p class="lb2-wait">Carregando personagem…</p></div>
        <nav class="lb2-tabs"><button data-act="tab" data-tab="info">Informação</button><button data-act="tab" data-tab="bag">Mochila</button></nav>
        <div class="lb2-panel"></div>
      </aside>
      <section class="lb2-right"></section>
    </div>`;
  }
  _startPreview() {
    const a = this.hooks.assets, L = getLoadout();
    if (!a?.ready) { clearTimeout(this._wt); this._wt = setTimeout(() => this.s && this._startPreview(), 400); return; }
    this.preview ??= new CharacterPreview(this.root.querySelector('.lb2-char'), a);
    this.preview.set(L.skin, L.primary); this.preview.start();
    this.root.querySelector('.lb2-wait')?.classList.add('hidden');
  }
  _stop() { clearInterval(this.timer); this.timer = null; this.cd = 0; }
  /** Mochila (inventário em tela cheia, estilo Point Blank). A sala para de desenhar o personagem enquanto ela está aberta. */
  openBag() { if (this.cd) { this._stop(); this._log('Início cancelado', 'warn'); } this.preview?.stop(); this.hooks.openInventory?.(); }
  /** Volta da mochila: o personagem da sala mostra o que foi equipado. */
  afterBag() { const L = getLoadout(); this.preview?.set(L.skin, L.primary); this.preview?.start(); this._render(); }
  logEquip(name) { this._log('Equipado: ' + name, 'ok'); }

  _init(mode) {
    const M = MODES[mode], used = new Set();
    const bot = () => { const n = BOT_NAMES.find(x => !used.has(x)) || 'Bot' + used.size; used.add(n); return { bot: true, name: n, agent: used.size % AGENTS.length }; };
    const teams = {}; let first = true;
    for (const [k, n] of Object.entries(M.teams)) teams[k] = Array.from({ length: n }, () => { if (first) { first = false; return { me: true }; } return bot(); });
    this.s = { mode, name: 'Jogador', agent: 0, teams, cfg: Object.fromEntries(M.cfg.map(c => [c.k, c.v])) };
    this.logs = [];
    this._log(`Sala criada: ${M.title}`, 'ok'); this._log(`Mapa: ${this.map.name}`);
  }
  _log(t, cls = '') { this.logs.push({ t, cls }); if (this.logs.length > 5) this.logs.shift(); }
  _newBot() {
    const used = new Set(Object.values(this.s.teams).flat().filter(p => p?.bot).map(p => p.name));
    const n = BOT_NAMES.find(x => !used.has(x)) || 'Bot' + (used.size + 1);
    return { bot: true, name: n, agent: used.size % AGENTS.length };
  }

  _act(d) {
    const s = this.s, n = AGENTS.length, slots = s.teams[d.t];
    switch (d.act) {
      case 'prev': case 'next': s.agent = (s.agent + (d.act === 'next' ? 1 : n - 1)) % n; this.hooks.beep?.(); break;
      case 'join':
        for (const arr of Object.values(s.teams)) arr.forEach((p, i) => { if (p?.me) arr[i] = null; });
        slots[+d.i] = { me: true }; this._log(`${s.name || 'Jogador'} trocou de vaga`); this.hooks.beep?.(); break;
      case 'bot': slots[+d.i] = this._newBot(); this._log(`Bot ${slots[+d.i].name} adicionado`); this.hooks.beep?.(); break;
      case 'kick': this._log(`Bot ${slots[+d.i].name} removido`, 'warn'); slots[+d.i] = null; this.hooks.beep?.(); break;
      case 'settings': this._stop(); this._render(); this.hooks.onSettings?.(); return;
      case 'exit': this._stop(); this.preview?.stop(); this.hooks.onExit?.(); return;
      case 'tab': if (d.tab === 'bag') { this.hooks.beep?.(); this.openBag(); return; } this.tab = d.tab; this.hooks.beep?.(); break;
      case 'bag': this.hooks.beep?.(); this.openBag(); return;
      case 'equip': {   // mochila: equipa skin/arma (vale para a próxima partida)
        const L = setLoadout({ [d.slot]: d.id }); this.hooks.beep?.();
        this.preview?.set(L.skin, d.slot === 'secondary' || d.slot === 'melee' ? d.id : L.primary);
        this._log(`${d.slot === 'skin' ? 'Skin' : 'Equipado'}: ${d.slot === 'skin' ? SKINS.find(x => x.id === d.id).name : WEAPONS[d.id].name}`, 'ok'); break;
      }
      case 'go': if (this.cd) { this._stop(); this._log('Início cancelado', 'warn'); } else this._countdown(); break;
    }
    this._render();
  }

  _countdown() {
    this.cd = 3; this.hooks.beep?.();
    this.timer = setInterval(() => {
      this.cd--;
      if (this.cd <= 0) { this._stop(); this._start(); return; }
      this.hooks.beep?.(); this._render();
    }, 1000);
  }

  _start() {
    this.preview?.stop();
    const s = this.s, M = MODES[s.mode], players = [];
    for (const [team, arr] of Object.entries(s.teams)) arr.forEach((p, slot) => {
      if (!p) return;
      const a = AGENTS[p.me ? s.agent : p.agent];
      players.push({ team, slot, me: !!p.me, bot: !!p.bot, name: p.me ? (s.name.trim() || 'Jogador') : p.name, agent: a.id });
    });
    this.hooks.onStart?.({ mode: s.mode, title: M.title + (s.mode === 'competitive' ? ' 5v5' : ''), map: this.map.name,
      me: players.find(p => p.me), players, bots: players.filter(p => p.bot), loadout: getLoadout(), ...s.cfg });
  }

  _issues() {
    const s = this.s, out = [], t = s.teams, cnt = a => a.filter(Boolean).length;
    if (s.mode === 'competitive') {
      const a = cnt(t.att), d = cnt(t.def);
      if (!a || !d) out.push({ t: 'Cada time precisa de ao menos 1 jogador.', cls: 'warn', block: true });
      else if (a !== d) out.push({ t: `Times desiguais: ${a} contra ${d}.`, cls: 'warn' });
    } else if (cnt(t.ffa) < 2) out.push({ t: 'Adicione ao menos 1 bot para jogar.', cls: 'warn', block: true });
    if (!out.length) out.push({ t: 'Sala pronta para iniciar.', cls: 'ok' });
    return out;
  }

  _slot(key, p, i) {
    const at = `data-t="${key}" data-i="${i}"`;
    if (!p) return `<li class="empty"><span class="nm"><b>Vaga livre</b></span><button class="mini" data-act="join" ${at}>Entrar</button><button class="mini" data-act="bot" ${at}>+ Bot</button></li>`;
    const a = AGENTS[p.me ? this.s.agent : p.agent], name = p.me ? (this.s.name.trim() || 'Jogador') : p.name;
    return `<li class="${p.me ? 'me' : ''}"><span class="ic">${badge(a)}</span><span class="nm"><b>${esc(name)}</b><small>${a.name}, ${a.role}</small></span>`
      + (p.me ? '<span class="tag">VOCÊ</span>' : `<span class="tag">BOT</span><button class="mini x" data-act="kick" ${at} aria-label="Remover bot">✕</button>`) + '<span class="ok">PRONTO</span></li>';
  }

  /** Painel da esquerda: classe, nome e o que está equipado (fotos). A aba Mochila abre o inventário em tela cheia (Inventory.js). */
  _left() {
    const s = this.s, ag = AGENTS[s.agent], L = getLoadout();
    const skin = SKINS.find(x => x.id === L.skin);
    this.root.querySelector('.lb2-skin').textContent = skin.name;
    this.root.querySelector('.lb2-eq').innerHTML = SLOTS.map(sl => `<li><span>${sl.key}</span><img src="${weaponPhoto(L[sl.k])}" alt=""><b>${WEAPONS[L[sl.k]].name}</b></li>`).join('');
    this.root.querySelectorAll('.lb2-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    const P = this.root.querySelector('.lb2-panel');
    if (this.tab === 'info') {
      P.innerHTML = `<div class="lb2-info" style="--c:${ag.c}">
        <div class="lb2-agent"><span class="ic">${badge(ag)}</span><div><small>${ag.role}</small><h3>${ag.name}</h3></div>
          <div class="agent-sw"><button data-act="prev" aria-label="Classe anterior">‹</button><button data-act="next" aria-label="Próxima classe">›</button></div></div>
        <p>${ag.desc}</p>
        <label class="lb2-nm">Seu nome<input id="lbName" maxlength="16" value="${esc(s.name)}" autocomplete="off"></label>
        <div class="lb2-bagbtn"><h4>Equipado para a partida</h4><div class="eqrow">${SLOTS.map(sl => `<div><img src="${weaponPhoto(L[sl.k])}" alt=""><b>${WEAPONS[L[sl.k]].name}</b><small>${sl.label} · tecla ${sl.key}</small></div>`).join('')}</div>
          <button data-act="bag">ABRIR MOCHILA</button></div></div>`;
    }
  }

  _render() {
    const s = this.s, M = MODES[s.mode], iss = this._issues(), blocked = iss.some(i => i.block), cd = this.cd;
    const team = (key, label, cls) => { const arr = s.teams[key];
      return `<div class="team team-${cls}"><div class="team-h"><span>${label}</span><span>${arr.filter(Boolean).length}/${arr.length}</span></div><ul${key === 'ffa' ? ' class="two-col"' : ''}>${arr.map((p, i) => this._slot(key, p, i)).join('')}</ul></div>`; };
    const comp = s.mode === 'competitive';
    this._left();
    this.root.querySelector('.lb2-right').innerHTML = `
      <div class="lb2-top"><div><h2>Sala: ${M.title}</h2><p>${M.sub}</p></div>
        <div class="lb-btns"><button class="ghost" data-act="settings">Configurações</button><button class="ghost" data-act="exit">Sair</button></div></div>
      <div class="lb-teams${comp ? ' two' : ''}">${comp ? team('att', 'ATAQUE', 'att') + team('def', 'DEFESA', 'def') : team('ffa', 'TODOS CONTRA TODOS', 'ffa')}</div>
      <div class="lb2-bottom">
        <div class="lb-map"><canvas width="250" height="200"></canvas><b>${this.map.name}</b></div>
        <div class="lb-cfg">${M.cfg.map(c => `<label>${c.label}<select data-k="${c.k}">${c.opts.map(o => `<option value="${o[0]}"${o[0] === s.cfg[c.k] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></label>`).join('')}</div>
        <div class="lb-log"><h4>Registro</h4><ol>${[...iss, ...this.logs.slice().reverse()].map(l => `<li class="${l.cls}">${esc(l.t)}</li>`).join('')}</ol></div>
      </div>
      <div class="lb2-go"><small>${cd ? `Começando em ${cd}...` : blocked ? 'Corrija os avisos para iniciar.' : 'Tudo pronto.'}</small>
        <button class="go${cd ? ' cancel' : ''}" data-act="go"${blocked && !cd ? ' disabled' : ''}>${cd ? `Cancelar (${cd})` : 'JOGAR'}</button>
        <button class="ghost lb2-exit" data-act="exit">SAIR</button></div>`;
    new Minimap(this.root.querySelector('.lb-map canvas'), this.map).draw(null);
  }
}
