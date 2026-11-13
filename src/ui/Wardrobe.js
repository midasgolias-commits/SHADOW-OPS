import { getLoadout, setLoadout, SKINS } from './Loadout.js';
import { WEAPONS } from '../weapons/Weapons.js';
import { WEAPON_SKINS, skinSwatch, getWeaponSkin, setWeaponSkin } from '../weapons/WeaponSkins.js';
import { getStats, kda, hsRate, resetStats } from '../core/Stats.js';
import { weaponPhoto, charPhoto } from './WeaponPhoto.js';
import { AVATARS, RARITY, avatarSVG, getProfile, setProfile } from './Avatars.js';

/**
 * CUSTOMIZAR (como o Customize do PUBG): janela grande de vidro à esquerda; o personagem 3D continua no mesmo lugar e mostra as provas.
 * Abas: PERSONAGEM (trocar personagem) · ARMAS (skins por arma) · PERFIL (nome e avatar) · CARREIRA (estatísticas / KDA).
 * Em todas: clicar só prova; SALVAR grava; RESTAURAR volta ao salvo; fechar sem salvar desfaz as provas.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7Z"/></svg>';
const TABS = [['char', 'Personagem', 'visual do operador'], ['weapons', 'Armas', 'skins das armas'], ['profile', 'Perfil', 'nome e avatar'], ['career', 'Carreira', 'estatísticas e KDA']];
const KINDS = [['Fuzil', 'Fuzis'], ['Submetralhadora', 'Submetralhadoras'], ['Sniper', 'Snipers'], ['Escopeta', 'Escopetas'], ['Pistola', 'Pistolas'], ['Corpo a corpo', 'Facas']];
const KNIVES = new Set(['knife', 'karambit', 'faca2']);
const MODE_NAME = { competitive: 'Modo Favela', deathmatch: 'Mata-mata' };
const MAP_NAME = { warehouse: 'Warehouse', celeiro: 'Celeiro' };
const rar = id => RARITY[id] || RARITY.comum;
const fmtMin = m => { m = Math.round(m || 0); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const when = t => { const d = new Date(t); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
// lista de armas (uma vez cada), na ordem das categorias
const GUNS = Object.values(WEAPONS).filter((w, i, a) => a.findIndex(x => x.id === w.id) === i);

export class Wardrobe {
  /** hooks: { beep, preview(): CharacterPreview|null, net, onSkin(), onProfile() } */
  constructor(tabsEl, panel, hooks) {
    this.tabsEl = tabsEl; this.panel = panel; this.hooks = hooks; this.isOpen = false; this.tab = 'char';
    this.kind = KINDS[0][0]; this.wsel = GUNS.find(w => w.kind === this.kind)?.id;
    tabsEl.innerHTML = TABS.map(([k, n, s]) => `<button type="button" class="fm-hover" data-wr-tab="${k}" role="tab"><b>${n}</b><small>${s}</small></button>`).join('');
    panel.innerHTML = `<header class="wr-head"><div class="wr-title"><b></b><small class="wr-count"></small></div>
        <button type="button" class="fc-x fm-hover" data-wr="close" aria-label="Fechar">✕</button></header>
      <div class="wr-body"></div><footer class="wr-foot"></footer><p class="wr-toast" role="status"></p>`;
    tabsEl.addEventListener('click', e => { const b = e.target.closest('[data-wr-tab]'); if (b) this.go(b.dataset.wrTab); });
    panel.addEventListener('click', e => this._click(e));
    panel.addEventListener('input', e => { if (e.target.matches('.wr-name')) { this.d.name = e.target.value; this._foot(); this._card(); } });
    panel.addEventListener('keydown', e => {   // setas andam pela grade (prova o item ao lado)
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      const it = e.target.closest?.('[data-wr-item]'); if (!d || !it) return;
      const all = [...this.panel.querySelectorAll('[data-wr-item]')], i = all.indexOf(it), nx = all[(i + d + all.length) % all.length];
      e.preventDefault(); nx.click(); this.panel.querySelector(`[data-wr-item="${nx.dataset.wrItem}"]`)?.focus({ preventScroll: true });
    });
    addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !this.isOpen || e.defaultPrevented || document.querySelector('#settings:not(.hidden)')) return;
      e.preventDefault(); this.close();
    });
  }

  /* ---------- abrir / fechar ---------- */
  open(tab = this.tab) { this.isOpen = true; this._reset(); this.go(tab, true); }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; this._showSaved(); this.hooks.onClose?.();
  }
  /** rascunho = o que está salvo agora */
  _reset() {
    const L = getLoadout(), P = getProfile();
    this.d = { skin: L.skin, wskins: {}, name: this.hooks.net?.name || 'Jogador', avatar: P.avatar };
  }
  /** personagem 3D volta a mostrar o que está salvo */
  _showSaved() { const L = getLoadout(), pv = this.hooks.preview?.(); if (!pv) return; pv.set(L.skin, L.primary); pv.held?.applySkin?.(getWeaponSkin(L.primary)); }
  get draftSkin() { return this.isOpen ? this.d?.skin : null; }

  go(tab, force) {
    if (!force && tab === this.tab) return;
    this.tab = tab; this.hooks.beep?.();
    this.tabsEl.querySelectorAll('[data-wr-tab]').forEach(b => { const on = b.dataset.wrTab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    this.panel.dataset.tab = tab;
    this._preview(); this.render();
    this.panel.querySelector('[data-wr-item].sel, .wr-name, [data-wr-kind].on')?.focus({ preventScroll: true });
  }
  /** o que o personagem 3D mostra em cada aba */
  _preview() {
    const pv = this.hooks.preview?.(); if (!pv) return; const L = getLoadout();
    if (this.tab === 'weapons' && this.wsel) { pv.set(this.d.skin, this.wsel); pv.held?.applySkin?.(this._wskin(this.wsel)); }
    else { pv.set(this.d.skin, L.primary); pv.held?.applySkin?.(this._wskin(L.primary)); }
  }
  _wskin(id) { return this.d.wskins[id] ?? getWeaponSkin(id); }

  /* ---------- cliques ---------- */
  _click(e) {
    const b = e.target.closest('[data-wr], [data-wr-item], [data-wr-kind], [data-wr-gun]'); if (!b || b.disabled) return;
    if (b.dataset.wrKind) { this.kind = b.dataset.wrKind; this.wsel = GUNS.find(w => w.kind === this.kind)?.id; this.hooks.beep?.(); this._preview(); this.render(); return; }
    if (b.dataset.wrGun) { this.wsel = b.dataset.wrGun; this.hooks.beep?.(); this._preview(); this.render(); return; }
    if (b.dataset.wrItem) {
      const v = b.dataset.wrItem; this.hooks.beep?.();
      if (this.tab === 'char') this.d.skin = v;
      else if (this.tab === 'weapons') this.d.wskins[this.wsel] = v;
      else if (this.tab === 'profile') this.d.avatar = v;
      this._preview(); this.render(); this.panel.querySelector(`[data-wr-item="${v}"]`)?.focus({ preventScroll: true }); return;
    }
    switch (b.dataset.wr) {
      case 'close': this.hooks.beep?.(); this.close(); return;
      case 'save': this._save(); return;
      case 'reset': this.hooks.beep?.(); this._reset(); this._preview(); this.render(); this._toast('Voltou ao que estava salvo.'); return;
      case 'random': {
        this.hooks.beep?.();
        if (this.tab === 'char') this.d.skin = SKINS[Math.floor(Math.random() * SKINS.length)].id;
        if (this.tab === 'weapons') this.d.wskins[this.wsel] = WEAPON_SKINS[Math.floor(Math.random() * WEAPON_SKINS.length)].id;
        if (this.tab === 'profile') this.d.avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)].id;
        this._preview(); this.render(); return; }
      case 'zero':
        if (!confirm('Zerar todas as suas estatísticas? Não dá para desfazer.')) return;
        resetStats(); this.hooks.beep?.(); this.render(); this._toast('Estatísticas zeradas.'); return;
    }
  }
  _dirty() {
    const L = getLoadout();
    if (this.tab === 'char') return this.d.skin !== L.skin;
    if (this.tab === 'weapons') return Object.entries(this.d.wskins).some(([w, s]) => s !== getWeaponSkin(w));
    if (this.tab === 'profile') return this.d.name.trim() !== (this.hooks.net?.name || 'Jogador') || this.d.avatar !== getProfile().avatar;
    return false;
  }
  _save() {
    if (!this._dirty()) return;
    this.hooks.beep?.();
    if (this.tab === 'char') { setLoadout({ skin: this.d.skin }); this.hooks.onSkin?.(); this._toast('Personagem salvo: ' + (SKINS.find(s => s.id === this.d.skin)?.name || '')); }
    if (this.tab === 'weapons') { const n = Object.entries(this.d.wskins).filter(([w, s]) => s !== getWeaponSkin(w)); n.forEach(([w, s]) => setWeaponSkin(w, s)); this.d.wskins = {}; this._toast(`${n.length} skin${n.length > 1 ? 's' : ''} de arma salva${n.length > 1 ? 's' : ''}.`); }
    if (this.tab === 'profile') {
      const nm = this.d.name.trim().slice(0, 16);
      if (nm.length < 2) { this._toast('O nome precisa ter pelo menos 2 letras.'); return; }
      this.hooks.net?.setName(nm); this.d.name = this.hooks.net?.name || nm; setProfile({ avatar: this.d.avatar }); this.hooks.onProfile?.(); this._toast('Perfil salvo.');
    }
    this.render();
  }
  _toast(t) {
    const el = this.panel.querySelector('.wr-toast'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), 2000);
  }

  /* ---------- desenho ---------- */
  render() {
    if (!this.isOpen) return;
    const t = TABS.find(x => x[0] === this.tab), body = this.panel.querySelector('.wr-body');
    this.panel.querySelector('.wr-title b').textContent = t[1];
    if (this.tab === 'char') body.innerHTML = this._char();
    if (this.tab === 'weapons') body.innerHTML = this._weapons();
    if (this.tab === 'profile') { const keep = this.panel.querySelector('.wr-name'); if (!keep) body.innerHTML = this._profile(); else this._profileGrid(); this._card(); }
    if (this.tab === 'career') body.innerHTML = this._career();
    this._foot();
  }
  _foot() {
    const f = this.panel.querySelector('.wr-foot');
    if (this.tab === 'career') { f.innerHTML = `<button type="button" class="fm-hover wr-zero" data-wr="zero">Zerar estatísticas</button>`; return; }
    const dirty = this._dirty();
    f.innerHTML = `<button type="button" class="fm-hover wr-save" data-wr="save"${dirty ? '' : ' disabled'}>Salvar</button>
      <button type="button" class="fm-hover wr-reset" data-wr="reset"${dirty ? '' : ' disabled'}>Restaurar</button>
      <button type="button" class="fm-hover wr-rand" data-wr="random" title="Escolher um aleatório">Aleatório</button>`;
  }
  _tile({ id, name, img, swatch, rarity, sel, used, sub }) {
    const r = rar(rarity);
    return `<button type="button" class="wr-item fm-hover${sel ? ' sel' : ''}${used ? ' used' : ''}" data-wr-item="${esc(id)}" role="radio" aria-checked="${!!sel}" tabindex="${sel ? 0 : -1}" style="--r:${r.c}" title="${esc(name)} · ${r.name}${used ? ' · em uso' : ''}">
      <span class="wr-ph"${swatch ? ` style="background:${swatch}"` : ''}>${img || ''}</span>
      <span class="wr-nm">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${used ? `<span class="wr-chk" title="Em uso">${CHECK}</span>` : ''}</button>`;
  }
  _info(small, name, desc, rarity) {
    const r = rar(rarity);
    return `<div class="wr-info"><small><i style="background:${r.c}"></i>${esc(small)}</small><b>${esc(name)}</b><p>${esc(desc || '')}</p></div>`;
  }
  _char() {
    const L = getLoadout(), s = SKINS.find(x => x.id === this.d.skin) || SKINS[0];
    this.panel.querySelector('.wr-count').textContent = `${SKINS.length} itens`;
    return `<div class="wr-split"><nav class="wr-cats"><button type="button" class="on">Personagem</button></nav>
      <div class="wr-main"><div class="wr-grid" role="radiogroup" aria-label="Personagens">${SKINS.map(k => this._tile({ id: k.id, name: k.name, rarity: k.rarity, sel: k.id === this.d.skin, used: k.id === L.skin, img: `<img src="${charPhoto(k.id)}" alt="" draggable="false" class="wr-char">` })).join('')}</div>
      ${this._info(`${rar(s.rarity).name} · ${s.role || 'Operador'} · ${s.id === L.skin ? 'Em uso' : 'Provando'}`, s.name, s.desc, s.rarity)}</div></div>`;
  }
  _weapons() {
    const guns = GUNS.filter(w => w.kind === this.kind), w = WEAPONS[this.wsel] || guns[0], cur = this._wskin(w.id), saved = getWeaponSkin(w.id);
    const sk = WEAPON_SKINS.find(x => x.id === cur) || WEAPON_SKINS[0];
    this.panel.querySelector('.wr-count').textContent = `${WEAPON_SKINS.length} skins · ${GUNS.length} armas`;
    return `<div class="wr-split"><nav class="wr-cats" aria-label="Tipo de arma">${KINDS.map(([k, n]) => `<button type="button" class="fm-hover${k === this.kind ? ' on' : ''}" data-wr-kind="${esc(k)}">${n}<small>${GUNS.filter(g => g.kind === k).length}</small></button>`).join('')}</nav>
      <div class="wr-main"><div class="wr-guns" role="tablist" aria-label="Arma">${guns.map(g => `<button type="button" class="fm-hover${g.id === w.id ? ' on' : ''}" data-wr-gun="${g.id}" title="${esc(g.name)}"><img src="${weaponPhoto(g.id)}" alt="" draggable="false"><b>${esc(g.name)}</b>${getWeaponSkin(g.id) !== 'padrao' ? '<i title="Com skin"></i>' : ''}</button>`).join('')}</div>
        <div class="wr-grid" role="radiogroup" aria-label="Skins da ${esc(w.name)}">${WEAPON_SKINS.map(s => this._tile({ id: s.id, name: s.name, rarity: s.rarity, sel: s.id === cur, used: s.id === saved, swatch: skinSwatch(s.id), img: `<img src="${weaponPhoto(w.id)}" alt="" draggable="false" class="wr-gun">` })).join('')}</div>
        ${this._info(`${rar(sk.rarity).name} · ${w.name} · ${cur === saved ? 'Em uso' : 'Provando'}`, sk.name, sk.desc || (KNIVES.has(w.id) ? 'Acabamento da faca.' : 'Acabamento da arma. Aparece no menu, em 3ª e em 1ª pessoa.'), sk.rarity)}</div></div>`;
  }
  _profile() {
    return `<div class="wr-profile"><div class="wr-card"></div>
      <label class="wr-field"><small>Nome de jogador (2 a 16 letras)</small><input class="wr-name" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(this.d.name)}"></label>
      <div class="wr-field"><small>Avatar</small><div class="wr-grid wr-avatars" role="radiogroup" aria-label="Avatares"></div></div></div>`;
  }
  _profileGrid() {
    const saved = getProfile().avatar, grid = this.panel.querySelector('.wr-avatars'); if (!grid) return;
    const had = grid.contains(document.activeElement);
    grid.innerHTML = AVATARS.map(a => this._tile({ id: a.id, name: a.name, rarity: a.rarity, sel: a.id === this.d.avatar, used: a.id === saved, img: avatarSVG(a.id, 64) })).join('');
    if (had) grid.querySelector(`[data-wr-item="${this.d.avatar}"]`)?.focus({ preventScroll: true });
    this.panel.querySelector('.wr-count').textContent = `${AVATARS.length} avatares`;
  }
  _card() {
    const c = this.panel.querySelector('.wr-card'); if (!c) return;
    if (!this.panel.querySelector('.wr-avatars')?.children.length) this._profileGrid();
    const S = getStats().total;
    c.innerHTML = `${avatarSVG(this.d.avatar, 72)}<div><b>${esc(this.d.name.trim() || 'Jogador')}</b><small>ID ${esc(this.hooks.net?.id || '')}</small>
      <span>${S.matches} partidas · KDA ${kda(S).toFixed(2)}</span></div>`;
  }
  _career() {
    const st = getStats(), T = st.total;
    this.panel.querySelector('.wr-count').textContent = `${T.matches} partida${T.matches === 1 ? '' : 's'}`;
    const card = (v, l, big) => `<div class="wr-stat${big ? ' big' : ''}"><b>${v}</b><small>${l}</small></div>`;
    const row = (n, S) => `<tr><th>${n}</th><td>${S.matches}</td><td>${S.wins}</td><td>${S.kills}</td><td>${S.deaths}</td><td>${kda(S).toFixed(2)}</td><td>${hsRate(S)}%</td></tr>`;
    if (!T.matches) return `<div class="wr-empty"><b>Nenhuma partida ainda</b><p>Jogue o Modo Favela ou Mata-mata (offline ou online) e suas estatísticas aparecem aqui: abates, mortes, KDA, headshots e vitórias. O Treino não conta.</p></div>`;
    return `<div class="wr-career">
      <div class="wr-stats">${card(kda(T).toFixed(2), 'KDA', true)}${card(T.kills, 'Abates')}${card(T.deaths, 'Mortes')}${card(T.assists, 'Assistências')}
        ${card(T.matches, 'Partidas')}${card(T.wins, 'Vitórias')}${card(T.matches ? Math.round(T.wins / T.matches * 100) + '%' : '0%', 'Taxa de vitória')}${card(hsRate(T) + '%', 'Headshots')}
        ${card(Math.round(T.damage), 'Dano total')}${card(T.bestKills, 'Mais abates numa partida')}${card(fmtMin(T.minutes), 'Tempo jogado')}${card(T.matches ? (T.kills / T.matches).toFixed(1) : '0', 'Abates por partida')}</div>
      <h5>Por modo</h5>
      <table class="wr-table"><thead><tr><th>Modo</th><th>Partidas</th><th>Vitórias</th><th>Abates</th><th>Mortes</th><th>KDA</th><th>HS</th></tr></thead>
        <tbody>${row('Modo Favela', st.byMode.competitive)}${row('Mata-mata', st.byMode.deathmatch)}</tbody></table>
      <h5>Últimas partidas</h5>
      <ul class="wr-recent">${st.recent.slice(0, 10).map(m => `<li class="${m.won === true ? 'win' : m.won === false ? 'loss' : ''}"><i></i>
        <div><b>${MODE_NAME[m.mode] || m.mode} · ${MAP_NAME[m.map] || m.map || ''}${m.online ? ' · online' : ''}</b><small>${when(m.t)} · ${fmtMin(m.minutes)}</small></div>
        <span>${m.kills}/${m.deaths}/${m.assists || 0}</span><em>${m.won === true ? 'Vitória' : m.won === false ? 'Derrota' : '—'}</em></li>`).join('')}</ul></div>`;
  }
}
