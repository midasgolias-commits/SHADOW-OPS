/** Minimapa 2D visto de cima. A camada do mapa é desenhada uma vez; por quadro só o jogador. */
export class Minimap {
  constructor(canvas, map) {
    this.g = canvas.getContext('2d'); this.w = canvas.width; this.h = canvas.height; this.map = map;
    const b = map.bounds, mw = b.maxX - b.minX, mh = b.maxZ - b.minZ;
    this.s = Math.min(this.w / mw, this.h / mh);
    this.ox = (this.w - mw * this.s) / 2; this.oz = (this.h - mh * this.s) / 2;
    this.base = this._bake();
  }

  X(x) { return this.ox + (x - this.map.bounds.minX) * this.s; }
  Z(z) { return this.oz + (z - this.map.bounds.minZ) * this.s; }

  _bake() {
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    const g = c.getContext('2d'), b = this.map.bounds, rect = (x0, z0, x1, z1) => g.fillRect(this.X(x0), this.Z(z0), (x1 - x0) * this.s, (z1 - z0) * this.s);
    g.fillStyle = '#10171b'; g.fillRect(0, 0, this.w, this.h);
    g.fillStyle = '#1c272d'; rect(b.minX, b.minZ, b.maxX, b.maxZ);
    for (const z of this.map.zones) { g.fillStyle = z.team === 'att' ? 'rgba(217,72,43,.28)' : 'rgba(61,139,217,.28)'; rect(z.x0, z.z0, z.x1, z.z1); }
    for (const s of this.map.sites) {
      g.fillStyle = 'rgba(201,180,88,.2)'; rect(s.x - s.w / 2, s.z - s.d / 2, s.x + s.w / 2, s.z + s.d / 2);
      g.fillStyle = 'rgba(201,180,88,.85)'; g.font = `bold ${Math.round(this.s * 9)}px "Bahnschrift",sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.id, this.X(s.x), this.Z(s.z));
    }
    for (const bx of this.map.boxes) {
      if (bx.kind === 'floor' || bx.min.y > 1.6 || bx.max.y < .5) continue;   // só o que bloqueia na altura do corpo
      const tall = bx.max.y >= 1.4;
      g.fillStyle = tall ? '#7d878d' : '#a39366'; rect(bx.min.x, bx.min.z, bx.max.x, bx.max.z);
    }
    return c;
  }

  /** p = {x, z, yaw} ou null (só o mapa, usado na prévia da sala). */
  draw(p) {
    const g = this.g; g.drawImage(this.base, 0, 0);
    if (!p) return;
    g.save(); g.translate(this.X(p.x), this.Z(p.z)); g.rotate(-p.yaw);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2.5); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
