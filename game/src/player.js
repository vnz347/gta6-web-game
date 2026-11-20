// Solmar: the player. On-foot movement, getting in and out of cars,
// shooting (hitscan from the crosshair), health and armour, the weapon
// wheel's selection, reloads, and the three crew abilities.

import * as THREE from 'three';
import { CREW, HEAT, MEDALLION_REWARD } from './config.js';
import { down, pressed, steerAxis, throttleAxis } from './input.js';
import { damageAt, weaponByKey, weaponById } from './weapons.js';
import { clamp } from './random.js';

const RAY = new THREE.Raycaster();
const CENTER = new THREE.Vector2(0, 0);

export function createPlayer(G) {
  const { world, render, input } = G;
  const mesh = render.makePedMesh(0xd8a03c, 0x2a2d34, 0xc89a6a);
  // Rook's look: mustard jacket, dark jeans, and a gun in his right hand.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x222222 }),
  );
  gun.position.set(0.42, 1.05, 0.25);
  mesh.group.add(gun);

  const player = {
    x: 152, z: 84, heading: Math.PI, speed: 0,
    mode: 'foot', car: null,
    health: 100, armour: 0,
    money: 500, rp: 0,
    weapon: 'pistol',
    ammo: null, // filled by weapons.freshAmmo in main
    fireT: 0, reloadT: 0, meleeT: 0,
    crewCooldowns: [0, 0, 0],
    dead: false, busted: false, bustedT: 0,
    phase: 0, mesh, gun,
    stats: {
      distanceDriven: 0, topSpeed: 0, carsStolen: 0, faresDone: 0,
      medallions: 0, shotsFired: 0, missionsDone: 0, timesBusted: 0, timesWasted: 0,
    },
  };

  function hurt(amount, source) {
    if (player.dead || player.busted) return;
    let rest = amount;
    if (player.armour > 0) {
      const absorbed = Math.min(player.armour, rest * 0.6);
      player.armour -= absorbed;
      rest -= absorbed;
    }
    player.health -= rest;
    G.hud.flashDamage();
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
      player.stats.timesWasted += 1;
      G.events.push({ type: 'wasted', source });
    }
  }

  function heal(amount) {
    player.health = Math.min(100, player.health + amount);
  }

  function addMoney(amount) {
    player.money = Math.max(0, player.money + amount);
  }

  function addRp(amount) {
    const before = player.rp;
    player.rp += amount;
    G.events.push({ type: 'rp', amount, before, after: player.rp });
  }

  function currentWeapon() {
    return weaponById(player.weapon);
  }

  function tryEnterCar() {
    const car = G.vehicles.nearest(player.x, player.z, 5, (c) => !c.dead);
    if (!car) return;
    if (car.driver === 'traffic') {
      // Carjack: the driver bails out and runs.
      const ped = G.peds.spawn(car.x + 2, car.z + 2);
      G.peds.scare(car.x, car.z, 4);
      G.police.addHeat(HEAT.carjack);
      player.stats.carsStolen += 1;
      G.events.push({ type: 'carjack', car });
    }
    if (car.driver === 'police') {
      G.police.addHeat(HEAT.carjack + 100);
      player.stats.carsStolen += 1;
    }
    car.driver = 'player';
    player.car = car;
    player.mode = 'car';
    mesh.group.visible = false;
    G.audio.door();
    G.events.push({ type: 'enteredCar', car });
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.driver = 'parked';
    const side = 3.2;
    const px = car.x - Math.cos(car.heading) * side;
    const pz = car.z + Math.sin(car.heading) * side;
    const fixed = world.collideCircle(px, pz, 0.6);
    player.x = fixed.x;
    player.z = fixed.z;
    player.heading = car.heading;
    player.speed = 0;
    player.car = null;
    player.mode = 'foot';
    mesh.group.visible = true;
    G.audio.door();
    G.events.push({ type: 'exitedCar', car });
  }

  function useCrew(index) {
    if (player.crewCooldowns[index] > 0) return;
    const crew = CREW[index];
    player.crewCooldowns[index] = crew.cooldown;
    if (index === 0 && player.mode === 'car' && player.car) {
      player.car.nitro = 4;
      G.events.push({ type: 'crew', text: 'NITRO SURGE — Sable floors it' });
    } else if (index === 1) {
      if (player.mode === 'car' && player.car) {
        player.car.hp = player.car.maxHp;
        player.car.dead = false;
        G.events.push({ type: 'crew', text: 'FIELD REPAIR — Finn patches the ride' });
      } else {
        heal(40);
        G.events.push({ type: 'crew', text: 'FIELD REPAIR — Finn patches you up' });
      }
    } else if (index === 2) {
      G.police.addHeat(-220);
      G.events.push({ type: 'crew', text: 'DEAD ZONE — Nadia scrambles the scanners' });
    }
    G.audio.ability();
  }

  function reload() {
    const w = currentWeapon();
    const a = player.ammo[w.id];
    if (!a || a.inMag >= w.mag || a.reserve <= 0 || w.mag === Infinity) return;
    player.reloadT = w.reload;
    G.audio.reload();
  }

  function finishReload() {
    const w = currentWeapon();
    const a = player.ammo[w.id];
    const need = w.mag - a.inMag;
    const take = Math.min(need, a.reserve);
    a.inMag += take;
    a.reserve -= take;
  }

  function shoot() {
    const w = currentWeapon();
    const a = player.ammo[w.id];
    if (player.reloadT > 0 || player.fireT > 0) return;
    if (w.id === 'fists') {
      player.fireT = 1 / w.rate;
      player.meleeT = 0.25;
      const reach = w.range;
      const fx = Math.sin(player.heading);
      const fz = Math.cos(player.heading);
      const ped = G.peds.nearest(player.x + fx * reach, player.z + fz * reach, 2.2);
      if (ped) {
        G.peds.knockDown(ped);
        G.police.addHeat(HEAT.hitPed);
      }
      const car = G.vehicles.nearest(player.x + fx * reach, player.z + fz * reach, 3);
      if (car) G.vehicles.damage(car, w.damage, player);
      G.audio.swing();
      return;
    }
    if (a.inMag <= 0) {
      reload();
      return;
    }
    player.fireT = 1 / w.rate;
    a.inMag -= 1;
    player.stats.shotsFired += 1;
    G.police.addHeat(HEAT.shot * 0.4);
    G.peds.scare(player.x, player.z, 26);

    RAY.setFromCamera(CENTER, render.camera);
    RAY.far = w.range;
    const targets = [
      ...G.vehicles.list.map((c) => c.mesh.group),
      ...G.peds.list.map((p) => p.mesh.group),
      ...render.shootables,
    ];
    const muzzle = {
      x: player.x + Math.sin(player.heading) * 0.8,
      y: 1.35,
      z: player.z + Math.cos(player.heading) * 0.8,
    };
    render.flash(muzzle.x, muzzle.y, muzzle.z);
    G.audio.shot(w.id);

    for (let p = 0; p < w.pellets; p += 1) {
      const spread = w.spread;
      const dir = RAY.ray.direction.clone();
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
      RAY.ray.direction.copy(dir);
      const hits = RAY.intersectObjects(targets, true);
      const hit = hits[0];
      if (!hit) continue;
      const point = hit.point;
      let obj = hit.object;
      let carHit = null;
      let pedHit = null;
      while (obj) {
        if (obj.userData.car) { carHit = obj.userData.car; break; }
        if (obj.userData.ped) { pedHit = obj.userData.ped; break; }
        obj = obj.parent;
      }
      const dist = hit.distance;
      if (carHit) {
        G.vehicles.damage(carHit, damageAt(w, dist), player);
        render.burst(point.x, point.y, point.z, 0xffc860, 6, 4);
        if (carHit.driver === 'police') G.police.addHeat(HEAT.hitCop * 0.5);
      } else if (pedHit) {
        G.peds.knockDown(pedHit);
        G.police.addHeat(HEAT.hitPed);
      } else {
        render.burst(point.x, point.y, point.z, 0xcccccc, 4, 3);
      }
    }
  }

  function updateFoot(dt) {
    const throttle = throttleAxis(input);
    const steer = steerAxis(input);
    const sprint = down(input, 'ShiftLeft') || down(input, 'ShiftRight');
    const maxSpeed = sprint ? 10.5 : 6;
    player.heading += steer * 2.6 * dt;
    const target = throttle * maxSpeed;
    player.speed += (target - player.speed) * Math.min(1, dt * 10);
    player.x += Math.sin(player.heading) * player.speed * dt;
    player.z += Math.cos(player.heading) * player.speed * dt;
    const fixed = world.collideCircle(player.x, player.z, 0.6);
    player.x = fixed.x;
    player.z = fixed.z;
    // Pedestrians are soft: push them aside instead of stopping.
    for (const ped of G.peds.list) {
      if (ped.state === 'down') continue;
      const dx = ped.x - player.x;
      const dz = ped.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.1 && d > 0.001) {
        ped.x = player.x + (dx / d) * 1.1;
        ped.z = player.z + (dz / d) * 1.1;
      }
    }
    // Cars on foot: running into one hurts.
    const car = G.vehicles.nearest(player.x, player.z, 2.6);
    if (car && Math.abs(car.speed) > 6) {
      hurt(Math.abs(car.speed) * 1.2, car);
      player.x += Math.sin(player.heading) * -2;
      player.z += Math.cos(player.heading) * -2;
      render.addShake(0.25);
    }
    player.phase += dt * Math.abs(player.speed) * 1.9;
    const swing = Math.sin(player.phase) * clamp(Math.abs(player.speed) / 6, 0, 1) * 0.7;
    mesh.legL.rotation.x = swing;
    mesh.legR.rotation.x = -swing;
    mesh.armL.rotation.x = -swing * 0.6;
    mesh.armR.rotation.x = player.meleeT > 0 ? -1.4 : swing * 0.6;
    mesh.group.position.set(player.x, 0, player.z);
    mesh.group.rotation.set(0, player.heading, 0);
    gun.visible = player.weapon !== 'fists';
    if (pressed(input, 'KeyE')) tryEnterCar();
  }

  function updateCar(dt) {
    const car = player.car;
    if (!car) { player.mode = 'foot'; return; }
    if (car.dead) {
      G.vehicles.stepCar(car, dt, 0, 0, false);
      if (pressed(input, 'KeyE')) exitCar();
      return;
    }
    const throttle = throttleAxis(input);
    const steer = steerAxis(input);
    const handbrake = down(input, 'Space');
    const before = { x: car.x, z: car.z };
    G.vehicles.stepCar(car, dt, throttle, steer, handbrake);
    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
    player.speed = car.speed;
    player.stats.distanceDriven += Math.hypot(car.x - before.x, car.z - before.z);
    player.stats.topSpeed = Math.max(player.stats.topSpeed, Math.abs(car.speed) * 3.6);
    // Running over a pedestrian while driving.
    const ped = G.peds.nearest(car.x, car.z, 2.6);
    if (ped && Math.abs(car.speed) > 4) {
      G.peds.knockDown(ped);
      G.police.addHeat(HEAT.hitPed);
      G.peds.scare(car.x, car.z, 20);
      render.addShake(0.1);
    }
    if (pressed(input, 'KeyE')) exitCar();
  }

  function update(dt) {
    if (player.dead || player.busted) return;
    player.fireT = Math.max(0, player.fireT - dt);
    player.meleeT = Math.max(0, player.meleeT - dt);
    if (player.reloadT > 0) {
      player.reloadT -= dt;
      if (player.reloadT <= 0) finishReload();
    }
    for (let i = 0; i < 3; i += 1) player.crewCooldowns[i] = Math.max(0, player.crewCooldowns[i] - dt);

    // Weapon switching: number keys, or the wheel (Tab) handled by the HUD.
    for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']) {
      if (pressed(input, code)) {
        const w = weaponByKey(code.slice(5));
        if (w) {
          player.weapon = w.id;
          player.reloadT = 0;
          G.audio.select();
        }
      }
    }
    if (pressed(input, 'KeyR')) reload();
    if (pressed(input, 'KeyZ')) useCrew(0);
    if (pressed(input, 'KeyX')) useCrew(1);
    if (pressed(input, 'KeyC')) useCrew(2);

    if (player.mode === 'car') updateCar(dt);
    else {
      updateFoot(dt);
      const w = currentWeapon();
      const wantFire = w.auto ? input.mouseDown : input.mousePressed;
      if (wantFire) shoot();
    }

    // Medallions: walk or drive over one to collect it.
    for (const m of world.medallions) {
      if (m.taken) continue;
      if (Math.hypot(m.x - player.x, m.z - player.z) < 3) {
        m.taken = true;
        player.stats.medallions += 1;
        addMoney(MEDALLION_REWARD);
        G.events.push({ type: 'medallion', count: player.stats.medallions });
        G.audio.pickup();
      }
    }
  }

  return {
    player, hurt, heal, addMoney, addRp, currentWeapon, useCrew,
    tryEnterCar, exitCar, reload, update,
  };
}
