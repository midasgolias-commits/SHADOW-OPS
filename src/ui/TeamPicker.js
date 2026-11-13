/** MODO FAVELA: ao entrar, o jogador escolhe o lado. Polícia = time de ataque ('att'), Bandido = time de defesa ('def').
 *  open(onPick) mostra a tela; onPick('att' | 'def') é chamado no clique (ou teclas 1 / 2). Esc ou "Voltar" fecha sem escolher. */
const SIDES = [
  { team: 'att', name: 'POLÍCIA', key: '1', desc: 'Sobe da avenida do canal, atravessa a ponte e ataca os sites A e B.',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3 41 9.5V22c0 11.5-7.4 19.6-17 23C14.4 41.6 7 33.5 7 22V9.5z" fill="currentColor"/><path d="m24 13.5 3.2 6.5 7.1 1-5.15 5 1.2 7.1L24 29.8l-6.35 3.3 1.2-7.1-5.15-5 7.1-1z" fill="#081426"/></svg>' },
  { team: 'def', name: 'BANDIDO', key: '2', desc: 'Nasce no meio do morro e segura a praça e a laje contra a invasão.',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="19" r="13" fill="currentColor"/><path d="M9.5 22.5c5 3.4 24 3.4 29 0L35.6 37c-3.8 5.4-19.4 5.4-23.2 0z" fill="#26090a"/><circle cx="19" cy="17" r="2.3" fill="#26090a"/><circle cx="29" cy="17" r="2.3" fill="#26090a"/></svg>' }
];

export class TeamPicker {
  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'teamPick'; el.className = 'tp hidden';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Escolha o seu lado');
    el.innerHTML = `<div class="tp-box">
      <p class="tp-kicker">MODO FAVELA</p>
      <h2 class="tp-title">Escolha o seu lado</h2>
      <div class="tp-sides">${SIDES.map(s => `<button class="tp-side tp-${s.team}" data-team="${s.team}">
        <span class="tp-ic">${s.icon}</span><b>${s.name}</b><span class="tp-desc">${s.desc}</span><kbd>${s.key}</kbd></button>`).join('')}</div>
      <button class="tp-back" data-back>Voltar</button>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-team]'); if (b) return this._pick(b.dataset.team);
      if (e.target.closest('[data-back]') || e.target === el) this.close();
    });
    addEventListener('keydown', e => {
      if (this.el.classList.contains('hidden')) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      const s = SIDES.find(x => x.key === e.key); if (s) this._pick(s.team);
    });
  }
  open(onPick) { this.onPick = onPick; this.el.classList.remove('hidden'); this.el.querySelector('.tp-side')?.focus(); }
  close() { this.el.classList.add('hidden'); this.onPick = null; }
  _pick(team) { const f = this.onPick; this.close(); f?.(team); }
}
