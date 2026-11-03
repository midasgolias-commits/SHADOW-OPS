import * as THREE from 'three';
import { twoBoneIK, elbowToward } from '../weapons/WeaponModels.js';

/**
 * RETARGET POR IK (engenharia reversa da animação do pacote → braços da Izzy).
 *
 * O pacote tem outro esqueleto (Blender: r_upperarm, r_wrist, r_index_low…) com outras medidas e eixos de osso.
 * Copiar rotações de osso não funciona entre esqueletos assim. O que se copia é o RESULTADO, como num estúdio:
 *  1. a MÃO: onde fica a palma e para onde ela aponta. O "quadro da mão" é medido pelos próprios dedos
 *     (punho→base do dedo médio = comprimento; anelar→indicador = largura — a Izzy não tem osso de mindinho), então vale para os dois esqueletos;
 *  2. o BRAÇO: IK de dois ossos (ombro→cotovelo→punho) leva o punho da Izzy até lá, e o cotovelo aponta
 *     para o mesmo lado do cotovelo do pacote;
 *  3. os DEDOS: cada falange da Izzy aponta na mesma direção da falange do pacote (a mão já está no mesmo quadro).
 * A arma não é tocada: ela continua sendo animada pelo pacote (ferrolho, carregador, bala), e as mãos da Izzy seguem.
 */
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3(),
  _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3();

