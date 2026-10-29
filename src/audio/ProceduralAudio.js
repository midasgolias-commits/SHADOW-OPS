/**
 * Áudio (Web Audio API). Sons gravados em assets/sounds (tiros, recargas, faca, pulo, passos, abate, dano);
 * o que não tem arquivo continua procedural. Inicializado após interação do usuário.
 */
const SND = 'assets/sounds/';
const SAMPLES = ['rifle', 'aug', 'reload_aug', 'sniper', 'smg', 'pistol', 'shotgun', 'knife', 'reload_rifle', 'reload_smg', 'reload_pistol', 'reload_shell', 'reload_sniper',
  'jump', 'kill', 'hurt', 'step', 'walk_loop', 'kill_sound', 'bullet_onme_sound'];   // kill_sound: abate · bullet_onme_sound: levar tiro
/**
 * Sons sem arquivo próprio que reaproveitam outro (o arquivo próprio sempre tem prioridade):
 * sniper = tiro do fuzil mais grave e mais alto (só se faltar assets/sounds/sniper.mp3 — L115A1, desde 27/10).
 * AUG: se existir assets/sounds/aug.mp3 (e reload_aug.mp3), usa o arquivo dela; senão o do fuzil, um pouco mais agudo.
 */
const ALIAS = { sniper: { src: 'rifle', rate: .72, gain: 1.35 }, aug: { src: 'rifle', rate: 1.07, gain: 1 }, reload_aug: { src: 'reload_rifle' } };
export class ProceduralAudio {
  constructor() { this.ctx = null; this.volume = .6; this.raw = {}; this.buf = {}; this.loops = {}; this._preload(); }

