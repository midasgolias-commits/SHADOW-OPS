/**
 * Dados das armas (sem Three.js). Ângulos em radianos, tempos em segundos, distâncias em metros.
 * dmg: dano base no corpo; head/limb: multiplicadores por zona; falloff: fator de dano a cada 20 m.
 * Dispersão (cone em volta do centro da tela, em rad):
 *   spread = do quadril (parado); ads.spreadMul = multiplicador mirando pela arma; zoomSpread = na luneta;
 *   moveSpread = acréscimo andando/correndo (jogador; 28/10: bem menor, a bala não espalha tanto andando — exceto sniper);
 *   botMoveSpread = o mesmo para os bots (valor antigo, a dificuldade deles não muda); airSpread = no ar; burstSpread = acréscimo a cada tiro seguido (rajada).
 * Recuo da CÂMERA (a mira na tela fica parada; quem sobe é a câmera e volta sozinha — ajustes gerais em WeaponSystem.AIM):
 *   recoil.p = subida por tiro, recoil.y = desvio lateral máximo (sorteado), ramp/cap = aumento ao longo da rajada.
 */
export const WEAPONS = {
  rifle: {
    id: 'rifle', slot: 1, name: 'VX-47', kind: 'Fuzil', auto: true, rpm: 600,
    dmg: 32, head: 4, limb: .75, falloff: .96, range: 200, pellets: 1,
    mag: 30, reserve: 90, reload: 2.4,
    spread: .0015, moveSpread: .007, botMoveSpread: .035, airSpread: .06, burstSpread: .0012,
    recoil: { p: .011, y: .004, ramp: .1, cap: 10 }, speedMul: .95,
    ads: { fov: 17, spreadMul: .4 }   // botão direito: mira pela própria arma, igual à Vector (um pouco mais de zoom por causa da luneta)
  },
  smg: {
    id: 'smg', slot: 2, name: 'VECTOR', kind: 'Submetralhadora', auto: true, rpm: 800,
    dmg: 20, head: 3, limb: .8, falloff: .93, range: 120, pellets: 1,
    mag: 30, reserve: 120, reload: 1.9,
    spread: .0025, moveSpread: .005, botMoveSpread: .02, airSpread: .05, burstSpread: .0014,
    recoil: { p: .007, y: .005, ramp: .08, cap: 12 }, speedMul: 1,
    ads: { fov: 22, spreadMul: .4 }   // botão direito: mira pela própria arma (zoom ~2x; campo de visão VERTICAL em graus)
  },
  sniper: {
    id: 'sniper', slot: 3, name: 'SNIPER', kind: 'Sniper', auto: false, rpm: 45,
    dmg: 115, head: 4, limb: 1, falloff: 1, range: 300, pellets: 1,
    mag: 5, reserve: 20, reload: 3.2,
    spread: .06, moveSpread: .06, airSpread: .1, burstSpread: 0, zoomSpread: .0002, zoomFov: 10,   // luneta: campo de visão VERTICAL (~4x)
   
    recoil: { p: .05, y: .008, ramp: 0, cap: 1 }, speedMul: .85
  },
  shotgun: {
    id: 'shotgun', slot: 4, name: 'SPAS-12', kind: 'Escopeta', auto: false, rpm: 70,
    dmg: 12, head: 2, limb: .8, falloff: .86, range: 60, pellets: 9,
    mag: 8, reserve: 32, reload: .45, shell: true,   // reload = tempo por cartucho
    spread: .035, moveSpread: .004, botMoveSpread: .01, airSpread: .02, burstSpread: 0,
    recoil: { p: .045, y: .006, ramp: 0, cap: 1 }, speedMul: .93
  },
  pistol: {
    id: 'pistol', slot: 5, name: 'P-19', kind: 'Pistola', auto: false, rpm: 400,
    dmg: 25, head: 3.5, limb: .8, falloff: .96, range: 120, pellets: 1,
    mag: 13, reserve: 52, reload: 1.7,
    spread: .003, moveSpread: .006, botMoveSpread: .03, airSpread: .05, burstSpread: .003,
    recoil: { p: .018, y: .004, ramp: .15, cap: 5 }, speedMul: 1
  },
  knife: {
    id: 'knife', slot: 6, name: 'BAIONETA M9', kind: 'Corpo a corpo', melee: true, auto: false, rpm: 100,
    dmg: 40, head: 1, limb: 1, falloff: 1, range: 2.3, pellets: 1,
    spread: 0, moveSpread: 0, airSpread: 0, burstSpread: 0,
    recoil: { p: 0, y: 0, ramp: 0, cap: 1 }, speedMul: 1.08
  }
};

/** Ordem das teclas 1..6. */
// AUG A3: fuzil bullpup com luneta embutida; mesmos números da VX-47 (pedido: "copiar o que tem da VX")
WEAPONS.aug = { ...WEAPONS.rifle, id: 'aug', slot: 7, name: 'AUG A3', kind: 'Fuzil', recoil: { ...WEAPONS.rifle.recoil }, ads: { ...WEAPONS.rifle.ads } };

// Karambit: segunda faca (mesmo dano da faca; pegada invertida, lâmina curva saindo por baixo do mindinho)
WEAPONS.karambit = { ...WEAPONS.knife, id: 'karambit', slot: 8, name: 'KARAMBIT', recoil: { ...WEAPONS.knife.recoil } };
/** Arma branca (faca, karambit…): usa a mesma 1ª pessoa, golpe e cenas da faca. */
export const isMelee = id => !!WEAPONS[id]?.melee;

/** Ordem das teclas 1..6 (sem mochila) e da lista do Lab. A AUG fica no fim (tecla 7) para não mudar as outras. */
export const ORDER = ['rifle', 'smg', 'sniper', 'shotgun', 'pistol', 'knife', 'aug', 'karambit'];
