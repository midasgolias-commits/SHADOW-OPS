import * as THREE from 'three';
import { PM } from '../utils/ProceduralMaterials.js';

/** Constrói colisão (e, para caixas com material, malhas) a partir do MapData. O visual do warehouse vem do GLB (Game._addMapModel). */
export class MapBuilder {
  constructor(scene) { this.scene = scene; this.group = new THREE.Group(); scene.add(this.group); }

  build(map, world) {
    for (const b of map.boxes) {
      if (!b.mat) { world.addBox(b.min, b.max, b.tag); continue; }   // mapa vindo de GLB: caixa só de colisão (o visual é o modelo)
      const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
      const geo = new THREE.BoxGeometry(w, h, d);
      PM.scaleBoxUV(geo, w, h, d, b.mat === 'asphalt' ? 4 : 2);
      const m = new THREE.Mesh(geo, PM.get(b.mat));
      m.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      m.castShadow = b.kind !== 'floor'; m.receiveShadow = true;
      this.group.add(m);
      world.addBox(b.min, b.max, b.tag);
    }
    for (const s of map.sites) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d), PM.siteMark(s.id));
      m.rotation.x = -Math.PI / 2; m.position.set(s.x, .02, s.z); this.group.add(m);
    }
    for (const l of map.labels) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), PM.label(l.text));
      m.position.set(l.x, l.y, l.z); m.rotation.y = l.rotY; this.group.add(m);
    }
  }
}
