/**
 * Ferramenta de sons (sons.html, aberta pelo Lab de Armas).
 * Lista os sons dos pacotes (pasta Sounds/), toca um por um e deixa você escolher o destino de cada som.
 * "Aplicar no jogo" copia o som para assets/sounds/<destino>.mp3 (o servidor guarda o anterior em assets/sounds/_backup).
 * As escolhas (destino + anotação) ficam em assets/config/sons_destino.json — também servem para o Claude ligar os sons novos no jogo.
 */
const $ = id => document.getElementById(id);

/** Destinos. game:true = o jogo já toca esse som; false = som novo, fica guardado até ser ligado no jogo. */
export const DESTINOS = [
  ['Tiros', [['rifle', 'VX-47 — tiro'], ['aug', 'AUG A3 — tiro'], ['sniper', 'Sniper — tiro'], ['smg', 'Vector — tiro'], ['pistol', 'P-19 — tiro'], ['shotgun', 'SPAS — tiro'], ['knife', 'Faca — golpe']]],
  ['Recargas', [['reload_rifle', 'VX-47 — recarga'], ['reload_aug', 'AUG A3 — recarga'], ['reload_sniper', 'Sniper — recarga'], ['reload_smg', 'Vector — recarga'], ['reload_pistol', 'P-19 — recarga'], ['reload_shell', 'SPAS — cada cartucho']]],
  ['Jogador', [['step', 'Passo'], ['walk_loop', 'Andando (som contínuo)'], ['jump', 'Pulo'], ['bullet_onme_sound', 'Levar tiro'], ['kill_sound', 'Abate (som do abate)']]],
  ['Locutor — novo (o jogo ainda não toca; eu ligo depois)', [['locutor_inicio', 'Início da partida'], ['locutor_abate', 'Abate'], ['locutor_headshot', 'Abate com tiro na cabeça'],
    ['locutor_abate_duplo', 'Abate duplo'], ['locutor_abate_triplo', 'Abate triplo'], ['locutor_massacre', 'Muitos abates seguidos'], ['locutor_sequencia', 'Sequência de abates'],
    ['locutor_capacete', 'Capacete protegeu'], ['locutor_vitoria', 'Vitória'], ['locutor_derrota', 'Derrota'], ['locutor_vitoria_azul', 'Vitória do time azul'], ['locutor_vitoria_vermelho', 'Vitória do time vermelho'],
    ['locutor_bomba_plantada', 'Bomba plantada'], ['locutor_bomba_desarmada', 'Bomba desarmada'], ['locutor_bomba_explodiu', 'Bomba explodiu'], ['locutor_nivel', 'Subiu de nível (treino)']]]
];
const GAME_SLOTS = new Set(DESTINOS.slice(0, 3).flatMap(g => g[1].map(d => d[0])));
const LABEL = Object.fromEntries(DESTINOS.flatMap(g => g[1]));

/** O que cada nome do pacote do Point Blank quer dizer (só uma dica; quem decide é você). */
const DICAS = [
  [/Double_Kill/i, 'abate duplo', 'locutor_abate_duplo'], [/Triple_Kill/i, 'abate triplo', 'locutor_abate_triplo'], [/MassKill/i, 'massacre (muitos abates)', 'locutor_massacre'],
  [/Chain_HeadShot/i, 'sequência de tiros na cabeça', 'locutor_sequencia'], [/Chain_Killer/i, 'sequência de abates', 'locutor_sequencia'], [/Chain_Slugger/i, 'sequência de abates corpo a corpo', 'locutor_sequencia'],
  [/Chain_Stopper/i, 'parou a sequência do inimigo', 'locutor_sequencia'], [/HeadShot/i, 'tiro na cabeça', 'locutor_headshot'], [/HelmetProtection/i, 'capacete protegeu', 'locutor_capacete'],
  [/Halloween_Kill/i, 'abate (Halloween)', 'locutor_abate'], [/Piercing/i, 'tiro atravessou', null], [/_Kill\b|_Kill$/i, 'abate', 'locutor_abate'],
  [/BlueTeam_Win/i, 'vitória do time azul', 'locutor_vitoria_azul'], [/RedTeam_Win/i, 'vitória do time vermelho', 'locutor_vitoria_vermelho'],
  [/Mission_Success/i, 'missão cumprida', 'locutor_vitoria'], [/Mission_Fail/i, 'missão falhou', 'locutor_derrota'], [/Start_Mission/i, 'início da partida', 'locutor_inicio'],
  [/Bomb_Plated|Bomb_Planted/i, 'bomba plantada', 'locutor_bomba_plantada'], [/Bomb_Removed/i, 'bomba desarmada', 'locutor_bomba_desarmada'], [/Bomb_Explode/i, 'bomba explodiu', 'locutor_bomba_explodiu'],
  [/Warn_Generator/i, 'aviso: gerador', null], [/Warn_Helicopter/i, 'aviso: helicóptero', null], [/Training_Levelup/i, 'subiu de nível (treino)', 'locutor_nivel'],
  [/Watermelon/i, 'pegou a melancia (evento)', null], [/PumpkinKnuckle.*Hit_Human/i, 'soco de abóbora acertou (evento)', null], [/PumpkinKnuckle.*Chain/i, 'sequência com soco de abóbora (evento)', null]
];
const dica = name => { for (const [re, txt, slot] of DICAS) if (re.test(name)) return { txt, slot }; return null; };

