// The arsenal: four guns, each with its own damage, fire rate, spread and recoil, plus a
// buy price. Spread grows with movement speed, so stopping to aim pays — the same rule
// the bots play by. The module owns the view model, the muzzle flash and the numbers;
// main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 48,
    damage: 26, headMult: 4, pellets: 1, gap: 0.18, auto: false,
    spreadStill: 0.004, spreadMove: 0.03, reload: 1.4, kick: 0.008,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', price: 2700, mag: 30, reserve: 90,
    damage: 34, headMult: 4, pellets: 1, gap: 0.096, auto: true,
    spreadStill: 0.0022, spreadMove: 0.028, reload: 1.9, kick: 0.011,
  },
  smg: {
    id: 'smg', name: 'KX-9 Ripper', price: 1500, mag: 32, reserve: 96,
    damage: 22, headMult: 4, pellets: 1, gap: 0.065, auto: true,
    spreadStill: 0.006, spreadMove: 0.035, reload: 1.6, kick: 0.007,
  },
  shotgun: {
    id: 'shotgun', name: 'M12 Breacher', price: 1700, mag: 6, reserve: 24,
    damage: 12, headMult: 2, pellets: 8, gap: 0.85, auto: false,
    spreadStill: 0.02, spreadMove: 0.05, reload: 2.6, kick: 0.03,
  },
};

const ORDER = ['pistol', 'rifle', 'smg', 'shotgun'];

function buildViewModel(def) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  // Every gun is the same family of boxes, different in proportion — a long rifle barrel
  // reads differently from a stubby shotgun at a glance, with no model files.
  const dims = {
    pistol: { receiver: [0.07, 0.09, 0.22], barrel: [0.04, 0.04, 0.14], stock: null },
    rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22] },
    smg: { receiver: [0.08, 0.09, 0.3], barrel: [0.05, 0.05, 0.22], stock: [0.07, 0.07, 0.14] },
    shotgun: { receiver: [0.1, 0.11, 0.36], barrel: [0.06, 0.06, 0.44], stock: [0.08, 0.09, 0.24] },
  }[def.id];
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(...dims.receiver), body);
  group.add(receiver);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(...dims.barrel), dark);
  barrel.position.set(0, 0.02, -(dims.receiver[2] / 2 + dims.barrel[2] / 2 - 0.02));
  group.add(barrel);
  if (dims.stock) {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(...dims.stock), dark);
    stock.position.set(0, -0.02, dims.receiver[2] / 2 + dims.stock[2] / 2 - 0.02);
    group.add(stock);
  }
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), accent);
  grip.position.set(0, -0.09, 0.08);
  group.add(grip);
  // Held low and angled in, so the gun reads as a gun instead of a slab.
  group.position.set(0.28, -0.24, -0.5);
  group.rotation.y = 0.18;
  group.scale.setScalar(0.8);
  return group;
}

export function createWeapons(camera, audio) {
  const models = {};
  for (const id of ORDER) models[id] = buildViewModel(WEAPONS[id]);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.28, -0.2, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
  let currentId = 'pistol';
  let currentModel = models.pistol;
  camera.add(currentModel);
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };

  function def() { return WEAPONS[currentId]; }
  function ammo() { return owned[currentId]; }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    currentModel.position.z = -0.5 + state.kick;
    currentModel.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      currentModel.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - ammo().mag;
        const take = Math.min(need, ammo().reserve);
        ammo().mag += take;
        ammo().reserve -= take;
      }
    }
  }

  return {
    def,
    currentId: () => currentId,
    ownedIds: () => Object.keys(owned),
    ammo: () => ({ mag: ammo().mag, reserve: ammo().reserve }),
    step,
    ready() {
      return ammo().mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    // Semi-auto guns fire on the press edge; autos fire while held. main.js asks.
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.055 + def().kick;
      audio.shot();
    },
    takeRound() {
      if (ammo().mag <= 0) return false;
      ammo().mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || ammo().mag === d.mag || ammo().reserve === 0) return false;
      state.reloadLeft = d.reload;
      audio.reload();
      return true;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
    },
    switchTo(id) {
      if (!owned[id] || id === currentId) return false;
      camera.remove(currentModel);
      currentId = id;
      currentModel = models[id];
      camera.add(currentModel);
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      return true;
    },
    buy(id, money) {
      const d = WEAPONS[id];
      if (!d || owned[id] || money < d.price) return false;
      owned[id] = { mag: d.mag, reserve: d.reserve };
      return true;
    },
    refillAmmo() {
      for (const id of Object.keys(owned)) {
        owned[id].mag = WEAPONS[id].mag;
        owned[id].reserve = WEAPONS[id].reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
