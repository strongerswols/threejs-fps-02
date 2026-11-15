// RUSTLINE DEPOT — boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. Rounds run buy (15 s) -> live (100 s, bomb 35 s) -> end, first
// team to 5 round wins takes the match. ?shot=start|play|bomb|end with &seed=N sets up
// a deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createBody } from './physics.js';
import { createInput } from './input.js';
import { createWeapons, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createEconomy } from './economy.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const BUY_TIME = 15;
const ROUND_TIME = 100;
const WIN_ROUNDS = 5;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const effects = createEffects(scene);
const economy = createEconomy();
const weapons = createWeapons(camera, audio);
const bomb = createBomb(scene, world, audio);
const hud = createHud();
const playerBody = createBody(world.colliders, { position: world.spawns.player.clone() });
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 100;

// Invisible player hit volumes, so bot fire is a real raycast like the player's.
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), hitMat);
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), hitMat);
playerTorso.userData = { part: 'torso', isPlayer: true };
playerHead.userData = { part: 'head', isPlayer: true };
scene.add(playerTorso, playerHead);
const playerHitMeshes = [playerTorso, playerHead];

const api = {
  time: 0,
  fire: botFire,
  onPlanted(siteName) {
    bomb.plant(siteName);
    hud.setBomb(`BOMB PLANTED — SITE ${siteName}`);
    hud.showBanner(`BOMB PLANTED AT SITE ${siteName}`, 3000);
    hud.killFeed(`Rustjackals planted the bomb at site ${siteName}`, false);
  },
};
const bots = createBots(scene, world, audio, api);

const body = playerBody.state;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const seenEnemies = new Map();
let phase = 'buy';
let phaseTimer = BUY_TIME;
let round = 1;
let score = { vanguard: 0, rustjack: 0 };
let health = 100;
let playerAlive = true;
let elapsed = 0;
let frozen = false;
let started = false;
let overlayMode = 'start';
let buyMenuOpen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let stepDistance = 0;
let shake = 0;
let spectateBot = null;
let minimapTimer = 0;
const grenades = [];
const grenadeMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.09, 10, 8),
  new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1e22'), roughness: 0.4, metalness: 0.6 }),
);

function syncCamera() {
  if (!playerAlive && spectateBot && spectateBot.alive) {
    const s = spectateBot.body.state;
    camera.position.set(s.position.x, s.position.y + 1.55, s.position.z);
    camera.rotation.set(0, s.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (shake > 0) {
    camera.rotation.x += (random() - 0.5) * shake * 0.06;
    camera.rotation.y += (random() - 0.5) * shake * 0.06;
  }
}

function syncPlayerHitMeshes() {
  playerTorso.position.set(body.position.x, body.position.y + 1.0, body.position.z);
  playerTorso.rotation.y = body.yaw;
  playerHead.position.set(body.position.x, body.position.y + 1.53, body.position.z);
}

function getShootables() {
  return world.shootables.concat(bots.hitMeshes);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  muzzle.x += 0.2;
  muzzle.y -= 0.15;
  let anyHit = false;
  let anyKill = false;
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    const dir = direction.clone();
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, dir);
    const hit = raycaster.intersectObjects(getShootables(), false)[0];
    const end = hit ? hit.point : camera.position.clone().addScaledVector(dir, 60);
    effects.tracer(muzzle, end);
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const amount = Math.round(def.damage * (part === 'head' ? def.headMult : 1));
      const killed = bots.damage(bot, amount, part);
      seenEnemies.set(bot, elapsed);
      effects.hitSpark(hit.point);
      audio.hit();
      hud.hitMarker(killed, killed ? 300 : 120);
      if (killed) {
        anyKill = true;
        audio.kill();
        economy.earn(300);
        hud.killFeed(`You ▸ ${bot.name} [${def.name}]`, true);
        hud.setMoney(economy.state.money);
        if (bot.team === 'enemy' && bot.role === 'carrier') bots.promoteCarrier();
      }
      anyHit = true;
    }
  }
  weapons.pullTrigger();
  playerBody.recoil(0.009 + def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  bots.hear(body.position.x, body.position.z, 26);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, def.name);
  return anyHit || anyKill;
}