let ctx = null, gain = null, playing = null, files = [], game = new Set(), map = { version: 1, sons: {} }, rows = [], sel = -1;
const audio = () => { if (!ctx) { ctx = new AudioContext(); gain = ctx.createGain(); gain.gain.value = +$('vol').value; gain.connect(ctx.destination); } return ctx; };
const bufs = new Map();
async function decode(url) {
  if (!bufs.has(url)) bufs.set(url, fetch(encodeURI(url) + '?v=' + Date.now()).then(r => { if (!r.ok) throw new Error('não achou'); return r.arrayBuffer(); }).then(b => audio().decodeAudioData(b)));
  return bufs.get(url);
}
function stop() { if (playing) { try { playing.src.stop(); } catch {} playing.btn?.classList.remove('on'); playing = null; } }
async function play(url, btn) {
  const was = playing?.url === url; stop(); if (was) return;
  try {
    const b = await decode(url), c = audio(); if (c.state === 'suspended') await c.resume();
    const s = c.createBufferSource(); s.buffer = b; s.connect(gain); s.start();
    playing = { src: s, url, btn }; btn?.classList.add('on');
    s.onended = () => { if (playing?.src === s) stop(); };
  } catch (e) { say('Não consegui tocar: ' + e.message, 'err'); }
}
function say(t, cls = '') { $('msg').textContent = t; $('msg').className = cls; }

function drawWave(cv, b) {
  const w = cv.width = cv.clientWidth * devicePixelRatio, h = cv.height = cv.clientHeight * devicePixelRatio, g = cv.getContext('2d'), d = b.getChannelData(0), n = d.length;
  g.fillStyle = '#0f1519'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9b458';
  for (let x = 0; x < w; x++) {
    let mx = 0; const a = Math.floor(x / w * n), z = Math.floor((x + 1) / w * n);
    for (let i = a; i < z; i++) { const v = Math.abs(d[i]); if (v > mx) mx = v; }
    const y = Math.max(1, mx * h * .95); g.fillRect(x, (h - y) / 2, 1, y);
  }
}

function pretty(path) {
  const f = path.split('/').pop().replace(/\.[^.]+$/, '');
  return f.replace(/^\d+_/, '').replace(/^(MV|TS|VR)_Ann_/, '').replace(/^UI_HUD_/, '').replace(/_/g, ' ');
}
const packOf = p => p.split('/').slice(1, -1).join('/') || '(solto)';

async function load() {
  const [list, m] = await Promise.all([
    fetch('api/sons').then(r => r.json()),
    fetch('assets/config/sons_destino.json?v=' + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null)
  ]);
  if (m?.sons) map = m;
  // o pacote pode ter a cópia .wav original e a .mp3: mostra só a .mp3 (é a que vai para o jogo)
  const mp3 = new Set(list.pacotes.filter(f => f.path.toLowerCase().endsWith('.mp3')).map(f => f.path.split('/').pop().replace(/\.mp3$/i, '')));
  files = list.pacotes.filter(f => f.path.toLowerCase().endsWith('.mp3') || !mp3.has(f.path.split('/').pop().replace(/\.[^.]+$/, '')));
  game = new Set(list.jogo.map(f => f.path.split('/').pop().replace(/\.mp3$/i, '')));
  const packs = [...new Set(files.map(f => packOf(f.path)))];
  $('pack').innerHTML = '<option value="">Todos</option>' + packs.map(p => `<option>${p}</option>`).join('');
  const last = packs.find(p => /bison/i.test(p)); if (last) $('pack').value = last;
  render();
}

