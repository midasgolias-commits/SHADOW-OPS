/** Grade de navegação (1 m) sobre o CollisionWorld: alcance por flood-fill e caminhos A* (base para os bots). */
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

export class Navigation {
  constructor(world, bounds, seed, cell = 1) {
    this.world = world; this.b = bounds; this.cell = cell;
    this.nx = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.nz = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.walk = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const c = this.center(i, j);
      // y=.5 ignora degraus baixos (<= .45 m), que o jogador sobe sozinho
      this.walk[j * this.nx + i] = world.anyHit(c.x, .5, c.z, .4, 1.3) ? 0 : 1;
    }
    this.reach = new Uint8Array(this.walk.length);
    this._flood(seed);
  }

  center(i, j) { return { x: this.b.minX + (i + .5) * this.cell, z: this.b.minZ + (j + .5) * this.cell }; }
  index(x, z) {
    const i = Math.floor((x - this.b.minX) / this.cell), j = Math.floor((z - this.b.minZ) / this.cell);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i;
  }
  walkable(x, z) { const k = this.index(x, z); return k >= 0 && this.walk[k] === 1; }
  isReachable(x, z) { const k = this.index(x, z); return k >= 0 && this.reach[k] === 1; }

  /** Célula andável mais próxima de (x,z), ou -1. */
  nearest(x, z) {
    const k = this.index(x, z); if (k >= 0 && this.walk[k]) return k;
    const ci = Math.floor((x - this.b.minX) / this.cell), cj = Math.floor((z - this.b.minZ) / this.cell);
    for (let r = 1; r <= 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj;
      if (i >= 0 && j >= 0 && i < this.nx && j < this.nz && this.walk[j * this.nx + i]) return j * this.nx + i;
    }
    return -1;
  }

  _flood(seed) {
    const s = this.nearest(seed.x, seed.z); if (s < 0) return;
    const q = [s]; this.reach[s] = 1;
    for (let h = 0; h < q.length; h++) {
      const k = q[h], i = k % this.nx, j = (k / this.nx) | 0;
      for (const [di, dj] of DIRS) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= this.nx || b >= this.nz) continue;
        const n = b * this.nx + a;
        if (!this.walk[n] || this.reach[n] || (di && dj && !(this.walk[j * this.nx + a] && this.walk[b * this.nx + i]))) continue;
        this.reach[n] = 1; q.push(n);
      }
    }
  }

  randomPoint(rng = Math.random) {
    for (let t = 0; t < 200; t++) {
      const k = (rng() * this.walk.length) | 0;
      if (this.reach[k]) return this.center(k % this.nx, (k / this.nx) | 0);
    }
    return null;
  }

  /** Caminho A* de a para b ({x,z}). Retorna [{x,z}...] suavizado, ou null se inalcançável. */
  findPath(a, b) {
    const s = this.nearest(a.x, a.z), g = this.nearest(b.x, b.z);
    if (s < 0 || g < 0 || !this.reach[s] || !this.reach[g]) return null;
    const n = this.walk.length, nx = this.nx, G = new Float32Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const gi = g % nx, gj = (g / nx) | 0;
    const hf = k => { const dx = Math.abs((k % nx) - gi), dz = Math.abs(((k / nx) | 0) - gj); return Math.max(dx, dz) + .4142 * Math.min(dx, dz); };
    const heap = []; // [f, índice]
    const push = e => { heap.push(e); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let c = 0; for (;;) { let m = c; const l = 2 * c + 1, r = l + 1;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } }
      return top;
    };
    G[s] = 0; push([hf(s), s]);
    while (heap.length) {
      const k = pop()[1]; if (done[k]) continue; done[k] = 1; if (k === g) break;
      const i = k % nx, j = (k / nx) | 0;
      for (const [di, dj, cost] of DIRS) {
        const a2 = i + di, b2 = j + dj; if (a2 < 0 || b2 < 0 || a2 >= nx || b2 >= this.nz) continue;
        const m = b2 * nx + a2;
        if (!this.walk[m] || done[m] || (di && dj && !(this.walk[j * nx + a2] && this.walk[b2 * nx + i]))) continue;
        const ng = G[k] + cost; if (ng < G[m]) { G[m] = ng; prev[m] = k; push([ng + hf(m), m]); }
      }
    }
    if (prev[g] < 0 && g !== s) return null;
    const pts = []; for (let k = g; k >= 0; k = prev[k]) pts.push(this.center(k % nx, (k / nx) | 0));
    pts.reverse(); if (g === this.index(b.x, b.z)) pts[pts.length - 1] = { x: b.x, z: b.z };
    return this._smooth(pts);
  }

  _clear(p, q) {
    const L = Math.hypot(q.x - p.x, q.z - p.z), n = Math.ceil(L / .4);
    for (let t = 1; t < n; t++) if (!this.walkable(p.x + (q.x - p.x) * t / n, p.z + (q.z - p.z) * t / n)) return false;
    return true;
  }
  _smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]]; let i = 0;
    while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !this._clear(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
    return out;
  }
}
