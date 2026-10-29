/**
 * Painel de configurações (menu principal e pausa da partida). Tudo é aplicado na hora e salvo no navegador (Game.setSetting).
 * Abas: Controles, Câmera (3ª pessoa), Mira (editor com prévia) e Áudio/vídeo.
 */
const pct = v => Math.round(v * 100) + '%', cm = v => Math.round(v * 100) + ' cm', px = v => v + ' px';
export const SCHEMA = [
  { tab: 'Controles', items: [
    { k: 'sens', label: 'Sensibilidade do mouse', min: .1, max: 4, step: .05, fmt: v => (+v).toFixed(2) },
    { k: 'adsSens', label: 'Sensibilidade mirando (botão direito e luneta)', min: .3, max: 2, step: .05, fmt: pct },
    { k: 'fullscreen', label: 'Tela cheia ao jogar (assim Ctrl+W, Ctrl+D etc. não fecham nem mexem na aba). Agachar também funciona com C', type: 'check' }
  ] },
  { tab: 'Câmera', items: [
    { k: 'firstPerson', label: 'Primeira pessoa (atalho na partida: tecla V)', type: 'check' },
    { k: 'fov', label: 'Campo de visão (FOV)', min: 60, max: 120, step: 1, fmt: v => v + '°' },
    { k: 'camDist', label: 'Distância da câmera (perto ↔ longe)', min: 1.2, max: 4, step: .05, fmt: v => (+v).toFixed(2) + ' m' },
    { k: 'camSide', label: 'Câmera para o lado (ombro)', min: 0, max: .9, step: .01, fmt: cm },
    { k: 'camHeight', label: 'Altura da câmera', min: -.3, max: .6, step: .01, fmt: cm }
  ] },
  { tab: 'Mira', preview: true, items: [
    { k: 'chStyle', label: 'Estilo', type: 'select', options: [['dot', 'Ponto'], ['cross', 'Cruz'], ['crossdot', 'Cruz com ponto'], ['circle', 'Círculo']] },
    { k: 'chColor', label: 'Cor', type: 'color' },
    { k: 'chSize', label: 'Tamanho do ponto', min: 2, max: 14, step: 1, fmt: px },
    { k: 'chLen', label: 'Comprimento das linhas', min: 2, max: 24, step: 1, fmt: px },
    { k: 'chThick', label: 'Espessura', min: 1, max: 6, step: 1, fmt: px },
    { k: 'chGap', label: 'Espaço no meio', min: 0, max: 20, step: 1, fmt: px },
    { k: 'chOutline', label: 'Contorno preto', type: 'check' },
    { k: 'chOpacity', label: 'Opacidade', min: .2, max: 1, step: .05, fmt: pct },
    { k: 'chDynamic', label: 'Abre ao atirar e andar (mostra a dispersão)', type: 'check' }
  ] },
  { tab: 'Áudio e vídeo', items: [
    { k: 'volume', label: 'Volume', min: 0, max: 1, step: .01, fmt: pct },
    { k: 'quality', label: 'Qualidade gráfica', type: 'select', options: [['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']] }
  ] }
];
export const SETTINGS_DEFAULTS = { fullscreen: false, firstPerson: false, adsSens: 1, camDist: 2.05, camSide: .48, camHeight: .16,
  chStyle: 'dot', chColor: '#ffffff', chSize: 6, chLen: 8, chThick: 2, chGap: 5, chOutline: true, chOpacity: 1, chDynamic: false };

/** Aplica a mira configurada num elemento .xhair (a mira do HUD ou a prévia). */
export function applyCrosshair(el, s) {
  if (!el) return;
  el.classList.remove('dot', 'cross', 'crossdot', 'circle'); el.classList.add('xhair', s.chStyle || 'dot');
  const st = el.style;
  st.setProperty('--cc', s.chColor || '#fff'); st.setProperty('--cs', (s.chSize ?? 6) + 'px'); st.setProperty('--cl', (s.chLen ?? 8) + 'px');
  st.setProperty('--ct', (s.chThick ?? 2) + 'px'); st.setProperty('--cg', (s.chGap ?? 5) + 'px'); st.setProperty('--ol', s.chOutline === false ? '0px' : '1px');
  st.opacity = s.chOpacity ?? 1;
}

