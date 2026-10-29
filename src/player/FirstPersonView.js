import * as THREE from 'three';
import { upperOnly, OVER, forceMixerWrite } from './CharacterAnimator.js';
import { CharacterAnimator } from './CharacterAnimator.js';
import { ArmsOnly } from './ArmsOnly.js';
import { HeldWeapon, WEAPON_MODELS, fpUsesIK, ensureWeaponEnv } from '../weapons/WeaponModels.js';
import { SCENES, fpSceneOf, fpFor, gripFor, vmFor } from '../weapons/Grips.js';
import { PistolViewmodel } from './PistolViewmodel.js';
import { WEAPONS } from '../weapons/Weapons.js';
import { KNIFE_SLASH, applyKnifeSlash, leftDuringSlash, slashValues } from './KnifeSlash.js';

/**
 * 1ª pessoa dentro da partida (tecla V): braços e arma desenhados POR CIMA do mapa, com a câmera do viewmodel
 * ajustada no Lab de Armas (aba "1ª pessoa"). É uma cópia do que o Lab mostra na janela "1ª pessoa (como no jogo)":
 * mesmo personagem, mesmas 4 cenas (andando, correndo, atirando, recarregando), mesma pegada salva e mesma câmera.
 *
 * Fica numa cena só dela (vmScene). O jogo desenha o mapa com a câmera de mira (sempre reta) e depois chama render().
 */
const FP_POLE = new THREE.Vector3(0, -1, .35).normalize();   // cotovelo esquerdo para baixo (igual ao Lab)
const PIS = { idle: 'pistol_idle', walk_f: 'pistol_walk_f', run_f: 'pistol_run_f' };
const _d = new THREE.Vector3(), _e = new THREE.Euler(), _w = new THREE.Vector3(), _aq = new THREE.Quaternion(), _ap = new THREE.Vector3(), _av = new THREE.Vector3(), FLIP = new THREE.Quaternion(0, 1, 0, 0);

// troca de arma: ossos usados e quanto cada um gira (graus) com a arma toda guardada
const HB = { rArm: /RightArm$/, rFore: /RightForeArm$/, rHand: /RightHand$/, lArm: /LeftArm$/ };
const FADE = .15;   // s: mistura entre cenas (parado/recarga/golpe)
/**
 * Armas que, na 1ª pessoa, recarregam com a ANIMAÇÃO de recarga (a mesma da cena "1ª pessoa · recarregando" do Lab).
 * As outras usam a recarga simples (a arma abaixa e tomba na pose normal). Para passar outra arma para a animação, inclua o id aqui.
 */
/** Recarga animada: a partir desta parte da recarga (0..1) a mão esquerda já vai para a pegada salva (AUG: empunhadura), em vez de terminar na frente da arma. */
export const RELOAD_GRIP_AT = .72;
export const FP_RELOAD_ANIM = { has: id => !!WEAPONS[id] && !WEAPONS[id].melee };   // TODAS as armas de fogo recarregam com a animação de recarga (como era antes / como no Lab)
export const SLASH = { dur: .5, keys: [   // golpe da faca: [tempo 0..1, giro (graus, + = inclina p/ direita), inclinação (graus), frente/lado/altura (m) da mão]
  [0, { roll: 0, pitch: 0, fwd: 0, side: 0, up: 0 }], [.14, { roll: 15, pitch: 6, fwd: -.02, side: .04, up: .03 }], [.3, { roll: -20, pitch: -6, fwd: .08, side: -.12, up: -.02 }],
  [.46, { roll: -35, pitch: -10, fwd: .03, side: -.22, up: -.06 }], [1, { roll: 0, pitch: 0, fwd: 0, side: 0, up: 0 }]] };
export const BOB_KNIFE = { fwd: .018, up: .004, freq: 1.5 };   // faca andando/correndo: balanço um pouco maior e mais rápido
export const RELOAD = { pitch: -10, roll: 22, down: .03, at: .45, len: .2, bumpPitch: 4, bumpUp: .015 };   // recarga 1ª pessoa (graus / m; at/len = parte da recarga com o tranco)
export const BOB = { fwd: .012, up: .003, freq: .9 };   // andando: balanço para frente/trás (m), subida a cada passo (m), ciclos por segundo andando normal
/**
 * Troca de arma (TODAS, troca rápida estilo Point Blank): a pose salva no Lab só desce para fora da tela e a nova sobe de volta,
 * sem girar até o ombro (antes o antebraço passava na frente da câmera). m / graus.
 */
