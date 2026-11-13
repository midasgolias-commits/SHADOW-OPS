/**
 * SINO de notificações (canto de cima à direita do menu iniciar, como no PUBG).
 * Junta tudo num lugar só: pedidos de amizade (alguém te adicionou), convites para grupo (com ACEITAR / RECUSAR),
 * amigo que entrou ou saiu do grupo e avisos do jogo (resultado da partida, versão nova...).
 * Bolinha com o número de não lidas; abrir o sino marca tudo como lido. Guarda as últimas 30 no navegador.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PERFIL = (new URLSearchParams(location.search).get('perfil') || '').replace(/[^a-z0-9]/gi, '').slice(0, 8);
const LS = 'shadowops.notifs' + (PERFIL ? '.' + PERFIL : '');
const MAX = 30;
export const ICON_BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z"/></svg>';
export const ICON_GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.7 2l.5 2.6 1.6.7 2.2-1.5 2.4 2.4-1.5 2.2.7 1.6 2.6.5v3.4l-2.6.5-.7 1.6 1.5 2.2-2.4 2.4-2.2-1.5-1.6.7-.5 2.6h-3.4l-.5-2.6-1.6-.7-2.2 1.5-2.4-2.4 1.5-2.2-.7-1.6L2 13.7v-3.4l2.6-.5.7-1.6-1.5-2.2 2.4-2.4 2.2 1.5 1.6-.7.5-2.6ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/></svg>';
const KIND = { friend: 'Amizade', invite: 'Convite', group: 'Grupo', game: 'Jogo' };
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'agora' : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 86400)} d`; };

export class NotifyCenter {
  /** hooks: { beep, onAccept(fromId), onDecline(fromId) } */
  constructor(btn, panel, hooks = {}) {
    this.btn = btn; this.panel = panel; this.hooks = hooks; this.isOpen = false;
    try { this.list = JSON.parse(localStorage.getItem(LS) || '[]'); } catch { this.list = []; }
    this.list = this.list.filter(n => n.kind !== 'invite' || Date.now() - n.t < 10 * 60e3);   // convite velho não vale mais
    panel.innerHTML = `<header class="nt-head"><b>Notificações</b><button type="button" class="fm-hover nt-clear" data-nt="clear">Limpar</button><button type="button" class="nt-x fm-hover" data-nt="close" aria-label="Fechar">✕</button></header><ul class="nt-list"></ul>`;
    btn.addEventListener('click', () => { hooks.beep?.(); this.isOpen ? this.close() : this.open(); });
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-nt]'); if (!b) return;
      const k = b.dataset.nt, n = this.list.find(x => x.id === b.dataset.id);
      if (k === 'close') { this.close(); return; }
      if (k === 'clear') { this.list = []; this._save(); this.render(); return; }
      if (!n) return;
      hooks.beep?.();
      if (k === 'accept') {   // só marca "Aceito" se entrou de verdade no grupo
        this.close();
        Promise.resolve(this.hooks.onAccept?.(n.from)).then(ok => { if (ok) { n.done = 'Aceito'; this._save(); this.render(); } });
        return;
      }
      if (k === 'decline') { n.done = 'Recusado'; this.hooks.onDecline?.(n.from); }
      this._save(); this.render(); this.panel.querySelector('.nt-x')?.focus({ preventScroll: true });
    });
    addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen && !e.defaultPrevented) { e.preventDefault(); this.close(); } });
    addEventListener('pointerdown', e => { if (this.isOpen && !panel.contains(e.target) && !btn.contains(e.target)) this.close(); }, true);
    this.render();
  }
  /** nova notificação: { kind: 'friend'|'invite'|'group'|'game', text, from?, name? } */
  push(n) {
    const it = { id: Math.random().toString(36).slice(2, 9), t: Date.now(), read: false, ...n };
    if (it.kind === 'invite' && it.from) this.list = this.list.filter(x => !(x.kind === 'invite' && x.from === it.from && !x.done));   // um convite por amigo
    this.list.unshift(it); this.list.length = Math.min(this.list.length, MAX);
    if (this.isOpen) it.read = true;
    this._save(); this.render();
    this.btn.classList.remove('ring'); void this.btn.offsetWidth; this.btn.classList.add('ring');
    return it;
  }
  open() { this.hooks.onOpen?.(); this.isOpen = true; this.panel.hidden = false; this.btn.setAttribute('aria-expanded', 'true'); this.list.forEach(n => { n.read = true; }); this._save(); this.render(); }
  close() { const had = this.panel.contains(document.activeElement); this.isOpen = false; this.panel.hidden = true; this.btn.setAttribute('aria-expanded', 'false'); if (had) this.btn.focus({ preventScroll: true }); }
  _save() { try { localStorage.setItem(LS, JSON.stringify(this.list)); } catch {} }
  render() {
    const unread = this.list.filter(n => !n.read).length, badge = this.btn.querySelector('.nt-badge');
    badge.textContent = unread > 9 ? '9+' : unread || ''; badge.hidden = !unread;
    this.btn.title = unread ? `Notificações (${unread} nova${unread > 1 ? 's' : ''})` : 'Notificações';
    this.btn.setAttribute('aria-label', this.btn.title);
    this.panel.querySelector('.nt-list').innerHTML = this.list.length ? this.list.map(n => `
      <li class="k-${n.kind}${n.read ? '' : ' new'}"><i></i><div><small>${KIND[n.kind] || 'Aviso'} · ${ago(n.t)}</small><p>${esc(n.text)}</p>
        ${n.kind === 'invite' && !n.done && Date.now() - n.t < 10 * 60e3 ? `<div class="nt-act"><button type="button" class="fm-hover nt-yes" data-nt="accept" data-id="${n.id}">Aceitar</button><button type="button" class="fm-hover" data-nt="decline" data-id="${n.id}">Recusar</button></div>` : ''}
        ${n.done ? `<em>${esc(n.done)}</em>` : n.kind === 'invite' && Date.now() - n.t >= 10 * 60e3 ? '<em>Expirado</em>' : ''}</div></li>`).join('') : '<li class="empty">Nenhuma notificação.</li>';
  }
}
