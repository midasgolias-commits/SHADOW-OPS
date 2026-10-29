/**
 * Efeitos do menu inicial:
 * - faíscas laranja subindo e apagando (fade), poeira flutuando na luz e brilho das lâmpadas tremendo de leve (como luz real);
 * - som curto ao passar o mouse nos cartões (Competitivo / Mata-mata / Treino); o cartão inteiro é clicável.
 * Coordenadas das lâmpadas medidas na arte de fundo (1672x941); o fundo usa "cover", então converto do mesmo jeito.
 */
const ART_W = 1672, ART_H = 941;
const LAMPS = [   // x, y, raio, cor, força
  { x: 572, y: 85, r: 120, c: [205, 225, 255], k: .55 },   // luminária do teto (fria)
  { x: 71, y: 211, r: 70, c: [255, 170, 90], k: .6 },      // lâmpada laranja da esquerda
  { x: 1669, y: 310, r: 90, c: [255, 160, 80], k: .6 },    // lâmpada laranja da direita
  { x: 444, y: 356, r: 45, c: [150, 200, 255], k: .45 },   // luz azul pequena
];

export class MenuFx {
  constructor(menu, getVolume) {
    this.menu = menu; this.getVolume = getVolume; this.cv = menu.querySelector('.mm-fx'); this.ctx = this.cv.getContext('2d');
    this.parts = []; this.dust = []; this.t = 0; this.last = performance.now(); this.ac = null;
    for (let i = 0; i < 70; i++) this.dust.push(this._mote(true));
    menu.querySelectorAll('.mm-card').forEach(c => {
      c.addEventListener('mouseenter', () => this.hover());
      c.addEventListener('click', e => { if (!e.target.closest('button')) c.querySelector('button').click(); });
    });
    const unlock = () => { this._audio(); };
    addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);
    requestAnimationFrame(this._loop);
  }
  _audio() {
    try { this.ac ??= new (window.AudioContext || window.webkitAudioContext)(); if (this.ac.state === 'suspended') this.ac.resume(); } catch {}
    return this.ac;
  }
  /** "tic" metálico curto: ruído filtrado + tom grave rápido */
  hover() {
    const ac = this.ac; if (!ac || ac.state !== 'running') return;   // o navegador só libera som depois do 1º clique na página
    const v = Math.max(0, Math.min(1, this.getVolume?.() ?? .6)) * .5, t = ac.currentTime, out = ac.createGain();
    out.gain.value = v; out.connect(ac.destination);
    const n = ac.createBufferSource(), buf = ac.createBuffer(1, ac.sampleRate * .05, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    n.buffer = buf; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.4;
    const gn = ac.createGain(); gn.gain.value = .55; n.connect(bp).connect(gn).connect(out); n.start(t);
    const o = ac.createOscillator(), go = ac.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(180, t + .07);
    go.gain.setValueAtTime(.35, t); go.gain.exponentialRampToValueAtTime(.001, t + .09); o.connect(go).connect(out); o.start(t); o.stop(t + .1);
  }
  _mote(any) { return { x: Math.random(), y: any ? Math.random() : 1.05, s: .4 + Math.random() * 1.3, vx: (Math.random() - .5) * .004, vy: -(.002 + Math.random() * .006), a: Math.random() * 6.28, o: .15 + Math.random() * .35 }; }
  _spark(W, H) {   // nasce embaixo / nas laterais e sobe com o "calor", balançando
    const side = Math.random();
    return { x: side < .5 ? Math.random() * W * .45 : W * (.55 + Math.random() * .45), y: H * (.55 + Math.random() * .5),
      vx: (Math.random() - .5) * 40, vy: -(40 + Math.random() * 90), life: 0, max: 1.6 + Math.random() * 2.6, r: 1.3 + Math.random() * 2.2, w: Math.random() * 6.28 };
  }
  _loop = now => {
    requestAnimationFrame(this._loop);
    if (this.menu.classList.contains('hidden') || document.hidden) { this.last = now; return; }
    const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    const cv = this.cv, dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = this.ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const s = Math.max(W / ART_W, H / ART_H), ox = (W - ART_W * s) / 2, oy = (H - ART_H * s) / 2;   // mesmo encaixe do fundo (cover)
    c.globalCompositeOperation = 'lighter';
    // luzes: brilho suave que "respira" e às vezes tremula (lâmpada velha)
    LAMPS.forEach((L, i) => {
      const flick = .82 + .12 * Math.sin(this.t * (1.3 + i * .7) + i * 2) + .06 * Math.sin(this.t * 17 + i * 5) - (Math.random() < .004 ? .35 : 0);
      const x = ox + L.x * s, y = oy + L.y * s, r = L.r * s * 2.4, g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${L.c},${L.k * flick * .55})`); g.addColorStop(.25, `rgba(${L.c},${L.k * flick * .18})`); g.addColorStop(1, `rgba(${L.c},0)`);
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    });
    // cone de luz do teto, bem leve
    const lx = ox + 572 * s, ly = oy + 85 * s, cg = c.createLinearGradient(0, ly, 0, ly + 620 * s);
    cg.addColorStop(0, 'rgba(170,200,240,.10)'); cg.addColorStop(1, 'rgba(170,200,240,0)');
    c.fillStyle = cg; c.beginPath(); c.moveTo(lx - 30 * s, ly); c.lineTo(lx + 30 * s, ly); c.lineTo(lx + 260 * s, ly + 620 * s); c.lineTo(lx - 200 * s, ly + 620 * s); c.closePath(); c.fill();
    // poeira flutuando (mais visível perto da luz)
    for (const m of this.dust) {
      m.x += m.vx * dt * 6 + Math.sin(this.t * .7 + m.a) * .0004; m.y += m.vy * dt * 6; if (m.y < -.05 || m.x < -.05 || m.x > 1.05) Object.assign(m, this._mote(false), { x: Math.random() });
      const px = m.x * W, py = m.y * H, near = Math.max(0, 1 - Math.hypot(px - lx, (py - ly) * .6) / (520 * s));
      c.fillStyle = `rgba(200,215,235,${m.o * (.25 + near * .9)})`; c.beginPath(); c.arc(px, py, m.s, 0, 6.28); c.fill();
    }
    // faíscas
    this.acc = (this.acc || 0) + dt * 16; while (this.acc >= 1) { this.acc--; if (this.parts.length < 55) this.parts.push(this._spark(W, H)); }
    this.parts = this.parts.filter(p => (p.life += dt) < p.max);
    for (const p of this.parts) {
      p.w += dt * 3; p.vx += Math.sin(p.w) * 18 * dt; p.vy -= 6 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.life / p.max, a = (k < .15 ? k / .15 : 1 - (k - .15) / .85) * (.6 + .4 * Math.sin(p.life * 30));
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
      g.addColorStop(0, `rgba(255,${215 - k * 90 | 0},${120 - k * 80 | 0},${a})`); g.addColorStop(.25, `rgba(255,120,35,${a * .7})`); g.addColorStop(1, 'rgba(255,80,20,0)');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r * 5, 0, 6.28); c.fill();
      c.strokeStyle = `rgba(255,230,180,${a})`; c.lineWidth = p.r * .9; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * .06, p.y - p.vy * .06); c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  };
}
