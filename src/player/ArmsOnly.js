import * as THREE from 'three';

/**
 * Visão de 1ª pessoa: desenha SÓ os braços e as mãos do personagem (o resto do corpo some), como nos jogos de tiro.
 * Funciona pela pele do modelo: cada ponto da malha é puxado por alguns ossos (pesos); se a maior parte do peso é de
 * osso de braço/mão, o ponto aparece; senão, é descartado no desenho. Não muda nada na 3ª pessoa.
 *
 * Uso: const arms = new ArmsOnly(personagem); arms.on(); renderer.render(...); arms.off();
 */
const ARM = /(ForeArm|Hand|Thumb|Index|Middle|Ring|Pinky)/;   // antebraço e mão: sempre aparecem
const UPPER = /(LeftArm|RightArm)$/;                           // braço de cima: só a parte que é "puro braço" (sem ombro/blusa), senão o antebraço fica cortado no ar
export class ArmsOnly {
  constructor(root) {
    this.items = [];
    root.traverse(m => {
      if (!m.isSkinnedMesh) return;
      const bones = m.skeleton.bones, flags = bones.map(b => (ARM.test(b.name) ? 1 : UPPER.test(b.name) ? .55 : 0));
      const mats = [].concat(m.material), alt = mats.map(src => {
        const a = src.clone();
        a.onBeforeCompile = sh => {
          sh.uniforms.armFlags = { value: flags };
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', `#include <common>\nuniform float armFlags[${flags.length}];\nvarying float vArm;`)
            .replace('#include <skinbase_vertex>', `#include <skinbase_vertex>\n vArm = armFlags[int(skinIndex.x)] * skinWeight.x + armFlags[int(skinIndex.y)] * skinWeight.y + armFlags[int(skinIndex.z)] * skinWeight.z + armFlags[int(skinIndex.w)] * skinWeight.w;`);
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vArm;')
            .replace('void main() {', 'void main() {\n if (vArm < .4) discard;');
        };
        a.customProgramCacheKey = () => 'armsOnly' + flags.length;
        return a;
      });
      this.items.push({ m, mats: m.material, alt: Array.isArray(m.material) ? alt : alt[0], flags, base: flags.slice(), up: bones.map(b => !ARM.test(b.name) && UPPER.test(b.name)), left: bones.map(b => /Left(Arm|ForeArm|Hand)/.test(b.name)) });
    });
  }
  on() { for (const it of this.items) it.m.material = it.alt; }
  /** Liga/desliga o braço de cima (fica só antebraço e mão). */
  upper(show) { this.show({ upper: show }); }
  /** O que aparece: upper = braço de cima, left = braço esquerdo inteiro (a faca usa só a mão direita). */
  show(o) {
    const st = this._st ??= { upper: true, left: true }; let ch = false;
    for (const k in o) if (st[k] !== o[k]) { st[k] = o[k]; ch = true; }
    if (!ch) return;
    for (const it of this.items) for (let i = 0; i < it.flags.length; i++) it.flags[i] = (it.left[i] && !st.left) || (it.up[i] && !st.upper) ? 0 : it.base[i];
  }
  off() { for (const it of this.items) it.m.material = it.mats; }
  dispose() { this.off(); for (const it of this.items) for (const a of [].concat(it.alt)) a.dispose(); }
}
