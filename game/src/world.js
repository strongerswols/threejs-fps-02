// RUSTLINE DEPOT: a 44 x 32 m container yard at dusk. Two bomb sites (A west, B east),
// three lanes between the spawns (A-long, mid, B-long), containers and crates for cover,
// and a waypoint graph the bots walk. Every solid box is a collider for bodies and a
// surface bullets stop on. All art is styled geometry; no models, no textures from disk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const CONTAINER_COLORS = ['#b4552a', '#2e7f74', '#5a6b7a', '#8a6d3b', '#7a4a8a', '#46688a'];

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101216';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = color;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const mat = (color, roughness = 0.9, metalness = 0.08) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness, metalness,
  });
  const groundMat = mat(PALETTE.canvas, 0.95, 0.02);
  const wallMat = mat('#2a2f37', 0.92, 0.05);
  const darkMat = mat('#23272e', 0.9, 0.06);
  const containerMats = CONTAINER_COLORS.map((c) => mat(c, 0.75, 0.25));
  const crateMat = mat('#6b5433', 0.9, 0.05);
  const barrelRust = mat('#a34d24', 0.7, 0.3);
  const barrelTeal = mat('#2e7f74', 0.7, 0.3);
  const stripeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(radius, height, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 14), material);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const half = radius * 0.95;
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - half, 0, z - half),
      new THREE.Vector3(x + half, height, z + half),
    ));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter walls (44 x 32 m, walls 5 m high).
  box(44.4, 0.4, 32.4, 0, -0.2, 0, groundMat);
  box(0.5, 5, 32.4, -22.2, 2.5, 0, wallMat);
  box(0.5, 5, 32.4, 22.2, 2.5, 0, wallMat);
  box(44.4, 5, 0.5, 0, 2.5, -16.2, wallMat);
  box(44.4, 5, 0.5, 0, 2.5, 16.2, wallMat);

  // Painted lane strips on the ground (no collision): mid lane and the two site aprons.
  box(2.2, 0.02, 26, 0, 0.01, 0, mat('#1d2126', 0.95), false);
  box(7, 0.02, 7, -16, 0.01, -8, mat('#241f1a', 0.95), false);
  box(7, 0.02, 7, 16, 0.01, -8, mat('#1a2224', 0.95), false);

  // --- Containers: the yard's cover. 6 x 2.6 x 2.6 m, some stacked two high. ---
  const containers = [
    // mid: a double stack splitting the lane, with a gap to slip through on each side
    [6, 2.6, 2.6, -4.5, 1.3, 0, 0], [6, 2.6, 2.6, -4.5, 3.9, 0, 0],
    [6, 2.6, 2.6, 4.5, 1.3, 0, 1],
    // A-long: staggered cover down the west lane
    [6, 2.6, 2.6, -12, 1.3, 4, 2], [2.6, 2.6, 6, -17, 1.3, -1, 3],
    [6, 2.6, 2.6, -9, 1.3, -6, 4],
    // B-long: staggered cover down the east lane
    [6, 2.6, 2.6, 12, 1.3, 4, 5], [2.6, 2.6, 6, 17, 1.3, -1, 0],
    [6, 2.6, 2.6, 9, 1.3, -6, 1],
    // site A: a low wall of containers guarding the plant zone
    [2.6, 2.6, 6, -19.5, 1.3, -8, 2], [6, 2.6, 2.6, -14, 1.3, -12.5, 3],
    // site B: same, mirrored
    [2.6, 2.6, 6, 19.5, 1.3, -8, 4], [6, 2.6, 2.6, 14, 1.3, -12.5, 5],
    // north spawn cover
    [6, 2.6, 2.6, -6, 1.3, -13.5, 1], [6, 2.6, 2.6, 6, 1.3, -13.5, 0],
    // south spawn cover
    [6, 2.6, 2.6, -6, 1.3, 13.5, 2], [6, 2.6, 2.6, 6, 1.3, 13.5, 3],
  ];
  for (const [w, h, d, x, y, z, ci] of containers) box(w, h, d, x, y, z, containerMats[ci % containerMats.length]);

  // --- Crates (1.2 m) and barrels: crouch cover and corners. ---
  const crates = [
    [-2.2, 4.5], [2.2, 4.5], [-8, 2], [8, 2], [-2, -4.5], [2, -4.5],
    [-13.5, -4.5], [13.5, -4.5], [-16, -3.5], [16, -3.5], [-11, -10.5], [11, -10.5],
    [-6, 10], [6, 10], [0, 8.5],
  ];
  for (const [x, z] of crates) box(1.2, 1.2, 1.2, x, 0.6, z, crateMat);
  box(1.2, 1.2, 1.2, -2.2, 1.8, 4.5, crateMat);
  box(1.2, 1.2, 1.2, 2.2, 1.8, 4.5, crateMat);
  const barrels = [
    [-18.5, 4, barrelRust], [-18.5, 5.2, barrelTeal], [18.5, 4, barrelTeal], [18.5, 5.2, barrelRust],
    [-10.5, 11.5, barrelRust], [10.5, 11.5, barrelTeal], [-4, -11, barrelTeal], [4, -11, barrelRust],
  ];
  for (const [x, z, m] of barrels) cylinder(0.55, 1.1, x, z, m);

  // --- Bomb sites: glowing floor plates + letter signs on poles. ---
  const sites = {
    A: { center: new THREE.Vector3(-16, 0, -8), min: new THREE.Vector3(-19.5, 0, -11.5), max: new THREE.Vector3(-12.5, 0, -4.5) },
    B: { center: new THREE.Vector3(16, 0, -8), min: new THREE.Vector3(12.5, 0, -11.5), max: new THREE.Vector3(19.5, 0, -4.5) },
  };
  for (const [name, site] of Object.entries(sites)) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 6.4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(site.center.x, 0.03, site.center.z);
    group.add(plate);
    const pole = box(0.18, 3.4, 0.18, site.center.x, 1.7, site.center.z - 3.4, darkMat);
    pole.castShadow = false;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: letterTexture(name, PALETTE.accent), transparent: false }),
    );
    sign.position.set(site.center.x, 3.6, site.center.z - 3.4);
    group.add(sign);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.05, 0.18), stripeMat);
    strip.position.set(site.center.x, 0.04, site.center.z + 3.2);
    group.add(strip);
  }

  // --- Floodlight poles with emissive heads (visual only). ---
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe9b0') });
  for (const [x, z] of [[-20, 14], [20, 14], [-20, -14], [20, -14], [0, 14], [0, -14]]) {
    box(0.16, 6.5, 0.16, x, 3.25, z, darkMat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5), lampMat);
    head.position.set(x, 6.6, z);
    group.add(head);
  }

  // --- Light: dusk sky, warm key, cool fill, long shadows. ---
  const sky = new THREE.HemisphereLight(new THREE.Color('#8fa3b8'), new THREE.Color(PALETTE.canvas), 1.3);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.6);
  key.position.set(14, 20, 10);
  key.target.position.set(-4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5f7ea6'), 0.75);
  fill.position.set(-12, 10, 14);
  scene.add(fill);

  // --- Waypoint graph for the bots. ---
  const nodes = [
    { id: 'pSpawn', x: 0, z: 13 }, { id: 'eSpawn', x: 0, z: -13 },
    { id: 'midS', x: 0, z: 7 }, { id: 'mid', x: 0, z: 0 }, { id: 'midN', x: 0, z: -7 },
    { id: 'aLong1', x: -10, z: 7 }, { id: 'aLong2', x: -14, z: 0 }, { id: 'aSite', x: -16, z: -8 },
    { id: 'bLong1', x: 10, z: 7 }, { id: 'bLong2', x: 14, z: 0 }, { id: 'bSite', x: 16, z: -8 },
    { id: 'aMid', x: -8, z: -4 }, { id: 'bMid', x: 8, z: -4 },
    { id: 'westMid', x: -18.5, z: 2 }, { id: 'eastMid', x: 18.5, z: 2 },
  ];
  const edges = [
    ['pSpawn', 'midS'], ['midS', 'mid'], ['mid', 'midN'], ['midN', 'eSpawn'],
    ['midS', 'aLong1'], ['aLong1', 'aLong2'], ['aLong2', 'aSite'], ['aLong2', 'aMid'],
    ['aMid', 'midN'], ['midS', 'bLong1'], ['bLong1', 'bLong2'], ['bLong2', 'bSite'],
    ['bLong2', 'bMid'], ['bMid', 'midN'], ['aLong1', 'westMid'], ['westMid', 'aLong2'],
    ['bLong1', 'eastMid'], ['eastMid', 'bLong2'], ['mid', 'aMid'], ['mid', 'bMid'],
  ];
  const adjacency = new Map(nodes.map((n) => [n.id, []]));
  for (const [a, b] of edges) {
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));

  function nearestNode(x, z) {
    let best = nodes[0];
    let bestD = Infinity;
    for (const n of nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  // BFS over the graph; returns world waypoints from (x,z) to the target node id.
  function findPath(x, z, targetId) {
    const start = nearestNode(x, z);
    if (start.id === targetId) return [{ x: byId.get(targetId).x, z: byId.get(targetId).z }];
    const prev = new Map([[start.id, null]]);
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift();
      if (id === targetId) break;
      for (const next of adjacency.get(id)) {
        if (!prev.has(next)) { prev.set(next, id); queue.push(next); }
      }
    }
    if (!prev.has(targetId)) return [{ x: byId.get(targetId).x, z: byId.get(targetId).z }];
    const path = [];
    let id = targetId;
    while (id !== null) {
      const n = byId.get(id);
      path.unshift({ x: n.x, z: n.z });
      id = prev.get(id);
    }
    return path;
  }

  return {
    colliders,
    shootables,
    group,
    sites,
    spawns: {
      player: new THREE.Vector3(0, 0, 13.5),
      friendly: [new THREE.Vector3(-2, 0, 12), new THREE.Vector3(2, 0, 12)],
      enemy: [
        new THREE.Vector3(-3, 0, -13.5), new THREE.Vector3(-1, 0, -13.5),
        new THREE.Vector3(1, 0, -13.5), new THREE.Vector3(3, 0, -13.5),
      ],
    },
    waypoints: { nodes, findPath, nearestNode },
  };
}