export class SettingsPanel {
  /** root: elemento onde o painel é montado; game: Game (settings + setSetting); onChange(k, v): avisa quem precisa (ex.: mira do HUD). */
  constructor(root, game, onChange = () => {}) {
    this.root = root; this.game = game; this.onChange = onChange; this.tab = 0; this.inputs = {};
    root.classList.add('settings');
    root.innerHTML = `<nav class="st-tabs">${SCHEMA.map((t, i) => `<button data-tab="${i}">${t.tab}</button>`).join('')}</nav>` +
      SCHEMA.map((t, i) => `<div class="st-page" data-page="${i}">${t.preview ? '<div class="ch-prev"><div class="xhair"><i></i><i></i><i></i><i></i></div><span>prévia</span></div>' : ''}` +
        t.items.map(it => this._row(it)).join('') + (i === 2 ? '<button class="ghost st-reset" data-reset="ch">Mira padrão</button>' : '') +
        (i === 1 ? '<button class="ghost st-reset" data-reset="cam">Câmera padrão</button>' : '') + '</div>').join('');
    root.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tab) { this.tab = +b.dataset.tab; this.refresh(); }
      if (b.dataset.reset) {
        const keys = Object.keys(SETTINGS_DEFAULTS).filter(k => b.dataset.reset === 'ch' ? k.startsWith('ch') : k.startsWith('cam'));
        if (b.dataset.reset === 'cam') keys.push('fov');
        for (const k of keys) this._set(k, k === 'fov' ? 90 : SETTINGS_DEFAULTS[k]);
        this.refresh();
      }
    });
    for (const it of SCHEMA.flatMap(t => t.items)) {
      const el = root.querySelector(`[data-k="${it.k}"]`); this.inputs[it.k] = { el, it };
      el.addEventListener(it.type === 'select' || it.type === 'check' ? 'change' : 'input', () => {
        const v = it.type === 'check' ? el.checked : it.type === 'select' || it.type === 'color' ? el.value : +el.value;
        this._set(it.k, v); this._out(it);
      });
      el.addEventListener('keydown', e => e.stopPropagation());
    }
    this.refresh();
  }
  _row(it) {
    const input = it.type === 'select' ? `<select data-k="${it.k}">${it.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`
      : it.type === 'check' ? `<input type="checkbox" data-k="${it.k}">`
      : it.type === 'color' ? `<input type="color" data-k="${it.k}">`
      : `<input type="range" data-k="${it.k}" min="${it.min}" max="${it.max}" step="${it.step}">`;
    return `<label class="st-row ${it.type || 'range'}"><span>${it.label}</span><output data-o="${it.k}"></output>${input}</label>`;
  }
  _set(k, v) { this.game.setSetting(k, v); this.onChange(k, v); applyCrosshair(this.root.querySelector('.ch-prev .xhair'), this.game.settings); }
  _out(it) { const o = this.root.querySelector(`[data-o="${it.k}"]`); if (o) o.textContent = it.fmt ? it.fmt(this.game.settings[it.k]) : ''; }
  /** Relê os valores (chamar ao abrir: o outro painel pode ter mudado algo). */
  refresh() {
    const s = this.game.settings;
    this.root.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', +b.dataset.tab === this.tab));
    this.root.querySelectorAll('[data-page]').forEach(p => p.classList.toggle('hidden', +p.dataset.page !== this.tab));
    for (const { el, it } of Object.values(this.inputs)) {
      if (it.type === 'check') el.checked = !!s[it.k]; else el.value = s[it.k];
      this._out(it);
    }
    applyCrosshair(this.root.querySelector('.ch-prev .xhair'), s);
  }
}
