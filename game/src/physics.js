// Shared body physics: acceleration, friction, gravity, crouch and jump, resolved as a
// box against the world's colliders one axis at a time, so a wall never swallows a body.
// The player and every bot are bodies built from this one helper — one collision model
// for the whole game, no duplicated movement code.
import * as THREE from 'three';

const RADIUS = 0.34;
const GRAVITY = 20;

export function createBody(colliders, options) {
  const opts = {
    position: new THREE.Vector3(0, 0, 0),
    standHeight: 1.72,
    crouchHeight: 1.12,
    standEye: 1.6,
    crouchEye: 1.02,
    walkSpeed: 5.2,
    crouchSpeed: 2.4,
    groundAccel: 42,
    airAccel: 9,
    friction: 9,
    jumpSpeed: 6.2,
    ...options,
  };
  const body = {
    position: opts.position.clone(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: opts.standEye,
    onGround: true,
    crouching: false,
    height: opts.standHeight,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  // lift keeps the feet and the crown out of the horizontal tests, so standing on the
  // floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  // wishX/wishZ are already world-space unit wishes; crouching, jumping and eye height
  // are handled here so callers only steer.
  function step(dt, wishX, wishZ, { crouch = false, jump = false } = {}) {
    if (crouch && !body.crouching) {
      body.crouching = true;
      body.height = opts.crouchHeight;
    } else if (!crouch && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, opts.standHeight, 0.02)) {
      body.crouching = false;
      body.height = opts.standHeight;
    }
    const eyeTarget = body.crouching ? opts.crouchEye : opts.standEye;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const speed = body.crouching ? opts.crouchSpeed : opts.walkSpeed;
    wish.set(wishX, 0, wishZ);
    if (wish.lengthSq() > 1) wish.normalize();
    const blend = Math.min(1, (body.onGround ? opts.groundAccel : opts.airAccel) * dt / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - opts.friction * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (jump && body.onGround) {
      body.velocity.y = opts.jumpSpeed;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  return {
    state: body,
    step,
    look,
    recoil,
    overlaps,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
