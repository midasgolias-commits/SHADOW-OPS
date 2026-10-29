import { weaponIcon, headIcon } from './WeaponIcons.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STREAK = ['', 'ABATE', 'ABATE DUPLO', 'ABATE TRIPLO', 'ABATE QUÁDRUPLO', 'IMPARÁVEL'];
const STREAK_WINDOW = 5000;   // ms entre abates para contar a sequência

/**
 * Feed de abates (canto direito) + selo grande no centro quando o jogador abate alguém.
 * add(e) recebe o mesmo objeto do hook onKill: { killer, victim, killerTeam, victimTeam, weapon, head, killerIsMe, victimIsMe }.
 */
export class KillFeed {
  constructor(feed, banner, audio, announcer = null) { this.feed = feed; this.banner = banner; this.audio = audio; this.announcer = announcer; this.streak = 0; this.lastKill = 0; this.bt = 0; }

  reset() { this.feed.innerHTML = ''; this.banner.className = 'kb'; this.banner.innerHTML = ''; this.streak = 0; clearTimeout(this.bt); }

  add(e) {
    const li = document.createElement('li');
    li.className = 'kf' + (e.killerIsMe ? ' kf-me' : e.victimIsMe ? ' kf-dead' : '') + (e.head ? ' kf-head' : '');
    li.innerHTML = `<span class="kf-n k-${e.killerTeam || 'ffa'}">${esc(e.killer)}</span>` +
      `<span class="kf-w">${weaponIcon(e.weapon)}${e.head ? headIcon() : ''}</span>` +
      `<span class="kf-n k-${e.victimTeam || 'ffa'}">${esc(e.victim)}</span>`;
    this.feed.prepend(li);
    while (this.feed.children.length > 6) this.feed.lastChild.remove();
    setTimeout(() => li.classList.add('kf-out'), e.killerIsMe ? 7000 : 5000);
    setTimeout(() => li.remove(), (e.killerIsMe ? 7000 : 5000) + 600);
    if (e.killerIsMe) this._banner(e);
  }

  _banner(e) {
    const now = performance.now();
    this.streak = now - this.lastKill < STREAK_WINDOW ? this.streak + 1 : 1; this.lastKill = now;
    const n = Math.min(this.streak, STREAK.length - 1);
    const title = (e.weapon === 'knife' || e.weapon === 'karambit') ? 'FACADA' : e.head ? 'TIRO NA CABEÇA' : STREAK[n];
    const sub = ((e.weapon === 'knife' || e.weapon === 'karambit') || e.head) && n > 1 ? STREAK[n] : esc(e.victim);
    this.banner.innerHTML = `<div class="kb-emb">${e.head ? headIcon() : weaponIcon(e.weapon)}${n > 1 ? `<i>${this.streak}</i>` : ''}</div>` +
      `<b>${title}</b><small>${sub}</small>`;
    this.banner.className = 'kb';
    void this.banner.offsetWidth;
    this.banner.className = 'kb on' + (e.head ? ' head' : '') + (n > 1 ? ' multi' : '');
    this.audio?.play(this.audio.has?.('kill_sound') ? 'kill_sound' : 'kill', { gain: .75 });   // som de abate (volume médio)
    this.announcer?.kill(e);   // locutor: abate duplo/triplo/massacre, tiro na cabeça… (Announcer.js)
    clearTimeout(this.bt); this.bt = setTimeout(() => this.banner.classList.add('out'), 1900);
  }
}
