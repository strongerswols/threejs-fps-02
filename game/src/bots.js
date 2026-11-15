// The bots: two teams, one brain each. Every bot walks the world's waypoint graph,
// sees through a real raycast, hears gunfire, holds angles, strafes while it shoots,
// and the enemy carrier walks to a bomb site and plants. Friendly bots hold the sites
// with the player. Difficulty is honest: bots aim with spread and reaction time, and
// they miss when the player moves — the same spread rule the player plays by.
import * as THREE from 'three';
import { createBody } from './physics.js';
import { PALETTE } from './palette.js';

const ENEMY_NAMES = ['Vex', 'Marrow', 'Grit', 'Sable'];
const FRIENDLY_NAMES = ['Iris', 'Juno'];
const ENEMY_COLOR = PALETTE.rust;
const FRIENDLY_COLOR = PALETTE.teal;

function buildBotMesh(teamColor) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2b2f36'), roughness: 0.7, metalness: 0.15 });
  const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.5, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#15171b'), roughness: 0.8 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), suit);
  legL.position.set(-0.11, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
  torso.position.y = 1.12;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.34, 0.32), trim);
  vest.position.y = 1.18;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), dark);
  head.position.y = 1.58;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), trim);
  visor.position.set(0, 1.6, -0.13);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.18, 1.28, -0.28);
  group.add(legL, legR, torso, vest, head, visor, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  return { group, torso, head };
}