// A bot's shot: a real raycast from its muzzle toward its target's chest, with spread.
// Walls block it; the player and other bots are real hit volumes.
function botFire(bot, targetPos, spread) {
  const s = bot.body.state;
  const from = new THREE.Vector3(s.position.x, s.position.y + 1.45, s.position.z);
  const aim = new THREE.Vector3(targetPos.x, targetPos.y + 1.3, targetPos.z);
  const dir = aim.sub(from).normalize();
  dir.x += (random() * 2 - 1) * spread;
  dir.y += (random() * 2 - 1) * spread;
  dir.z += (random() * 2 - 1) * spread;
  dir.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(from, dir);
  const targets = world.shootables.concat(playerHitMeshes, bots.hitMeshes);
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point : from.clone().addScaledVector(dir, 60);
  effects.tracer(from, end);
  const dist = from.distanceTo(end);
  audio.enemyShot(dist);
  seenEnemies.set(bot, elapsed);
  if (!hit) return;
  if (hit.object.userData.isPlayer && playerAlive) {
    const amount = hit.object.userData.part === 'head' ? 20 : 10;
    damagePlayer(amount, from);
  } else if (hit.object.userData.bot && hit.object.userData.bot !== bot) {
    const victim = hit.object.userData.bot;
    if (victim.team !== bot.team) {
      const killed = bots.damage(victim, hit.object.userData.part === 'head' ? 24 : 10, hit.object.userData.part);
      if (killed) {
        hud.killFeed(`${bot.name} ▸ ${victim.name}`, bot.team === 'friendly');
        if (victim.team === 'enemy' && victim.role === 'carrier') bots.promoteCarrier();
      }
    }
  }
}

function damagePlayer(amount, fromPos) {
  if (!playerAlive) return;
  let remaining = amount;
  if (economy.state.armor > 0) {
    const absorbed = Math.min(economy.state.armor, Math.ceil(amount * 0.5));
    economy.state.armor -= absorbed;
    remaining -= absorbed;
  }
  health -= remaining;
  hud.hurt();
  audio.hurt();
  hud.setHealth(health, economy.state.armor);
  if (health <= 0) {
    health = 0;
    playerAlive = false;
    spectateBot = bots.bots.find((b) => b.alive && b.team === 'friendly') ?? null;
    hud.showBanner('YOU ARE DOWN', 3000);
    if (document.pointerLockElement) document.exitPointerLock();
    if (phase === 'live') {
      overlayMode = 'dead';
      hud.showOverlay('dead');
    }
  }
}

function throwGrenade() {
  if (!economy.useGrenade()) {
    audio.denied();
    return;
  }
  camera.getWorldDirection(direction);
  const mesh = grenadeMesh.clone();
  mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: direction.clone().multiplyScalar(17).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: 1.8,
    bounced: false,
  });
  audio.grenadeThrow();
  hud.setGrenades(economy.state.grenades);
}

function explodeGrenade(g) {
  const origin = g.mesh.position.clone();
  scene.remove(g.mesh);
  effects.explode(origin);
  audio.explosion();
  shake = 1;
  const radius = 6.5;
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.body.state.position.distanceTo(origin);
    if (d < radius) {
      const amount = Math.max(12, Math.round(110 * (1 - d / radius)));
      const killed = bots.damage(bot, amount, 'torso');
      seenEnemies.set(bot, elapsed);
      if (killed) {
        hud.killFeed(`You ▸ ${bot.name} [HE grenade]`, true);
        economy.earn(300);
        hud.setMoney(economy.state.money);
        if (bot.team === 'enemy' && bot.role === 'carrier') bots.promoteCarrier();
      }
    }
  }
  const pd = body.position.distanceTo(origin);
  if (pd < radius && playerAlive) damagePlayer(Math.round(55 * (1 - pd / radius)), origin);
}

