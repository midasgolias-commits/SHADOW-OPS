import * as THREE from 'three';
import { AUTHORED } from '../core/AnimTable.js';
import { sceneOf } from '../weapons/Grips.js';

/**
 * Anima um personagem Mixamo (Izzy ou bot) a partir do estado do jogo. Usado pelo jogador e pelos bots.
 * update(dt, s): s = { speed, fwd, side (velocidade local: frente/direita, m/s), crouch, air, melee, dead, deadCrouch, pitch }
 * Ações pontuais: fire(), reload(segundos), hit() (faca).
 * Tiro/recarga/golpe tocam só no tronco (por cima da locomoção) com peso alto.
 */
const UPPER = /(Spine|Neck|Head|Shoulder|Arm|Hand|Thumb|Index|Middle|Ring|Pinky)/, LOWER = /(Hips|Leg|Foot|Toe)/;
// golpe de faca: os dedos da mão direita do clipe ficam ~90° fechados (punho sem cabo) e atravessavam o cabo — a mão ficava deformada.
// Nesses clipes os dedos da mão direita NÃO vêm do golpe: ficam com a pegada da animação de baixo (faca andando), que segura o cabo.
const KEEP_GRIP = /^knife_hit/, R_FINGERS = /RightHand(Thumb|Index|Middle|Ring|Pinky)/;
export const upperOnly = c => new THREE.AnimationClip(c.name + '_up', c.duration, c.tracks.filter(t => { const b = t.name.split('.')[0]; return UPPER.test(b) && !LOWER.test(b) && !(KEEP_GRIP.test(c.name) && R_FINGERS.test(b)); }));
/**
 * O mixer do three.js só regrava um osso quando o valor da animação MUDA em relação ao quadro anterior. Com a animação parada
 * (pose congelada), qualquer mudança feita por código depois do mixer (IK da mão esquerda, giro da mão) ficava "grudada" no osso
 * e ia se acumulando — ex.: trocar para a faca deixava o braço esquerdo na pose do fuzil até dar um golpe.
 * Chamando isto antes de mixer.update, todo osso animado recebe de novo o valor da animação, todo quadro.
 */
export function forceMixerWrite(mixer) { for (const b of mixer?._bindings || []) { const s = b.valueSize; if (b.buffer && s) b.buffer.fill(NaN, s, 3 * s); } }
export const OVER = 20;      // peso do clipe de tronco (domina a locomoção nos ossos de cima)
const FADE = .16;

export class CharacterAnimator {
  constructor(obj, clips) {
    this.obj = obj; this.mixer = new THREE.AnimationMixer(obj); this.clips = clips; this.actions = {}; this.cur = null; this.curName = '';
    this.up = {}; this.over = null; this.overT = 0; this.dead = false;
    for (const k of ['fire', 'crouch_fire', 'reload', 'crouch_reload', 'knife_hit']) if (clips[k]) this.up[k] = this.mixer.clipAction(upperOnly(clips[k]));
    this.spine = []; obj.traverse(n => { if (n.isBone && /Spine\d?$/.test(n.name)) this.spine.push(n); });
    this._q = new THREE.Quaternion(); this._p = new THREE.Quaternion(); this._ax = new THREE.Vector3(); this._wq = new THREE.Quaternion();
  }

  _act(name) {
    let a = this.actions[name];
    if (!a && this.clips[name]) a = this.actions[name] = this.mixer.clipAction(this.clips[name]);
    return a;
  }
  _play(name, scale = 1, once = false) {
    const a = this._act(name); if (!a) return;
    a.timeScale = scale;
    if (this.curName === name) return;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.enabled = true; a.setEffectiveWeight(1);
    if (this.cur) a.crossFadeFrom(this.cur, FADE, false);
    a.play(); this.cur = a; this.curName = name;
  }
  _overlay(name, dur, hold = 0) {
    const a = this.up[name]; if (!a || this.dead) return;
    if (this.over && this.over !== a) this.over.fadeOut(.08);
    const again = this.over === a && this.overName === name && hold;   // tiro seguido: não recomeça o fade
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = !!hold; a.setEffectiveWeight(OVER); a.enabled = true;
    a.timeScale = dur ? a.getClip().duration / dur : 1; if (!again) a.fadeIn(.05); a.play();
    this.over = a; this.overName = name; this.overT = (dur ?? a.getClip().duration) + hold;
  }
  /** Coloca o personagem parado num quadro de um clipe, chama fn() e volta ao normal (usado para medir a pegada da arma). */
  withPose(name, fn, at = 1) {
    const clip = this.clips[name]; if (!clip) return;
    this.mixer.stopAllAction(); const a = this.mixer.clipAction(clip);
    a.reset(); a.setEffectiveWeight(1); a.play(); a.time = clip.duration * at; a.paused = true;
    this.mixer.update(0); this.obj.updateMatrixWorld(true); fn();
    a.stop(); this.mixer.uncacheAction(clip); this.cur = null; this.curName = '';
  }
  /** Tiro: toca o tranco e segura a pose de mira por ~1 s (a arma fica apontada para a frente). */
  fire(crouch) { this._overlay(crouch && this.up.crouch_fire ? 'crouch_fire' : 'fire', undefined, 1.1); }
  /** Segura a pose de mira (usado na mira pela arma, botão direito). */
  aimHold(crouch) { if (!this.aiming) this.fire(crouch); else this.overT = Math.max(this.overT, .3); }
  /** Cena atual para o ajuste da arma na mão (Lab de Armas): parado, andando, atirando, recarregando... */
  get scene() { return sceneOf(this.curName, this.over ? this.overName : ''); }
  get aiming() { return !!this.over && (this.overName === 'fire' || this.overName === 'crouch_fire'); }
  reload(sec, crouch) { this._overlay(crouch && this.up.crouch_reload ? 'crouch_reload' : 'reload', sec); }
  hit() { this._overlay('knife_hit', .55); }
  cancelOverlay() { if (this.over) { this.over.fadeOut(.1); this.over = null; this.overName = ''; } }

