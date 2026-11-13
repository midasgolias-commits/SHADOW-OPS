/**
 * Tela de carregamento (abre antes do menu): logo, barra de progresso, porcentagem e dicas que trocam sozinhas.
 * Fica na frente de tudo até os modelos terminarem; depois desaparece com um fade e o menu entra.
 * Também é usada quando o stand de tiro precisa carregar (primeira vez que o treino abre).
 */
const TIPS = [
  'Botão direito mira pela arma (VX-47, AUG, Vector e sniper).',
  'V alterna entre 1ª e 3ª pessoa durante a partida.',
  'Ctrl ou C agacha: você fica menor e mais difícil de acertar.',
  'Q volta para a arma anterior sem passar pelas outras.',
  'Esc pausa e abre as configurações sem sair da partida.',
  'No CELEIRO, os vagões e os containers servem de cobertura.',
  'A faca corre mais rápido. Corre e aperta Espaço duas vezes para saltar por cima.',
  'Mire na cabeça: o dano é maior e o selo de abate muda.',
  'Cada mapa tem sites A e B. No competitivo, os times nascem em lados opostos.',
  'A mochila define sua arma principal, a secundária e a arma branca.'
];

export class Boot {
  constructor(root) {
    this.root = root;
    this.bar = root.querySelector('.boot-bar i');
    this.pctEl = root.querySelector('.boot-pct');
    this.stateEl = root.querySelector('.boot-state');
    this.tipEl = root.querySelector('.boot-tip');
    this.i = Math.floor(Math.random() * TIPS.length);
    this.label = 'Carregando';
    this.p = 0;
    if (this.tipEl) this.tipEl.textContent = TIPS[this.i];
    this.timer = setInterval(() => this._tip(), 4200);
  }
  _tip() {
    if (!this.tipEl || this.root.classList.contains('hidden')) return;
    this.i = (this.i + 1) % TIPS.length;
    this.tipEl.classList.remove('on');
    setTimeout(() => { this.tipEl.textContent = TIPS[this.i]; this.tipEl.classList.add('on'); }, 220);
  }
  /** volta para a tela de carregamento (ex.: antes de carregar o stand de tiro) */
  show(label = 'Carregando') {
    clearTimeout(this._end);
    this.root.classList.remove('hidden', 'out', 'err');
    this.label = label;
    if (this.stateEl) this.stateEl.textContent = label + '…';
    this.set(0, label);
  }
  set(p, label) {
    if (label) { this.label = label; if (this.stateEl) this.stateEl.textContent = label + '…'; }
    this.p = Math.max(0, Math.min(1, p || 0));
    const pc = Math.round(this.p * 100);
    if (this.bar) this.bar.style.width = pc + '%';
    if (this.pctEl) this.pctEl.textContent = pc + '%';
  }
  /** carregou tudo: completa a barra e sai de cena */
  done() {
    this.set(1, 'Pronto');
    if (this.stateEl) this.stateEl.textContent = 'PRONTO';
    this.root.classList.add('out');
    this._end = setTimeout(() => this.root.classList.add('hidden'), 600);
  }
  /** esconde na hora (ex.: depois de mostrar um erro) */
  hide() { clearTimeout(this._end); this.root.classList.add('hidden'); }
  /** deu erro: a tela continua, com o aviso (não entra no menu com o jogo quebrado) */
  error(msg) {
    this.root.classList.add('err');
    if (this.stateEl) this.stateEl.textContent = 'FALHA AO CARREGAR';
    if (this.tipEl) { this.tipEl.textContent = msg; this.tipEl.classList.add('on'); }
    if (this.bar) this.bar.style.width = '100%';
    if (this.pctEl) this.pctEl.textContent = '!';
  }
}
