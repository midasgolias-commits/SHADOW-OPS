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
    id: 'sniper', slot: 3, name: 'L11', kind: 'Sniper', auto: false, rpm: 45,
    dmg: 115, head: 4, limb: 1, falloff: 1, range: 300, pellets: 1,
    mag: 5, reserve: 20, reload: 3.2,
    spread: .06, moveSpread: .06, airSpread: .1, burstSpread: 0, zoomSpread: .0002, zoomFov: 10,   // luneta: campo de visão VERTICAL (~4x)
   
    recoil: { p: .05, y: .008, ramp: 0, cap: 1 }, speedMul: .85
  },
  shotgun: {
    id: 'shotgun', slot: 4, name: 'SHORTY', kind: 'Escopeta', auto: false, rpm: 70,
    dmg: 12, head: 2, limb: .8, falloff: .86, range: 60, pellets: 9,
    mag: 8, reserve: 32, reload: .45, shell: true,   // reload = tempo por cartucho
    spread: .035, moveSpread: .004, botMoveSpread: .01, airSpread: .02, burstSpread: 0,
    recoil: { p: .045, y: .006, ramp: 0, cap: 1 }, speedMul: .93
  },
  pistol: {
    id: 'pistol', slot: 5, name: 'GLOCK', kind: 'Pistola', auto: false, rpm: 400,
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
WEAPONS.karambit = { ...WEAPONS.knife, id: 'karambit', slot: 8, name: 'KARAMBIT', recoil: { ...WEAPONS.knife.recoil }, trocaFaca: true };
WEAPONS.knife.trocaFaca = true;   // 1ª pessoa: animação da faca do pacote novo com a lâmina da própria arma
// ---- 03/11: armas novas com pacote de 1ª pessoa próprio (braços do personagem pelo adaptador universal) ----
WEAPONS.faca2 = { ...WEAPONS.knife, id: 'faca2', slot: 10, name: 'FACA TÁTICA', recoil: { ...WEAPONS.knife.recoil }, trocaFaca: false };
WEAPONS.magnum = { ...WEAPONS.pistol, id: 'magnum', slot: 11, name: 'MAGNUM', kind: 'Pistola', dmg: 55, head: 3, rpm: 150, mag: 6, reserve: 30, reload: 3.0,
  spread: .0035, burstSpread: .006, recoil: { p: .045, y: .008, ramp: .2, cap: 3 }, speedMul: 1 };
WEAPONS.sniper2 = { ...WEAPONS.sniper, id: 'sniper2', slot: 12, name: 'SNIPER SD', dmg: 100, rpm: 50, reload: 2.9, recoil: { ...WEAPONS.sniper.recoil } };
WEAPONS.smg2 = { ...WEAPONS.smg, id: 'smg2', slot: 13, name: 'SST-30', dmg: 22, rpm: 750, reload: 2.1, recoil: { ...WEAPONS.smg.recoil }, ads: null };
WEAPONS.m4a1s = { ...WEAPONS.rifle, id: 'm4a1s', slot: 14, name: 'M4A1-S', dmg: 30, rpm: 650, mag: 25, reserve: 75, reload: 2.5, recoil: { p: .009, y: .004, ramp: .09, cap: 9 }, ads: null };
// AK-74M (kit do LokitoBlu, CC BY 4.0): fuzil mais forte e com mais recuo que a VX-47; viewmodel próprio com os braços da Izzy
WEAPONS.ak = { ...WEAPONS.rifle, id: 'ak', slot: 9, name: 'AK-74M', kind: 'Fuzil', dmg: 36, rpm: 600, reload: 2.6, burstSpread: .0016,
  recoil: { p: .014, y: .006, ramp: .12, cap: 10 }, ads: null };   // sem mirar pela arma por enquanto (o kit não tem animação de mira)
/** Arma branca (faca, karambit…): usa a mesma 1ª pessoa, golpe e cenas da faca. */
export const isMelee = id => !!WEAPONS[id]?.melee;

/** Ordem das teclas 1..6 (sem mochila) e da lista do Lab. A AUG fica no fim (tecla 7) para não mudar as outras. */
export const ORDER = ['rifle', 'smg', 'sniper', 'shotgun', 'pistol', 'knife', 'aug', 'karambit', 'ak', 'faca2', 'magnum', 'sniper2', 'smg2', 'm4a1s'];