export const KNIFE_SWAP = { down: .8, back: .05, pitch: 14 };
export const SWING = { pitch: 35, roll: -25, up: .28, right: .14, back: .06 };   // troca de arma: quanto o conjunto gira para cima/trás (graus) e recua (m)
const _pv = new THREE.Vector3();
export const DRAW = { up: .3, right: .08, fwd: -.02, pitch: 40, roll: -20 };   // sacar: de onde a arma começa a cair (m / graus, na visão da câmera)
export const HOLSTER = { armUp: 55, armOut: -12, foreFold: 40, handTurn: 0, handRoll: 0, leftDown: -45 };
const _ax = new THREE.Vector3(), _fw = new THREE.Vector3(), _up = new THREE.Vector3(), _bq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _pq = new THREE.Quaternion();

export class FirstPersonView {
  constructor(assets, skin) {
    this.kind = skin; this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xe4ecf4, 0x463c32, 1.35));
    const key = new THREE.DirectionalLight(0xfff0dc, 1.9); key.position.set(1.5, 3, 1); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb8d8, .6); fill.position.set(-2, 1, -2); this.scene.add(fill);
    const { obj, clips } = assets.instance(skin);
    obj.scale.setScalar(.01); obj.rotation.y = Math.PI;   // de costas para a câmera (olhando para -z), como no Lab
    obj.traverse(n => { if (n.isMesh) { n.castShadow = n.receiveShadow = false; n.frustumCulled = false; } });
    this.scene.add(obj); this.obj = obj; this.clips = clips;
    this.arms = new ArmsOnly(obj); this.arms.on();   // só braços e mãos
    this.held = new HeldWeapon(obj, assets.weapons, skin, { flashLight: true }); this.held.attachTo(this.scene);
    // pegada e ponto dos olhos medidos na pose de mira (igual ao Lab)
    this.eye = new THREE.Vector3(0, 1.62, -.05); let head = null; obj.traverse(n => { if (n.isBone && /Head$/.test(n.name)) head = n; });
    const ca = new CharacterAnimator(obj, clips);
    ca.withPose('fire', () => { this.held.calibrate(); if (head) { head.getWorldPosition(this.eye); this.eye.y += .07; this.eye.z -= .09; } }); ca.dispose();
    this.mixer = new THREE.AnimationMixer(obj); this.overCache = {}; this.key = ''; this.base = this.over = null;
    this.yaw = 0; this.wid = null; this.fireT = 0;
    this.cam = new THREE.PerspectiveCamera(60, 16 / 9, .01, 20);
    this.vm = null; this.vmOn = false;   // viewmodel novo (braços + arma do pacote) para a pistola: setPistolVM()
  }
  /** Liga o viewmodel novo da pistola (rig do Assets.loadPistolVM). Com ele ligado no Lab (vm.pistol.on), a pistola usa ele. */
  setPistolVM(rig) { if (!rig || this.vm) return; this.vm = new PistolViewmodel(rig, 'pistol'); }
  /** Tecla F: inspecionar a arma (só no viewmodel novo, que tem o clipe). */
  inspect() { if (this.vmOn) this.vm.inspect(); }

  /** Toca as animações (mesma lógica do Lab): clipe do corpo + clipe de tronco por cima. */
  _play(clip, overName, hold, overScale = 1) {
    const pistol = this.wid === 'pistol', name = pistol && this.clips[PIS[clip]] ? PIS[clip] : clip;
    const key = name + '|' + (overName || '') + '|' + hold;
    if (key === this.key) { if (this.over && !hold) this.over.timeScale = overScale; return; }
    // troca de cena com MISTURA curta (antes trocava de uma vez: no começo e no fim da recarga a arma "pulava" num quadro)
    const F = this.base ? FADE : 0; this.key = key;
    const nb = this.clips[name] ? this.mixer.clipAction(this.clips[name]) : null;
    let no = null;
    if (overName && this.clips[overName]) { this.overCache[overName] ??= upperOnly(this.clips[overName]); no = this.mixer.clipAction(this.overCache[overName]); }
    const out = a => { if (!a) return; if (F) a.fadeOut(F); else a.stop(); };
    if (this.base && this.base !== nb) out(this.base);
    if (this.over && this.over !== no) out(this.over);
    if (this.still && this.still.getClip().userData.src !== nb?.getClip()) { out(this.still); this.stillOn = false; }
    if (nb && nb !== this.base) { nb.reset(); nb.setEffectiveWeight(1); nb.play(); if (F) nb.fadeIn(F); }
    if (no && (no !== this.over || this._restartOver)) {
      this._restartOver = false; no.reset(); no.setEffectiveWeight(OVER); no.play(); if (F) no.fadeIn(F);
      // clipe de tronco que toca (recarga, golpe) toca UMA vez e para no último quadro: nunca volta ao começo no fim
      if (hold) { no.time = no.getClip().duration * .999; no.timeScale = 0; } else { no.setLoop(THREE.LoopOnce, 1); no.clampWhenFinished = true; no.timeScale = overScale; }
    } else if (no && hold) { no.time = no.getClip().duration * .999; no.timeScale = 0; }
    this.base = nb; this.over = no;
  }

  /**
   * Faca fora do golpe (andando, correndo, agachado, pulando, parado): a cena "1ª pessoa · andando" do Lab.
   * Parado e no pulo = exatamente o quadro inicial dessa cena (como no Lab com a barra no começo) + respiração;
   * andando/correndo/agachado andando = a animação tocando (mais rápida correndo). A troca entre as duas é suave.
   */
  _knifeIdle(dt, moving) {
    if (this.over) { this.base?.setEffectiveWeight(1); this.walkK = 0; this.breathK = THREE.MathUtils.damp(this.breathK ?? 0, 0, 6, dt); return; }   // golpe: a animação do golpe manda
    this._stillBlend(dt, false);   // a cena da faca não toca mais: andando/correndo é o balanço
    this.breathK = THREE.MathUtils.damp(this.breathK ?? 0, moving ? 0 : 1, 3, dt);
  }
  /**
   * Mistura a pose INICIAL da cena (quadro 0, parada) com a cena tocando. play = tocar (faca andando, armas correndo);
   * senão fica exatamente o quadro inicial. A troca entre as duas é suave e a cena volta a tocar sempre do começo.
   */
  _stillBlend(dt, play) {
    const clip = this.base?.getClip(); if (!clip) return;
    if (!this.still || this.still.getClip().userData.src !== clip) {
      this.stillCache ??= {};
      if (!this.stillCache[clip.uuid]) { const c = clip.clone(); c.userData = { src: clip }; this.stillCache[clip.uuid] = this.mixer.clipAction(c); }
      this.still = this.stillCache[clip.uuid]; this.stillOn = false;
    }
    if (!this.stillOn) { this.still.reset().play(); this.still.time = 0; this.still.timeScale = 0; this.stillOn = true; }   // (_play para tudo ao trocar de clipe)
    this.walkK = THREE.MathUtils.damp(this.walkK ?? 0, play ? 1 : 0, 9, dt);
    if (!play && this.walkK < .02) this.base.time = 0;
    this.base.timeScale = play ? THREE.MathUtils.clamp(this.speedNow / 2.6, .6, 1.9) : this.walkK > .02 ? this.base.timeScale : 0;
    this.base.setEffectiveWeight(Math.max(.0001, this.walkK)); this.still.setEffectiveWeight(Math.max(.0001, 1 - this.walkK));
  }

  /** Um tiro: tranco + clarão (e segura a cena "atirando" um pouco). */
  shot(w, small = false) { if (this.vmOn) { this.vm.shot(); return; } this.fireT = .35; this.held.shotKick(small); this.held.muzzleFlash(!!w.auto, small); }
  /** Golpe de faca. */
  melee() { this.slashFrom = this.meleeT != null ? slashValues(Math.min(1, this.meleeT / KNIFE_SLASH.dur), this.slashFrom) : null; this.fireT = .5; this.meleeT = 0; }   // golpe: o braço direito corta a partir da pose parada (KnifeSlash), o esquerdo recua

  /**
   * s = { wid (arma na mão ou null na troca), speed (m/s), reloading, aiming, reloadTime, adsK (0..1: mira pela arma, botão direito) }
   */
  update(dt, s) {
    this.dt = dt; this.adsK = s.adsK || 0; this.speedNow = s.speed || 0;
    if (this.meleeT != null) { this.meleeT += dt; if (this.meleeT > KNIFE_SLASH.dur || !WEAPONS[s.wid]?.melee) { this.meleeT = null; this.slashFrom = null; } }
    // desfaz o giro da troca de arma do quadro anterior: com a animação parada o mixer NÃO regrava os ossos (só grava quando o valor muda)
    if (this._hsave) { for (const [b, q] of this._hsave) b.quaternion.copy(q); this._hsave = null; }
    if (s.wid !== this.wid) { this.wid = s.wid; this.held.set(s.wid); this.key = ''; if (!(s.switchK > 0)) this._yawSnap = true; }   // arma aparece sem troca (início/renascer): corpo já certo
    this.fireT = Math.max(0, this.fireT - dt);
    const knife = !!WEAPONS[this.wid]?.melee, moving = s.speed > .6;   // faca e karambit
    const sc = fpSceneOf({ reloading: s.reloading, firing: this.fireT > 0 || s.aiming, speed: s.speed });
    // mesmos clipes das cenas do Lab (o corpo fica no mesmo ângulo e a arma no mesmo lugar); parado = a mesma animação congelada
    if (knife) {
      this._play('knife_f', null, false);
      this._knifeIdle(dt, moving && !s.air);   // faca: sempre a pose inicial (andando e correndo = balanço, abaixo)
    } else if (sc === 'fp_reload' && FP_RELOAD_ANIM.has(this.wid) && this.clips.reload) {
      // recarga com a animação do Lab: toca uma vez no tempo da recarga da arma; entra e sai misturando (sem quadro pulado)
      this._play('walk_f', 'reload', false, this.clips.reload.duration / Math.max(.3, s.reloadTotal || s.reloadTime || 2));   // SPAS: dura a recarga inteira (todos os cartuchos)
    } else this._play('walk_f', 'fire', true);   // andando/correndo/parado/atirando/RECARREGANDO: braços na pose de mira
    // recarga na 1ª pessoa: a arma fica na pose normal e o conjunto só abaixa e tomba um pouco, com um tranco ao encaixar o pente
    // (a animação de recarga do corpo levantava a arma na vertical e passava o braço na frente da câmera)
    const animReload = sc === 'fp_reload' && FP_RELOAD_ANIM.has(this.wid);
    this.rlK = THREE.MathUtils.damp(this.rlK ?? 0, sc === 'fp_reload' && !knife && !animReload ? 1 : 0, 9, dt);
    const rp = animReload ? -1 : (s.reloadP ?? -1); this.rlBump = rp >= RELOAD.at && rp <= RELOAD.at + RELOAD.len ? Math.sin((rp - RELOAD.at) / RELOAD.len * Math.PI) : 0;
    // armas: parado e ANDANDO (qualquer direção, agachado também) = a pose inicial da cena + um balanço leve para frente e para trás;
    // CORRENDO (Shift) = a cena "andando" tocando, mais rápida (como antes)
    const run = moving && s.speed > 6.2 && !s.air, walking = moving && !run && !s.air; this.runNow = run;
    if (!knife) this._stillBlend(dt, run && sc !== 'fp_reload');
    // balanço para frente/trás: armas andando (correndo = a cena); faca andando E correndo, mais rápido
    const B = knife ? BOB_KNIFE : BOB, bobOn = knife ? moving && !s.air : walking && sc !== 'fp_reload';
    this.bob = B; this.bobK = THREE.MathUtils.damp(this.bobK ?? 0, bobOn ? 1 : 0, 6, dt);
    if (bobOn) this.bobT = (this.bobT || 0) + dt * Math.max(.5, s.speed / 5.2) * B.freq * Math.PI * 2;
    forceMixerWrite(this.mixer); this.mixer.update(dt);   // regrava a pose da animação (apaga o IK do quadro anterior)
    // o corpo gira até o cano apontar para a frente (a animação de tiro deixa o corpo de lado) — igual ao Lab
    if (s.switchK > 0 && !s.switchIn) { /* guardando: o corpo fica parado (só o conjunto todo se move); sacando, o corpo já se acerta para a arma nova enquanto ela ainda vem */ }
    else if (!knife && this.held.cur) {
      _d.set(0, 0, 1).applyQuaternion(this.held.baseQ); const ey = Math.atan2(-_d.x, -_d.z), err = ey - Math.round(ey / (Math.PI * 2)) * Math.PI * 2;
      this.yaw = THREE.MathUtils.clamp(this.yaw - THREE.MathUtils.clamp(err, -.6, .6) * .35, -1.3, 1.3);
      // início da partida / renascer: resolve o giro do corpo de uma vez (antes a arma "escorregava" nos primeiros quadros)
      if (this._yawSnap) { this._yawSnap = false; for (let i = 0; i < 24; i++) {
        this.obj.rotation.y = Math.PI + this.yaw; this.obj.updateMatrixWorld(true); this.held.snap = true; this.held.update(true, null, 0);
        _d.set(0, 0, 1).applyQuaternion(this.held.baseQ); const y2 = Math.atan2(-_d.x, -_d.z), e2 = y2 - Math.round(y2 / (Math.PI * 2)) * Math.PI * 2;
        if (Math.abs(e2) < .002) break; this.yaw = THREE.MathUtils.clamp(this.yaw - THREE.MathUtils.clamp(e2, -.6, .6) * .5, -1.3, 1.3); } }
    } else this.yaw *= .8;
    this.obj.rotation.y = Math.PI + this.yaw;
    // respiração (faca parada / no pulo): sobe e desce bem pouco, devagar
    const br = knife ? this.breathK || 0 : 0; this.breathT = (this.breathT || 0) + dt;
    this.obj.position.y = br * Math.sin(this.breathT * 1.9) * .0045; this.obj.rotation.x = br * Math.sin(this.breathT * 1.9 - .6) * .004;
    // andando: o conjunto vai levemente para frente e para trás (na direção da câmera) e sobe um tiquinho a cada passo
    const bk = this.bobK || 0, BB = this.bob || BOB, bf = bk * Math.sin(this.bobT || 0) * BB.fwd;
    this.obj.position.x = -Math.sin(this.yaw) * bf; this.obj.position.z = -Math.cos(this.yaw) * bf;
    this.obj.position.y += bk * Math.abs(Math.sin(this.bobT || 0)) * BB.up;
    this.obj.updateMatrixWorld(true);
    this.held.scene = knife ? 'fp_walk' : sc;
    // mira pela arma (VX-47, Vector): a MESMA animação da 3ª pessoa — a arma vai para a frente da câmera com a mira no centro
    // troca de arma: o CONJUNTO inteiro (braços + arma, sem deformar nada) vai para trás subindo até o ombro, e a nova volta pelo mesmo caminho
    this.swK = s.switchK || 0; const sk = this.swK; this.swE = sk * sk * (3 - 2 * sk);
    this._placeCam(); const k = this.adsK;
    const slashP = knife && this.meleeT != null ? this.meleeT / KNIFE_SLASH.dur : null;
    if (slashP != null) applyKnifeSlash(this.obj, slashP, this.slashFrom);   // golpe: ombro + cotovelo por cima da pose parada (a faca vai junto na mão)
    const away = (this.swE || 0) > .6;   // troca de arma: com o conjunto já fora da tela, esconde tudo (não sobra ombro/roupa na borda)
    this.held.update(!!this.wid && !away, k > 0 && !knife ? this._ads(k) : null, dt);
    this.obj.visible = k < .5 && !away;   // como na 3ª pessoa: mirando, só a arma aparece
    // trocando: só antebraço e mão (o braço de cima passava na frente da câmera) · faca: só a mão direita, o braço esquerdo aparece só correndo
    // faca/karambit: braço esquerdo só se a cena tiver "mão esquerda livre" (Lab); fica num ponto fixo do corpo, não segue a faca
    const lf = knife && k <= 0 ? leftDuringSlash(gripFor(this.kind, this.wid, 'fp_walk').lhFree || null, slashP, this.slashFrom) : null;   // golpe: recua e sai da tela
    this.knifeT = knife && this.swK <= 0 ? (this.knifeT || 0) + dt : 0;
    this.gunT = !knife && this.swK <= 0 && !animReload ? (this.gunT || 0) + dt : 0;   // tempo com a arma já parada na pose (sem troca)   // tempo com a faca já na pose (sem troca)
    if (lf) this.held.leftHandFree(lf, FP_POLE, this.knifeT > .4 && this.meleeT == null && (this.walkK ?? 0) < .05);
    this.arms.show({ upper: this.swK <= 0 && this.meleeT == null, left: !knife || !!(lf && lf.on !== false) });   // golpe: sem o braço de cima
    this.held.leftHandIK(!knife && !!this.wid && k <= 0 && fpUsesIK(this.kind, this.wid) && (!animReload || (s.reloadP ?? 0) > RELOAD_GRIP_AT) && !away, dt, FP_POLE, this.gunT > .35);   // fim da recarga: a mão já volta para a SUA pegada (nunca passa pela frente da arma)   // fora da tela na troca: a mão não segura a arma parada (a pegada da AUG saía torta)   // igual ao Lab (recarga animada: a mão esquerda segue a animação)
    // viewmodel novo da pistola: ele toca as animações do pacote; os braços antigos ficam escondidos (continuam prontos para as outras armas)
    const vmNow = !!this.vm && this.wid === 'pistol' && vmFor('pistol').on;
    if (this.vmOn && !vmNow) this.vm.cancel();
    this.vmOn = vmNow;
    if (vmNow) { this.vm.update(dt, s); this.obj.visible = false; this.held.holder.visible = false; }
  }

  /**
   * Troca de arma (vale para todas): k 0→1 guarda a arma — o braço direito leva a arma ao ombro, como se pusesse nas costas,
   * e o braço esquerdo solta e desce; k 1→0 é o mesmo caminho ao contrário, sacando a nova. Mexe só nos ossos dos braços,
   * por cima da cena parada/andando (a arma vai junto porque está presa na mão).
   */
  _holster(k) {
    if (!this._hb) { this._hb = {}; this.obj.traverse(n => { if (n.isBone) for (const [key, re] of Object.entries(HB)) if (re.test(n.name)) this._hb[key] = n; }); }
    const e = k * k * (3 - 2 * k), B = this._hb, c = this.cam;
    _ax.set(1, 0, 0).applyQuaternion(c.quaternion); _fw.set(0, 0, -1).applyQuaternion(c.quaternion); _up.set(0, 1, 0).applyQuaternion(c.quaternion);
    const turn = (bone, axis, ang) => {   // gira o osso em volta de um eixo da câmera (em graus), mantendo os filhos presos
      if (!bone || !ang) return; bone.updateWorldMatrix(true, false);
      this._hsave ??= []; if (!this._hsave.some(x => x[0] === bone)) this._hsave.push([bone, bone.quaternion.clone()]);
      bone.getWorldQuaternion(_bq); _rq.setFromAxisAngle(axis, ang * Math.PI / 180).multiply(_bq);
      bone.parent.getWorldQuaternion(_pq); bone.quaternion.copy(_pq.invert().multiply(_rq)); bone.updateMatrixWorld(true);
    };
    const H = HOLSTER;
    turn(B.rArm, _ax, H.armUp * e); turn(B.rArm, _fw, H.armOut * e); turn(B.rFore, _ax, H.foreFold * e); turn(B.rHand, _up, H.handTurn * e); turn(B.rHand, _fw, H.handRoll * e);
    turn(B.lArm, _ax, H.leftDown * e);
    this.obj.updateMatrixWorld(true);
  }

  /**
   * Sacar a arma nova: ela vem de cima à direita (onde a antiga sumiu ao ser guardada), girada com o cano para cima,
   * e cai até a pose inicial (rápido no começo, assentando no fim). Os braços ficam escondidos até ela chegar.
   * k: 1 = ainda lá em cima, 0 = na pose.
   */
  _drawDrop(k) {
    const g = this.held.cur; if (!g) return;
    const c = this.cam, e = k * k, D = DRAW;   // e: 1→0, desacelera ao chegar
    _ax.set(1, 0, 0).applyQuaternion(c.quaternion); _up.set(0, 1, 0).applyQuaternion(c.quaternion); _fw.set(0, 0, -1).applyQuaternion(c.quaternion);
    g.position.addScaledVector(_up, D.up * e).addScaledVector(_ax, D.right * e).addScaledVector(_fw, D.fwd * e);
    _rq.setFromAxisAngle(_ax, D.pitch * e * Math.PI / 180); _bq.setFromAxisAngle(_fw, D.roll * e * Math.PI / 180);
    g.quaternion.premultiply(_rq).premultiply(_bq); g.updateMatrixWorld(true);
  }

  /**
   * Troca de arma: em vez de mexer nos ossos, gira a CÂMERA dos braços ao contrário — na tela é o conjunto inteiro (braços + arma)
   * que vai para trás subindo por cima do ombro direito, sem deformar nada; e volta exatamente pelo mesmo caminho até a pose inicial.
   * e: 0 = pose inicial, 1 = guardada (fora da tela).
   */
  _swingCam(e) {
    const c = this.cam, S = SWING, piv = _pv, g = this.held.cur;
    if (g) g.getWorldPosition(piv); else piv.copy(c.position);   // gira em volta da arma
    _ax.set(1, 0, 0).applyQuaternion(c.quaternion); _up.set(0, 1, 0).applyQuaternion(c.quaternion); _fw.set(0, 0, -1).applyQuaternion(c.quaternion);
    // o conjunto: inclina com o cano para cima e tomba para fora, enquanto sobe para a direita e vem para trás (ombro)
    const r = this.rlK || 0, bu = this.rlBump || 0, L = RELOAD, D2R = Math.PI / 180;   // + recarga: abaixa e tomba; tranco ao encaixar
    const pitch = S.pitch * e + (L.pitch * r + L.bumpPitch * bu), roll = S.roll * e + L.roll * r, up = S.up * e - L.down * r + L.bumpUp * bu;
    _rq.setFromAxisAngle(_ax, pitch * D2R); _bq.setFromAxisAngle(_fw, roll * D2R); _rq.premultiply(_bq);
    _pq.copy(_rq).invert();   // a câmera faz o contrário: na tela só o conjunto se move (o mapa é outra camada)
    c.position.sub(piv).applyQuaternion(_pq).add(piv);
    c.quaternion.premultiply(_pq);
    c.position.addScaledVector(_up, -up).addScaledVector(_ax, -S.right * e).addScaledVector(_fw, S.back * e);
  }

  /** Faca guardando/sacando: o conjunto (a pose salva) desce até sair da tela e sobe de volta, sem girar. e: 0 = na pose, 1 = fora da tela. */
  _knifeSwap(e) {
    const c = this.cam, K = KNIFE_SWAP;
    _up.set(0, 1, 0).applyQuaternion(c.quaternion); _fw.set(0, 0, -1).applyQuaternion(c.quaternion); _ax.set(1, 0, 0).applyQuaternion(c.quaternion);
    c.position.addScaledVector(_up, K.down * e).addScaledVector(_fw, -K.back * e);   // câmera sobe = o conjunto desce na tela
    c.quaternion.premultiply(_rq.setFromAxisAngle(_ax, K.pitch * e * Math.PI / 180));
  }

  /**
   * Golpe da faca na 1ª pessoa: o conjunto (mão + faca, sem deformar) recua um pouco para a direita, corta na diagonal
   * para a esquerda/baixo indo para a frente, e volta para a pose inicial. Mesmo tempo da lâmina que dá o dano (WeaponSystem MELEE).
   */
  _slashCam(p) {
    const K = SLASH.keys; let i = 0; while (i < K.length - 2 && p > K[i + 1][0]) i++;
    const [p0, a] = K[i], [p1, b] = K[i + 1], u = THREE.MathUtils.clamp((p - p0) / (p1 - p0), 0, 1), e = u * u * (3 - 2 * u), L = k => a[k] + (b[k] - a[k]) * e;
    const c = this.cam, D2R = Math.PI / 180;
    _ax.set(1, 0, 0).applyQuaternion(c.quaternion); _up.set(0, 1, 0).applyQuaternion(c.quaternion); _fw.set(0, 0, -1).applyQuaternion(c.quaternion);
    if (this.held.cur) this.held.cur.getWorldPosition(_pv); else _pv.copy(c.position);   // gira em volta da mão/faca (não sai de cena)
    _rq.setFromAxisAngle(_fw, L('roll') * D2R); _bq.setFromAxisAngle(_ax, L('pitch') * D2R); _rq.multiply(_bq);
    _pq.copy(_rq).invert();
    c.position.sub(_pv).applyQuaternion(_pq).add(_pv); c.quaternion.premultiply(_pq);
    c.position.addScaledVector(_fw, -L('fwd')).addScaledVector(_ax, -L('side')).addScaledVector(_up, -L('up'));
  }

  /** Pose da arma mirando: igual a Game._ads, mas em relação à câmera dos braços. */
  _ads(k) {
    const c = this.cam, cfg = WEAPON_MODELS[this.wid]?.ads || {}, sc = cfg.sight ? { x: 0, ...cfg.sight } : this.held.cur?.userData.sightC;
    const q = _aq.copy(c.quaternion).multiply(FLIP);   // arma: +z = frente da câmera
    const pos = _ap.set(0, cfg.up ?? 0, -(cfg.back ?? .17)).applyQuaternion(c.quaternion).add(c.position);
    if (sc) pos.sub(_av.set(sc.x + (cfg.dx ?? 0), sc.y + (cfg.dy ?? 0), sc.z).applyQuaternion(q));
    return { pos, quat: q, k };
  }

  /** Posição e giro da câmera dos braços para a cena atual (cada cena pode ter a sua; troca de cena desliza suave). */
  _placeCam() {
    const t = fpFor(this.kind, this.wid, this.held.scene), c = this.cam, e = this.eye, k = this.fs ? 1 - Math.exp(-(this.dt || .016) * 12) : 1;
    this.fs ??= { ...t }; for (const key in t) this.fs[key] += (t[key] - (this.fs[key] ?? t[key])) * k;
    const f = this.fs, x = e.x + f.x / 100, z = e.z - f.z / 100, co = Math.cos(this.yaw), si = Math.sin(this.yaw);
    c.position.set(x * co + z * si, e.y + f.y / 100, -x * si + z * co);
    const R = Math.PI / 180; c.quaternion.setFromEuler(_e.set(f.rx * R, f.ry * R, f.rz * R, 'YXZ'));
    if (this.rlK > .001) this._swingCam(0);   // recarga simples (abaixa e tomba)
    if (this.swE > 0) this._knifeSwap(this.swE);   // troca de arma: desce/sobe na própria pose (sem braço passando na tela)
    c.updateMatrixWorld();
    return f;
  }

  /**
   * Ponto do MAPA que aparece na tela exatamente em cima do cano dos braços (os braços ficam noutra cena, com outra câmera).
   * Usado só para o rastro começar no cano; o acerto do tiro não depende disso. depth = distância (m) da câmera do jogo.
   */
  muzzleInWorld(camera, depth = .6) {
    if (this.vmOn) return this.vm.muzzleInWorld(camera, depth);
    const m = this.held.cur && this.held.holder.visible ? this.held.muzzleWorld : null; if (!m) return null;
    this.cam.updateMatrixWorld(); m.project(this.cam);
    if (m.z > 1 || Math.abs(m.x) > 1.3 || Math.abs(m.y) > 1.3) return null;   // cano fora da tela: usa o ponto padrão
    const v = _w.set(m.x, m.y, .5).unproject(camera).sub(camera.position).normalize();
    return camera.position.clone().addScaledVector(v, depth);
  }

  /** Desenha os braços e a arma por cima do que já está na tela (depois do mapa). aspect = largura/altura da tela. */
  render(renderer, aspect, worldFov = null) {
    if (this.vmOn) { ensureWeaponEnv(renderer); this.vm.render(renderer, aspect); return; }
    const f = this._placeCam(), c = this.cam;
    // mirando: o zoom dos braços vai junto com o zoom da mira (a arma fica do mesmo tamanho que na 3ª pessoa)
    const k = this.adsK || 0; c.fov = worldFov && k > 0 ? f.fov + (worldFov - f.fov) * k : f.fov;
    c.near = k > 0 ? .01 : Math.max(.005, f.near / 100); c.aspect = aspect; c.updateProjectionMatrix();   // mirando: não corta a arma colada na câmera
    ensureWeaponEnv(renderer);
    const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth();
    renderer.render(this.scene, c);
    renderer.autoClear = ac;
  }

  dispose() {
    this.vm?.dispose(); this.vm = null;
    this.mixer.stopAllAction(); this.held.dispose?.(); this.arms.dispose();
    this.scene.traverse(o => { if (o.isLight) o.dispose?.(); });
  }
}