/** quadro da mão (quaternion no mundo) a partir de punho, base do médio, base do indicador e base do mindinho */
export function handFrame(W, M, I, K, out) {
  _y.subVectors(M, W).normalize();
  _x.subVectors(I, K); _x.addScaledVector(_y, -_x.dot(_y)).normalize();
  _z.crossVectors(_x, _y).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

export class ArmRetarget {
  /** izzy: personagem (Mixamo). pack: rig do pacote. side: 'r' | 'l'. */
  constructor(izzy, pack, side) {
    const S = side === 'r' ? 'Right' : 'Left', bz = {}, bp = n => { const o = pack.getObjectByName(`${side}_${n}`); if (o) o.userData.rtKey = `${side}_${n}`; return o; };
    this.over = null;   // Map nome → posição no mundo: alvos que substituem os ossos do pacote (ex.: mão no carregador)
    izzy.traverse(n => { if (n.isBone) bz[n.name.replace(/^mixamorig\d*:?/, '')] = n; });
    this.arm = bz[S + 'Arm']; this.fore = bz[S + 'ForeArm']; this.hand = bz[S + 'Hand'];
    this.zf = FINGERS.map(f => [1, 2, 3, 4].map(i => bz[`${S}Hand${f}${i}`]));
    this.p = { sh: bp('upperarm'), el: bp('forearm'), wr: bp('wrist') };
    this.pf = FINGERS.map(f => ['low', 'mid', 'tip', 'tip_end'].map(k => bp(`${f.toLowerCase()}_${k}`)));
    this.ok = !!(this.arm && this.fore && this.hand && this.p.wr && this.p.el && this.zf[0][0] && this.zf[1][0] && this.zf[2][0] && this.pf[2][0]);
    this.local = null;   // quadro dos dedos da Izzy no espaço da mão (medido uma vez) e a palma
  }
  /** mede uma vez: quadro da mão da Izzy e ponto da palma, no espaço do osso da mão */
  _measure() {
    const h = this.hand, z = this.zf; h.updateWorldMatrix(true, true);
    const W = h.getWorldPosition(new THREE.Vector3()), M = z[1][0].getWorldPosition(new THREE.Vector3());
    const F = handFrame(W, M, z[0][0].getWorldPosition(new THREE.Vector3()), z[2][0].getWorldPosition(new THREE.Vector3()), new THREE.Quaternion());
    const Hq = h.getWorldQuaternion(new THREE.Quaternion()), His = Hq.clone().invert();
    const sc = h.getWorldScale(new THREE.Vector3()).x;
    this.local = { frame: His.clone().multiply(F), palm: W.clone().lerp(M, .5).sub(W).applyQuaternion(His).divideScalar(sc) };
  }
  /** quadro da palma (matriz no mundo, sem escala): do pacote (pack = true) ou da Izzy */
  palmMatrix(pack, out) {
    const pf = this.pf, z = this.zf;
    const W = pack ? this._pw(this.p.wr, new THREE.Vector3()) : this.hand.getWorldPosition(new THREE.Vector3());
    const M = pack ? this._pw(pf[1][0], new THREE.Vector3()) : z[1][0].getWorldPosition(new THREE.Vector3());
    const I = pack ? this._pw(pf[0][0], new THREE.Vector3()) : z[0][0].getWorldPosition(new THREE.Vector3());
    const K = pack ? this._pw(pf[2][0], new THREE.Vector3()) : z[2][0].getWorldPosition(new THREE.Vector3());
    const q = handFrame(W, M, I, K, new THREE.Quaternion());
    return out.compose(W.lerp(M, .5), q, new THREE.Vector3(1, 1, 1));
  }
  /** tamanho da mão (punho → base do dedo médio) */
  handLen(pack) { return pack ? this._pw(this.p.wr, new THREE.Vector3()).distanceTo(this._pw(this.pf[1][0], new THREE.Vector3())) : this.hand.getWorldPosition(new THREE.Vector3()).distanceTo(this.zf[1][0].getWorldPosition(new THREE.Vector3())); }
  /** posição de um osso do pacote (ou do alvo que o substitui) */
  _pw(o, out) { const v = this.over?.get(o.userData.rtKey); return v ? out.copy(v) : o.getWorldPosition(out); }
  /** aplica a pose do pacote (os dois esqueletos já no mesmo mundo, em metros). k: 0..1 quanto aplicar. */
  apply(k = 1) {
    if (!this.ok || k <= 0) return;
    if (!this.local) this._measure();
    const P = this.p, pf = this.pf;
    const W = this._pw(P.wr, _a), M = this._pw(pf[1][0], _b);
    const Fp = handFrame(W, M, this._pw(pf[0][0], _c), this._pw(pf[2][0], _t), _qp);
    const Qh = _qh.copy(Fp).multiply(_q.copy(this.local.frame).invert());   // giro da mão da Izzy no mundo
    const palmP = _p.copy(W).lerp(M, .5);                                   // palma do pacote = palma da Izzy
    const sc = this.hand.getWorldScale(_d1).x;
    const target = palmP.clone().sub(_d2.copy(this.local.palm).multiplyScalar(sc).applyQuaternion(Qh));
    // ombro no lugar certo: na mesma linha punho→ombro do pacote, na distância do braço da Izzy (o braço de cima não aparece na 1ª pessoa)
    if (this.moveShoulder) {
      const S = this.shoulderTarget(), par = this.arm.parent; par.updateWorldMatrix(true, false);
      this.arm.position.copy(par.worldToLocal(S.clone())); this.arm.updateWorldMatrix(false, true);
    }
    // braço: IK até o punho e cotovelo para o mesmo lado do cotovelo do pacote
    const a = this.arm.getWorldPosition(new THREE.Vector3()), b = this.fore.getWorldPosition(new THREE.Vector3()), c = this.hand.getWorldPosition(new THREE.Vector3());
    if (k < 1) target.lerp(c, 1 - k);
    twoBoneIK(this.arm, this.fore, a, b, c, target);
    const sh = this._pw(P.sh, new THREE.Vector3()), el = this._pw(P.el, new THREE.Vector3());
    const pole = el.sub(sh.lerp(W, .5));
    if (pole.lengthSq() > 1e-8) elbowToward(this.arm, this.fore, this.hand, pole, k);
    // mão: giro absoluto no mundo → local
    this.fore.updateWorldMatrix(true, false); this.fore.getWorldQuaternion(_qw);
    const want = _q.copy(_qw).invert().multiply(Qh);
    this.hand.quaternion.slerp(want, k); this.hand.updateWorldMatrix(false, true);
    // dedos: cada falange aponta como a do pacote
    for (let f = 0; f < FINGERS.length; f++) {
      const zb = this.zf[f], pb = pf[f]; if (!zb[0] || !pb[0]) continue;
      for (let j = 0; j < 3; j++) {
        const b0 = zb[j], b1 = zb[j + 1], p0 = pb[j], p1 = pb[j + 1]; if (!b0 || !b1 || !p0 || !p1) break;
        const cur = b1.getWorldPosition(_d1).sub(b0.getWorldPosition(_t)).normalize();
        const tgt = this._pw(p1, _d2).sub(this._pw(p0, _c)).normalize();
        _q.setFromUnitVectors(cur, tgt.lerp(cur, 1 - k).normalize());
        b0.parent.getWorldQuaternion(_qp); b0.getWorldQuaternion(_qw);
        b0.quaternion.copy(_qp.invert().multiply(_q.multiply(_qw))); b0.updateWorldMatrix(false, true);
      }
    }
  }
  /** distância que falta (m) entre o punho da Izzy e o alvo — para conferir se o braço alcança */
  shoulder() { return this.arm.getWorldPosition(new THREE.Vector3()); }
  /** onde o ombro da Izzy precisa estar para a mão chegar no punho do pacote com o braço na mesma direção
   *  (mesma linha punho→ombro do pacote, encurtada para o tamanho do braço da Izzy, que é menor) */
  shoulderTarget(reach = .97) {
    const W = this._pw(this.p.wr, new THREE.Vector3()), S = this._pw(this.p.sh, new THREE.Vector3()), E = this._pw(this.p.el, new THREE.Vector3());
    const lp = S.distanceTo(E) + E.distanceTo(W);
    const a = this.arm.getWorldPosition(_a), b = this.fore.getWorldPosition(_b), c = this.hand.getWorldPosition(_c), lz = a.distanceTo(b) + b.distanceTo(c);
    return W.clone().add(S.sub(W).normalize().multiplyScalar(Math.min(lz * reach, lp)));
  }
  packShoulder() { return this.p.sh.getWorldPosition(new THREE.Vector3()); }
}
