/** Tabela das animações (sem Three.js): id do jogo → arquivo em assets/anims/<pasta>/<nome>.fbx. */
export const ANIMS = {
  // fuzil (também usado por SMG, escopeta, sniper e pistola)
  idle: 'Rifle Idle', fire: 'idle Firing Rifle', reload: 'Reload idle', death: 'Death animation', jump: 'Rifle Jump Idle', jump_run: 'Jump Running Forward',
  walk_f: 'Walk Forward', walk_b: 'walk Backwards Rifle', walk_l: 'Walk Left', walk_r: 'Walk Right',
  run_f: 'Run Forward', run_b: 'Run Backward Rifle', run_l: 'Run Left', run_r: 'Run Right', run_fl: 'Run Forward Left', run_fr: 'Run Forward Right',
  crouch_idle: 'Crouch Idle', crouch_f: 'Crouching Forward', crouch_b: 'Crouching Backward', crouch_l: 'Crouching Left', crouch_r: 'Crouching Right',
  crouch_fire: 'crouch Fire idle', crouch_reload: 'Crouch reload idle', crouch_death: 'Crouch Death',
  // faca
  knife_idle: 'Knife Idle', knife_f: 'Knife Run forward', knife_b: 'knife Running Backward', knife_l: 'Standing_Run_Left', knife_r: 'Standing_Run_Right',   // de lado com a faca (andando ou correndo)
  knife_hit: 'Stabbing_3', knife_hit_run: 'knife hit run',
  // pulos com a faca (mãos livres) e o salto por cima de obstáculo (só com a faca, Espaço duas vezes correndo)
  knife_jump: 'Jump_1', knife_jump_run: 'Running_Jump_2', knife_vault: 'Big_Jump',
  // pistola (pacote "Pistol Handgun Locomotion"): andar/correr, de lado, pulos e ajoelhar
  pistol_idle: 'pistol idle', pistol_walk_f: 'pistol walk', pistol_run_f: 'pistol run', pistol_walk_b: 'pistol walk backward', pistol_run_b: 'pistol run backward',
  pistol_l: 'pistol strafe', pistol_r: 'pistol strafe (2)', pistol_jump: 'pistol jump', pistol_jump_run: 'pistol jump (2)',
  pistol_crouch: 'pistol kneeling idle', pistol_kneel_down: 'pistol stand to kneel', pistol_kneel_up: 'pistol kneel to stand'
};
export const FOLDER = id => id.startsWith('knife') ? 'with knife' : id.startsWith('pistol') ? 'with pistol' : id.startsWith('crouch') ? 'crouch with rifle' : 'with gun';

/** Velocidade (m/s) em que cada clipe de locomoção foi gravado; usada para a passada casar com o chão. */
export const AUTHORED = { walk_f: 1.86, walk_b: 2.37, walk_l: 1.86, walk_r: 1.86, run_f: 4.6, run_b: 4.6, run_l: 4.6, run_r: 4.6, run_fl: 4.64, run_fr: 4.64,
  crouch_f: 1.97, crouch_b: 1.97, crouch_l: 1.97, crouch_r: 1.97, knife_f: 4.6, knife_b: 2.88, knife_l: 3.46, knife_r: 3.89,
  pistol_walk_f: 2.64, pistol_run_f: 4.9, pistol_walk_b: 1.45, pistol_run_b: 3.41, pistol_l: 2.22, pistol_r: 2.5 };

