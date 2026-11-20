// Solmar: the screenshot scenes behind ?shot=chase|foot|menu|garage. Each
// one stages a real game state — a mission in progress, a wanted level, a
// crew, a dialogue line — then runs the simulation forward a fixed number
// of steps with a simple autopilot, so the frame is what live play really
// looks like and the same seed always gives the same frame.

import { STEP } from './config.js';

const SAMPLE_STEPS = 150; // 2.5 s of fixed-step play before the shot

function autopilotDrive(G) {
  const car = G.player.player.car;
  if (!car) return;
  // Hold the throttle, steer gently toward the road ahead.
  G.vehicles.stepCar(car, STEP, 1, 0, false);
  G.player.player.x = car.x;
  G.player.player.z = car.z;
  G.player.player.heading = car.heading;
  G.player.player.speed = car.speed;
}

function runSteps(G, steps, drive) {
  for (let i = 0; i < steps; i += 1) {
    if (drive) autopilotDrive(G);
    G.vehicles.update(STEP);
    G.peds.update(STEP);
    G.police.update(STEP);
    G.missions.update(STEP);
    G.time.elapsed += STEP;
    G.time.clock += STEP / 60;
  }
}

function seedTrafficOnBoulevard(G, count) {
  // A few cars ahead on Strand Boulevard so the chase has traffic to pass.
  for (let n = 0; n < count; n += 1) {
    const z = 40 - n * 34;
    const car = G.vehicles.spawn(n % 2 ? 'sedan' : 'coupe', 240 + (n % 2 ? -3.5 : 3.5), z, Math.PI, 'traffic');
    car.route = { road: 'ave', line: 240, dir: -1 };
    car.speed = 12;
  }
}

function stageChase(G) {
  const p = G.player.player;
  p.money = 12750;
  p.rp = 3900;
  p.health = 72;
  p.armour = 55;
  p.weapon = 'smg';
  // Rook in the orange Cometa GT, northbound on Strand Boulevard at speed.
  const car = G.vehicles.spawn('sports', 236.5, 80, Math.PI, 'player', { color: 0xe86a2c });
  car.speed = 30;
  p.car = car;
  p.mode = 'car';
  p.x = car.x;
  p.z = car.z;
  p.heading = car.heading;
  p.mesh.group.visible = false;
  // Mission 6, stage 1/1: wreck the courier van, which is ahead of us.
  G.missions.startMission(5);
  const cur = G.missions.state.current;
  if (cur && cur.target) {
    cur.target.x = 240;
    cur.target.z = 20;
    cur.target.heading = Math.PI;
    cur.target.speed = 14;
    cur.targetDest = { x: 240, z: -260 };
    cur.target.hp = 150;
  }
  seedTrafficOnBoulevard(G, 3);
  // Five stars: the helicopter and six units are already on us. No roadblock
  // in the staged chase — the frame reads cleaner as a pure pursuit.
  G.police.addHeat(900);
  G.police.police.roadblockT = 30;
  for (let i = 0; i < 3; i += 1) G.police.update(STEP);
  // Put the helicopter at the far, ahead point of its orbit so the chase
  // camera catches it in the sky.
  if (G.police.police.heli) G.police.police.heli.angle = Math.PI;
  G.hud.clearBanner();
  G.hud.clearDialogue();
  G.hud.saySticky('NADIA', 'He is making for the north end! Wreck the van before it gets away!', '#38b8c8');
  G.audio.setStation(0);
  runSteps(G, 70, true);
  // Keep pedestrians out of the camera's face: anyone in the chase corridor
  // near the car steps over to Marina Avenue.
  const cz = G.player.player.z;
  G.peds.list.forEach((ped, i) => {
    if (Math.abs(ped.x - 240) < 18 && Math.abs(ped.z - cz) < 45) {
      ped.x = 160 + (i % 3) * 8;
      ped.target = { x: 160, z: ped.z + 60 };
    }
  });
}

function stageFoot(G) {
  const p = G.player.player;
  p.money = 4320;
  p.rp = 1450;
  p.health = 88;
  p.armour = 20;
  p.weapon = 'smg';
  p.x = 6;
  p.z = 44;
  p.heading = Math.PI * 0.85;
  p.mode = 'foot';
  p.mesh.group.visible = true;
  p.mesh.group.position.set(p.x, 0, p.z);
  // Mission 2 in progress; two stars and the units closing in.
  G.missions.startMission(1);
  G.police.addHeat(280);
  for (let i = 0; i < 3; i += 1) G.police.update(STEP);
  G.hud.clearBanner();
  G.hud.clearDialogue();
  G.hud.saySticky('FINN', 'The Cometa is at the docks. Take any car and go — quietly.', '#4a9e5c');
  // The weapon wheel open, mid-selection, shows the whole arsenal. Park the
  // mouse over the SMG segment so the wheel highlights the equipped weapon.
  G.input.mouseX = 694;
  G.input.mouseY = 444;
  G.hud.showWheel(true, true);
  runSteps(G, 60, false);
}

function stageMenu(G) {
  const p = G.player.player;
  p.money = 8900;
  p.rp = 2600;
  p.health = 100;
  p.armour = 40;
  p.weapon = 'rifle';
  const car = G.vehicles.spawn('coupe', 196, 196, Math.PI * 0.75, 'player', { color: 0x38b8c8 });
  p.car = car;
  p.mode = 'car';
  p.x = car.x;
  p.z = car.z;
  p.heading = car.heading;
  p.mesh.group.visible = false;
  G.missions.startMission(2);
  G.missions.state.completed = 2;
  Object.assign(p.stats, {
    missionsDone: 2, faresDone: 3, medallions: 4, distanceDriven: 12400,
    topSpeed: 142, carsStolen: 5, timesBusted: 1, timesWasted: 0,
  });
  G.hud.clearBanner();
  G.hud.clearDialogue();
  G.hud.fillPause();
  G.hud.show('pause', true);
  G.hud.show('hud', false);
}

function stageGarage(G) {
  const p = G.player.player;
  p.money = 6400;
  p.rp = 3100;
  p.health = 100;
  p.armour = 0;
  p.weapon = 'pistol';
  const car = G.vehicles.spawn('sports', 148, 96, Math.PI / 2, 'player', {
    color: 0xe86a2c, engine: 1, armour: 0,
  });
  car.hp = 62;
  p.car = car;
  p.mode = 'car';
  p.x = car.x;
  p.z = car.z;
  p.heading = car.heading;
  p.mesh.group.visible = false;
  G.missions.startMission(3);
  G.missions.state.completed = 3;
  G.hud.clearBanner();
  G.hud.clearDialogue();
  G.hud.fillGarage();
  G.hud.show('garage', true);
}

export function stageShot(name, G) {
  if (name === 'foot') stageFoot(G);
  else if (name === 'menu') stageMenu(G);
  else if (name === 'garage') stageGarage(G);
  else stageChase(G);
  return { shot: name };
}
