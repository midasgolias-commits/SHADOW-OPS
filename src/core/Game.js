import * as THREE from 'three';
import { FirstPersonView } from '../player/FirstPersonView.js';
import { ProceduralAudio } from '../audio/ProceduralAudio.js';
import { Announcer } from '../audio/Announcer.js';
import { CollisionWorld } from '../world/CollisionWorld.js';
import { PlayerController } from '../player/PlayerController.js';
import { PM } from '../utils/ProceduralMaterials.js';
import { buildMapData, buildRangeData } from '../world/MapData.js';
import { buildCeleiro } from '../world/CeleiroMap.js';
import { FavelaMap } from '../world/FavelaMap.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
import { loadGrips, vmFor, VM_KIT } from '../weapons/Grips.js';
import { SETTINGS_DEFAULTS } from '../ui/Settings.js';
import { getLoadout, loadoutWeapons } from '../ui/Loadout.js';
import { GrenadeSystem } from '../weapons/Grenades.js';
import { recordMatch } from './Stats.js';

const DEATH_DELAY = 3.2; // segundos até o jogador reaparecer (o competitivo passa a usar rodadas na Parte 5)

const DEFAULTS = { sens: 1, fov: 80, volume: .6, quality: 'high', ...SETTINGS_DEFAULTS };
const STEP = 1 / 120; // passo fixo de física

/** CELEIRO: o visual é montado em tempo de execução (geometria própria + 6 GLBs + texturas).
 *  Monta uma vez e reaproveita entre partidas (o grupo é preservado no stop(), como os modelos de assets). */
let _celeiro = null;
function getCeleiro() {
  if (!_celeiro) _celeiro = buildCeleiro(THREE, { basePath: 'assets/maps/celeiro/', GLTFLoader });
  return _celeiro;
}
/** FAVELA: o visual (≈26 MB de malhas e texturas, mapa recortado) carrega uma vez, antes da primeira partida no mapa (main.js mostra a barra). */
let _favela = null;
export function getFavela() { return _favela || (_favela = new FavelaMap('assets/maps/favela/')); }