  /** Baixa os arquivos já ao abrir a página (decodifica quando o áudio for liberado pelo clique). */
  _preload() {
    if (typeof fetch === 'undefined') return;
    const load = n => fetch(SND + n + '.mp3').then(r => r.ok ? r.arrayBuffer() : null).then(b => { if (b) { this.raw[n] = b; this._decode(n); } }).catch(() => {});
    for (const n of SAMPLES) load(n);
    // sons escolhidos na ferramenta de Sons do Lab (assets/config/sons_destino.json): todo destino aplicado é carregado,
    // inclusive destinos novos (locutor…) — quem decide quando tocar é o Announcer (src/audio/Announcer.js)
    fetch('assets/config/sons_destino.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(m => {
      const extra = new Set(Object.values(m?.sons || {}).filter(v => v.aplicado && v.destino && v.destino !== 'nao_usar').map(v => v.destino));
      for (const n of extra) if (!SAMPLES.includes(n)) load(n);
    }).catch(() => {});
  }
  _decode(n) {
    if (!this.ctx || !this.raw[n] || this.buf[n]) return;
    const b = this.raw[n]; this.raw[n] = null;
    this.ctx.decodeAudioData(b).then(d => { this.buf[n] = d; }).catch(() => {});
  }
  has(n) { return !!(this.buf[n] || (ALIAS[n] && this.buf[ALIAS[n].src])); }
  /** Toca um som gravado (o arquivo próprio tem prioridade sobre o reaproveitado). Retorna false se não houver arquivo. */
  _sample(name, gain, pan, dist, rate = 1) {
    const own = !!this.buf[name], al = own ? null : ALIAS[name], key = al ? al.src : name, b = this.buf[key]; if (!b) return false;
    const t = this.ctx.currentTime, src = this.ctx.createBufferSource(); src.buffer = b;
    src.playbackRate.value = rate * (al?.rate ?? 1) * (1 + (Math.random() - .5) * .06);   // leve variação: tiros seguidos não soam idênticos
    let node = src;
    if (dist > 18) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(700, 6000 - dist * 70); src.connect(f); node = f; }
    node.connect(this._out(gain * (al?.gain ?? 1) / (1 + dist * .07), pan)); src.start(t);
    return true;
  }
  /** Som em laço (passos do jogador). on=false para; rate acelera (corrida). */
  loop(name, on, { rate = 1, gain = 1 } = {}) {
    if (!this.ctx) return false;
    let l = this.loops[name];
    if (!on) { if (l) { l.g.gain.setTargetAtTime(0, this.ctx.currentTime, .05); l.src.stop(this.ctx.currentTime + .3); delete this.loops[name]; } return true; }
    if (!this.buf[name]) return false;
    if (!l) {
      const src = this.ctx.createBufferSource(); src.buffer = this.buf[name]; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.master);
      src.start(this.ctx.currentTime, Math.random() * this.buf[name].duration); l = this.loops[name] = { src, g };
    }
    l.src.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, .08); l.g.gain.setTargetAtTime(gain, this.ctx.currentTime, .06);
    return true;
  }
  stopLoops() { for (const n of Object.keys(this.loops)) this.loop(n, false); }

  init() {
    try {
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        this.ctx = new C();
        this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp); comp.connect(this.ctx.destination);
        const n = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, n, n);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      for (const n of Object.keys(this.raw)) this._decode(n);
    } catch (e) { console.warn('Áudio indisponível:', e); this.ctx = null; }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, .02);
  }

  _out(gain, pan) {
    const g = this.ctx.createGain(); g.gain.value = gain;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    return g;
  }
  _env(g, t, dur, peak, attack = .002) {
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  }
  _noise(out, t, { dur, f = 2000, fEnd, q = 1, type = 'lowpass', gain = 1 }) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f, t);
    if (fEnd) flt.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const g = this.ctx.createGain(); this._env(g, t, dur, gain);
    s.connect(flt); flt.connect(g); g.connect(out);
    s.start(t, Math.random() * .5, dur + .05);
  }
  _tone(out, t, { f, fEnd, dur, type = 'sine', gain = 1 }) {
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const g = this.ctx.createGain(); this._env(g, t, dur, gain);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
  }

  /** name: rifle|smg|sniper|shotgun|pistol|knife|reload|step|land|ui|beep|hit|explosion */
  play(name, { gain = 1, pan = 0, dist = 0, rate = 1 } = {}) {
    if (!this.ctx) return;
    if (this._sample(name, gain, pan, dist, rate)) return;
    const t = this.ctx.currentTime, far = dist > 18;
    const out = this._out(gain / (1 + dist * .07), pan);
    const N = o => this._noise(out, t, far ? { ...o, f: o.f * .45 } : o);
    switch (name) {
      case 'rifle': N({ dur: .13, f: 3000, fEnd: 500, gain: 1 }); this._tone(out, t, { f: 150, fEnd: 50, dur: .11, gain: .9 }); N({ dur: .03, f: 5500, type: 'bandpass', gain: .5 }); break;
      case 'smg': N({ dur: .07, f: 3800, fEnd: 800, gain: .8 }); this._tone(out, t, { f: 210, fEnd: 90, dur: .06, gain: .6 }); break;
      case 'sniper': N({ dur: .55, f: 2000, fEnd: 200, gain: 1.4 }); this._tone(out, t, { f: 95, fEnd: 30, dur: .4, gain: 1.2 }); this._noise(out, t + .22, { dur: .5, f: 700, fEnd: 150, gain: .25 }); break;
      case 'shotgun': N({ dur: .32, f: 1600, fEnd: 200, gain: 1.3 }); this._tone(out, t, { f: 110, fEnd: 38, dur: .25, gain: 1.1 }); break;
      case 'pistol': N({ dur: .1, f: 4300, fEnd: 900, gain: .8 }); this._tone(out, t, { f: 280, fEnd: 110, dur: .07, gain: .6 }); break;
      case 'knife': N({ dur: .14, f: 3500, type: 'highpass', gain: .3 }); break;
      case 'reload':
        this._tone(out, t, { f: 900, fEnd: 600, dur: .03, type: 'square', gain: .25 });
        this._noise(out, t + .3, { dur: .08, f: 2500, type: 'highpass', gain: .3 });
        this._tone(out, t + .65, { f: 500, fEnd: 300, dur: .05, type: 'square', gain: .3 }); break;
      case 'step': this._noise(out, t, { dur: .07, f: 300 + Math.random() * 250, gain: .25 }); break;
      case 'land': this._noise(out, t, { dur: .16, f: 280, gain: .45 }); break;
      case 'ui': this._tone(out, t, { f: 880, fEnd: 1320, dur: .08, gain: .25 }); break;
      case 'beep': this._tone(out, t, { f: 1800, dur: .07, type: 'square', gain: .25 }); break;
      case 'hit': this._tone(out, t, { f: 1500, fEnd: 900, dur: .04, gain: .3 }); break;
      case 'explosion': this._noise(out, t, { dur: 1.8, f: 900, fEnd: 70, gain: 1.6 }); this._tone(out, t, { f: 65, fEnd: 24, dur: 1.4, gain: 1.4 }); break;
    }
  }
}