const grenadeProbe = new THREE.Box3();
function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 14 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    const p = g.mesh.position;
    let bounced = false;
    if (p.y < 0.09) { p.y = 0.09; g.vel.y = Math.abs(g.vel.y) * 0.45; bounced = true; }
    grenadeProbe.min.set(p.x - 0.09, p.y - 0.09, p.z - 0.09);
    grenadeProbe.max.set(p.x + 0.09, p.y + 0.09, p.z + 0.09);
    for (const c of world.colliders) {
      if (!grenadeProbe.intersectsBox(c)) continue;
      // Reflect off the shallowest penetration axis.
      const px = Math.min(p.x + 0.09 - c.min.x, c.max.x - (p.x - 0.09));
      const pz = Math.min(p.z + 0.09 - c.min.z, c.max.z - (p.z - 0.09));
      if (px < pz) { g.vel.x *= -0.45; p.x += g.vel.x > 0 ? px : -px; }
      else { g.vel.z *= -0.45; p.z += g.vel.z > 0 ? pz : -pz; }
      bounced = true;
      break;
    }
    if (bounced && !g.bounced && g.vel.lengthSq() > 4) { g.bounced = true; audio.bounce(); }
    else if (!bounced) g.bounced = false;
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function startRound() {
  body.position.copy(world.spawns.player);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  body.eye = 1.6;
  health = 100;
  playerAlive = true;
  spectateBot = null;
  weapons.refillAmmo();
  bomb.reset();
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  const site = bots.spawnRound();
  void site;
  phase = 'buy';
  phaseTimer = BUY_TIME;
  buyMenuOpen = false;
  hud.showBuy(false);
  hud.setHealth(health, economy.state.armor);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.def().name);
  hud.setMoney(economy.state.money);
  hud.setGrenades(economy.state.grenades);
  hud.setScore(score.vanguard, score.rustjack, round);
  hud.setBomb('');
  hud.setTimer(phaseTimer, 'BUY PHASE');
  hud.showBanner(`ROUND ${round} — DEFEND THE SITES`, 2600);
}

function startMatch() {
  score = { vanguard: 0, rustjack: 0 };
  round = 1;
  economy.reset();
  startRound();
}

function endRound(won, reason) {
  if (phase !== 'live') return;
  phase = 'roundEnd';
  phaseTimer = 4;
  if (won) score.vanguard += 1; else score.rustjack += 1;
  economy.roundEnd(won, false);
  hud.setScore(score.vanguard, score.rustjack, round);
  hud.setMoney(economy.state.money);
  hud.showBanner(won ? `ROUND WON — ${score.vanguard} : ${score.rustjack}` : `ROUND LOST — ${score.vanguard} : ${score.rustjack}`, 3400);
  if (won) audio.roundWin(); else audio.roundLose();
  hud.killFeed(won ? `Round ${round} won — ${reason}` : `Round ${round} lost — ${reason}`, won);
}

function checkRoundEnd() {
  if (phase !== 'live') return;
  if (bomb.state.planted) {
    // With the bomb down, only defusal or detonation ends the round. If every
    // defender is down, fast-forward the timer so the round does not hang.
    if (!playerAlive && bots.aliveCount('friendly') === 0) bomb.state.timeLeft = Math.min(bomb.state.timeLeft, 3);
    return;
  }
  if (bots.aliveCount('enemy') === 0) endRound(true, 'team eliminated');
  else if (!playerAlive && bots.aliveCount('friendly') === 0) endRound(false, 'team eliminated');
  else if (phaseTimer <= 0) endRound(true, 'time — sites held');
}

