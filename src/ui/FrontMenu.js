import { CharacterPreview } from './CharacterPreview.js';
import { getLoadout, setLoadout, SKINS, SLOTS } from './Loadout.js';
import { WEAPONS } from '../weapons/Weapons.js';
import { weaponPhoto, charPhoto } from './WeaponPhoto.js';
import { MAPS } from '../world/MapData.js';
import { avatarSVG, getProfile } from './Avatars.js';

/**
 * Menu principal (estilo PUBG): barra de cima com abas, faixa de modos, personagem 3D no centro,
 * ficha do modo e equipamento à esquerda e o botão JOGAR embaixo.
 * Ele só escolhe o modo; quem monta a sala (mapa, bots, dificuldade) continua sendo o Lobby.js.
 * Aba CUSTOMIZAR: janela de vidro à esquerda para trocar o personagem (o personagem 3D não sai do lugar).
 * Clicar num personagem só mostra como fica; SALVAR grava, RESTAURAR volta ao salvo, fechar sem salvar desfaz.
 */
const TIPS = [
  'Mire pela arma com o botão direito: o tiro sai exatamente no ponto vermelho.',
  'No CELEIRO dá para subir nas torres e usar os vagões como cobertura alta.',
  'Agachado você faz menos barulho e acerta melhor à distância.',
  'A troca de arma é rápida: dá para trocar no meio do combate.',
  'A luneta da sniper abre em tela cheia; fora dela a arma espalha muito.',
  'Cada arma tem recuo próprio: puxe a mira para baixo nos tiros seguidos.',
  'A faca tem o maior dano por golpe. Ataque pelas costas sempre que puder.',
  'No Modo Favela você escolhe o lado: Polícia (ataque) ou Bandido (defesa).',
  'No menu você escolhe o mapa: WAREHOUSE ou CELEIRO.',
  'A dificuldade dos bots vale para a partida inteira.',
  'Mochila: escolha a principal, a secundária e a arma branca antes de jogar.'
];

const MODES = {
  competitive: {
    name: 'MODO FAVELA', tag: '5v5',
    desc: 'Polícia contra Bandido, 5 contra 5 com bots. A Polícia ataca os sites A e B; o Bandido defende. Ao entrar você escolhe o lado.',
    facts: ['Polícia ou Bandido: você escolhe', 'Sites A e B em cada mapa', 'Warehouse e Celeiro'],
    play: 'JOGAR', hint: 'Escolha o lado e entre direto no mapa escolhido.', map: true
  },
  deathmatch: {
    name: 'MATA-MATA', tag: 'LIVRE',
    desc: 'Todos contra todos com respawn contínuo. Ganha quem chegar primeiro no limite de abates.',
    facts: ['Até 8 jogadores com bots', 'Respawn contínuo', 'Placar em tempo real'],
    play: 'JOGAR', hint: 'Todos contra todos até 30 abates. Entra direto no mapa escolhido.', map: true
  },
  training: {
    name: 'TREINO', tag: 'SOLO',
    desc: 'Stand de tiro com bots-alvo de vida infinita. Todas as armas e munição infinita.',
    facts: ['Bot parado e bot andando', 'Todas as armas liberadas', 'Munição infinita'],
    play: 'INICIAR TREINO', hint: 'Stand de tiro: todas as armas e munição infinita.'
  },
  custom: {
    name: 'CUSTOM', tag: 'SALA',
    desc: 'Mata-mata com amigos pela internet, direto entre os navegadores. Convide pelo ID do jogador.',
    facts: ['Grátis, sem servidor', 'Até 8 jogadores', 'Convite por ID'],
    play: 'INICIAR PARTIDA', hint: ''
  }
};

