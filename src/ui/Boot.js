/**
 * Tela de carregamento (design novo do usuário, minimalista/tático): emblema, SHADOW-OPS, barra fina com porcentagem e etapa.
 * A barra segue o carregamento DE VERDADE (modelos, animações, armas, mapa); o número anda suave até o valor real.
 * Em cima: versão (build) e onde o jogo está rodando. Também é usada quando o stand de tiro carrega pela primeira vez.
 */
const STAGES = [   // etapa mostrada conforme a porcentagem (o carregamento real acontece em paralelo)
  [0, 'INICIALIZANDO SISTEMAS...'],
  [12, 'VERIFICANDO ARQUIVOS...'],
  [28, 'CARREGANDO OPERADORES...'],
  [45, 'CARREGANDO ANIMAÇÕES...'],
  [62, 'CARREGANDO ARMAMENTO...'],
  [80, 'CARREGANDO MAPA...'],
  [93, 'COMPILANDO SHADERS...']
];

export class Boot {
  constructor(root) {
    this.root = root;
    this.bar = root.querySelector('.boot-bar i');
    this.track = root.querySelector('.boot-bar');
    this.pctEl = root.querySelector('.boot-pct');
    this.stateEl = root.querySelector('.boot-state');
    this.msgEl = root.querySelector('.boot-msg');
    this.label = null; this.target = 0; this.shown = 0; this.raf = 0;
    const build = document.querySelector('meta[name="build"]')?.content || 'dev';
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    const b = root.querySelector('.boot-build'); if (b) b.textContent = `BUILD ${build === 'dev' ? 'LOCAL' : build} // WEBGL`;
    const sv = root.querySelector('.boot-sv'); if (sv) sv.textContent = local ? 'SV: LOCAL' : 'SV: ONLINE';
  }
  /** volta para a tela de carregamento (label = etapa fixa, ex.: stand de tiro; sem label usa as etapas automáticas) */
  show(label) {
    clearTimeout(this._end);
    this.root.classList.remove('hidden', 'out', 'err', 'ready');
    this.label = label && !/^carregando$/i.test(label) && !/carregando o jogo/i.test(label) ? label : null;
    if (this.msgEl) this.msgEl.textContent = '';
    this.target = 0; this.shown = 0; this._draw();
  }
  /** p = 0..1 (progresso real) */
  set(p) {
    this.target = Math.max(this.target, Math.max(0, Math.min(1, p || 0)));   // nunca volta para trás
    if (!this.raf) this.raf = requestAnimationFrame(this._tick);
  }
  _tick = () => {   // o número anda suave até o valor real (sem saltos secos)
    this.raf = 0;
    const d = this.target - this.shown;
    this.shown = Math.abs(d) < .002 ? this.target : this.shown + d * .18;
    this._draw();
    if (this.shown !== this.target) this.raf = requestAnimationFrame(this._tick);
  };
  _draw() {
    const pc = Math.round(this.shown * 100);
    if (this.bar) this.bar.style.width = pc + '%';
    if (this.track) this.track.setAttribute('aria-valuenow', pc);
    if (this.pctEl) this.pctEl.firstChild.textContent = pc;
    if (this.stateEl && !this.root.classList.contains('err') && !this.root.classList.contains('ready')) {
      const t = this.label ? this.label.toUpperCase() + '...' : STAGES.filter(s => pc >= s[0]).pop()[1];
      if (this.stateEl.textContent !== t) this.stateEl.textContent = t;
    }
  }
  /** carregou tudo: completa a barra, mostra PRONTO (ponto verde) e sai de cena */
  done() {
    this.target = this.shown = 1; this._draw();
    this.root.classList.add('ready'); if (this.stateEl) this.stateEl.textContent = 'PRONTO';
    this._end = setTimeout(() => { this.root.classList.add('out'); this._end = setTimeout(() => this.root.classList.add('hidden'), 600); }, 350);
  }
  /** esconde na hora (ex.: depois de mostrar um erro) */
  hide() { clearTimeout(this._end); this.root.classList.add('hidden'); }
  /** deu erro: a tela continua, com o aviso (não entra no menu com o jogo quebrado) */
  error(msg) {
    this.root.classList.add('err');
    if (this.stateEl) this.stateEl.textContent = 'FALHA AO CARREGAR';
    if (this.msgEl) this.msgEl.textContent = msg;
    if (this.bar) this.bar.style.width = '100%';
    if (this.pctEl) this.pctEl.firstChild.textContent = '!';
  }
}