function step(dt) {
  elapsed += dt;
  api.time = elapsed;
  if (phase === 'buy') {
    phaseTimer -= dt;
    if (phaseTimer <= 0) {
      phase = 'live';
      phaseTimer = ROUND_TIME;
      hud.showBuy(false);
      buyMenuOpen = false;
      hud.showBanner('GO — HOLD THE SITES', 2000);
    }
  } else if (phase === 'live') {
    phaseTimer -= dt;
    const bombEvent = bomb.step(dt);
    if (bombEvent === 'defused') {
      economy.earn(300);
      hud.setMoney(economy.state.money);
      endRound(true, 'bomb defused');
    } else if (bombEvent === 'exploded') {
      effects.explode(bomb.position());
      audio.explosion();
      shake = 1;
      endRound(false, 'bomb detonated');
    }
    if (playerAlive) {
      const keys = input.state.keys;
      const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      const before = body.position.clone();
      playerBody.step(dt, -sin * forward + cos * strafe, -cos * forward - sin * strafe, {
        crouch: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'),
        jump: keys.has('Space'),
      });
      const moved = body.position.distanceTo(before);
      stepDistance += moved;
      if (stepDistance > 2.4 && body.onGround) {
        stepDistance = 0;
        audio.step();
      }
      // Defuse: hold E within 1.8 m of the planted bomb.
      const defuseEl = document.getElementById('defuse');
      if (bomb.state.planted && keys.has('KeyE') && body.position.distanceTo(bomb.position()) < 1.8) {
        bomb.startDefuse();
        defuseEl.style.display = 'block';
        document.getElementById('defuse-fill').style.width = `${(bomb.state.defuseProgress / 5) * 100}%`;
      } else {
        bomb.stopDefuse();
        defuseEl.style.display = 'none';
      }
    }
    bots.step(dt, elapsed, {
      playerPos: body.position,
      playerEye: body.position.y + body.eye,
      playerAlive,
      playerHitMeshes,
      roundLive: true,
      bombPlanted: bomb.state.planted,
      bombExploded: bomb.state.exploded,
    });
    checkRoundEnd();
  } else if (phase === 'roundEnd') {
    phaseTimer -= dt;
    if (phaseTimer <= 0) {
      if (score.vanguard >= WIN_ROUNDS || score.rustjack >= WIN_ROUNDS) {
        phase = 'matchEnd';
        overlayMode = score.vanguard >= WIN_ROUNDS ? 'matchWin' : 'matchLose';
        hud.showOverlay(overlayMode);
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        round += 1;
        startRound();
      }
    }
  }
  weapons.step(dt);
  stepGrenades(dt);
  effects.step(dt);
  shake = Math.max(0, shake - dt * 2.2);
  syncPlayerHitMeshes();
}

function updateHud() {
  const def = weapons.def();
  hud.setHealth(health, economy.state.armor);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, def.name);
  hud.setMoney(economy.state.money);
  hud.setGrenades(economy.state.grenades);
  hud.setSpread(4 + weapons.spread(playerBody.groundSpeed()) * 900);
  if (phase === 'buy') hud.setTimer(phaseTimer, 'BUY PHASE');
  else if (phase === 'live' && bomb.state.planted) hud.setTimer(bomb.state.timeLeft, `BOMB — SITE ${bomb.state.site}`);
  else if (phase === 'live') hud.setTimer(phaseTimer, 'ROUND');
  else if (phase === 'roundEnd') hud.setTimer(phaseTimer, 'NEXT ROUND');
  minimapTimer -= 1 / 60;
  if (minimapTimer <= 0) {
    minimapTimer = 0.25;
    const cutoff = elapsed - 4;
    for (const [bot, t] of seenEnemies) if (t < cutoff) seenEnemies.delete(bot);
    hud.drawMinimap(
      world,
      body.position,
      body.yaw,
      bots.bots.filter((b) => b.team === 'friendly').map((b) => ({ pos: b.body.state.position, alive: b.alive })),
      bots.bots.filter((b) => b.team === 'enemy').map((b) => ({ pos: b.body.state.position, alive: b.alive, seen: seenEnemies.has(b) })),
      bomb.state.planted ? bomb.position() : null,
      bomb.state.planted,
    );
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    buyMenuOpen = false;
    hud.showBuy(false);
    hud.hideOverlay();
  } else if (phase !== 'matchEnd' && playerAlive && !buyMenuOpen) {
    overlayMode = started ? 'paused' : 'start';
    hud.showOverlay(overlayMode);
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (overlayMode === 'matchWin' || overlayMode === 'matchLose') {
    startMatch();
    overlayMode = 'start';
    input.requestLock();
    return;
  }
  if (overlayMode === 'dead') {
    hud.hideOverlay();
    return;
  }
  input.requestLock();
});