  update(dt, s) {
    if (s.dead) {
      if (!this.dead) { this.dead = true; this.cancelOverlay(); this._play(s.deadCrouch && this.clips.crouch_death ? 'crouch_death' : 'death', 1, true); }
      forceMixerWrite(this.mixer); this.mixer.update(dt); return;
    }
    if (this.dead) { this.dead = false; this.curName = ''; this.mixer.stopAllAction(); this.cur = null; }
    const sp = s.speed, mv = sp > .35;
    const dir = () => {   // direção do movimento relativa ao corpo
      const a = Math.atan2(s.side, s.fwd) * 180 / Math.PI;
      if (Math.abs(a) <= 30) return 'f'; if (a > 30 && a <= 60) return 'fr'; if (a < -30 && a >= -60) return 'fl';
      if (a > 60 && a < 120) return 'r'; if (a < -60 && a > -120) return 'l'; return 'b';
    };
    let name, scale = 1;
    if (s.vault && this.clips.knife_vault) name = 'knife_vault';
    else if (s.air) name = s.melee && this.clips.knife_jump ? (sp > 2.5 ? 'knife_jump_run' : 'knife_jump')
      : s.pistol && this.clips.pistol_jump ? (sp > 2.5 ? 'pistol_jump_run' : 'pistol_jump') : (sp > 2.5 ? 'jump_run' : 'jump');
    else if (s.melee) { if (!mv) name = 'knife_idle'; else { let d = dir(); if (d === 'fr' || d === 'fl') d = 'f'; name = 'knife_' + d; } }
    else if (s.pistol && this.clips.pistol_idle && !(s.crouch && mv)) {   // pistola (agachado andando: usa o agachado do fuzil, o pacote não tem)
      if (s.crouch) name = 'pistol_crouch';
      else if (!mv) name = 'pistol_idle';
      else { let d = dir(); if (d.length > 1) d = 'f'; name = d === 'l' || d === 'r' ? 'pistol_' + d : (sp > 3.3 ? 'pistol_run_' : 'pistol_walk_') + d; }
    }
    else if (s.crouch) { if (!mv) name = 'crouch_idle'; else { let d = dir(); if (d.length > 1) d = 'f'; name = 'crouch_' + d; } }
    else if (!mv) name = 'idle';
    else {
      let d = dir(); const run = sp > 3.3;
      if (!run && d.length > 1) d = 'f';      // andar não tem diagonal: usa frente
      name = (run ? 'run_' : 'walk_') + d;
    }
    if (!this.clips[name]) name = s.crouch ? 'crouch_idle' : 'idle';
    // pistola: ajoelhar/levantar tocam a transição antes do ajoelhado/em pé
    if (this.trans) { this.trans.t -= dt; if (this.trans.t > 0 && this.trans.to === name) name = this.trans.name; else this.trans = null; }
    else if (name === 'pistol_crouch' && this.curName === 'pistol_idle' && this.clips.pistol_kneel_down) { this.trans = { name: 'pistol_kneel_down', to: name, t: this.clips.pistol_kneel_down.duration * .85 }; name = this.trans.name; }
    else if (name === 'pistol_idle' && this.curName === 'pistol_crouch' && this.clips.pistol_kneel_up) { this.trans = { name: 'pistol_kneel_up', to: name, t: this.clips.pistol_kneel_up.duration * .85 }; name = this.trans.name; }
    if (AUTHORED[name]) scale = THREE.MathUtils.clamp(sp / AUTHORED[name], .55, 1.7);
    this._play(name, scale, /jump|vault|kneel_/.test(name));
    if (name === 'knife_vault') { this.cur.timeScale = 0; this.cur.time = s.vault.u; }   // salto por cima: o quadro vem da física (sincronizado com o movimento)
    if (this.over && (this.overT -= dt) <= 0) { this.over.fadeOut(.15); this.over = null; this.overName = ''; }
    forceMixerWrite(this.mixer); this.mixer.update(dt);
    // inclina o tronco para a mira (para cima/baixo), dividido entre as vértebras
    if (this.spine.length && s.pitch) {
      const k = s.pitch / this.spine.length;
      for (const b of this.spine) {
        // eixo "direita" do personagem no espaço do pai do osso
        this.obj.getWorldQuaternion(this._wq); this._ax.set(1, 0, 0).applyQuaternion(this._wq);
        b.parent.getWorldQuaternion(this._p); this._ax.applyQuaternion(this._p.invert()).normalize();
        this._q.setFromAxisAngle(this._ax, -k); b.quaternion.premultiply(this._q);
      }
    }
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.obj); }
}
