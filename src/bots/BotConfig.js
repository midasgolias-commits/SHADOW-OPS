/** Dificuldades e tabelas dos bots. Ângulos em rad, tempos em s, distâncias em m. */
export const DIFFS = {
  easy:   { react: [.55, .95], err: .035, turn: 4.5, speed: 3.8, vision: 50, fov: 110, hs: .08, dmgMul: .7,  hear: .4,  burst: [1, 3], pause: [.5, 1.1],  strafe: .4, aimTau: .9 },
  normal: { react: [.3, .55],  err: .018, turn: 7,   speed: 4.6, vision: 70, fov: 125, hs: .2,  dmgMul: .85, hear: .7,  burst: [2, 5], pause: [.3, .7],   strafe: .7, aimTau: .6 },
  hard:   { react: [.15, .3],  err: .009, turn: 11,  speed: 5.2, vision: 90, fov: 140, hs: .4,  dmgMul: 1,   hear: .95, burst: [3, 7], pause: [.15, .4],  strafe: .9, aimTau: .35 }
};

export const AGENT_COLOR = { viper: 0xd9482b, ghost: 0x3d8bd9, rook: 0xc9b458, nova: 0x53d36e };
export const TEAM_COLOR = { att: 0xc2452a, def: 0x3d7fc9 };

/** Distância em que cada arma rende mais (o bot tenta ficar por aí). */
export const IDEAL = { aug: 24, rifle: 24, smg: 13, sniper: 48, shotgun: 7, pistol: 17 };
/** Raio em que o tiro é ouvido por inimigos. */
export const NOISE = { aug: 45, rifle: 45, smg: 35, sniper: 75, shotgun: 45, pistol: 32, knife: 6, karambit: 6 };

const POOL = {
  competitive: [['rifle', .5], ['smg', .2], ['shotgun', .1], ['sniper', .1], ['pistol', .1]],
  deathmatch: [['rifle', .35], ['smg', .25], ['shotgun', .15], ['sniper', .1], ['pistol', .15]]
};
export function pickWeapon(mode, rng = Math.random) {
  const pool = POOL[mode] || POOL.deathmatch; let r = rng();
  for (const [id, w] of pool) { if ((r -= w) < 0) return id; }
  return 'rifle';
}