hud.onBuy((id) => {
  if (phase !== 'buy') return;
  let ok = false;
  if (id === 'grenade') ok = economy.buyGrenade();
  else if (id === 'armor') ok = economy.buyArmor();
  else if (WEAPONS[id]) {
    if (economy.spend(WEAPONS[id].price)) ok = weapons.buy(id, Infinity);
    if (ok) weapons.switchTo(id);
  }
  if (ok) {
    audio.buy();
    hud.setMoney(economy.state.money);
    hud.setGrenades(economy.state.grenades);
    hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.def().name);
    hud.setHealth(health, economy.state.armor);
  } else audio.denied();
  hud.setBuyState(economy.state.money, weapons.ownedIds());
});

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerAlive) playerBody.look(look.x, look.y);
    const firing = input.state.firing;
    const def = weapons.def();
    if (playerAlive && phase === 'live' && weapons.ready()) {
      if ((def.auto && firing) || (!def.auto && firing && !prevFiring)) shoot(weapons.spread(playerBody.groundSpeed()));
    } else if (playerAlive && phase === 'live' && firing && !prevFiring && weapons.ammo().mag === 0) {
      audio.dryFire();
    }
    prevFiring = firing;
    if (playerAlive && input.wasPressed('KeyR')) {
      if (weapons.reload()) hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, def.name);
    }
    if (playerAlive && input.wasPressed('KeyG')) throwGrenade();
    if (playerAlive && phase === 'buy' && input.wasPressed('KeyB')) {
      buyMenuOpen = !buyMenuOpen;
      hud.showBuy(buyMenuOpen);
      hud.setBuyState(economy.state.money, weapons.ownedIds());
      if (buyMenuOpen) input.exitLock();
      else input.requestLock();
    }
    if (playerAlive && input.wasPressed('Digit1')) weapons.switchTo('pistol');
    if (playerAlive && input.wasPressed('Digit2')) weapons.switchTo('rifle');
    if (playerAlive && input.wasPressed('Digit3')) weapons.switchTo('smg');
    if (playerAlive && input.wasPressed('Digit4')) weapons.switchTo('shotgun');
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    updateHud();
  }
  renderer.render(scene, camera);
  if (!window.__gameReady) window.__gameReady = true;
}

function settle(steps, ctx) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    updateHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  startMatch();
  if (name === 'start') {
    body.position.copy(world.spawns.player);
    body.yaw = 0;
    body.pitch = 0;
    syncCamera();
    hud.showOverlay('start');
    hud.setTimer(BUY_TIME, 'BUY PHASE');
    paintTwiceThenReady();
    return;
  }
  if (name === 'play') {
    phase = 'live';
    phaseTimer = ROUND_TIME;
    settle(240);
    body.position.set(0, 0, 6);
    body.yaw = 0;
    body.pitch = 0;
    let nearest = null;
    let nearestD = Infinity;
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 'enemy') continue;
      const d = bot.body.state.position.distanceTo(body.position);
      if (d < nearestD) { nearestD = d; nearest = bot; }
    }
    if (nearest) {
      const s = nearest.body.state;
      aimAt(new THREE.Vector3(s.position.x, s.position.y + 1.2, s.position.z));
      shoot(0);
      settle(6);
    }
    paintTwiceThenReady();
    return;
  }
  if (name === 'bomb') {
    phase = 'live';
    phaseTimer = ROUND_TIME;
    bomb.plant('A');
    bomb.state.timeLeft = 24;
    hud.setBomb('BOMB PLANTED — SITE A');
    settle(60);
    const carrier = bots.carrier();
    if (carrier) {
      carrier.body.state.position.set(-18, 0, -5.5);
      carrier.state = 'defend';
      carrier.group.position.copy(carrier.body.state.position);
    }
    body.position.set(-12.5, 0, -4.5);
    aimAt(new THREE.Vector3(-16, 0.6, -8));
    settle(6);
    paintTwiceThenReady();
    return;
  }
  // end: round won, one enemy down in the foreground.
  phase = 'roundEnd';
  phaseTimer = 4;
  score = { vanguard: 1, rustjack: 0 };
  hud.setScore(1, 0, 1);
  settle(120);
  const fallen = bots.bots.find((b) => b.team === 'enemy');
  if (fallen) {
    fallen.alive = false;
    fallen.fall = 1;
    fallen.group.rotation.x = -1.5;
    fallen.group.position.set(1.2, -0.05, 2.2);
  }
  body.position.set(0, 0, 5);
  aimAt(new THREE.Vector3(1.2, 0.3, 2.2));
  hud.showBanner('ROUND WON — 1 : 0', 60000);
  hud.setTimer(4, 'NEXT ROUND');
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
updateHud();
if (shot) runShot(shot);
else {
  startMatch();
  requestAnimationFrame(frame);
}
