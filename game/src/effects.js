// Transient effects, all pooled — no new objects in the hot loop. Tracers are reused
// lines, explosions are one reused shell of particles plus a light, and hit sparks are
// a reused burst of points. The game never allocates while a round is running.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < 10; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0,
    }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const explosion = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c'), transparent: true, opacity: 0, depthWrite: false }),
  );
  const flash = new THREE.PointLight(new THREE.Color('#ff9a3c'), 0, 18);
  const sparks = (() => {
    const count = 90;
    const positions = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: new THREE.Color(PALETTE.accent), size: 0.12, transparent: true, opacity: 0,
    }));
    points.frustumCulled = false;
    return { points, positions, count, velocities: new Float32Array(count * 3), life: 0 };
  })();
  explosion.add(shell, flash, sparks.points);
  explosion.visible = false;
  scene.add(explosion);
  const sparkOrigin = new THREE.Vector3();

  const hitBurst = (() => {
    const count = 24;
    const positions = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: new THREE.Color('#ffd27a'), size: 0.09, transparent: true, opacity: 0,
    }));
    points.frustumCulled = false;
    scene.add(points);
    return { points, positions, count, velocities: new Float32Array(count * 3), life: 0 };
  })();

  function burst(b, origin, speed, up) {
    for (let i = 0; i < b.count; i += 1) {
      b.positions[i * 3] = origin.x;
      b.positions[i * 3 + 1] = origin.y;
      b.positions[i * 3 + 2] = origin.z;
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.6);
      b.velocities[i * 3] = Math.cos(a) * Math.cos(e) * s;
      b.velocities[i * 3 + 1] = Math.sin(e) * s + up;
      b.velocities[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
    }
    b.points.geometry.attributes.position.needsUpdate = true;
    b.life = 1;
  }

  return {
    tracer(from, to) {
      const t = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % tracers.length;
      const attr = t.line.geometry.attributes.position;
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      t.line.material.opacity = 0.85;
      t.life = 0.07;
    },
    explode(origin) {
      explosion.position.copy(origin);
      explosion.visible = true;
      shell.scale.setScalar(0.4);
      shell.material.opacity = 0.9;
      flash.intensity = 60;
      sparkOrigin.copy(origin);
      burst(sparks, origin, 7, 3);
      sparks.life = 0.9;
    },
    hitSpark(origin) {
      burst(hitBurst, origin, 3.5, 1.2);
      hitBurst.life = 0.35;
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          if (t.life <= 0) t.line.material.opacity = 0;
        }
      }
      if (sparks.life > 0) {
        sparks.life -= dt;
        const k = Math.max(0, sparks.life / 0.9);
        shell.scale.setScalar(0.4 + (1 - k) * 6.5);
        shell.material.opacity = 0.9 * k;
        flash.intensity = 60 * k;
        for (let i = 0; i < sparks.count; i += 1) {
          sparks.velocities[i * 3 + 1] -= 12 * dt;
          sparks.positions[i * 3] += sparks.velocities[i * 3] * dt;
          sparks.positions[i * 3 + 1] += sparks.velocities[i * 3 + 1] * dt;
          sparks.positions[i * 3 + 2] += sparks.velocities[i * 3 + 2] * dt;
          if (sparks.positions[i * 3 + 1] < 0.05) sparks.positions[i * 3 + 1] = 0.05;
        }
        sparks.points.geometry.attributes.position.needsUpdate = true;
        sparks.points.material.opacity = k;
        if (sparks.life <= 0) explosion.visible = false;
      }
      if (hitBurst.life > 0) {
        hitBurst.life -= dt;
        for (let i = 0; i < hitBurst.count; i += 1) {
          hitBurst.velocities[i * 3 + 1] -= 9 * dt;
          hitBurst.positions[i * 3] += hitBurst.velocities[i * 3] * dt;
          hitBurst.positions[i * 3 + 1] += hitBurst.velocities[i * 3 + 1] * dt;
          hitBurst.positions[i * 3 + 2] += hitBurst.velocities[i * 3 + 2] * dt;
        }
        hitBurst.points.geometry.attributes.position.needsUpdate = true;
        hitBurst.points.material.opacity = Math.max(0, hitBurst.life / 0.35);
      }
    },
  };
}
