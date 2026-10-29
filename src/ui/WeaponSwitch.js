import { weaponIcon } from './WeaponIcons.js';

/**
 * Painel de troca de arma: ao trocar, mostra o inventário à direita.
 * A arma na mão fica em destaque; a anterior e a faca ficam visíveis; as outras somem em degradê.
 * Depois de HOLD segundos sem trocar, o painel inteiro se dissolve.
 */
const HOLD = 1500;

export class WeaponSwitch {
  constructor(root) { this.root = root; this.timer = 0; this.cur = null; }

  /** Chamado a cada quadro com os dados do HUD da arma. Só reage quando a arma escolhida muda. */
  update(w) {
    const id = w.pending || w.id;
    if (this.cur === null) { this.cur = id; return; }   // arma inicial: não mostra
    if (id === this.cur) return;
    this.cur = id; this.show(w.slots, id, w.last);
  }
  reset() { this.cur = null; clearTimeout(this.timer); this.root.className = 'ws'; this.root.innerHTML = ''; }

  show(slots, cur, last) {
    const rows = slots.filter(s => s.owned).map(s => {
      const role = s.id === cur ? 'cur' : (s.id === last || s.id === 'knife' || s.id === 'karambit') ? 'near' : 'far';
      return `<li class="ws-${role}"><span class="ws-key">${s.n}</span>${weaponIcon(s.id)}<b>${s.name}</b></li>`;
    }).join('');
    this.root.innerHTML = `<ul>${rows}</ul>`;
    this.root.className = 'ws';
    void this.root.offsetWidth;            // reinicia as animações
    this.root.className = 'ws on';
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.root.className = 'ws on out'; }, HOLD);
  }
}
