import * as THREE from 'three';
import { FirstPersonView } from '../player/FirstPersonView.js';
import { ProceduralAudio } from '../audio/ProceduralAudio.js';
import { Announcer } from '../audio/Announcer.js';
import { CollisionWorld } from '../world/CollisionWorld.js';
import { PlayerController } from '../player/PlayerController.js';
import { PM } from '../utils/ProceduralMaterials.js';
import { buildMapData, buildRangeData } from '../world/MapData.js';
import { RangeTraining } from '../modes/RangeTraining.js';
import { OnlineMatch } from '../net/OnlineMatch.js';
import { MapBuilder } from '../world/MapBuilder.js';
import { Navigation } from '../world/Navigation.js';
import { WeaponSystem, AIM } from '../weapons/WeaponSystem.js';
import { WEAPONS } from '../weapons/Weapons.js';
import { BotManager } from '../bots/BotManager.js';
import { Assets } from './Assets.js';
import { CharacterAnimator } from '../player/CharacterAnimator.js';
import { HeldWeapon, WEAPON_MODELS, setScopeCut, ensureWeaponEnv } from '../weapons/WeaponModels.js';
import { vfov } from './Fov.js';
import { loadGrips } from '../weapons/Grips.js';
import { SETTINGS_DEFAULTS } from '../ui/Settings.js';
import { getLoadout, loadoutWeapons } from '../ui/Loadout.js';

const DEATH_DELAY = 3.2; // segundos até o jogador reaparecer (o competitivo passa a usar rodadas na Parte 5)

const DEFAULTS = { sens: 1, fov: 90, volume: .6, quality: 'high', ...SETTINGS_DEFAULTS };
const STEP = 1 / 120; // passo fixo de física

