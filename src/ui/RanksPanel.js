import { RANKS, FUNCS, getXp, earnedRank, stepXp, isOwner, myRankCell, pickRank, unlocked, rankIcon, rankName } from './Ranks.js';

/** Tela PATENTES (botão na barra da sala, ao lado da Mochila): progresso de XP, todas as patentes e qual usar ao lado do nome. */
const fmt = n => Math.round(n).toLocaleString('pt-BR');
export class RanksPanel {
  constructor(root, hooks = {}) {
    this.root = root; this.hooks = hooks;
    root.addEventListener('click', e => {
      if (e.target === root || e.target.closest('[data-rk="close"]')) { this.close(); return; }
      const b = e.target.closest('[data-cell]'); if (!b) return;
      const cell = +b.dataset.cell;
      if (!unlocked(cell)) { this.hooks.beep?.(); this._say(`Bloqueada: faltam ${fmt(RANKS.find(r => r.cell === cell).need - getXp())} XP.`); return; }
      pickRank(cell); this.hooks.beep?.(); this.hooks.onPick?.(cell); this.render(); this._say(`Usando agora: ${rankName(cell)}`);
    });
    addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen) this.close(); });
  }
  open() { this.isOpen = true; this.root.classList.remove('hidden'); this.render(); }
  close() { this.isOpen = false; this.root.classList.add('hidden'); this.hooks.onClose?.(); }
  _say(t) { const m = this.root.querySelector('.rk-msg'); if (m) m.textContent = t; }
  render() {
    const xp = getXp(), own = isOwner(), er = earnedRank(xp), cur = myRankCell(), nx = RANKS[er + 1];
    const into = nx ? xp - RANKS[er].need : 1, span = nx ? stepXp(er) : 1, pct = Math.min(100, into / span * 100);
    const groups = []; for (const r of RANKS) { let g = groups.find(x => x.name === r.group); if (!g) groups.push(g = { name: r.group, list: [] }); g.list.push(r); }
    const cellBtn = (r, extra = '') => { const ok = unlocked(r.cell), on = r.cell === cur;
      return `<button class="rk-cell${ok ? '' : ' lock'}${on ? ' on' : ''}" data-cell="${r.cell}" title="${r.name}${ok ? '' : ` — precisa de ${fmt(r.need)} XP`}">${rankIcon(r.cell, 58, false)}<small>${r.name}</small>${ok ? '' : `<em>${fmt(r.need)} XP</em>`}${extra}</button>`; };
    this.root.innerHTML = `<div class="rk-win">
      <header class="rk-top"><h2>PATENTES</h2><button class="rk-x" data-rk="close" title="Fechar">✕</button></header>
      <section class="rk-me">
        <div class="rk-cur">${rankIcon(cur, 84, false)}<div><small>Usando ao lado do nome</small><b>${rankName(cur)}</b>${own ? '<span class="rk-own">CRIADOR · todas as patentes liberadas</span>' : ''}</div></div>
        <div class="rk-prog"><div class="rk-line"><span>Sua patente: <b>${RANKS[er].name}</b></span><span>${nx ? `Próxima: <b>${nx.name}</b>` : '<b>Patente máxima!</b>'}</span></div>
          <div class="rk-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
          <div class="rk-line"><span>XP total: <b>${fmt(xp)}</b></span><span>${nx ? `${fmt(into)} / ${fmt(span)} XP (faltam ${fmt(span - into)})` : ''}</span></div>
          <p class="rk-how">Como ganhar XP: <b>+100</b> por abate · <b>+30</b> por minuto jogado (até 20 min por partida). O treino não conta. O XP entra quando você sai da partida. Cada patente pede mais XP que a anterior.</p></div>
      </section>
      <p class="rk-msg">Clique numa patente liberada para usar ao lado do seu nome.</p>
      <div class="rk-list">${groups.map(g => `<h3>${g.name}</h3><div class="rk-grid">${g.list.map(r => cellBtn(r)).join('')}</div>`).join('')}
        ${own ? `<h3>Funções (só o criador)</h3><div class="rk-grid">${FUNCS.map(f => cellBtn({ ...f, need: 0 })).join('')}</div>` : ''}</div>
    </div>`;
  }
}