function destSelect(cur) {
  return '<option value="">— escolher destino —</option><option value="nao_usar">Não usar</option>' +
    DESTINOS.map(([g, ds]) => `<optgroup label="${g}">` + ds.map(([id, l]) => `<option value="${id}" ${id === cur ? 'selected' : ''}>${l}${game.has(id) && GAME_SLOTS.has(id) ? '' : ''}</option>`).join('') + '</optgroup>').join('') +
    `<option value="outro" ${cur && !LABEL[cur] && cur !== 'nao_usar' ? 'selected' : ''}>Outro (escreva abaixo)</option>`;
}

function render() {
  const pk = $('pack').value, q = $('filter').value.trim().toLowerCase(), free = $('onlyFree').checked;
  const L = $('list'); L.innerHTML = ''; rows = [];
  const show = files.filter(f => (!pk || packOf(f.path) === pk) && (!q || f.path.toLowerCase().includes(q) || pretty(f.path).toLowerCase().includes(q)) && (!free || !map.sons[f.path]?.destino));
  if (!show.length) L.innerHTML = '<p class="hint">Nenhum som aqui. Coloque os sons (.mp3 ou .wav) dentro da pasta <b>Sounds</b> do jogo e recarregue (F5).</p>';
  for (const f of show) {
    const e = map.sons[f.path] || {}, d = dica(f.path), isMp3 = f.path.toLowerCase().endsWith('.mp3');
    const r = document.createElement('div'); r.className = 'row' + (e.aplicado ? ' done' : '') + (e.destino === 'nao_usar' ? ' skip' : '');
    r.innerHTML = `
      <button class="play" title="Tocar (Espaço)">▶</button>
      <div class="nm"><b>${pretty(f.path)}</b>${d ? `<i>${d.txt}</i>` : ''}<small>${f.path}</small></div>
      <canvas class="wave" title="clique para tocar"></canvas>
      <div class="dest"><select>${destSelect(e.destino)}</select>
        <input class="note" placeholder="anotação (ex.: usar mais baixo, cortar o começo…)" value="${(e.nota || '').replace(/"/g, '&quot;')}">
        ${d?.slot && !e.destino ? `<span class="sug">sugestão: ${LABEL[d.slot]} <button class="useSug">usar</button></span>` : ''}</div>
      <div class="acts"><button class="cur">Ouvir o som atual do destino</button><button class="apply" ${isMp3 ? '' : 'disabled title="só .mp3"'}>Aplicar no jogo</button><button class="undo">Desfazer no jogo</button><span class="st"></span></div>`;
    const btn = r.querySelector('.play'), cv = r.querySelector('.wave'), sel_ = r.querySelector('select'), note = r.querySelector('.note'), st = r.querySelector('.st');
    const slot = () => sel_.value === 'outro' ? (note.value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40) || '') : sel_.value;
    const status = () => {
      const s = slot(), ent = map.sons[f.path];
      if (ent?.aplicado && ent.destino === s) { st.textContent = '✓ no jogo como "' + (LABEL[s] || s) + '"'; st.className = 'st ok'; }
      else if (!s) { st.textContent = ''; st.className = 'st'; }
      else if (s === 'nao_usar') { st.textContent = 'marcado: não usar'; st.className = 'st'; }
      else { st.textContent = GAME_SLOTS.has(s) ? 'ainda não aplicado' : 'som novo: aplique e me avise para eu ligar no jogo'; st.className = 'st'; }
      r.querySelector('.apply').disabled = !isMp3 || !s || s === 'nao_usar';
      r.querySelector('.undo').disabled = !s || s === 'nao_usar';
      r.querySelector('.cur').disabled = !s || s === 'nao_usar';
    };
    const remember = async (patch) => {
      map.sons[f.path] = { ...(map.sons[f.path] || {}), ...patch, quando: new Date().toISOString() };
      if (!map.sons[f.path].destino && !map.sons[f.path].nota) delete map.sons[f.path];
      map.saved = new Date().toISOString();
      const ok = await fetch('api/sons-destino', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(map) }).then(x => x.ok).catch(() => false);
      if (!ok) say('Não consegui guardar a escolha (o servidor do jogo está aberto?)', 'err');
      summary();
    };
    btn.onclick = () => { pick(rows.indexOf(item)); play(f.path, btn); };
    cv.onclick = btn.onclick;
    sel_.onchange = () => { remember({ destino: slot(), aplicado: false }); r.classList.toggle('skip', sel_.value === 'nao_usar'); r.classList.remove('done'); status(); };
    note.onchange = () => { remember({ nota: note.value, ...(sel_.value === 'outro' ? { destino: slot(), aplicado: false } : {}) }); status(); };
    r.querySelector('.useSug')?.addEventListener('click', ev => { sel_.value = d.slot; sel_.onchange(); ev.target.parentElement.remove(); });
    r.querySelector('.cur').onclick = ev => {
      const s = slot(); if (!game.has(s)) { say('"' + (LABEL[s] || s) + '" ainda não tem som gravado no jogo' + (GAME_SLOTS.has(s) ? ' (o jogo usa um som gerado).' : '.'), ''); return; }
      bufs.delete('assets/sounds/' + s + '.mp3'); play('assets/sounds/' + s + '.mp3', ev.target);
    };
    const apply = async () => {
      const s = slot(); if (!s || s === 'nao_usar' || !isMp3) return;
      if (game.has(s) && !confirm('Trocar o som "' + (LABEL[s] || s) + '" do jogo por este?\n(o atual fica guardado; dá para desfazer)')) return;
      const res = await fetch('api/som-aplicar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src: f.path, slot: s }) }).then(x => x.json()).catch(e => ({ ok: false, erro: e.message }));
      if (!res.ok) { say('Não apliquei: ' + (res.erro || 'erro'), 'err'); return; }
      game.add(s); bufs.delete('assets/sounds/' + s + '.mp3');
      // um destino só tem um som: tira a marca "aplicado" de outro som que estava nesse destino
      for (const [p, v] of Object.entries(map.sons)) if (p !== f.path && v.destino === s && v.aplicado) v.aplicado = false;
      await remember({ destino: s, aplicado: true }); r.classList.add('done'); status();
      say('✓ "' + pretty(f.path) + '" agora é "' + (LABEL[s] || s) + '" no jogo. ' + (GAME_SLOTS.has(s) ? 'Recarregue o jogo (F5) para ouvir.' : 'Som novo: me avise para eu ligar no jogo.'), 'ok');
      document.querySelectorAll('.row').forEach(x => x !== r && x._status?.());
    };
    r.querySelector('.apply').onclick = apply;
    r.querySelector('.undo').onclick = async () => {
      const s = slot(); if (!confirm('Voltar o som "' + (LABEL[s] || s) + '" do jogo para o que era antes da última troca?')) return;
      const res = await fetch('api/som-desfazer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot: s }) }).then(x => x.json()).catch(e => ({ ok: false, erro: e.message }));
      if (!res.ok) { say('Nada desfeito: ' + (res.erro || 'erro'), 'err'); return; }
      bufs.delete('assets/sounds/' + s + '.mp3');
      const list = await fetch('api/sons').then(x => x.json()); game = new Set(list.jogo.map(x => x.path.split('/').pop().replace(/\.mp3$/i, '')));
      for (const v of Object.values(map.sons)) if (v.destino === s) v.aplicado = false;
      await remember({}); r.classList.remove('done'); status();
      say('Som "' + (LABEL[s] || s) + '" voltou ao anterior.', 'ok');
    };
    r._status = status; status();
    const item = { r, f, btn, play: () => play(f.path, btn), apply };
    rows.push(item); L.appendChild(r);
    new IntersectionObserver((es, ob) => { if (es[0].isIntersecting) { ob.disconnect(); decode(f.path).then(b => { drawWave(cv, b); r.querySelector('.nm small').textContent = f.path + ' · ' + b.duration.toFixed(2) + ' s'; }).catch(() => {}); } }).observe(cv);
  }
  sel = -1; summary();
}
function pick(i) { if (i < 0 || i >= rows.length) return; rows[sel]?.r.classList.remove('sel'); sel = i; rows[i].r.classList.add('sel'); rows[i].r.scrollIntoView({ block: 'nearest' }); }
function summary() {
  const all = files.length, dec = files.filter(f => map.sons[f.path]?.destino).length, ap = files.filter(f => map.sons[f.path]?.aplicado).length;
  $('summary').textContent = `${all} sons · ${dec} com destino · ${ap} aplicados no jogo`;
}

document.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) && e.key !== 'Escape') return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pick(Math.max(0, Math.min(rows.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)))); stop(); rows[sel]?.play(); }
  else if (e.key === ' ') { e.preventDefault(); if (sel < 0) pick(0); stop(); rows[sel]?.play(); }
  else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); rows[sel].apply(); }
  else if (e.key === 'Escape') { document.activeElement?.blur(); stop(); }
});
$('vol').oninput = () => { if (gain) gain.gain.value = +$('vol').value; };
for (const id of ['pack', 'onlyFree']) $(id).onchange = render;
$('filter').oninput = render;
load().catch(e => { $('list').innerHTML = '<p class="hint">Não consegui ler a lista de sons. O jogo precisa estar aberto pelo arquivo .bat (servidor do jogo). Erro: ' + e.message + '</p>'; });
