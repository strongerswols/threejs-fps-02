// The objective: one bomb, two sites. The enemy carrier plants it (3.5 s, handled by
// the bots); once planted it ticks for 35 s with accelerating beeps, and the player
// defuses it by holding E beside it for 5 s. Explosion or defusal ends the round.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOMB_TIME = 35;
const DEFUSE_TIME = 5;

export function createBomb(scene, world, audio) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.24, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1e22'), roughness: 0.5, metalness: 0.5 }),
  );
  body.position.y = 0.12;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  light.position.set(0.12, 0.28, 0);
  const lightPoint = new THREE.PointLight(new THREE.Color(PALETTE.danger), 0, 4);
  lightPoint.position.set(0, 0.5, 0);
  group.add(body, light, lightPoint);
  group.visible = false;
  scene.add(group);

  const state = {
    planted: false, site: null, timeLeft: BOMB_TIME,
    defusing: false, defuseProgress: 0, exploded: false, beepTimer: 0,
  };

  return {
    state,
    plant(siteName) {
      const site = world.sites[siteName];
      state.planted = true;
      state.site = siteName;
      state.timeLeft = BOMB_TIME;
      state.defuseProgress = 0;
      state.exploded = false;
      group.position.set(site.center.x, 0, site.center.z);
      group.visible = true;
      audio.plantStart();
    },
    position() {
      return group.position;
    },
    step(dt) {
      if (!state.planted || state.exploded) return null;
      state.timeLeft -= dt;
      state.beepTimer -= dt;
      const interval = Math.max(0.25, state.timeLeft / BOMB_TIME);
      if (state.beepTimer <= 0) {
        state.beepTimer = interval;
        audio.beep(state.timeLeft < 5);
        lightPoint.intensity = 6;
      } else {
        lightPoint.intensity = Math.max(0, lightPoint.intensity - dt * 20);
      }
      light.material.color.setHex(Math.floor(state.beepTimer * 10) % 2 === 0 ? 0xe5484d : 0x551111);
      if (state.defusing) {
        state.defuseProgress += dt;
        if (state.defuseProgress >= DEFUSE_TIME) {
          state.planted = false;
          group.visible = false;
          state.defusing = false;
          return 'defused';
        }
      } else {
        state.defuseProgress = Math.max(0, state.defuseProgress - dt * 2);
      }
      if (state.timeLeft <= 0) {
        state.exploded = true;
        state.planted = false;
        group.visible = false;
        return 'exploded';
      }
      return null;
    },
    startDefuse() { if (state.planted) state.defusing = true; },
    stopDefuse() { state.defusing = false; },
    reset() {
      state.planted = false;
      state.site = null;
      state.timeLeft = BOMB_TIME;
      state.defusing = false;
      state.defuseProgress = 0;
      state.exploded = false;
      group.visible = false;
    },
  };
}