export class Game {
  constructor(host) {
    this.hooks = {}; this.mode = null; this.running = false; this.paused = false;
    this.settings = this._load();
    this.audio = new ProceduralAudio(); this.audio.setVolume(this.settings.volume);
    this.announcer = new Announcer(this.audio);   // locutor (sons escolhidos na ferramenta de Sons do Lab)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, .05, 300);
    this.scene = new THREE.Scene(); this.world = new CollisionWorld(); this.player = null; this.weapons = null; this.bots = null; this.deadT = 0;
    this.assets = new Assets(); this.avatar = null; this.anim = null;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.clock = new THREE.Clock(); this._fpsT = 0; this._fpsN = 0; this.fps = 0; this.time = 0;
    this._applyQuality();
    addEventListener('resize', () => this._resize()); this._resize();
    addEventListener('keydown', e => {   // Esc com o teclado preso (tela cheia): pausa do mesmo jeito
      if (e.code === 'Escape' && this.running && !this.paused && document.pointerLockElement && navigator.keyboard && document.fullscreenElement) document.exitPointerLock();
    });
    addEventListener('keydown', e => {   // V: alterna 1ª / 3ª pessoa
      if (e.code === 'KeyV' && !e.repeat && this.running && !this.paused && document.pointerLockElement) { this.setSetting('firstPerson', !this.settings.firstPerson); this.hooks.onView?.(this.settings.firstPerson); }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) { this.paused = false; this.hooks.onResume?.(); }
      else if (this.running && !this.paused) this.pause();
    });
  }

  _load() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('shadowops.settings') || '{}') }; } catch { return { ...DEFAULTS }; } }
  setSetting(k, v) {
    this.settings[k] = v;
    try { localStorage.setItem('shadowops.settings', JSON.stringify(this.settings)); } catch {}
    if (k === 'fov') { this.camera.fov = vfov(v, this.camera.aspect); this.camera.updateProjectionMatrix(); }
    if (k === 'volume') this.audio.setVolume(v);
    if (k === 'fullscreen' && !v) { navigator.keyboard?.unlock?.(); if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {}); }
    if (k === 'quality') this._applyQuality();
    if (k === 'firstPerson' && this.player) { this.player.firstPerson = !!v && !this.player.dead; this.player.applyLook(); }
    if (k.startsWith('cam') && this.player) { if (k === 'camDist') this.player.camDist = v; this.player.applyLook(); }   // câmera da 3ª pessoa muda na hora (também com o jogo pausado)
  }
  _applyQuality() {
    const q = this.settings.quality;
    this.renderer.setPixelRatio(q === 'low' ? .75 : q === 'medium' ? 1 : Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = q !== 'low';
    if (this.sun) {
      const sz = q === 'high' ? 2048 : 1024;
      if (this.sun.shadow.mapSize.x !== sz) { this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; this.sun.shadow.mapSize.set(sz, sz); }
    }
  }
  _resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    if (!this.weapons?.scoped) this.camera.fov = vfov(this.settings.fov, this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  start(mode, config = null) {
    this.stop(); this.mode = mode; this.config = config; this.audio.init(); this.audio.play('ui'); this._t0 = performance.now(); this.finished = false;
    this.announcer.reset(); this.announcer.say('inicio', 250);
    this._refreshGrips();
    this._buildMap();
    this.player = new PlayerController(this.camera, this.world, this.settings, this.audio);
    const sp = this.mapData.spawns;
    const me = config?.me;
    const pt = mode === 'competitive'
      ? { ...(me?.team === 'def' ? sp.defenders : sp.attackers)[me?.slot ?? 2] }
      : mode === 'training' ? { ...sp.dm[0] }   // treino: dentro da baia, olhando para os alvos
      : config?.online ? { ...sp.dm[(config.online.slot ?? 0) * 3 % sp.dm.length], yaw: Math.random() * Math.PI * 2 }   // online: cada um num ponto diferente
      : { ...sp.dm[Math.floor(Math.random() * sp.dm.length)], yaw: Math.random() * Math.PI * 2 };
    this.player.respawn(new THREE.Vector3(pt.x, 0, pt.z), pt.yaw);
    this.player.vaultCurve = this.assets.clips.knife_vault?.userData?.root || null;   // caminho do Big Jump (salto por cima)
    this.camera.fov = vfov(this.settings.fov, this.camera.aspect); this.camera.updateProjectionMatrix();
    // Parte 3: todas as armas liberadas em todos os modos (a economia do competitivo restringe isso na Parte 5)
    this.weapons = new WeaponSystem({
      camera: this.camera, scene: this.scene, world: this.world, player: this.player, audio: this.audio,
      settings: this.settings, hooks: this.hooks, active: () => this.running && !this.paused && !this.player.dead && !!document.pointerLockElement,
      loadout: loadoutWeapons(this.loadout = config?.loadout || getLoadout()),   // só as 3 armas da mochila (1 principal, 2 secundária, 3 faca)
      infiniteAmmo: mode === 'training'   // treino: munição infinita
    });
    this._makeAvatar();
    // Parte 4: bots (só quando a sala tem bots; o treino ainda não tem)
    this.deadT = 0; this.bots = null;
    if (config?.bots?.length) {
      this.bots = new BotManager({ scene: this.scene, world: this.world, nav: this.nav, map: this.mapData, player: this.player,
        weapons: this.weapons, audio: this.audio, camera: this.camera, hooks: this.hooks, cfg: config, assets: this.assets,
        onPlayerDeath: src => this._playerDied(src) });
      this.weapons.onShot = w => this.bots.playerShot(w);
      this.bots.spawnAll();
    }
    this.range = mode === 'training' ? new RangeTraining(this) : null;   // treino: bots-alvo, botão do menu (E), todas as armas
    this.online = config?.online ? new OnlineMatch(this, config.online) : null;   // online: os amigos (Net.js / OnlineMatch.js)
    this.hooks.onStart?.(this.mapData);
    this.time = 0; this.running = true; this.paused = false; this.clock.getDelta();
    this._lock();
    this._raf = requestAnimationFrame(() => this._frame());
  }
  _lock() {
    try { const r = this.renderer.domElement.requestPointerLock(); r?.catch?.(() => this.pause()); } catch { this.pause(); }
    // "Tela cheia ao jogar": em tela cheia o navegador deixa o jogo segurar o teclado (Ctrl+W não fecha a aba ao agachar andando)
    if (this.settings.fullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(() => navigator.keyboard?.lock?.()).catch(() => {});
    } else if (this.settings.fullscreen) navigator.keyboard?.lock?.().catch?.(() => {});
  }
  pause() {
    if (!this.running || this.paused) return; this.paused = true; this.audio.stopLoops?.();
    if (this.range?.menuOpen) return;   // treino: o menu do E já está na tela (não mostra a pausa)
    this.hooks.onPause?.();
  }
  resume() { this.audio.init(); this._lock(); this._refreshGrips(); }
  /** Relê os ajustes salvos no Lab de Armas (assim o que você salvou no Lab vale na próxima partida / ao voltar da pausa, sem recarregar a página). */
  _refreshGrips() { loadGrips().then(() => { if (this.fpv) this.fpv.fs = null; if (this.held) this.held.snap = true; }).catch(() => {}); }

  /** XP da partida (patentes): +100 por abate, +30 por minuto jogado (até 20 min), +150 se terminou a partida. O treino não dá XP. */
  _matchXp() {
    if (!this.running || this.mode === 'training' || !this._t0) return null;
    const sc = this.bots?.scores.player || this.online?.myScore || { kills: 0, deaths: 0 };
    const min = Math.min(20, (performance.now() - this._t0) / 60000);
    if (min < .5 && !sc.kills) return null;   // entrou e saiu na hora: não conta
    const xp = sc.kills * 100 + Math.floor(min) * 30 + (this.finished ? 150 : 0);
    return { xp, kills: sc.kills, minutes: Math.floor(min), finished: !!this.finished };
  }
  stop() {
    const xp = this._matchXp(); this._t0 = 0; if (xp && xp.xp > 0) try { this.onXp?.(xp); } catch {}
    this.running = false; cancelAnimationFrame(this._raf);
    if (document.pointerLockElement) document.exitPointerLock();
    this.range?.dispose(); this.range = null;
    this.online?.dispose(); this.online = null;
    this.bots?.dispose(); this.bots = null;
    this.weapons?.dispose(); this.weapons = null;
    this.player?.dispose(); this.player = null;
    this.anim?.dispose(); this.anim = null; this.avatar = null; this.held?.dispose(); this.held = null; this.fpv?.dispose(); this.fpv = null;
    // modelos carregados de arquivo (mapa, personagens e suas cópias) ficam em memória para a próxima partida
    const keep = []; this.scene.traverse(o => { if (o.userData.asset || o.userData.instance) keep.push(o); });
    for (const o of keep) o.parent?.remove(o);
    this.scene.traverse(o => { o.geometry?.dispose(); o.dispose?.(); });
    this.sun?.shadow.map?.dispose(); this.mapBuilder?._headMat?.dispose(); this.mapBuilder = null; this.nav = null;
    this.scene.clear(); PM.disposeAll(); this.world.clear(); this.sun = null;
  }

  _playerDied(src) {
    this.player.dead = true; this.deadT = DEATH_DELAY;
    this.hooks.onPlayerDeath?.({ by: src.from?.name, weapon: src.weapon, head: src.zone === 'head', delay: DEATH_DELAY });
  }
  _respawnPlayer() {
    const sp = this.bots ? this.bots.spawnPointFor(this.bots.me) : this.online ? this.online.spawnPoint() : this.mapData.spawns.dm[0];
    this.player.respawn(new THREE.Vector3(sp.x, 0, sp.z), sp.yaw ?? 0);
    this.weapons.refill(); this.hooks.onRespawn?.();
  }

  _buildMap() {
    const s = this.scene;
    if (this.mode === 'training') return this._buildRange();
    s.background = new THREE.Color(0x8fa3b2); s.fog = new THREE.Fog(0x8fa3b2, 60, 160);
    s.add(new THREE.HemisphereLight(0xdfe8f0, 0x5a5248, 1.5));
    s.add(new THREE.AmbientLight(0xffffff, .35));
    const sun = this.sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(30, 60, 20); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 36, bottom: -36, near: 1, far: 140 });
    sun.shadow.bias = -.0005; sun.shadow.normalBias = .03; s.add(sun); this._applyQuality();
    this.mapData = buildMapData();
    this.mapBuilder = new MapBuilder(s); this.mapBuilder.build(this.mapData, this.world);
    this.nav = new Navigation(this.world, this.mapData.bounds, this.mapData.navSeed || this.mapData.spawns.attackers[0], this.mapData.navCell || 1);
    this._addMapModel();
  }

  /** Treino: stand de tiro fechado (FBX). Luz de dentro da sala (o teto tapa qualquer "sol" de fora). */
  _buildRange() {
    const s = this.scene;
    s.background = new THREE.Color(0x1a1f24); s.fog = null;
    s.add(new THREE.HemisphereLight(0xf4f6ff, 0x5a5650, 1.25));
    s.add(new THREE.AmbientLight(0xffffff, .45));
    const sun = this.sun = new THREE.DirectionalLight(0xfff6ea, 1.25);   // luz principal: das luminárias, um pouco atrás de quem atira
    sun.position.set(2.5, 2.85, -6.5); sun.target.position.set(-1, 0, 6); s.add(sun.target); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: .1, far: 30 });
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; s.add(sun); this._applyQuality();
    const fill = new THREE.DirectionalLight(0xdfe8ff, .5); fill.position.set(-3, 2.8, 6); s.add(fill);   // contra-luz do fundo (os bots não ficam pretos)
    this.mapData = buildRangeData();
    this.mapBuilder = new MapBuilder(s); this.mapBuilder.build(this.mapData, this.world);
    this.nav = new Navigation(this.world, this.mapData.bounds, this.mapData.navSeed, this.mapData.navCell || .5);
    const m = this.assets.range; if (m) this.scene.add(m);
  }

  /** Modelo 3D do mapa (GLB). O piso real do arquivo fica em y0; desloca para o piso ficar em y=0. */
  _addMapModel() {
    const m = this.assets.map; if (!m || !this.mapData.glb) return;
    m.position.set(0, -(this.mapData.y0 || 0), 0);
    if (!m.userData.prepared) {
      m.updateMatrixWorld(true); const box = new THREE.Box3();
      m.traverse(o => {
        if (!o.isMesh) return;
        box.setFromObject(o);
        o.receiveShadow = true;
        o.castShadow = box.min.y - (this.mapData.y0 || 0) < 5;   // telhado não projeta sombra (senão o galpão fica todo escuro)
        for (const mat of [].concat(o.material)) { mat.side = THREE.DoubleSide; if (mat.map) mat.map.anisotropy = 4; }   // o piso do arquivo está com a face virada para baixo
      });
      m.userData.prepared = true;
    }
    this.scene.add(m);
  }

  /** Personagem do jogador (Izzy) em 3ª pessoa. */
  _makeAvatar() {
    if (!this.assets.ready) return;
    const skin = this.loadout?.skin === 'bot' ? 'bot' : 'izzy';   // skin escolhida na mochila
    const { obj, clips } = this.assets.instance(skin);
    obj.scale.setScalar(.01);   // arquivo em centímetros
    this.avatar = obj; this.scene.add(obj);
    this.anim = new CharacterAnimator(obj, clips);
    this.weapons.onAction = (type, w, extra) => {
      if (type === 'shot') { this.anim.fire(this.player.crouch); this.held.muzzleFlash(!!w.auto, !!(this.weapons.scoped && w.ads)); this.held.shotKick(!!this.weapons.scoped); this.fpv?.shot(w); }
      else if (type === 'melee') { this.anim.hit(); this.fpv?.melee(); }
      else if (type === 'reload') this.anim.reload(extra, this.player.crouch);
      this.online?.localAction(type, w, extra);   // online: os amigos veem a animação e ouvem o som
    };
    this.held = new HeldWeapon(obj, this.assets.weapons, skin, { flashLight: true }); this.held.attachTo(this.scene);
    this.anim.withPose('fire', () => this.held.calibrate());   // mede a pegada da arma na pose de mira
    this._head = null; obj.traverse(n => { if (n.isBone && /Head$/.test(n.name)) this._head = n; });
    // 1ª pessoa (tecla V): braços e arma do Lab desenhados por cima do mapa
    this.fpv?.dispose(); this.fpv = new FirstPersonView(this.assets, skin);
    // cano para o CAMINHO do tiro: só quando a arma está de verdade no mapa (3ª pessoa, ou mira pela arma na 1ª pessoa)
    this.weapons.muzzle = () => { if (this.player.fp || !this.held.holder.visible || !this.held.cur) return null; return this.held.muzzleWorld; };
    // cano para o RASTRO: na 1ª pessoa os braços são desenhados por cima (outra cena), então o rastro começa
    // no ponto do mapa que aparece exatamente em cima do cano dos braços na tela
    this.weapons.visualMuzzle = () => (this.player.firstPerson && this.showVM && this.fpv) ? this.fpv.muzzleInWorld(this.camera, AIM.fpMuzzleDepth) : null;
  }
  _updateAvatar(dt) {
    const a = this.avatar, p = this.player; if (!a) return;
    const w = this.weapons.hud();
    if (w.aiming && !p.dead) this.anim.aimHold(p.crouch);
    // as animações de fuzil giram o corpo; quando a pose é de mira, o corpo gira até o cano apontar para a mira
    this.aimFix ??= { yaw: 0, pitch: 0 };
    const fix = this.aimFix, aimPose = this.anim.aiming && !w.melee && !p.dead;
    if (aimPose) {
      const e = this.held.aimError(p.yaw, p.pitch);
      const dz = v => Math.abs(v) < .035 ? 0 : v - Math.sign(v) * .035;   // zona morta: sem ela a correção "escorrega" devagar
      if (e) { e.yaw = dz(e.yaw); e.pitch = dz(e.pitch); const k = Math.min(1, dt * 10); fix.yaw = THREE.MathUtils.clamp(fix.yaw + THREE.MathUtils.clamp(e.yaw, -.6, .6) * k, -1.3, 1.3); fix.pitch = THREE.MathUtils.clamp(fix.pitch + THREE.MathUtils.clamp(e.pitch, -.5, .5) * k * .7, -.8, .8); }
    } else { const k = Math.exp(-dt * 5); fix.yaw *= k; fix.pitch *= k; }
    a.position.copy(p.pos); a.rotation.y = p.yaw + Math.PI + fix.yaw;   // modelo Mixamo olha para +z; yaw 0 do jogo olha para -z
    if (p.vault) { a.rotation.y = p.vault.yaw + Math.PI; fix.yaw = 0; }   // salto por cima: o corpo vai na direção do salto
    this.anim.update(dt, { speed: p.speed, fwd: p.localVel.fwd, side: p.localVel.side, crouch: p.crouch, air: !p.grounded,
      melee: w.melee, pistol: w.id === 'pistol', dead: p.dead, deadCrouch: p.crouch, vault: p.vault, pitch: p.dead ? 0 : (aimPose ? fix.pitch : p.pitch * .5) });
    // arma na mão (some na troca de arma, no meio da animação de troca)
    this.held.set(w.state === 'switch' && w.pending ? null : w.id);
    // mira pela arma: segue o p.aim (que entra e SAI suave); antes zerava num quadro ao soltar o botão e a arma pulava da mira para a mão
    const adsK = WEAPONS[w.id]?.ads && !p.dead ? Math.min(1, p.aim * 1.25) : 0;
    setScopeCut(w.id, adsK > .9);   // luneta aberta por dentro só com a mira pela arma assentada
    this.held.scene = this.anim.scene;   // ajuste da arma na mão salvo no Lab para a cena atual
    const fp1 = p.firstPerson;   // 1ª pessoa: o corpo some do mapa; a arma do mapa só aparece na mira pela arma (botão direito)
    this.held.update(!p.fp && !p.dead && !fp1, adsK > 0 ? this._ads(w.id, adsK) : null, dt);   // 1ª pessoa: a mira pela arma acontece nos braços (FirstPersonView)
    this.held.leftHandIK(!p.dead && !p.fp && !fp1 && adsK < .5 && w.state !== 'reload' && w.state !== 'switch' && !w.melee, dt);
    a.visible = !p.fp && !fp1 && adsK < .5;   // mirando pela arma: só a arma aparece, colada na frente da câmera
    this.showVM = fp1 && !p.fp && !!this.fpv;
    if (this.fpv && fp1) this.fpv.update(dt, { wid: w.id, switchK: w.switchK, switchIn: w.switchIn, speed: p.grounded ? p.speed : Math.min(p.speed, 2), air: !p.grounded,
      reloading: w.state === 'reload', reloadP: w.reloadP, aiming: !!w.aiming, reloadTime: WEAPONS[w.id]?.reload, reloadTotal: w.reloadTotal, adsK });
    // na mira pela arma a cabeça (e o cabelo) some, senão tampa a visão da câmera colada na arma
    if (this._head) this._head.scale.setScalar(p.aim > .3 && w.aiming ? .001 : 1);
  }
  /** Posição da arma na mira pela arma: o centro da mira (holográfico) fica bem na frente da câmera, alinhado ao centro da tela. */
  _ads(id, k) {
    const c = this.camera, cfg = WEAPON_MODELS[id]?.ads || {}, sc = cfg.sight ? { x: 0, ...cfg.sight } : this.held.cur?.userData.sightC;
    this._adsQ ??= new THREE.Quaternion(); this._adsP ??= new THREE.Vector3(); this._adsV ??= new THREE.Vector3();
    const q = this._adsQ.copy(c.quaternion).multiply(new THREE.Quaternion(0, 1, 0, 0));   // arma: +z = frente da câmera
    const target = this._adsP.set(0, cfg.up ?? 0, -(cfg.back ?? .17)).applyQuaternion(c.quaternion).add(c.position);
    if (sc) target.sub(this._adsV.set(sc.x + (cfg.dx ?? 0), sc.y + (cfg.dy ?? 0), sc.z).applyQuaternion(q));
    // recuo: a câmera inteira sobe (player.recoil) e a arma vai junto, presa à câmera: a mira continua no centro
    return { pos: target, quat: q, k };
  }

  _frame() {
    if (!this.running) return;
    this._raf = requestAnimationFrame(() => this._frame());
    const dt = Math.min(this.clock.getDelta(), .1);
    this.online?.update(dt);
    if (!this.paused) {
      let left = dt; while (left > 1e-6) { const d = Math.min(STEP, left); this.player.update(d); left -= d; }
      this.weapons.update(dt);
      this._updateAvatar(dt);
      this.bots?.update(dt);
      this.range?.update(dt);
      if (this.player.dead && (this.deadT -= dt) <= 0) this._respawnPlayer();
      this.time += dt;
    }
    if (this.player) this.player.firstPerson = !!this.settings.firstPerson && !this.player.dead;
    ensureWeaponEnv(this.renderer);
    this.renderer.render(this.scene, this.camera);
    if (this.showVM && this.player?.firstPerson) this.fpv.render(this.renderer, this.camera.aspect, this.camera.fov);   // braços e arma por cima
    this._fpsT += dt; this._fpsN++;
    if (this._fpsT >= .5) { this.fps = Math.round(this._fpsN / this._fpsT); this._fpsT = 0; this._fpsN = 0; }
    const p = this.player;
    this.hooks.onFrame?.({ fps: this.fps, time: this.time, health: Math.round(p.health), speed: p.speed, crouch: p.crouch, grounded: p.grounded,
      x: p.pos.x, z: p.pos.z, yaw: p.yaw, weapon: this.weapons.hud(), deadIn: p.dead ? Math.max(0, this.deadT) : 0,
      score: this.bots?.scores.player || this.online?.myScore });
  }
}
