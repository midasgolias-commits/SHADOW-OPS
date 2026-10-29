import { WEAPONS } from '../weapons/Weapons.js';
import { SKINS, SLOTS, getLoadout, setLoadout } from './Loadout.js';
import { CharacterPreview } from './CharacterPreview.js';

/**
 * INVENTÁRIO / MOCHILA (estilo Point Blank): personagem em 3D à esquerda com o STATUS, à direita a vitrine com FOTOS das armas
 * (assets/ui/weapons/<id>.png, tiradas dos modelos 3D do jogo) e embaixo os números da arma escolhida.
 * Clicar numa arma só SELECIONA (o personagem mostra ela); só vale para a partida depois de clicar em EQUIPAR.
 * Abre na sala (aba Mochila) e no menu principal (botão Mochila). Fundo: assets/ui/bg_galpao.jpg.
 */
export const weaponPhoto = id => `assets/ui/weapons/${id}.png`;
export const charPhoto = id => `assets/ui/chars/${id}.png`;
const slotOf = id => SLOTS.find(s => s.ids.includes(id));
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
/** Números de 0 a 100 para as barras (e o texto) de cada arma. */
export function weaponStats(id) {
  const w = WEAPONS[id], melee = !!w.melee;
  const eff = w.zoomSpread ?? w.spread * (w.ads?.spreadMul ?? 1);   // dispersão mirando (a que vale de verdade)
  return {
    dano: clamp(w.dmg * (w.pellets || 1) / 115 * 100), danoTxt: w.pellets > 1 ? `${w.dmg} x ${w.pellets}` : `${w.dmg}`,
    disparo: clamp(w.rpm / 800 * 100), disparoTxt: `${w.rpm}/min`,
    precisao: melee ? null : clamp(100 * (1 - eff / .04)),
    recuoV: melee ? null : clamp(w.recoil.p / .05 * 100), recuoH: melee ? null : clamp(w.recoil.y / .008 * 100),
    peso: clamp((1.08 - (w.speedMul ?? 1)) / .23 * 100), velocidade: clamp((w.speedMul ?? 1) / 1.1 * 100),
    alcance: clamp(w.range / 300 * 100), alcanceTxt: `${w.range} m`,
    municao: melee ? '—' : `${w.mag}/${w.reserve}`
  };
}

const TABS = [{ k: 'all', label: 'Ver tudo' }, ...SLOTS.map(s => ({ k: s.k, label: s.label }))];

