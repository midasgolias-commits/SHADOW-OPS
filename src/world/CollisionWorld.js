/** Colisão por AABBs: movimento de caixa com step-up e raycast (método dos slabs).
 *  Com milhares de caixas (mapa gerado do GLB), usa uma grade 2D (xz) para só testar as caixas próximas. */
const AX = ['x', 'y', 'z'];
const EPS = 1e-4;
const CELL = 2;          // tamanho da célula da grade (m)
const BIG = 24;          // caixas maiores que isso (base, limites) ficam numa lista testada sempre

export class CollisionWorld {
  constructor() { this.boxes = []; this._grid = null; this._stamp = 0; this.terrain = null; }

  addBox(min, max, tag = 'concrete') {
    const b = { min: { ...min }, max: { ...max }, tag, _s: 0 };
    this.boxes.push(b); this._grid = null; return b;
  }
  clear() { this.boxes.length = 0; this._grid = null; this.terrain = null; }

  /* ---------- terreno (mapa de alturas) ----------
   * Mapas de morro (FAVELA): o chão é uma grade de alturas em vez de caixas (a ladeira viraria centenas de milhares delas).
   * t = { minX, minZ, cell, nx, nz, h: Float32Array (m) }. Sem terreno, tudo funciona como antes (piso só de caixas). */
  setTerrain(t) { this.terrain = t; }
  /** Altura do terreno em (x,z), interpolada; -Infinity fora da grade ou sem terreno. */
  groundAt(x, z) {
    const t = this.terrain; if (!t) return -Infinity;
    const fx = (x - t.minX) / t.cell, fz = (z - t.minZ) / t.cell;
    if (fx < 0 || fz < 0 || fx > t.nx - 1 || fz > t.nz - 1) return -Infinity;
    const i = Math.min(t.nx - 2, Math.floor(fx)), k = Math.min(t.nz - 2, Math.floor(fz)), u = fx - i, w = fz - k, h = t.h, n = t.nx;
    return (h[k * n + i] * (1 - u) + h[k * n + i + 1] * u) * (1 - w) + (h[(k + 1) * n + i] * (1 - u) + h[(k + 1) * n + i + 1] * u) * w;
  }
  /** Raio contra o terreno por passos (0,4 m) + bisseção. Retorna a distância do primeiro contato ou Infinity. */
  _terrainRay(o, d, max) {
    if (!this.terrain) return Infinity;
    const STEP = .4; let tPrev = 0, above = o.y - this.groundAt(o.x, o.z);
    if (!(above > 0)) return Number.isFinite(above) ? 0 : Infinity;   // começou embaixo do chão: bate na hora
    for (let t = STEP; t <= max + STEP; t += STEP) {
      const tt = Math.min(t, max), a = o.y + d.y * tt - this.groundAt(o.x + d.x * tt, o.z + d.z * tt);
      if (a <= 0) {
        let lo = tPrev, hi = tt;
        for (let it = 0; it < 7; it++) { const m = (lo + hi) / 2; if (o.y + d.y * m - this.groundAt(o.x + d.x * m, o.z + d.z * m) > 0) lo = m; else hi = m; }
        return hi;
      }
      tPrev = tt; if (tt >= max) break;
    }
    return Infinity;
  }
  /** Normal do terreno em (x,z) pelas diferenças das alturas vizinhas. */
  _terrainNormal(x, z) {
    const e = .5, gx = this.groundAt(x + e, z) - this.groundAt(x - e, z), gz = this.groundAt(x, z + e) - this.groundAt(x, z - e);
    const L = Math.hypot(gx, 2 * e, gz) || 1;
    return { x: -gx / L, y: 2 * e / L, z: -gz / L };
  }