export function createBots(scene, world, audio, api) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const bots = [];
  const hitMeshes = [];
  const temp = new THREE.Vector3();
  const eyePos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();

  function makeBot(team, name, spawn, role) {
    const color = team === 'enemy' ? ENEMY_COLOR : FRIENDLY_COLOR;
    const { group, torso, head } = buildBotMesh(color);
    group.position.copy(spawn);
    scene.add(group);
    const body = createBody(world.colliders, {
      position: spawn.clone(), walkSpeed: team === 'enemy' ? 3.7 : 3.4, standHeight: 1.72,
    });
    const bot = {
      team, name, role, body, group, torso, head,
      health: 100, alive: true, fall: 0,
      state: 'patrol', path: [], pathIndex: 0,
      target: null, lastKnown: null, seenAt: -10, reactAt: 0,
      burstLeft: 0, burstTimer: 0, pauseTimer: 0, strafeDir: 1, strafeTimer: 0,
      plantTimer: 0, holdNode: null, perceiveAt: Math.random() * 0.15,
      aimError: 0.02 + Math.random() * 0.012,
    };
    torso.userData = { bot, part: 'torso' };
    head.userData = { bot, part: 'head' };
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function setPath(bot, targetId) {
    bot.path = world.waypoints.findPath(bot.body.state.position.x, bot.body.state.position.z, targetId);
    bot.pathIndex = 0;
  }

  function setPathToPoint(bot, x, z) {
    const node = world.waypoints.nearestNode(x, z);
    setPath(bot, node.id);
    bot.path.push({ x, z });
  }

  // True line of sight: a ray from the bot's eye to the target's chest, blocked by any
  // world surface in between.
  function canSee(bot, point) {
    const s = bot.body.state;
    eyePos.set(s.position.x, s.position.y + 1.55, s.position.z);
    temp.copy(point).sub(eyePos);
    const dist = temp.length();
    if (dist > 55) return false;
    temp.normalize();
    raycaster.set(eyePos, temp);
    const hits = raycaster.intersectObjects(world.shootables, false);
    return hits.length === 0 || hits[0].distance > dist - 0.4;
  }

  function spawnRound(plantSite) {
    for (const bot of bots) {
      scene.remove(bot.group);
      const iT = hitMeshes.indexOf(bot.torso);
      if (iT !== -1) hitMeshes.splice(iT, 1);
      const iH = hitMeshes.indexOf(bot.head);
      if (iH !== -1) hitMeshes.splice(iH, 1);
    }
    bots.length = 0;
    const carriers = ['aSite', 'bSite'];
    const site = plantSite || carriers[Math.floor(Math.random() * 2)];
    world.spawns.enemy.forEach((spawn, i) => {
      const bot = makeBot('enemy', ENEMY_NAMES[i], spawn, i === 0 ? 'carrier' : 'rusher');
      bot.plantSite = site;
      setPath(bot, i === 0 ? site : (i % 2 === 0 ? 'aLong1' : 'bLong1'));
    });
    world.spawns.friendly.forEach((spawn, i) => {
      const bot = makeBot('friendly', FRIENDLY_NAMES[i], spawn, 'holder');
      bot.holdNode = i === 0 ? 'aLong2' : 'bLong2';
      setPath(bot, bot.holdNode);
    });
    return site;
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    // A hit snaps a bot to its attacker: it turns, and it remembers where the shot came from.
    if (bot.state !== 'engage') {
      bot.state = 'engage';
      bot.reactAt = api.time + 0.25;
    }
    if (bot.health <= 0) {
      bot.alive = false;
      bot.fall = 0;
      bot.health = 0;
      return true;
    }
    return false;
  }

  function hear(x, z, radius) {
    for (const bot of bots) {
      if (!bot.alive || bot.team !== 'enemy') continue;
      const s = bot.body.state;
      const d = Math.hypot(s.position.x - x, s.position.z - z);
      if (d < radius && bot.state !== 'engage') {
        bot.lastKnown = new THREE.Vector3(x, 0, z);
        bot.state = 'investigate';
        setPathToPoint(bot, x, z);
      }
    }
  }

  function stepBot(bot, dt, time, ctx) {
    const s = bot.body.state;
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.45);
      bot.group.rotation.x = -bot.fall * 1.5;
      bot.group.position.y = -bot.fall * 0.1;
      return;
    }
    bot.group.rotation.x = 0;
    bot.group.position.y = s.position.y;

    // --- Perception, staggered so six bots never raycast on the same tick. ---
    bot.perceiveAt -= dt;
    let enemyVisible = null;
    if (bot.perceiveAt <= 0) {
      bot.perceiveAt = 0.15;
      const foes = bot.team === 'enemy'
        ? [{ pos: ctx.playerPos, eye: ctx.playerEye, alive: ctx.playerAlive, kind: 'player' }].concat(
          bots.filter((b) => b.alive && b.team === 'friendly').map((b) => ({ pos: b.body.state.position, eye: b.body.state.position.y + 1.4, alive: true, kind: 'bot', bot: b })),
        )
        : bots.filter((b) => b.alive && b.team === 'enemy').map((b) => ({ pos: b.body.state.position, eye: b.body.state.position.y + 1.4, alive: true, kind: 'bot', bot: b }));
      for (const foe of foes) {
        if (!foe.alive) continue;
        targetPos.set(foe.pos.x, foe.eye, foe.pos.z);
        if (canSee(bot, targetPos)) { enemyVisible = foe; break; }
      }
      if (enemyVisible) {
        bot.target = enemyVisible;
        bot.lastKnown = new THREE.Vector3(enemyVisible.pos.x, 0, enemyVisible.pos.z);
        bot.seenAt = time;
        if (bot.state !== 'engage') {
          bot.state = 'engage';
          bot.reactAt = time + 0.35 + Math.random() * 0.35;
        }
      } else if (bot.state === 'engage' && time - bot.seenAt > 2.5) {
        bot.state = bot.team === 'enemy' && bot.role === 'carrier' ? 'advance' : 'investigate';
        bot.target = null;
        if (bot.lastKnown) setPathToPoint(bot, bot.lastKnown.x, bot.lastKnown.z);
      }
    }

    // --- Planting: the carrier stops inside the site and plants for 3.5 s. ---
    if (bot.team === 'enemy' && bot.role === 'carrier' && ctx.roundLive && !ctx.bombPlanted && !ctx.bombExploded) {
      const site = world.sites[bot.plantSite === 'aSite' ? 'A' : 'B'];
      const inSite = s.position.x > site.min.x && s.position.x < site.max.x && s.position.z > site.min.z && s.position.z < site.max.z;
      if (inSite && bot.state !== 'engage') {
        bot.state = 'plant';
        bot.plantTimer += dt;
        if (Math.floor(bot.plantTimer * 2) !== Math.floor((bot.plantTimer - dt) * 2)) audio.beep(false);
        if (bot.plantTimer >= 3.5) {
          bot.plantTimer = 0;
          bot.state = 'defend';
          api.onPlanted(bot.plantSite === 'aSite' ? 'A' : 'B');
        }
        bot.body.step(dt, 0, 0, {});
        bot.group.position.copy(s.position);
        bot.group.rotation.y = s.yaw;
        return;
      }
      if (bot.state === 'plant') bot.state = 'advance';
    }

    // --- Movement: follow the path, strafe while engaging, hold when defending. ---
    let wishX = 0;
    let wishZ = 0;
    let crouch = false;
    const speed = bot.body.groundSpeed();
    if (bot.state === 'engage' && bot.target) {
      const tp = bot.target.pos;
      const dx = tp.x - s.position.x;
      const dz = tp.z - s.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      s.yaw = Math.atan2(-dx, -dz);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = 0.4 + Math.random() * 0.5;
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      // Close in if far, back off if point-blank, strafe in between.
      const forward = dist > 18 ? 1 : dist < 5 ? -0.6 : 0;
      const strafe = bot.strafeDir * 0.8;
      const sin = Math.sin(s.yaw);
      const cos = Math.cos(s.yaw);
      wishX = -sin * forward + cos * strafe;
      wishZ = -cos * forward - sin * strafe;
      // --- Fire in bursts once the reaction time has passed. ---
      if (time >= bot.reactAt && dist < 42) {
        bot.burstTimer -= dt;
        if (bot.burstLeft <= 0) {
          bot.pauseTimer -= dt;
          if (bot.pauseTimer <= 0) {
            bot.burstLeft = 3 + Math.floor(Math.random() * 3);
            bot.pauseTimer = 0.6 + Math.random() * 0.7;
          }
        } else if (bot.burstTimer <= 0) {
          bot.burstTimer = 0.13;
          bot.burstLeft -= 1;
          const spread = bot.aimError + dist * 0.0009 + speed * 0.0012;
          api.fire(bot, tp, spread);
        }
      }
    } else if (bot.state === 'defend') {
      // Hold near the planted site, watching the approaches.
      s.yaw += Math.sin(time * 0.5 + bot.body.state.position.x) * dt * 0.25;
      crouch = Math.sin(time * 0.3) > 0.2;
    } else {
      // Walk the path; arrive, then pick the next leg or hold.
      if (bot.pathIndex < bot.path.length) {
        const wp = bot.path[bot.pathIndex];
        const dx = wp.x - s.position.x;
        const dz = wp.z - s.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.7) bot.pathIndex += 1;
        else {
          s.yaw = Math.atan2(-dx, -dz);
          wishX = dx / dist;
          wishZ = dz / dist;
        }
      } else if (bot.team === 'enemy') {
        // Reached the end of the route: patrol between the site and mid.
        if (bot.role === 'carrier') setPath(bot, bot.plantSite);
        else setPath(bot, Math.random() < 0.5 ? 'mid' : (bot.role === 'rusher' ? 'aLong2' : 'bLong2'));
      } else {
        // Friendly holders patrol their lane node and the site approach.
        setPath(bot, bot.holdNode === 'aLong2' ? 'aSite' : 'bSite');
        bot.holdNode = bot.holdNode === 'aLong2' ? 'aSite' : 'aLong2';
      }
    }
    bot.body.step(dt, wishX, wishZ, { crouch });
    bot.group.position.copy(s.position);
    bot.group.rotation.y = s.yaw;
    // A walking bot bobs; a crouched one stays low (the body height already does it).
    const bob = speed > 0.5 ? Math.sin(time * 11) * 0.02 : 0;
    bot.group.position.y = s.position.y + bob;
  }

  function step(dt, time, ctx) {
    for (const bot of bots) stepBot(bot, dt, time, ctx);
  }

  function aliveCount(team) {
    return bots.filter((b) => b.alive && b.team === team).length;
  }

  function carrier() {
    return bots.find((b) => b.team === 'enemy' && b.role === 'carrier');
  }

  function promoteCarrier() {
    const living = bots.filter((b) => b.alive && b.team === 'enemy');
    if (!living.length) return;
    const next = living[0];
    next.role = 'carrier';
    next.state = 'advance';
    setPath(next, next.plantSite);
  }

  return {
    bots, hitMeshes, spawnRound, step, damage, hear, aliveCount, carrier, promoteCarrier,
    reset() {
      for (const bot of bots) scene.remove(bot.group);
      bots.length = 0;
      hitMeshes.length = 0;
    },
  };
}
