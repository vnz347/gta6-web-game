// Solmar: cars. Arcade driving physics (throttle, steering that tightens
// with speed, handbrake slides), car-to-car and car-to-building collisions,
// traffic that follows the road grid, parked cars to steal, and damage.

import { HEAT, VEHICLES, WORLD } from './config.js';
import { angleTo, clamp, pick, range } from './random.js';

const CAR_COLORS = [0xd8543c, 0x3c78d8, 0xe8e8e8, 0x2a2d34, 0xe8c33a, 0x4a9e5c, 0x9a5ec8, 0xc8c8d0, 0x38b8c8, 0xe07840];
const TRAFFIC_COUNT = 14;
const PARKED_COUNT = 10;

export function createVehicles(G) {
  const { world, render, rng } = G;
  const list = [];
  let nextId = 1;

  // The player's live state (G.player is the player module; .player is the state).
  function P() {
    return G.player.player;
  }

  function spawn(type, x, z, heading, driver, opts = {}) {
    const def = VEHICLES[type];
    const color = opts.color ?? (driver === 'police' ? 0xf2f2ee : pick(rng, CAR_COLORS));
    const mesh = render.makeCarMesh(type, color, driver === 'police');
    const car = {
      id: nextId, type, def, x, z, heading,
      speed: 0, vx: 0, vz: 0, steer: 0,
      hp: opts.hp ?? def.hp, maxHp: def.hp,
      color, mesh, driver,
      route: opts.route ?? null, // traffic: {road:'ave'|'st', line, dir}
      target: opts.target ?? null, // mission/pursuit target point
      nitro: 0, // seconds of nitro left
      engine: opts.engine ?? 0, // garage engine tier (player car)
      armour: opts.armour ?? 0, // garage armour tier (player car)
      dead: false, smokeT: 0, stuckT: 0, honkT: 0,
    };
    nextId += 1;
    list.push(car);
    mesh.group.userData.car = car;
    syncMesh(car);
    return car;
  }

  function syncMesh(car) {
    car.mesh.group.position.set(car.x, 0, car.z);
    car.mesh.group.rotation.y = car.heading;
    const spin = (car.speed * 0.016) / 0.38;
    for (const w of car.mesh.wheels) w.rotation.x += spin;
    car.mesh.wheels[0].rotation.y = car.steer * 0.4;
    car.mesh.wheels[1].rotation.y = car.steer * 0.4;
  }

  function topSpeed(car) {
    let top = car.def.top * (1 + car.engine * 0.12);
    if (car.nitro > 0) top *= 1.35;
    if (car.hp < 30) top *= 0.45;
    return top;
  }

  // One physics step for a car under the given controls. throttle -1..1,
  // steer -1..1, handbrake true while the handbrake is held.
  function stepCar(car, dt, throttle, steer, handbrake) {
    if (car.dead) {
      car.speed *= Math.max(0, 1 - 3 * dt);
      car.vx *= Math.max(0, 1 - 3 * dt);
      car.vz *= Math.max(0, 1 - 3 * dt);
      car.x += car.vx * dt;
      car.z += car.vz * dt;
      syncMesh(car);
      return;
    }
    car.steer = steer;
    const sand = world.isSand(car.x);
    const accel = car.def.accel * (1 + car.engine * 0.15) * (sand ? 0.55 : 1);
    if (throttle > 0) car.speed += accel * throttle * dt;
    else if (throttle < 0) {
      if (car.speed > 0.5) car.speed -= 26 * dt; // brake
      else car.speed = Math.max(-12, car.speed + accel * 0.7 * throttle * dt); // reverse
    }
    // Rolling drag and air drag.
    car.speed -= car.speed * 0.35 * dt + car.speed * Math.abs(car.speed) * 0.004 * dt;
    if (handbrake) car.speed -= car.speed * 1.6 * dt;
    car.speed = clamp(car.speed, -12, topSpeed(car));
    if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;

    const steerRate = 1.9 / (1 + Math.abs(car.speed) * 0.028);
    const dir = car.speed >= 0 ? 1 : -1;
    car.heading += steer * steerRate * dt * clamp(Math.abs(car.speed) / 7, 0, 1) * dir;

    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const grip = handbrake ? 2.2 : car.def.grip;
    const k = 1 - Math.exp(-grip * dt);
    car.vx += (fx * car.speed - car.vx) * k;
    car.vz += (fz * car.speed - car.vz) * k;
    car.x += car.vx * dt;
    car.z += car.vz * dt;

    const fixed = world.collideCircle(car.x, car.z, 2.3);
    car.x = fixed.x;
    car.z = fixed.z;
    if (fixed.hit) {
      const impact = Math.hypot(car.vx, car.vz);
      car.vx *= -0.25;
      car.vz *= -0.25;
      car.speed *= 0.35;
      if (impact > 6) {
        damage(car, impact * 1.4, null);
        render.burst(car.x, 0.8, car.z, 0xffc860, 10, 5);
        if (car === P().car) {
          render.addShake(Math.min(0.3, impact * 0.012));
          G.audio.crash(Math.min(1, impact / 30));
        }
      }
    }
    if (car.nitro > 0) car.nitro = Math.max(0, car.nitro - dt);
    if (car.hp < 30 && car.hp > 0) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.12;
        render.burst(car.x + Math.sin(car.heading) * 1.5, 1.2, car.z + Math.cos(car.heading) * 1.5, 0x555555, 2, 1.5);
      }
    }
    syncMesh(car);
  }

  function damage(car, amount, source) {
    if (car.dead) return;
    const reduction = 1 - car.armour * 0.15;
    car.hp -= amount * reduction;
    if (car.hp <= 0) {
      car.hp = 0;
      car.dead = true;
      car.speed = 0;
      render.burst(car.x, 1, car.z, 0xff8833, 26, 7);
      render.burst(car.x, 1, car.z, 0x333333, 18, 4);
      G.events.push({ type: 'carDestroyed', car, source });
    }
  }

  // Pairwise car collisions: push apart, swap a little speed, damage both.
  function collideCars() {
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 4.6 * 4.6 || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const push = (4.6 - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const rel = Math.abs((a.vx - b.vx) * nx + (a.vz - b.vz) * nz);
        if (rel > 4) {
          damage(a, rel * 0.9, b);
          damage(b, rel * 0.9, a);
          render.burst((a.x + b.x) / 2, 0.8, (a.z + b.z) / 2, 0xffc860, 8, 4);
          if ((a === P().car || b === P().car) && rel > 7) {
            render.addShake(0.12);
            G.audio.crash(0.5);
          }
          const other = a === P().car ? b : b === P().car ? a : null;
          if (other && other.driver === 'police') G.police.addHeat(HEAT.hitCop);
          else if (other) G.police.addHeat(HEAT.hitCar);
        }
        const tmpVx = a.vx; const tmpVz = a.vz;
        a.vx = b.vx * 0.5; a.vz = b.vz * 0.5;
        b.vx = tmpVx * 0.5; b.vz = tmpVz * 0.5;
      }
    }
  }

  // Traffic: follow the road grid, turn at intersections, stop for blocks.
  function trafficThink(car, dt) {
    if (!car.route) return { throttle: 0, steer: 0, brake: false };
    const { road, line, dir } = car.route;
    // Waypoint 26 ahead along the road.
    let wx; let wz;
    if (road === 'ave') {
      wx = line + (dir > 0 ? 3.5 : -3.5);
      wz = car.z + dir * 26;
    } else {
      wx = car.x + dir * 26;
      wz = line + (dir > 0 ? 3.5 : -3.5);
    }
    // At an intersection, sometimes turn onto the crossing road.
    if (road === 'ave') {
      for (const sz of WORLD.streets) {
        if (Math.abs(car.z - sz) < 7 && rng() < 0.012) {
          car.route = { road: 'st', line: sz, dir: rng() < 0.5 ? 1 : -1 };
          break;
        }
      }
    } else {
      for (const ax of WORLD.avenues) {
        if (Math.abs(car.x - ax) < 7 && rng() < 0.012) {
          car.route = { road: 'ave', line: ax, dir: rng() < 0.5 ? 1 : -1 };
          break;
        }
      }
    }
    // Slow for anything ahead.
    let blocked = false;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (const other of list) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 13 && side < 3.2) { blocked = true; break; }
    }
    if (!blocked && P().mode === 'foot') {
      const dx = P().x - car.x;
      const dz = P().z - car.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 9 && side < 2.5) blocked = true;
    }
    const desired = Math.atan2(wx - car.x, wz - car.z);
    const steer = clamp(angleTo(car.heading, desired) * 2.2, -1, 1);
    const cruise = 13 + (car.id % 5);
    const throttle = blocked ? (car.speed > 0.5 ? -1 : 0) : car.speed < cruise ? 0.7 : 0;
    return { throttle, steer, brake: false };
  }

  function spawnTraffic(count) {
    for (let n = 0; n < count; n += 1) {
      const p = world.randomRoadPoint();
      const type = pick(rng, ['sedan', 'sedan', 'coupe', 'pickup', 'van']);
      const car = spawn(type, p.x, p.z, p.heading, 'traffic');
      // Route along the road the point sits on.
      let best = null; let bestD = Infinity;
      for (const ax of WORLD.avenues) {
        const d = Math.abs(p.x - ax);
        if (d < bestD) { bestD = d; best = { road: 'ave', line: ax, dir: p.heading < Math.PI / 2 || p.heading > Math.PI * 1.5 ? 1 : -1 }; }
      }
      for (const sz of WORLD.streets) {
        const d = Math.abs(p.z - sz);
        if (d < bestD) { bestD = d; best = { road: 'st', line: sz, dir: p.heading > 0 && p.heading < Math.PI ? 1 : -1 }; }
      }
      car.route = best;
      car.speed = 10;
    }
  }

  function spawnParked(count) {
    for (let n = 0; n < count; n += 1) {
      const p = world.randomRoadPoint();
      const type = pick(rng, ['sedan', 'coupe', 'sports', 'pickup']);
      spawn(type, p.x + 5.5, p.z, p.heading, 'parked');
    }
  }

  function nearest(x, z, maxDist, filter) {
    let best = null; let bestD = maxDist;
    for (const car of list) {
      if (filter && !filter(car)) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function remove(car) {
    render.remove(car.mesh.group);
    const i = list.indexOf(car);
    if (i !== -1) list.splice(i, 1);
  }

  function update(dt) {
    for (const car of [...list]) {
      if (car.driver === 'traffic') {
        const c = trafficThink(car, dt);
        stepCar(car, dt, c.throttle, c.steer, c.brake);
        // Recycle traffic far from the player.
        const dp = Math.hypot(car.x - P().x, car.z - P().z);
        if (dp > 180) {
          remove(car);
          spawnTraffic(1);
        }
      } else if (car.driver === 'police' || car.driver === 'mission') {
        // Driven by police.js / missions.js through stepCar.
      } else if (car.driver === 'parked' && Math.abs(car.speed) > 0.3) {
        // A car the player just left coasts to a stop.
        stepCar(car, dt, 0, 0, false);
      }
    }
    collideCars();
  }

  return {
    list, spawn, stepCar, damage, nearest, remove, update,
    spawnTraffic, spawnParked,
    get playerCar() { return P().car; },
  };
}

export { TRAFFIC_COUNT, PARKED_COUNT };
