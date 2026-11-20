// Solmar: the wanted system. Heat rises with crimes and falls when no unit
// can see the player; stars decide how many SCP units answer, when the air
// unit joins, and when roadblocks go up. Units pursue, ram, and — at three
// stars and up — shoot at a player on foot.

import { HEAT, WANTED } from './config.js';
import { angleTo, clamp, pick } from './random.js';

const UNIT_NAMES = ['VIPER-2', 'VIPER-5', 'TIDE-7', 'TIDE-11', 'REEF-12', 'REEF-4', 'CORAL-9', 'CORAL-21', 'SURF-3', 'GULL-8'];
const UNIT_ROLES = ['INTERCEPTOR', 'PURSUIT', 'RAMMING', 'FLANKING', 'ROADBLOCK', 'SHORE WATCH'];

export function createPolice(G) {
  const { world, render, rng } = G;
  const police = {
    heat: 0,
    stars: 0,
    units: [], // {car, name, role, state, bustedT, shootT}
    heli: null, // {mesh, x, z}
    roadblockT: 0,
    clearT: 0,
  };

  // The player's live state (G.player is the player module; .player is the state).
  function P() {
    return G.player.player;
  }

  function starsFor(heat) {
    let s = 0;
    for (let i = 1; i < WANTED.thresholds.length; i += 1) {
      if (heat >= WANTED.thresholds[i]) s = i;
    }
    return s;
  }

  function addHeat(amount) {
    const before = police.stars;
    police.heat = clamp(police.heat + amount, 0, 1000);
    police.stars = starsFor(police.heat);
    if (police.stars > before) {
      G.events.push({ type: 'wantedUp', stars: police.stars });
      G.audio.siren();
    } else if (police.stars < before) {
      G.events.push({ type: 'wantedDown', stars: police.stars });
    }
  }

  function spawnUnit() {
    const used = new Set(police.units.map((u) => u.name));
    const name = UNIT_NAMES.find((n) => !used.has(n)) ?? `UNIT-${police.units.length + 1}`;
    // Spawn on a road 55-95 away from the player.
    let x = P().x; let z = P().z; let tries = 0;
    while (tries < 12) {
      const p = world.randomRoadPoint();
      const d = Math.hypot(p.x - P().x, p.z - P().z);
      if (d > 55 && d < 100) { x = p.x; z = p.z; break; }
      tries += 1;
    }
    const car = G.vehicles.spawn('police', x, z, Math.atan2(P().x - x, P().z - z), 'police');
    const unit = { car, name, role: pick(rng, UNIT_ROLES), state: 'pursue', bustedT: 0, shootT: 0 };
    police.units.push(unit);
    return unit;
  }

  function removeUnit(unit) {
    G.vehicles.remove(unit.car);
    police.units.splice(police.units.indexOf(unit), 1);
  }

  function spawnHeli() {
    const mesh = render.makeHeliMesh();
    police.heli = { mesh, x: P().x + 30, z: P().z - 20, y: 24, angle: 0 };
    mesh.group.position.set(police.heli.x, 24, police.heli.z);
  }

  function removeHeli() {
    if (!police.heli) return;
    render.remove(police.heli.mesh.group);
    police.heli = null;
  }

  function setRoadblock() {
    // Two units park across the road ahead of the player's heading.
    const p = P();
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const bx = p.x + fx * 55;
    const bz = p.z + fz * 55;
    let placed = 0;
    for (const unit of police.units) {
      if (placed >= 2) break;
      if (unit.state === 'roadblock') { placed += 1; continue; }
      const side = placed === 0 ? -3 : 3;
      unit.car.x = bx - fz * side;
      unit.car.z = bz + fx * side;
      unit.car.heading = Math.atan2(fz, -fx);
      unit.car.speed = 0;
      unit.state = 'roadblock';
      unit.role = 'ROADBLOCK';
      placed += 1;
    }
  }

  function updateUnit(unit, dt) {
    const car = unit.car;
    const p = P();
    const dx = p.x - car.x;
    const dz = p.z - car.z;
    const dist = Math.hypot(dx, dz);

    // Light bar strobes, alternating red and blue.
    const phase = Math.floor(G.time.elapsed * 8) % 2 === 0;
    if (car.mesh.lightL) car.mesh.lightL.material.emissiveIntensity = phase ? 2.2 : 0.25;
    if (car.mesh.lightR) car.mesh.lightR.material.emissiveIntensity = phase ? 0.25 : 2.2;

    if (unit.state === 'roadblock') {
      if (dist < 26) unit.state = 'pursue';
      else {
        G.vehicles.stepCar(car, dt, 0, 0, false);
        return;
      }
    }

    // Pursuit: steer at where the player will be, ram when close.
    const px = p.x + Math.sin(p.heading) * (p.speed || 0) * 0.6;
    const pz = p.z + Math.cos(p.heading) * (p.speed || 0) * 0.6;
    const desired = Math.atan2(px - car.x, pz - car.z);
    const steer = clamp(angleTo(car.heading, desired) * 2.4, -1, 1);
    const ramming = dist < 14;
    if (ramming) unit.role = 'RAMMING';
    const throttle = car.speed < 38 ? 1 : 0.4;
    G.vehicles.stepCar(car, dt, throttle, steer, false);

    // Busted: on foot, slow, and a unit right on top of the player.
    if (p.mode === 'foot' && dist < 7 && Math.abs(p.speed) < 3) {
      unit.bustedT += dt;
      if (unit.bustedT > 2.5) {
        p.busted = true;
        p.stats.timesBusted += 1;
        G.events.push({ type: 'busted' });
      }
    } else {
      unit.bustedT = Math.max(0, unit.bustedT - dt);
    }

    // At three stars the units shoot at a player on foot.
    if (police.stars >= 3 && p.mode === 'foot' && dist < 46) {
      unit.shootT -= dt;
      if (unit.shootT <= 0) {
        unit.shootT = 0.7 + rng() * 0.5;
        render.flash(car.x, 1.2, car.z);
        G.audio.shot('pistol');
        if (rng() < 0.55) G.player.hurt(7, unit);
        render.burst(p.x + (rng() - 0.5) * 2, 1, p.z + (rng() - 0.5) * 2, 0xffc860, 3, 2);
      }
    }
  }

  function update(dt) {
    // Keep the unit count matched to the stars.
    const wanted = WANTED.units[police.stars];
    while (police.units.length < wanted) spawnUnit();
    while (police.units.length > wanted) removeUnit(police.units[police.units.length - 1]);

    // Helicopter joins at four stars and leaves when the heat clears.
    if (police.stars >= WANTED.heliAt && !police.heli) spawnHeli();
    if (police.stars < WANTED.heliAt && police.heli) removeHeli();

    // Roadblocks go up at three stars, at most one every 25 seconds.
    police.roadblockT -= dt;
    if (police.stars >= 3 && police.roadblockT <= 0 && P().mode === 'car') {
      police.roadblockT = 25;
      setRoadblock();
    }

    // Heat decays only while no unit is near — the helicopter always sees.
    let nearest = Infinity;
    for (const unit of police.units) {
      nearest = Math.min(nearest, Math.hypot(unit.car.x - P().x, unit.car.z - P().z));
    }
    if (police.stars > 0 && !police.heli && nearest > 70) {
      addHeat(-WANTED.decay * dt);
    }
    if (police.stars === 0 && police.units.length > 0) {
      police.clearT += dt;
      if (police.clearT > 4) {
        while (police.units.length > 0) removeUnit(police.units[0]);
        police.clearT = 0;
      }
    }

    for (const unit of [...police.units]) {
      if (unit.car.dead) {
        // A wrecked unit is replaced after a short delay.
        removeUnit(unit);
        continue;
      }
      updateUnit(unit, dt);
    }

    if (police.heli) {
      const h = police.heli;
      h.angle += dt * 0.15;
      // The air unit circles ahead of the player, low and far enough to stay
      // inside the chase camera's view, spotlight sweeping the road.
      const fx = Math.sin(P().heading);
      const fz = Math.cos(P().heading);
      const tx = P().x + fx * 45 + Math.sin(h.angle) * 18;
      const tz = P().z + fz * 45 + Math.cos(h.angle) * 18;
      h.x += (tx - h.x) * Math.min(1, dt * 1.4);
      h.z += (tz - h.z) * Math.min(1, dt * 1.4);
      h.y = 24;
      h.mesh.group.position.set(h.x, h.y + Math.sin(G.time.elapsed * 0.9) * 1.2, h.z);
      h.mesh.group.rotation.y = Math.atan2(P().x - h.x, P().z - h.z);
      h.mesh.rotor.rotation.y += dt * 22;
      h.mesh.tailRotor.rotation.x += dt * 30;
    }
  }

  // The HUD's police panel: named units, roles and distances, nearest first.
  function visibleUnits() {
    const rows = police.units.map((u) => ({
      name: u.name,
      role: u.role,
      dist: Math.round(Math.hypot(u.car.x - P().x, u.car.z - P().z)),
    }));
    rows.sort((a, b) => a.dist - b.dist);
    if (police.heli) {
      rows.unshift({
        name: 'HAWK-1', role: 'AIR UNIT',
        dist: Math.round(Math.hypot(police.heli.x - P().x, police.heli.z - P().z)),
      });
    }
    return rows;
  }

  function reset() {
    police.heat = 0;
    police.stars = 0;
    while (police.units.length > 0) removeUnit(police.units[0]);
    removeHeli();
  }

  return { police, addHeat, update, visibleUnits, reset, spawnUnit };
}

export { HEAT };