  /* ---------- grade espacial ---------- */
  _build() {
    const g = { big: [], cells: new Map() };
    for (const b of this.boxes) {
      if (b.max.x - b.min.x > BIG || b.max.z - b.min.z > BIG) { g.big.push(b); continue; }
      const i0 = Math.floor(b.min.x / CELL), i1 = Math.floor(b.max.x / CELL), k0 = Math.floor(b.min.z / CELL), k1 = Math.floor(b.max.z / CELL);
      for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
        const key = i * 100003 + k; let c = g.cells.get(key); if (!c) g.cells.set(key, c = []); c.push(b);
      }
    }
    this._grid = g;
  }
  /** Caixas que tocam o retângulo xz (sem repetição). */
  _near(x0, z0, x1, z1, out) {
    if (!this._grid) this._build();
    const g = this._grid, s = ++this._stamp; out.length = 0;
    for (const b of g.big) out.push(b);
    const i0 = Math.floor(x0 / CELL), i1 = Math.floor(x1 / CELL), k0 = Math.floor(z0 / CELL), k1 = Math.floor(z1 / CELL);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const c = g.cells.get(i * 100003 + k); if (!c) continue;
      for (const b of c) if (b._s !== s) { b._s = s; out.push(b); }
    }
    return out;
  }

  _hit(x, y, z, r, h, b) {
    return x - r < b.max.x - EPS && x + r > b.min.x + EPS &&
           y < b.max.y - EPS && y + h > b.min.y + EPS &&
           z - r < b.max.z - EPS && z + r > b.min.z + EPS;
  }
  anyHit(x, y, z, r, h) {
    if (this.terrain && y < this.groundAt(x, z) - .05) return true;
    for (const b of this._near(x - r, z - r, x + r, z + r, this._qa || (this._qa = []))) if (this._hit(x, y, z, r, h, b)) return true;
    return false;
  }

  /** Move p (pés) com velocidade v. Retorna true se estiver no chão. Muta p e v. */
  move(p, v, dt, r, h, stepH = .45) {
    const reach = r + Math.max(Math.abs(v.x), Math.abs(v.z)) * dt + .1;
    const list = this._near(p.x - reach, p.z - reach, p.x + reach, p.z + reach, this._qm || (this._qm = [])).slice();
    const any = (x, y, z) => { for (const b of list) if (this._hit(x, y, z, r, h, b)) return true; return false; };
    for (const ax of ['x', 'z']) {
      const prev = p[ax];
      p[ax] += v[ax] * dt;
      if (this.terrain) {   // ladeira: sobe junto; barranco (mais de ~58°) ou degrau de terra alto bloqueia
        const g = this.groundAt(p.x, p.z), rise = g - p.y;
        if (rise > EPS) {
          const run = Math.abs(p[ax] - prev) || 1e-6;
          if (rise <= stepH && (rise < .03 || rise / run < 1.6) && !any(p.x, g + .002, p.z)) p.y = g;
          else { p[ax] = prev; v[ax] = 0; continue; }
        }
      }
      for (const b of list) {
        if (!this._hit(p.x, p.y, p.z, r, h, b)) continue;
        const rise = b.max.y - p.y;
        if (rise > 0 && rise <= stepH) {
          // rampa = escadinha de degraus baixos: sobe até o degrau mais alto que já está sob o corpo (dentro do limite do degrau),
          // senão o degrau seguinte encostava no corpo e travava a subida
          let top = b.max.y;
          for (let it = 0; it < 6; it++) {
            let next = top;
            for (const o of list) if (this._hit(p.x, top + .002, p.z, r, h, o) && o.max.y - p.y <= stepH && o.max.y > next) next = o.max.y;
            if (next === top) break; top = next;
          }
          if (!any(p.x, top + .002, p.z)) { p.y = top; continue; }
        }
        if (v[ax] > 0) p[ax] = b.min[ax] - r - EPS; else if (v[ax] < 0) p[ax] = b.max[ax] + r + EPS;
        v[ax] = 0;
      }
    }
    let grounded = false;
    p.y += v.y * dt;
    const fallY = p.y - v.y * dt;   // altura antes do passo vertical
    for (const b of list) {
      if (!this._hit(p.x, p.y, p.z, r, h, b)) continue;
      if (v.y <= 0) {
        // só apoia em cima se o topo da caixa está perto dos pés (caiu sobre ela ou degrau).
        // Antes, encostar de lado numa parede alta podia "teleportar" o jogador para o topo dela.
        if (b.max.y - Math.min(fallY, p.y) > stepH + .05) continue;
        p.y = b.max.y; grounded = true;
      } else { if (b.min.y < p.y + h - .5) continue; p.y = b.min.y - h - EPS; }
      v.y = 0;
    }
    if (this.terrain) {   // chão de terra: apoia; na descida gruda (até 12 cm) para não sair "voando" ladeira abaixo
      const g = this.groundAt(p.x, p.z);
      if (p.y < g) { p.y = g; if (v.y < 0) v.y = 0; grounded = true; }
      else if (!grounded && v.y <= 0 && p.y - g < .12 && fallY - g < .15) { p.y = g; v.y = 0; grounded = true; }
    }
    if (!grounded && v.y <= 0) grounded = any(p.x, p.y - .03, p.z) || this.anyHit(p.x, p.y - .03, p.z, r, h * .5);
    return grounded;
  }

  /** o, d: {x,y,z}, d normalizado. Retorna {dist, point, normal, tag} ou null. */
  raycast(o, d, max = 200) {
    if (!this._grid) this._build();
    let best = null;
    const test = b => {
      if (b.tag === 'blocker') return;   // grade invisível (beira do rio): segura o corpo, não o tiro
      let t0 = 0, t1 = best ? Math.min(max, best.dist) : max, nAx = null, nSign = 0;
      for (const a of AX) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < b.min[a] || o[a] > b.max[a]) return; continue; }
        let ta = (b.min[a] - o[a]) / d[a], tb = (b.max[a] - o[a]) / d[a], s = -1;
        if (ta > tb) { [ta, tb] = [tb, ta]; s = 1; }
        if (ta > t0) { t0 = ta; nAx = a; nSign = s; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) return;
      }
      if (best && t0 >= best.dist) return;
      const normal = { x: 0, y: 0, z: 0 }; if (nAx) normal[nAx] = nSign;
      best = { dist: t0, point: { x: o.x + d.x * t0, y: o.y + d.y * t0, z: o.z + d.z * t0 }, normal, tag: b.tag };
    };
    const g = this._grid, s = ++this._stamp;
    for (const b of g.big) test(b);
    // percorre as células da grade ao longo do raio (DDA 2D); para quando já achou algo mais perto que a próxima célula
    let i = Math.floor(o.x / CELL), k = Math.floor(o.z / CELL);
    const si = d.x > 0 ? 1 : -1, sk = d.z > 0 ? 1 : -1;
    const dti = Math.abs(d.x) < 1e-9 ? Infinity : CELL / Math.abs(d.x), dtk = Math.abs(d.z) < 1e-9 ? Infinity : CELL / Math.abs(d.z);
    let ti = Math.abs(d.x) < 1e-9 ? Infinity : ((d.x > 0 ? (i + 1) * CELL - o.x : o.x - i * CELL) / Math.abs(d.x));
    let tk = Math.abs(d.z) < 1e-9 ? Infinity : ((d.z > 0 ? (k + 1) * CELL - o.z : o.z - k * CELL) / Math.abs(d.z));
    let t = 0;
    while (t <= max) {
      const c = g.cells.get(i * 100003 + k);
      if (c) for (const b of c) if (b._s !== s) { b._s = s; test(b); }
      if (best && best.dist <= Math.min(ti, tk)) break;
      if (ti < tk) { t = ti; ti += dti; i += si; } else { t = tk; tk += dtk; k += sk; }
      if (!isFinite(t)) break;
    }
    if (this.terrain) {   // o chão de terra também segura tiro e visão
      const tt = this._terrainRay(o, d, best ? Math.min(max, best.dist) : max);
      if (tt < Infinity && (!best || tt < best.dist)) {
        const pt = { x: o.x + d.x * tt, y: o.y + d.y * tt, z: o.z + d.z * tt };
        best = { dist: tt, point: pt, normal: this._terrainNormal(pt.x, pt.z), tag: 'dirt' };
      }
    }
    return best;
  }

  /**
   * Varredura de ESFERA (raio r) do centro o na direção d (normalizada) até max: testa o centro contra as caixas
   * "engordadas" por r (soma de Minkowski), então o contato é exato em qualquer ângulo (granada).
   * Retorna { dist, point (centro no contato), normal, tag, inside } ou null. inside = já começou encostada/dentro:
   * nesse caso normal = lado mais raso para sair e dist = quanto precisa sair.
   */
  sweepSphere(o, d, max, r) {
    const ex = Math.abs(d.x) * max + r + .05, ez = Math.abs(d.z) * max + r + .05;
    const list = this._near(Math.min(o.x, o.x + d.x * max) - r - .05, Math.min(o.z, o.z + d.z * max) - r - .05,
      Math.max(o.x, o.x + d.x * max) + r + .05, Math.max(o.z, o.z + d.z * max) + r + .05, this._qs || (this._qs = []));
    let best = null;
    for (const b of list) {
      if (b.tag === 'blocker') continue;
      const mn = { x: b.min.x - r, y: b.min.y - r, z: b.min.z - r }, mx = { x: b.max.x + r, y: b.max.y + r, z: b.max.z + r };
      if (o.x > mn.x && o.x < mx.x && o.y > mn.y && o.y < mx.y && o.z > mn.z && o.z < mx.z) {   // começou dentro: sai pelo lado mais raso
        let pen = Infinity, ax = 'y', sg = 1;
        for (const a of AX) { const lo = o[a] - mn[a], hi = mx[a] - o[a]; if (lo < pen) { pen = lo; ax = a; sg = -1; } if (hi < pen) { pen = hi; ax = a; sg = 1; } }
        const normal = { x: 0, y: 0, z: 0 }; normal[ax] = sg;
        if (!best || !best.inside || pen > best.dist) best = { dist: pen, point: { ...o }, normal, tag: b.tag, inside: true };
        continue;
      }
      if (best?.inside) continue;
      let t0 = 0, t1 = best ? Math.min(max, best.dist) : max, nAx = null, nSign = 0, miss = false;
      for (const a of AX) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] <= mn[a] || o[a] >= mx[a]) { miss = true; break; } continue; }
        let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a], s = -1;
        if (ta > tb) { [ta, tb] = [tb, ta]; s = 1; }
        if (ta > t0) { t0 = ta; nAx = a; nSign = s; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) { miss = true; break; }
      }
      if (miss || !nAx) continue;
      const normal = { x: 0, y: 0, z: 0 }; normal[nAx] = nSign;
      best = { dist: t0, point: { x: o.x + d.x * t0, y: o.y + d.y * t0, z: o.z + d.z * t0 }, normal, tag: b.tag, inside: false };
    }
    if (this.terrain && !best?.inside) {   // esfera contra o chão de terra (granada quicando na ladeira)
      const g0 = this.groundAt(o.x, o.z);
      if (o.y - r < g0) return { dist: g0 + r - o.y, point: { ...o }, normal: this._terrainNormal(o.x, o.z), tag: 'dirt', inside: true };
      const lim = best ? best.dist : max, sub = { x: o.x, y: o.y - r, z: o.z };
      const tt = this._terrainRay(sub, d, lim);
      if (tt < lim) best = { dist: tt, point: { x: o.x + d.x * tt, y: o.y + d.y * tt, z: o.z + d.z * tt }, normal: this._terrainNormal(o.x + d.x * tt, o.z + d.z * tt), tag: 'dirt', inside: false };
    }
    return best;
  }

  /** Linha de visão livre entre dois pontos {x,y,z}. */
  hasLOS(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) return true;
    const hit = this.raycast(a, { x: dx / L, y: dy / L, z: dz / L }, L);
    return !hit || hit.dist >= L - .01;
  }
}
