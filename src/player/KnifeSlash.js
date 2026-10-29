import * as THREE from 'three';

/**
 * Golpe das facas na 1ª pessoa (vale para TODAS as facas, atuais e futuras — qualquer arma com melee: true).
 *
 * Parte exatamente da pose parada salva no Lab (cena "andando", quadro inicial) e volta para ela, sem trocar de animação
 * (por isso não tem corte seco). O movimento é de um braço de verdade, sem "borracha":
 *  - o OMBRO gira e leva o braço inteiro num arco (direita/cima → esquerda/baixo), mão e faca vão juntas, sem torcer o punho;
 *  - o COTOVELO estica um pouco no corte e dobra de volta (dobra na própria dobradiça do cotovelo);
 *  - o braço ESQUERDO recua para trás e para baixo, saindo da tela, e volta no fim.
 * Mesmo tempo da lâmina que dá o dano (WeaponSystem MELEE: dano entre 0,07 s e 0,23 s de 0,5 s).
 *
 * keys: [tempo 0..1, { yaw: ombro para a esquerda (graus), pitch: ombro para baixo (graus; negativo = para cima), ext: cotovelo esticando (graus) }]
 */
export const KNIFE_SLASH = {
  dur: .5,
  keys: [
    [0, { yaw: 0, pitch: 0, ext: 0 }],
    [.16, { yaw: -10, pitch: -10, ext: -10 }],   // prepara: sobe um pouco para a direita
    [.32, { yaw: 28, pitch: -24, ext: 6 }],      // corte: atravessa a frente da tela por cima
    [.46, { yaw: 50, pitch: -32, ext: 12 }],     // termina à esquerda, a lâmina ainda na tela
    [.74, { yaw: 14, pitch: -8, ext: 3 }],       // voltando
    [1, { yaw: 0, pitch: 0, ext: 0 }]
  ],
  left: { back: 42, down: 38, out: 6, in: [.02, .16], outT: [.6, .98] }   // braço esquerdo: cm para trás/baixo/fora; quando sai e quando volta
};

const ss = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Valores do golpe no instante p (0..1): curva suave que passa pelas chaves (sem paradas no meio do corte). */
export function slashAt(p) {
  const K = KNIFE_SLASH.keys; p = THREE.MathUtils.clamp(p, 0, 1);
  let i = 0; while (i < K.length - 2 && p > K[i + 1][0]) i++;
  const P = j => K[Math.max(0, Math.min(K.length - 1, j))];
  const [t0, a] = P(i), [t1, b] = P(i + 1), u = (p - t0) / (t1 - t0 || 1);
  const out = {};
  for (const k of ['yaw', 'pitch', 'ext']) {
    // Hermite com tangentes de Catmull-Rom (ajustadas ao tempo): continua suave de uma chave para a outra
    const m = (j) => { const [ta, va] = P(j - 1), [tb, vb] = P(j + 1); if (j <= 0 || j >= K.length - 1) return 0; return (vb[k] - va[k]) / (tb - ta) * (t1 - t0); };
    const m0 = m(i), m1 = m(i + 1), u2 = u * u, u3 = u2 * u;
    out[k] = (2 * u3 - 3 * u2 + 1) * a[k] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * b[k] + (u3 - u2) * m1;
  }
  const L = KNIFE_SLASH.left; out.left = ss(L.in[0], L.in[1], p) * (1 - ss(L.outT[0], L.outT[1], p));   // 0..1: braço esquerdo recolhido
  return out;
}

/**
 * Valores do golpe com emenda: golpe novo começando antes do anterior acabar sai de ONDE O BRAÇO ESTÁ (from) e vai
 * se misturando ao golpe novo durante a preparação — nunca volta de uma vez para a pose parada.
 */
export function slashValues(p, from = null) {
  const v = slashAt(p); if (!from) return v;
  const k = ss(0, .2, p);
  for (const key of ['yaw', 'pitch', 'ext', 'left']) v[key] = from[key] + (v[key] - from[key]) * k;
  if (from.left > v.left) v.left = Math.max(v.left, from.left * (1 - ss(.5, .98, p)));   // braço esquerdo continua fora até o fim
  return v;
}

/** Mão esquerda livre durante o golpe: o alvo recua para trás e para baixo (sai da tela). F = ajuste salvo no Lab. */
export function leftDuringSlash(F, p, from = null) {
  if (!F || p == null) return F;
  const k = slashValues(p, from).left, L = KNIFE_SLASH.left; if (k <= 0) return F;
  return { ...F, f: (F.f ?? 35) - L.back * k, h: (F.h ?? 135) - L.down * k, s: (F.s || 0) + L.out * k };
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(),
  _up = new THREE.Vector3(), _side = new THREE.Vector3(), _ax = new THREE.Vector3();
const D2R = Math.PI / 180;
/** gira o osso em volta de um eixo do mundo, mantendo os filhos presos a ele */
function turn(bone, axis, ang) {
  if (!bone || !ang) return;
  bone.updateWorldMatrix(true, false); bone.getWorldQuaternion(_q2); _q.setFromAxisAngle(axis, ang).multiply(_q2);
  bone.parent.getWorldQuaternion(_p); bone.quaternion.copy(_p.invert().multiply(_q)); bone.updateMatrixWorld(true);
}
/** ossos do braço direito do personagem (guardados nele) */
function armBones(char) {
  if (char.userData._slashB) return char.userData._slashB;
  const B = {}; char.traverse(n => { if (!n.isBone) return; if (/RightArm$/.test(n.name)) B.arm = n; else if (/RightForeArm$/.test(n.name)) B.fore = n; else if (/RightHand$/.test(n.name)) B.hand = n; });
  return (char.userData._slashB = B);
}

/**
 * Aplica o golpe nos ossos do braço direito, por cima da pose parada (chamar depois do mixer.update e antes de pôr a arma na mão).
 * char = personagem (o corpo; os eixos são os dele, então é igual no jogo e no Lab). p = 0..1.
 */
export function applyKnifeSlash(char, p, from = null) {
  if (p == null) return;
  const B = armBones(char); if (!B.arm || !B.fore || !B.hand) return;
  const v = slashValues(p, from);
  char.updateMatrixWorld(true);
  char.getWorldQuaternion(_q2);
  _up.set(0, 1, 0);                              // giro para a esquerda/direita: em volta do vertical
  _side.set(1, 0, 0).applyQuaternion(_q2);       // Mixamo: +x = lado esquerdo do personagem → girar em volta dele (+) leva o braço para baixo
  // ombro: o braço inteiro (com antebraço, mão e faca) faz o arco
  turn(B.arm, _up, v.yaw * D2R);
  turn(B.arm, _side, v.pitch * D2R);
  // cotovelo: estica/dobra na dobradiça dele (eixo perpendicular ao braço e ao antebraço)
  B.arm.getWorldPosition(_a); B.fore.getWorldPosition(_b); B.hand.getWorldPosition(_c);
  _ax.crossVectors(_b.clone().sub(_a), _c.clone().sub(_b));
  if (_ax.lengthSq() > 1e-10) { _ax.normalize(); turn(B.fore, _ax, -v.ext * D2R); }
  char.updateMatrixWorld(true);
}
