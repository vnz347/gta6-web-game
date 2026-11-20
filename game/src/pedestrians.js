// Solmar: pedestrians. They stroll the sidewalks, cross at corners, flee
// from danger, and go down when a car or a bullet catches them. Kept near
// the player by recycling: the crowd is densest where the camera is.

import { WORLD } from './config.js';
import { clamp, pick, range } from './random.js';

const PED_COUNT = 26;
const SHIRTS = [0xd8543c, 0x3c78d8, 0xe8c33a, 0x4a9e5c, 0xe8e8e8, 0x9a5ec8, 0x38b8c8, 0xe07840, 0x5a6a7a, 0xc8a0b8];
const PANTS = [0x2a2d34, 0x3a4a5a, 0x6a5a3a, 0x4a4a4a, 0x7a8a9a];
const SKINS = [0xf2c9a0, 0xc89a6a, 0x8a5a34, 0xe8b88a, 0x6a4526];

export function createPedestrians(G) {
  const { world, render, rng } = G;
  const list = [];
  let nextId = 1;

  // The player's live state (G.player is the player module; .player is the state).
  function P() {
    return G.player.player;
  }

  function sidewalkPoint() {
    // A point just off a road: on the sidewalk beside it.
    if (rng() < 0.5) {
      const ax = pick(rng, WORLD.avenues);
      const off = (ax === 240 ? 11 : 8.5) * (rng() < 0.5 ? 1 : -1);
      return { x: ax + off, z: range(rng, -280, 280) };
    }
    const sz = pick(rng, WORLD.streets);
    const off = 8.5 * (rng() < 0.5 ? 1 : -1);
    return { x: range(rng, -280, 220), z: sz + off };
  }

  function spawn(x, z) {
    const p = sidewalkPoint();
    const mesh = render.makePedMesh(pick(rng, SHIRTS), pick(rng, PANTS), pick(rng, SKINS));
    const ped = {
      id: nextId, x: x ?? p.x, z: z ?? p.z,
      heading: rng() * Math.PI * 2, speed: range(rng, 1.6, 2.6),
      state: 'walk', target: sidewalkPoint(), waitT: 0, downT: 0,
      phase: rng() * Math.PI * 2, fleeX: 0, fleeZ: 0, mesh,
    };
    nextId += 1;
    list.push(ped);
    mesh.group.userData.ped = ped;
    syncMesh(ped, 0);
    return ped;
  }

  function syncMesh(ped, dt) {
    const m = ped.mesh;
    m.group.position.set(ped.x, 0, ped.z);
    if (ped.state === 'down') {
      m.group.rotation.set(-Math.PI / 2, 0, ped.heading);
      return;
    }
    m.group.rotation.set(0, ped.heading, 0);
    const swing = Math.sin(ped.phase) * (ped.state === 'flee' ? 0.9 : 0.55);
    m.legL.rotation.x = swing;
    m.legR.rotation.x = -swing;
    m.armL.rotation.x = -swing * 0.7;
    m.armR.rotation.x = swing * 0.7;
  }

  function fleeFrom(ped, x, z) {
    if (ped.state === 'down') return;
    ped.state = 'flee';
    ped.fleeX = x;
    ped.fleeZ = z;
    ped.waitT = range(rng, 2, 4);
  }

  /** Scare every pedestrian within `radius` of a point (a crash, a shot). */
  function scare(x, z, radius) {
    for (const ped of list) {
      if (Math.hypot(ped.x - x, ped.z - z) < radius) fleeFrom(ped, x, z);
    }
  }

  function knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downT = 4;
    ped.speed = 0;
    render.burst(ped.x, 1, ped.z, 0xcc3333, 6, 3);
  }

  function update(dt) {
    for (const ped of [...list]) {
      if (ped.state === 'down') {
        ped.downT -= dt;
        syncMesh(ped, dt);
        if (ped.downT <= 0) {
          render.remove(ped.mesh.group);
          list.splice(list.indexOf(ped), 1);
          spawnNearPlayer();
        }
        continue;
      }
      let tx; let tz; let speed = ped.speed;
      if (ped.state === 'flee') {
        ped.waitT -= dt;
        const dx = ped.x - ped.fleeX;
        const dz = ped.z - ped.fleeZ;
        const d = Math.hypot(dx, dz) || 1;
        tx = ped.x + (dx / d) * 20;
        tz = ped.z + (dz / d) * 20;
        speed = 6.5;
        if (ped.waitT <= 0) ped.state = 'walk';
      } else if (ped.waitT > 0) {
        ped.waitT -= dt;
        ped.phase += dt * 2;
        syncMesh(ped, dt);
        continue;
      } else {
        tx = ped.target.x;
        tz = ped.target.z;
        const d = Math.hypot(tx - ped.x, tz - ped.z);
        if (d < 2) {
          ped.target = sidewalkPoint();
          if (rng() < 0.25) ped.waitT = range(rng, 1, 4);
          continue;
        }
      }
      const desired = Math.atan2(tx - ped.x, tz - ped.z);
      let diff = desired - ped.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ped.heading += clamp(diff, -3 * dt, 3 * dt);
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      const fixed = world.collideCircle(ped.x, ped.z, 0.6);
      ped.x = fixed.x;
      ped.z = fixed.z;
      ped.phase += dt * speed * 2.4;
      syncMesh(ped, dt);
      // Recycle pedestrians far from the player.
      if (Math.hypot(ped.x - P().x, ped.z - P().z) > 170) {
        render.remove(ped.mesh.group);
        list.splice(list.indexOf(ped), 1);
        spawnNearPlayer();
      }
    }
  }

  function spawnNearPlayer() {
    const a = rng() * Math.PI * 2;
    const r = range(rng, 40, 120);
    const x = clamp(P().x + Math.sin(a) * r, -280, 275);
    const z = clamp(P().z + Math.cos(a) * r, -280, 280);
    const p = sidewalkPoint();
    // Prefer the sidewalk point nearest the ring, so peds stay on paths.
    const ped = spawn(p.x, p.z);
    return ped;
  }

  function nearest(x, z, maxDist) {
    let best = null; let bestD = maxDist;
    for (const ped of list) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  return { list, spawn, update, scare, knockDown, nearest, spawnNearPlayer };
}

export { PED_COUNT };