export class Game {
  constructor(host) {
    this.hooks = {}; this.mode = null; this.running = false; this.paused = false;
    this.settings = this._load();
    this.audio = new ProceduralAudio(); this.audio.setVolume(this.settings.volume);
    this.audio.setCategoria('armas', this.settings.volArmas ?? 1); this.audio.setCategoria('ambiente', this.settings.volAmbiente ?? 1);
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
    addEventListener('keydown', e => {   // F: inspecionar a arma (viewmodel novo da pistola, 1ª pessoa)
      if (e.code === 'KeyF' && !e.repeat && this.running && !this.paused && document.pointerLockElement && !this.nades?.equipped && this.weapons?.state === 'ready') this.fpv?.inspect();
    });
    addEventListener('keydown', e => {   // V: alterna 1ª / 3ª pessoa
      if (e.code === 'KeyV' && !e.repeat && this.running && !this.paused && document.pointerLockElement) { this.setSetting('firstPerson', !this.settings.firstPerson); this.hooks.onView?.(this.settings.firstPerson); }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) { this.paused = false; this.hooks.onResume?.(); }
      else if (this.running && !this.paused) this.pause();
    });
  }

  _load() {
    let s; try { s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('shadowops.settings') || '{}') }; } catch { s = { ...DEFAULTS }; }
    // câmera nova (enquadramento do PUBG): quem tinha a câmera antiga salva recebe o padrão novo uma vez; depois pode ajustar à vontade
    if (s.camVer !== 2) { Object.assign(s, { camDist: DEFAULTS.camDist, camSide: DEFAULTS.camSide, camHeight: DEFAULTS.camHeight, fov: DEFAULTS.fov, camVer: 2 }); try { localStorage.setItem('shadowops.settings', JSON.stringify(s)); } catch {} }
    return s;
  }
  setSetting(k, v) {
    this.settings[k] = v;
    try { localStorage.setItem('shadowops.settings', JSON.stringify(this.settings)); } catch {}
    if (k === 'fov') { this.camera.fov = vfov(v, this.camera.aspect); this.camera.updateProjectionMatrix(); }
    if (k === 'volume') this.audio.setVolume(v);
    if (k === 'volArmas') this.audio.setCategoria('armas', v);
    if (k === 'volAmbiente') this.audio.setCategoria('ambiente', v);
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
    this.matchWon = null; this._ms = { hs: 0, dmg: 0, assists: 0, hit: new Set() };   // carreira (Stats.js): o fim da partida põe finished/matchWon
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
    this.player.respawn(new THREE.Vector3(pt.x, pt.y || 0, pt.z), pt.yaw);   // y: piso do ponto nos mapas de morro (FAVELA)
    this.player.vaultCurve = this.assets.clips.knife_vault?.userData?.root || null;   // caminho do Big Jump (salto por cima)
    this.camera.fov = vfov(this.settings.fov, this.camera.aspect); this.camera.updateProjectionMatrix();
    // Parte 3: todas as armas liberadas em todos os modos (a economia do competitivo restringe isso na Parte 5)
    this.weapons = new WeaponSystem({
      camera: this.camera, scene: this.scene, world: this.world, player: this.player, audio: this.audio,
      settings: this.settings, hooks: this.hooks, active: () => this.running && !this.paused && !this.player.dead && !!document.pointerLockElement && !this.nades?.equipped,   // granada na mão: a arma não atira
      loadout: loadoutWeapons(this.loadout = config?.loadout || getLoadout()),   // só as 3 armas da mochila (1 principal, 2 secundária, 3 faca)
      infiniteAmmo: mode === 'training'   // treino: munição infinita
    });
    // carreira: todo alvo (bots, amigos online) entra por addHitTester; o dano que EU causo passa por _dealt
    const addT = this.weapons.addHitTester.bind(this.weapons);
    this.weapons.addHitTester = fn => addT((o, d, max) => { const r = fn(o, d, max); if (r?.damage) { const dmg = r.damage; r.damage = (n, info) => this._dealt(r.who, n, info?.zone, () => dmg(n, info)); } return r; });
    this._makeAvatar();
    // Parte 4: bots (só quando a sala tem bots; o treino ainda não tem)
    this.deadT = 0; this.bots = null;
    if (config?.bots?.length) {
      this.bots = new BotManager({ scene: this.scene, world: this.world, nav: this.nav, map: this.mapData, player: this.player,
        weapons: this.weapons, audio: this.audio, camera: this.camera, hooks: this.hooks, cfg: config, assets: this.assets,
        onPlayerDeath: src => this._playerDied(src) });
      this.weapons.onShot = w => this.bots.playerShot(w);
      this.bots.spawnAll();
      // assistência: bot que eu acertei e outro matou
      const bk = this.bots.botKilled.bind(this.bots), meA = this.bots.me;
      this.bots.botKilled = (b, src) => { const ms = this._ms; if (ms?.hit.delete(b) && src?.from !== meA) ms.assists++; return bk(b, src); };
    }
    this.range = mode === 'training' ? new RangeTraining(this) : null;   // treino: bots-alvo, botão do menu (E), todas as armas
    this.online = config?.online ? new OnlineMatch(this, config.online) : null;   // online: os amigos (Net.js / OnlineMatch.js)
    if (this.online) {   // online: quem morre avisa se foi na cabeça (meu tiro só manda o dano, não sabe se matou)
      const om = this.online, msg = om._msg.bind(om);
      om._msg = m => { if (m?.t === 'ev' && m.e === 'death' && m.killer === om.me && m.victim !== om.me && m.head && this._ms) this._ms.hs++; return msg(m); };
    }
    this._makeGrenades(mode);
    this.hooks.onStart?.(this.mapData);
    this.time = 0; this.running = true; this.paused = false; this.clock.getDelta();
    this._lock();
    this._raf = requestAnimationFrame(() => this._frame());
  }
  /** Granada (tecla 4 / G): física, prévia do arco e dano em área ligados aos alvos que existem nesta partida. */
  _makeGrenades(mode) {
    this.nades = null;
    if (!this.assets.grenade) { console.error('Granada indisponível: o modelo não carregou.'); return; }
    const N = this.nades = new GrenadeSystem(this, this.assets.grenade, { infinite: mode === 'training' });
    const me = this.player;
    if (mode !== 'training') N.addAreaTarget(() => [{ key: 'me', name: 'você', pos: me.pos, alive: !me.dead, hurt: n => this._selfBlast(n) }]);
    if (this.bots) N.addAreaTarget(() => this.bots.bots.filter(b => b.alive && this.bots.isEnemy(this.bots.me, b)).map(b => ({ key: b, name: b.name, pos: b.pos, alive: true,
      hurt: n => this._dealt(b, n, 'body', () => b.takeDamage(n, { from: this.bots.me, zone: 'body', weapon: 'grenade', dist: 0 })) })));
    if (this.range) N.addAreaTarget(() => this.range.dummies.filter(b => b.on).map(b => ({ key: b, name: b.name, pos: b.pos, alive: true,
      hurt: n => { b.hit(n, 'body'); this.hooks.onRangeHit?.({ bot: b.name, damage: n, zone: 'body', total: b.total, hits: b.hits }); } })));
    if (this.online) N.addAreaTarget(() => [...this.online.remotes.values()].filter(r => r.alive && r.seen).map(r => ({ key: r, name: r.name, pos: r.pos, alive: true,
      hurt: n => this._dealt(r, n, 'body', () => this.online.net.sendGame({ t: 'ev', e: 'hit', to: r.id, dmg: n, zone: 'body', w: 'grenade' })) })));
  }
  /** Dano da minha própria granada (sem ponto de abate para mim). */
  _selfBlast(n) {
    const p = this.player; if (p.dead || p.health <= 0) return;
    p.health = Math.max(0, p.health - n);
    this.hooks.onDamage?.({ damage: n, angle: 0, from: 'sua granada', health: p.health });
    if (p.health > 0) return;
    const name = this.config?.me?.name || 'Você';
    if (this.bots) this.bots.scores.player.deaths++;
    if (this.online) { const o = this.online, sc = o.scores[o.me]; if (sc) sc.deaths++; o.net.sendGame({ t: 'ev', e: 'death', victim: o.me, vName: o.net.name, killer: o.me, kName: o.net.name, w: 'grenade', head: false }); }
    this.hooks.onKill?.({ killer: name, victim: name, weapon: 'grenade', head: false, killerIsMe: false, victimIsMe: true });
    this._playerDied({ from: { name }, weapon: 'grenade', zone: 'body' });
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
  /** Carreira: dano que eu causei (sem passar da vida que o alvo tinha), abate na cabeça e quem eu acertei (para assistência). */
  _dealt(who, n, zone, fn) {
    const hp = typeof who?.hp === 'number' ? Math.max(0, who.hp) : n, res = fn(), ms = this._ms;
    if (ms) { ms.dmg += Math.min(n, hp); if (who) ms.hit.add(who); if (res?.kill && zone === 'head') ms.hs++; }
    return res;
  }
  /** Carreira (Stats.js): grava a partida uma vez, no stop() (fim ou saída no meio). O treino não conta (Stats.js também ignora). */
  _recordStats() {
    if (!this.running || !this._t0 || (this.mode !== 'competitive' && this.mode !== 'deathmatch')) return;
    const sc = this.bots?.scores.player || this.online?.myScore || { kills: 0, deaths: 0 }, ms = this._ms || {};
    try { recordMatch({ mode: this.mode, map: this.config?.mapId || 'warehouse', kills: sc.kills, deaths: sc.deaths, assists: ms.assists || 0,
      headshots: ms.hs || 0, damage: ms.dmg || 0, won: this._won(sc), minutes: (performance.now() - this._t0) / 60000, online: !!this.online }); } catch {}
    this._ms = null;
  }
  /** Venceu? Só com a partida terminada (this.finished). matchWon (o fim da partida põe) manda; sem ele, no mata-mata vale o maior placar. */
  _won(sc) {
    if (!this.finished) return null;   // saiu no meio: não sabe
    if (typeof this.matchWon === 'boolean') return this.matchWon;
    if (this.mode !== 'deathmatch') return null;   // competitivo: precisa do resultado das rodadas (Parte 5)
    const all = Object.values(this.bots?.scores || this.online?.scores || {}), top = Math.max(0, ...all.map(s => s.kills || 0));
    return sc.kills > 0 && sc.kills >= top;
  }
  stop() {
    this._recordStats();
    const xp = this._matchXp(); this._t0 = 0; if (xp && xp.xp > 0) try { this.onXp?.(xp); } catch {}
    this.running = false; cancelAnimationFrame(this._raf);
    if (document.pointerLockElement) document.exitPointerLock();
    this.range?.dispose(); this.range = null;
    this.nades?.dispose(); this.nades = null;
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
    this.nades?.reset();
    this.player.dead = true; this.deadT = DEATH_DELAY;
    this.hooks.onPlayerDeath?.({ by: src.from?.name, weapon: src.weapon, head: src.zone === 'head', delay: DEATH_DELAY });
  }
  _respawnPlayer() {
    const sp = this.bots ? this.bots.spawnPointFor(this.bots.me) : this.online ? this.online.spawnPoint() : this.mapData.spawns.dm[0];
    this.player.respawn(new THREE.Vector3(sp.x, sp.y || 0, sp.z), sp.yaw ?? 0);
    this.weapons.refill(); this.nades?.reset(); this.nades?.refill(); this.hooks.onRespawn?.();
  }

  _buildMap() {
    const s = this.scene;
    this.camera.near = .05; this.camera.far = 300;   // galpões e treino: perto e curto (a FAVELA muda isso)
    if (this.mode === 'training') return this._buildRange();
    const mapId = this.config?.mapId || 'warehouse';
    if (mapId === 'favela') return this._buildFavela();
    const celeiro = mapId === 'celeiro';
    const sky = celeiro ? 0x9fb8c9 : 0x8fa3b2;
    s.background = new THREE.Color(sky); s.fog = new THREE.Fog(sky, celeiro ? 70 : 60, celeiro ? 190 : 160);
    s.add(new THREE.HemisphereLight(0xdfe8f0, 0x5a5248, 1.5));
    s.add(new THREE.AmbientLight(0xffffff, .35));
    const sun = this.sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(30, 60, 20); sun.castShadow = true;
    Object.assign(sun.shadow.camera, celeiro
      ? { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 170 }   // mapa maior: 50 x 86 m
      : { left: -48, right: 48, top: 36, bottom: -36, near: 1, far: 140 });
    sun.shadow.bias = -.0005; sun.shadow.normalBias = .03; s.add(sun); this._applyQuality();
    this.mapData = buildMapData(mapId);
    this.mapBuilder = new MapBuilder(s); this.mapBuilder.build(this.mapData, this.world);
    this.nav = new Navigation(this.world, this.mapData.bounds, this.mapData.navSeed || this.mapData.spawns.attackers[0], this.mapData.navCell || 1);
    this._addMapModel();
  }

  /** FAVELA: morro a céu aberto. Céu e névoa longe (dá para ver o morro todo), sol de fim de tarde vindo do noroeste
   *  (o mesmo da Unreal) com a sombra acompanhando o jogador, terreno como mapa de alturas e navegação em 2,5D. */
  _buildFavela() {
    const s = this.scene, sky = 0xb9c6cf;
    this.camera.near = .1; this.camera.far = 3000;   // vê o morro inteiro; .1 perto mantém a precisão da profundidade ao longe
    s.background = new THREE.Color(0x9fb4c4); s.fog = new THREE.Fog(sky, 180, 2600);
    s.add(new THREE.HemisphereLight(0xbfd4e6, 0x6b5a45, 1.3));
    s.add(new THREE.AmbientLight(0xffffff, .25));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
    this._sunDir = new THREE.Vector3(-0.513, 0.743, -0.430).normalize();
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 900 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .4; s.add(sun, sun.target); this._applyQuality();
    this.mapData = buildMapData('favela');
    this.mapBuilder = new MapBuilder(s); this.mapBuilder.build(this.mapData, this.world);
    this.world.setTerrain(this.mapData.terrain);
    this.nav = new Navigation(this.world, this.mapData.bounds, this.mapData.navSeed, this.mapData.navCell, this.mapData.floorAt);
    const fav = getFavela();
    if (fav.ready) s.add(fav.group);
    else console.error('FAVELA: o visual ainda não carregou (main.js carrega antes da partida).');
  }
  /** FAVELA, a cada quadro: a caixa de sombra do sol segue o jogador (em passos de texel, sem tremer) e as árvores perto viram modelo cheio. */
  _favelaFrame() {
    const p = this.player?.pos, sun = this.sun; if (!p || !sun) return;
    const S = sun.shadow.camera.right, tx = (2 * S) / sun.shadow.mapSize.x;
    const fx = Math.round(p.x / tx) * tx, fz = Math.round(p.z / tx) * tx;
    sun.target.position.set(fx, p.y, fz); sun.position.set(fx, p.y, fz).addScaledVector(this._sunDir, 450);
    getFavela().update(this.camera.position);
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
    if (this.mapData.visual === 'celeiro') {   // CELEIRO: visual montado por CeleiroMap.js (geometria própria + GLBs)
      const cel = getCeleiro();
      cel.group.userData.asset = true;   // o grupo é preservado no stop(), como os modelos de assets
      this.scene.add(cel.group);
      return;
    }
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
    const skin = this.assets.chars[this.loadout?.skin] ? this.loadout.skin : 'izzy';   // skin escolhida na mochila (qualquer personagem carregado)
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
    this.held = new HeldWeapon(obj, this.assets.weapons, skin, { flashLight: true, skins: true }); this.held.attachTo(this.scene);
    this.anim.withPose('fire', () => this.held.calibrate());   // mede a pegada da arma na pose de mira
    this._head = null; obj.traverse(n => { if (n.isBone && /Head$/.test(n.name)) this._head = n; });
    // 1ª pessoa (tecla V): braços e arma do Lab desenhados por cima do mapa
    this.fpv?.dispose(); this.fpv = new FirstPersonView(this.assets, skin);
    // viewmodel novo da pistola (carrega em segundo plano; quando chegar, a pistola passa a usar ele na 1ª pessoa)
    // pacotes de 1ª pessoa (braços DO PERSONAGEM escolhido): a FirstPersonView pede quando a arma aparece; enquanto carrega, a arma não aparece
    const fpvNow = this.fpv;
    fpvNow.loadVM = wid => { const kit = vmFor(wid).kit;
      (wid === 'pistol' ? this.assets.loadPistolKit(kit, skin) : this.assets.loadKit(kit, skin))
        .then(rig => { if (this.fpv === fpvNow) fpvNow.setVM(wid, rig, kit); }).catch(() => {}).finally(() => fpvNow.vmPending.delete(wid)); };
    for (const w of this.weapons.loadout) if (VM_KIT[w]) { (fpvNow._vmPedido ??= new Set()).add(w); fpvNow.vmPending.add(w); fpvNow.loadVM(w); }
    // kits com os braços DO PERSONAGEM escolhido (gerados por _fonte/bracos/gerar_todos.py para cada personagem)
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
      melee: w.melee, pistol: WEAPONS[w.id]?.kind === 'Pistola', dead: p.dead, deadCrouch: p.crouch, vault: p.vault, pitch: p.dead ? 0 : (aimPose ? fix.pitch : p.pitch * .5) });
    // arma na mão (some na troca de arma, no meio da animação de troca)
    const nadeEq = !!this.nades?.equipped;
    this.held.set(nadeEq || (w.state === 'switch' && w.pending) ? null : w.id);   // granada na mão: a arma some
    // mira pela arma: segue o p.aim (que entra e SAI suave); antes zerava num quadro ao soltar o botão e a arma pulava da mira para a mão
    const adsK = WEAPONS[w.id]?.ads && !p.dead ? Math.min(1, p.aim * 1.25) : 0;
    setScopeCut(w.id, adsK > .9);   // luneta aberta por dentro só com a mira pela arma assentada
    this.held.scene = this.anim.scene;   // ajuste da arma na mão salvo no Lab para a cena atual
    const fp1 = p.firstPerson;   // 1ª pessoa: o corpo some do mapa; a arma do mapa só aparece na mira pela arma (botão direito)
    this.held.update(!p.fp && !p.dead && !fp1, adsK > 0 ? this._ads(w.id, adsK) : null, dt);   // 1ª pessoa: a mira pela arma acontece nos braços (FirstPersonView)
    this.held.leftHandIK(!p.dead && !p.fp && !fp1 && adsK < .5 && w.state !== 'reload' && w.state !== 'switch' && !w.melee && !nadeEq, dt);
    a.visible = !p.fp && !fp1 && adsK < .5;   // mirando pela arma: só a arma aparece, colada na frente da câmera
    this.showVM = fp1 && !p.fp && !!this.fpv;
    if (this.fpv && fp1) this.fpv.update(dt, { wid: w.id, switchK: nadeEq ? 1 : w.switchK, switchIn: nadeEq ? false : w.switchIn, speed: p.grounded ? p.speed : Math.min(p.speed, 2), air: !p.grounded,
      reloading: w.state === 'reload', reloadP: w.reloadP, mag: w.mag, aiming: !!w.aiming, reloadTime: WEAPONS[w.id]?.reload, reloadTotal: w.reloadTotal, adsK });
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
      this.nades?.update(dt);
      this._updateAvatar(dt);
      this.bots?.update(dt);
      this.range?.update(dt);
      if (this.player.dead && (this.deadT -= dt) <= 0) this._respawnPlayer();
      this.time += dt;
    }
    if (this.player) this.player.firstPerson = !!this.settings.firstPerson && !this.player.dead;
    this.nades?.applyShake(this.camera);
    if (this.mapData?.visual === 'favela') this._favelaFrame();
    ensureWeaponEnv(this.renderer);
    this.renderer.render(this.scene, this.camera);
    if (this.showVM && this.player?.firstPerson) this.fpv.render(this.renderer, this.camera.aspect, this.camera.fov);   // braços e arma por cima
    this._fpsT += dt; this._fpsN++;
    if (this._fpsT >= .5) { this.fps = Math.round(this._fpsN / this._fpsT); this._fpsT = 0; this._fpsN = 0; }
    const p = this.player;
    this.hooks.onFrame?.({ fps: this.fps, time: this.time, health: Math.round(p.health), speed: p.speed, crouch: p.crouch, grounded: p.grounded,
      x: p.pos.x, z: p.pos.z, yaw: p.yaw, weapon: this.weapons.hud(), nade: this.nades?.hud(), deadIn: p.dead ? Math.max(0, this.deadT) : 0,
      score: this.bots?.scores.player || this.online?.myScore });
  }
}