const RARITY = { lendario: { name: 'Lendário', c: '#e6b84a' }, raro: { name: 'Raro', c: '#5aa0ff' }, comum: { name: 'Comum', c: '#9aa4ad' } };
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7Z"/></svg>';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class FrontMenu {
  constructor(root, hooks) {
    this.root = root; this.hooks = hooks; this.mode = 'competitive'; this.preview = null;
    this.view = 'play';
    const saved = (() => { try { return JSON.parse(localStorage.getItem('shadowops.menu') || '{}'); } catch { return {}; } })();
    if (MODES[saved.mode]) this.mode = saved.mode;
    this.mapId = MAPS.some(m => m.id === saved.map) ? saved.map : MAPS[0].id;   // mapa escolhido no menu (competitivo e mata-mata)   // view: 'play' (menu) ou 'custom' (janela Customizar); draft: personagem em prova
    this.tipI = Math.floor(Math.random() * TIPS.length);
    root.addEventListener('click', e => {
      const mp = e.target.closest('[data-map]');
      if (mp) { if (mp.dataset.map !== this.mapId) { this.mapId = mp.dataset.map; this.hooks.beep?.(); this._save(); this.render(); } return; }
      const pick = e.target.closest('[data-pick]');
      if (pick) { this.select(pick.dataset.pick); return; }
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        const k = nav.dataset.nav; this.hooks.beep?.();
        if (k === 'custom') { if (this.view !== 'custom') this.openCustom(); }
        else if (k === 'profile') { if (this.view !== 'custom') this.openCustom('profile'); else this.hooks.wardrobe?.go('profile'); }
        else if (k === 'play') this.closeCustom();
        else if (k === 'settings') this.hooks.onSettings?.();
        return;
      }
      if (e.target.closest('#fmPlay')) { this.hooks.beep?.(); this.hooks.onPlay?.(this.mode); }
    });
    setInterval(() => this._tip(), 9000);
  }

  /* ---------- CUSTOMIZAR (janela grande: Wardrobe.js) ---------- */
  openCustom(tab) {
    const W = this.hooks.wardrobe; if (!W) return;
    W.hooks.onClose = () => { this.view = 'play'; this.root.classList.remove('customizing'); this.render(); this.root.querySelector('[data-nav="custom"]')?.focus({ preventScroll: true }); };
    this.view = 'custom'; this.root.classList.add('customizing'); this.render(); W.open(tab);
  }
  closeCustom() { if (this.view === 'custom') this.hooks.wardrobe?.close(); }
  _tip() {
    if (this.root.classList.contains('hidden')) return;
    this.tipI = (this.tipI + 1) % TIPS.length;
    const el = this.root.querySelector('.fm-tip'); if (el) el.textContent = TIPS[this.tipI];
  }
  select(id) {
    if (!MODES[id] || id === this.mode) return;
    this.mode = id; this.hooks.beep?.(); this._save(); this.render();
  }
  /** amigos do grupo em 3D ao lado do seu personagem (lista sem você) */
  setSquad(list) { this.squadList = list; this.preview?.setSquad(list); }
  /** abre o menu já na aba CUSTOM (ex.: aceitou convite, voltou de partida online) */
  goCustom() { if (this.view === 'custom') this.closeCustom(); this.mode = 'custom'; this._save(); this.render(); }
  _save() { try { localStorage.setItem('shadowops.menu', JSON.stringify({ mode: this.mode, map: this.mapId })); } catch {} }
  /** volta ao menu: religa o personagem 3D */
  show() { this.root.classList.remove('hidden'); this.refresh(); this._startPreview(); }
  hide() { this.preview?.stop(); }
  /** atualiza tudo (nome, patente, equipamento, modo escolhido) */
  refresh() { this.render(); }
  render() {
    const R = this.root, M = MODES[this.mode], L = getLoadout();
    R.querySelectorAll('[data-pick]').forEach(b => b.classList.toggle('on', b.dataset.pick === this.mode));
    R.querySelectorAll('.fm-nav [data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === this.view));
    const set = (sel, v) => { const el = R.querySelector(sel); if (el) el.textContent = v; };
    set('.fm-title', M.name); set('.fm-tag', M.tag); set('.fm-desc', M.desc);
    const facts = R.querySelector('.fm-facts');
    if (facts) facts.innerHTML = M.facts.map(f => `<li>${esc(f)}</li>`).join('');
    set('#fmPlay span', M.play); set('#fmHint', M.hint);
    // aba CUSTOM: janela da sala à esquerda (some quando a janela Customizar está aberta)
    const custom = this.mode === 'custom' && this.view === 'play';
    R.classList.toggle('custom-room', custom);
    if (custom) this.hooks.custom?.show(); else this.hooks.custom?.hide();
    // escolha do mapa (só competitivo e mata-mata)
    const mapBox = R.querySelector('.fm-map');
    if (mapBox) {
      mapBox.classList.toggle('hidden', !M.map);
      const row = R.querySelector('.fm-maps');
      if (!row.children.length) row.innerHTML = MAPS.map(m => `<button type="button" class="fm-hover" data-map="${m.id}" role="radio">${esc(m.name)}</button>`).join('');
      row.querySelectorAll('[data-map]').forEach(b => { const on = b.dataset.map === this.mapId; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    }
    // nome + patente + XP
    const name = this.hooks.name?.() || 'Jogador';
    set('.fm-pname', name); set('.fm-name', name);
    set('.fm-xptxt', 'ID ' + (this.hooks.netId?.() || ''));
    const av = R.querySelector('.fm-av'); if (av) av.innerHTML = avatarSVG(getProfile().avatar, 36);   // seu ID (para os amigos te adicionarem na aba CUSTOM)
    // equipamento (fotos) e skin do personagem
    const skin = SKINS.find(x => x.id === L.skin) || SKINS[0];
    set('.fm-skin', (SKINS.find(x => x.id === (this.hooks.wardrobe?.draftSkin || L.skin)) || skin).name);
    const eq = R.querySelector('.fm-eqrow');
    if (eq) eq.innerHTML = SLOTS.map(sl => `<div><img src="${weaponPhoto(L[sl.k])}" alt=""><b>${WEAPONS[L[sl.k]]?.name || ''}</b><small>${sl.label} · tecla ${sl.key}</small></div>`).join('');
    if (this.view !== 'custom') this.preview?.set(L.skin, L.primary);   // no Customizar quem manda no personagem é o Wardrobe (provas)
    const tip = R.querySelector('.fm-tip'); if (tip && !tip.textContent) tip.textContent = TIPS[this.tipI];
  }
  _startPreview() {
    const a = this.hooks.assets, L = getLoadout();
    if (!a?.ready) { clearTimeout(this._wt); this._wt = setTimeout(() => { if (!this.root.classList.contains('hidden')) this._startPreview(); }, 400); return; }
    this.preview ??= new CharacterPreview(this.root.querySelector('.fm-char'), a, { dist: 6.6, lookY: 1.15, camY: 1.35, floor: false, set: 'galpao', pose: 'idle', spin: 0, yaw: 0, fixed: true });
    this.preview.set(L.skin, L.primary); if (this.squadList) this.preview.setSquad(this.squadList); this.preview.start();
    this.root.querySelector('.fm-wait')?.classList.add('hidden');
  }
}
