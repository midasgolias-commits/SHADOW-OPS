import * as THREE from 'three';

const TAGS = {
  concrete: { spark: 0xb9b2a4, decal: 0x15130f, n: 6, speed: [1.2, 3], life: [.25, .5] },
  wood:     { spark: 0x9a6b3a, decal: 0x120c06, n: 5, speed: [1.2, 3], life: [.25, .5] },
  metal:    { spark: 0xffb347, decal: 0x0a0a0a, n: 9, speed: [2, 5.5], life: [.15, .35] },
  flesh:    { spark: 0xb01e1e, decal: 0x300606, n: 6, speed: [1, 3], life: [.2, .4] }
};
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

/** Efeitos de tiro: faíscas, marcas de bala e rastros. Tudo em pool (sem alocar por tiro). */
export class Effects {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.geos = []; this.mats = [];
    const own = (o, list) => { list.push(o); return o; };

    this.sparkGeo = own(new THREE.BoxGeometry(.025, .025, .025), this.geos);
    this.sparkMats = {};
    for (const [k, v] of Object.entries(TAGS)) this.sparkMats[k] = own(new THREE.MeshBasicMaterial({ color: v.spark }), this.mats);
    this.sparks = Array.from({ length: 48 }, () => {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMats.concrete); m.visible = false;
      m.userData = { v: new THREE.Vector3(), life: 0, max: 1 }; this.group.add(m); return m;
    });
    this.si = 0;

    this.decalGeo = own(new THREE.CircleGeometry(.045, 10), this.geos);
    this.decalMats = {};
    for (const [k, v] of Object.entries(TAGS)) this.decalMats[k] = own(new THREE.MeshBasicMaterial({
      color: v.decal, transparent: true, opacity: .7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    }), this.mats);
    this.decals = Array.from({ length: 64 }, () => { const m = new THREE.Mesh(this.decalGeo, this.decalMats.concrete); m.visible = false; this.group.add(m); return m; });
    this.di = 0;

    this.tracerGeo = own(new THREE.BoxGeometry(1, 1, 1), this.geos);
    // cada rastro tem o próprio material (para sumir aos poucos)
    this.tracers = Array.from({ length: 16 }, () => {
      const mat = own(new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: .8, depthWrite: false }), this.mats);
      const m = new THREE.Mesh(this.tracerGeo, mat); m.visible = false; m.userData = { life: 0, max: 1 }; this.group.add(m); return m;
    });
    this.ti = 0;
    this.dbg = null;   // linhas de depuração do tiro (só com ?debugShots=1)
  }

  /** p, n: {x,y,z}; tag: concrete|metal|wood|flesh; d: direção do tiro (usada se n for nulo). */
  impact(p, n, tag = 'concrete', d = null) {
    const T = TAGS[tag] || TAGS.concrete;
    const hasN = n && (n.x || n.y || n.z);
    _w.set(hasN ? n.x : -(d?.x ?? 0), hasN ? n.y : -(d?.y ?? 0), hasN ? n.z : -(d?.z ?? 1)).normalize();
    for (let i = 0; i < T.n; i++) {
      const s = this.sparks[this.si++ % this.sparks.length], u = s.userData;
      s.material = this.sparkMats[tag] || this.sparkMats.concrete;
      s.position.set(p.x, p.y, p.z).addScaledVector(_w, .02);
      const sp = T.speed[0] + Math.random() * (T.speed[1] - T.speed[0]);
      u.v.set((Math.random() - .5) * 1.6, (Math.random() - .5) * 1.6, (Math.random() - .5) * 1.6).addScaledVector(_w, 1.2).normalize().multiplyScalar(sp);
      u.max = u.life = T.life[0] + Math.random() * (T.life[1] - T.life[0]);
      s.scale.setScalar(1); s.visible = true;
    }
    if (tag === 'flesh' || !hasN) return;
    const m = this.decals[this.di++ % this.decals.length];
    m.material = this.decalMats[tag] || this.decalMats.concrete;
    m.position.set(p.x, p.y, p.z).addScaledVector(_w, .008);
    m.lookAt(_v.set(p.x, p.y, p.z).add(_w));
    m.rotateZ(Math.random() * 6.28); m.visible = true;
  }

  /** Rastro de a (cano) até b (onde o tiro parou). Só visual. life em segundos, w = espessura (m). */
  tracer(a, b, life = .07, w = .012) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); if (len < .3) return;
    t.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    t.lookAt(b.x, b.y, b.z); t.scale.set(w, w, len);
    t.userData.life = t.userData.max = life; t.material.opacity = .8; t.visible = true;
  }

  /**
   * Depuração do tiro (desligada no jogo normal): amarelo = raio da câmera até o ponto mirado; azul = cano;
   * vermelho = caminho final; rosa = obstáculo que parou o tiro antes do ponto mirado. Fica 3 s na tela.
   */
  debugShot(camO, aimP, muzzle, finO, finEnd, block) {
    if (!this.dbg) {
      const mk = c => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); this.geos.push(g);
        const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: c, depthTest: false })); this.mats.push(l.material);
        l.renderOrder = 50; l.frustumCulled = false; this.group.add(l); return l; };
      const dot = c => { const m = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), new THREE.MeshBasicMaterial({ color: c, depthTest: false })); this.geos.push(m.geometry); this.mats.push(m.material); m.renderOrder = 51; this.group.add(m); return m; };
      this.dbg = { aim: mk(0xffe000), fin: mk(0xff2020), muz: dot(0x30a0ff), blk: dot(0xff40ff), life: 0 };
    }
    const D = this.dbg, set = (l, a, b) => { const p = l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; l.visible = true; };
    set(D.aim, camO, aimP); set(D.fin, finO, finEnd);
    D.muz.visible = !!muzzle; if (muzzle) D.muz.position.set(muzzle.x, muzzle.y, muzzle.z);
    D.blk.visible = !!block; if (block) D.blk.position.set(block.x, block.y, block.z);
    D.life = 3;
  }

  update(dt) {
    for (const s of this.sparks) {
      if (!s.visible) continue;
      const u = s.userData; u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      u.v.y -= 9 * dt; s.position.addScaledVector(u.v, dt); s.scale.setScalar(Math.max(.1, u.life / u.max));
    }
    for (const t of this.tracers) {
      if (!t.visible) continue;
      const u = t.userData; u.life -= dt; if (u.life <= 0) t.visible = false; else t.material.opacity = .8 * Math.min(1, u.life / u.max * 1.6);
    }
    if (this.dbg && this.dbg.life > 0 && (this.dbg.life -= dt) <= 0) for (const k of ['aim', 'fin', 'muz', 'blk']) this.dbg[k].visible = false;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