export class Inventory {
  /** root: elemento vazio onde a mochila é montada. hooks: { assets, beep, onClose, onEquip(L) } */
  constructor(root, hooks) {
    this.root = root; this.hooks = hooks; this.tab = 'weapon'; this.cat = 'all'; this.q = ''; this.sel = null; this.preview = null; this.isOpen = false;
    root.classList.add('inv-root', 'hidden');
    root.innerHTML = `<div class="inv">
      <header class="inv-top">
        <div class="inv-logo">SHADOW<b>OPS</b></div>
        <nav class="inv-nav"><button class="inv-navb" data-act="close"><i>◂</i>SALA</button><button class="inv-navb on"><i>▣</i>INVENTÁRIO</button></nav>
        <button class="inv-x" data-act="close" aria-label="Fechar">✕</button>
      </header>
      <div class="inv-body">
        <aside class="inv-left inv-frame">
          <div class="inv-stage"><canvas class="inv-char" aria-label="Seu personagem"></canvas><p class="inv-wait">Carregando personagem…</p>
            <div class="inv-who"><small>PERSONAGEM</small><b></b></div><p class="inv-tip">arraste para girar</p></div>
          <div class="inv-status"><h4><i>◆</i>STATUS<small></small></h4><div class="inv-st"></div></div>
        </aside>
        <section class="inv-right inv-frame">
          <div class="inv-tabs"><button data-act="tab" data-tab="weapon">Arma</button><button data-act="tab" data-tab="skin">Personagem</button></div>
          <div class="inv-cats"></div>
          <div class="inv-search"><label>Pesquisa<input class="inv-q" placeholder="nome da arma…" autocomplete="off"></label><span class="inv-count"></span></div>
          <div class="inv-grid"></div>
          <div class="inv-detail"></div>
        </section>
      </div>
    </div>`;
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.act === 'close') return this.close();
      if (d.act === 'tab') { this.tab = d.tab; this.sel = null; this.q = ''; root.querySelector('.inv-q').value = ''; }
      if (d.act === 'cat') this.cat = d.cat;
      if (d.act === 'sel') { this.sel = d.id; this._show(); }
      if (d.act === 'equip') this._equip();
      this.hooks.beep?.(); this._render();
    });
    root.querySelector('.inv-q').addEventListener('input', e => { this.q = e.target.value.trim().toLowerCase(); this._render(); });
    this._key = e => { if (this.isOpen && e.code === 'Escape') this.close(); };
    addEventListener('keydown', this._key);
  }

  open(tab = 'weapon') {
    this.isOpen = true; this.tab = tab; const L = getLoadout(); this.sel = tab === 'skin' ? L.skin : L.primary;
    this.root.classList.remove('hidden'); this._render(); this._startPreview();
  }
  close() { if (!this.isOpen) return; this.isOpen = false; this.preview?.stop(); this.root.classList.add('hidden'); this.hooks.onClose?.(); }

  _startPreview() {
    const a = this.hooks.assets;
    if (!a?.ready) { clearTimeout(this._wt); this._wt = setTimeout(() => this.isOpen && this._startPreview(), 400); return; }
    this.preview ??= new CharacterPreview(this.root.querySelector('.inv-char'), a);
    this._show(); this.preview.start(); this.root.querySelector('.inv-wait').classList.add('hidden');
  }
  /** O personagem mostra a skin e a arma SELECIONADAS (ainda sem equipar). */
  _show() {
    if (!this.preview) return; const L = getLoadout();
    const skin = this.tab === 'skin' && this.sel ? this.sel : L.skin, weapon = this.tab === 'weapon' && this.sel ? this.sel : L.primary;
    this.preview.set(skin, weapon);
  }
  _equip() {
    const id = this.sel; if (!id) return;
    const patch = this.tab === 'skin' ? { skin: id } : { [slotOf(id).k]: id };
    const L = setLoadout(patch); this.hooks.onEquip?.(L, this.tab === 'skin' ? SKINS.find(s => s.id === id).name : WEAPONS[id].name);
    this._flash = id; clearTimeout(this._ft); this._ft = setTimeout(() => { this._flash = null; this.isOpen && this._render(); }, 900);
  }

  _render() {
    const R = this.root, L = getLoadout(), equipped = new Set([L.primary, L.secondary, L.melee, L.skin]);
    R.querySelectorAll('.inv-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    R.querySelector('.inv-who b').textContent = SKINS.find(s => s.id === (this.tab === 'skin' && this.sel ? this.sel : L.skin)).name;
    const cats = R.querySelector('.inv-cats'), grid = R.querySelector('.inv-grid');
    if (this.tab === 'weapon') {
      cats.innerHTML = TABS.map(t => `<button data-act="cat" data-cat="${t.k}" class="${t.k === this.cat ? 'on' : ''}">${t.label}</button>`).join('');
      const ids = SLOTS.filter(s => this.cat === 'all' || s.k === this.cat).flatMap(s => s.ids)
        .filter(id => !this.q || (WEAPONS[id].name + ' ' + WEAPONS[id].kind).toLowerCase().includes(this.q));
      if (this.sel && !ids.includes(this.sel)) this.sel = ids[0] || null;
      grid.innerHTML = ids.map(id => { const w = WEAPONS[id], sl = slotOf(id), on = equipped.has(id);
        return `<button class="inv-card${id === this.sel ? ' sel' : ''}${on ? ' eq' : ''}" data-act="sel" data-id="${id}">
          <b class="nm">${w.name}</b><span class="ph"><img src="${weaponPhoto(id)}" alt="${w.name}" draggable="false"></span>
          <span class="ft"><small>${w.kind}</small>${on ? '<em>EQUIPADA</em>' : `<i>${sl.label} · tecla ${sl.key}</i>`}</span></button>`; }).join('')
        || '<p class="inv-none">Nenhuma arma com esse nome.</p>';
      R.querySelector('.inv-count').textContent = ids.length + (ids.length === 1 ? ' arma' : ' armas');
    } else {
      cats.innerHTML = '<button class="on">Ver tudo</button>';
      const list = SKINS.filter(s => !this.q || s.name.toLowerCase().includes(this.q));
      if (this.sel && !list.some(s => s.id === this.sel)) this.sel = list[0]?.id || null;
      grid.innerHTML = list.map(s => `<button class="inv-card skin${s.id === this.sel ? ' sel' : ''}${L.skin === s.id ? ' eq' : ''}" data-act="sel" data-id="${s.id}">
          <b class="nm">${s.name}</b><span class="ph"><img src="${charPhoto(s.id)}" alt="${s.name}" draggable="false"></span>
          <span class="ft"><small>Personagem</small>${L.skin === s.id ? '<em>EM USO</em>' : ''}</span></button>`).join('');
      R.querySelector('.inv-count').textContent = list.length + ' personagens';
    }
    this._status(L); this._detail(L, equipped);
  }

  /** STATUS (embaixo do personagem): arma EQUIPADA na vaga x arma SELECIONADA, como no Point Blank (27 / 25). */
  _status(L) {
    const box = this.root.querySelector('.inv-st'), small = this.root.querySelector('.inv-status small');
    if (this.tab !== 'weapon' || !this.sel) { box.innerHTML = '<p class="inv-none">Escolha uma arma para comparar.</p>'; small.textContent = ''; return; }
    const cur = L[slotOf(this.sel).k], a = weaponStats(cur), b = weaponStats(this.sel), same = cur === this.sel;
    small.textContent = same ? WEAPONS[cur].name : `${WEAPONS[cur].name} → ${WEAPONS[this.sel].name}`;
    const row = (label, k) => { const va = a[k] ?? 0, vb = b[k] ?? 0, up = vb > va, dn = vb < va;
      return `<div class="row"><span>${label}</span><i class="bar"><i class="a" style="width:${va}%"></i><i class="b${up ? ' up' : dn ? ' dn' : ''}" style="width:${vb}%"></i></i><b>${a[k] ?? '—'}${same ? '' : `<em class="${up ? 'up' : dn ? 'dn' : ''}">${b[k] ?? '—'}</em>`}</b></div>`; };
    box.innerHTML = row('Dano', 'dano') + row('Precisão', 'precisao') + row('Disparo', 'disparo') + row('Velocidade', 'velocidade');
  }

  /** Painel de baixo: números da arma selecionada + botão EQUIPAR (só equipando a arma vale para a partida). */
  _detail(L, equipped) {
    const D = this.root.querySelector('.inv-detail');
    if (!this.sel) { D.innerHTML = ''; return; }
    const isSkin = this.tab === 'skin', on = isSkin ? L.skin === this.sel : equipped.has(this.sel), flash = this._flash === this.sel;
    const btn = `<button class="inv-equip${on ? ' done' : ''}${flash ? ' flash' : ''}" data-act="equip"${on ? ' disabled' : ''}>${on ? (flash ? '✓ EQUIPADO!' : '✓ EQUIPADA') : 'EQUIPAR'}</button>`;
    if (isSkin) {
      const s = SKINS.find(x => x.id === this.sel);
      D.innerHTML = `<div class="inv-dl"><h3>${s.name}</h3><p class="inv-desc">${s.desc}</p></div>
        <div class="inv-dr"><div class="inv-box"><small>Em uso agora</small><b>${SKINS.find(x => x.id === L.skin).name}</b></div>${btn}</div>`;
      return;
    }
    const w = WEAPONS[this.sel], st = weaponStats(this.sel), sl = slotOf(this.sel);
    const bar = (label, v, txt) => `<div class="stat"><span>${label}</span><i class="bar"><i style="width:${v ?? 0}%"></i></i><b>${txt ?? v ?? '—'}</b></div>`;
    D.innerHTML = `<div class="inv-dl"><h3>${w.name}<small>${w.kind}</small></h3>
        <div class="inv-stats">
          ${bar('Dano', st.dano, st.danoTxt)}${bar('Recuo V.', st.recuoV)}
          ${bar('Vel. de disparo', st.disparo, st.disparoTxt)}${bar('Peso', st.peso)}
          ${bar('Precisão', st.precisao)}${bar('Recuo H.', st.recuoH)}
          <div class="stat"><span>Munição</span><b class="txt">${st.municao}</b></div>${bar('Alcance', st.alcance, st.alcanceTxt)}
        </div></div>
      <div class="inv-dr"><div class="inv-box"><small>${sl.label} · tecla ${sl.key} · equipada agora</small><b>${WEAPONS[L[sl.k]].name}</b></div>${btn}
        <p class="inv-note">${on ? 'Esta arma já vai com você na partida.' : 'Só vale na partida depois de clicar em EQUIPAR.'}</p></div>`;
  }
}
