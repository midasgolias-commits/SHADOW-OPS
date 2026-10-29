/**
 * Música ambiente: uma na sala (sala de espera / tela Online / mochila aberta pela sala) e outra dentro da partida.
 * Fica baixa (proporcional ao Volume das Configurações), troca com fade e pausa quando a aba do jogo não está à vista.
 */
const TRACKS = { sala: { src: 'assets/music/sala.mp3', gain: .45 }, partida: { src: 'assets/music/partida.mp3', gain: .16 } };
const visible = id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none'; };

export class Music {
  constructor(getVolume) {
    this.getVolume = getVolume; this.cur = null; this.el = {};
    for (const [k, t] of Object.entries(TRACKS)) { const a = new Audio(t.src); a.loop = true; a.preload = 'auto'; a.volume = 0; this.el[k] = a; }
    const kick = () => this._tick(true);   // o navegador só deixa tocar som depois de um clique/tecla
    addEventListener('pointerdown', kick, true); addEventListener('keydown', kick, true);
    setInterval(() => this._tick(), 100);
  }
  /** qual música deve tocar agora, pelo que está na tela */
  want() {
    if (document.hidden) return null;
    if (visible('hud')) return 'partida';
    if (visible('lobby') || visible('online') || visible('inventory')) return 'sala';
    return null;
  }
  _tick(gesture) {
    const w = this.want(), vol = Math.max(0, Math.min(1, this.getVolume() ?? .6));
    for (const [k, a] of Object.entries(this.el)) {
      const target = k === w ? TRACKS[k].gain * vol : 0;
      a.volume = Math.max(0, Math.min(1, a.volume + Math.sign(target - a.volume) * Math.min(Math.abs(target - a.volume), .04)));   // fade ~1 s
      if (target > 0 && a.paused) { if (k !== this.cur) a.currentTime = 0; a.play().then(() => { this.cur = k; }).catch(() => {}); }
      else if (target === 0 && a.volume <= .001 && !a.paused) a.pause();
    }
  }
}
