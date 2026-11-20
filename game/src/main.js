// Solmar: boot and the one loop. Builds the world, wires every module into
// the shared game object G, and runs the fixed-step simulation with the
// screens around it: title, play, paused, garage, busted, wasted, complete.
//
// ?seed=N fixes the city. ?shot=chase|foot|menu|garage (with &seed=N) stages
// that scene instead of the title screen and sets window.__shotReady once
// it has rendered, for screenshots.
import { CLOCK_START, STEP, UPGRADES } from './config.js';
import { makeRng } from './random.js';
import { createInput, down, endFrame, pressed } from './input.js';
import { LOCATIONS, createWorld } from './world.js';
import { createRenderer } from './render.js';
import { PARKED_COUNT, TRAFFIC_COUNT, createVehicles } from './vehicles.js';
import { PED_COUNT, createPedestrians } from './pedestrians.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createSave } from './save.js';
import { freshAmmo } from './weapons.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

// --- Build the world ----------------------------------------------------------
const canvas = document.getElementById('game');
const world = createWorld(seed);
const render = createRenderer(canvas, world);
const input = createInput();
const rng = makeRng(seed ^ 0x9e3779b9);

const G = {
  seed, rng, world, render, input,
  time: { elapsed: 0, clock: CLOCK_START },
  events: [],
  mode: 'title',
};

// Modules, in dependency order. Each reads G lazily, so the order only
// matters for the few that build meshes at creation.
G.audio = createAudio();
G.vehicles = createVehicles(G);
G.peds = createPedestrians(G);
G.police = createPolice(G);
G.player = createPlayer(G);
G.player.player.ammo = freshAmmo();
G.missions = createMissions(G);
G.hud = createHud(G);
G.save = createSave(G);

// Medallion meshes, one per hidden medallion.
const medallionMeshes = world.medallions.map((m) => {
  const mesh = render.makeMedallion();
  mesh.position.set(m.x, 1.4, m.z);
  return mesh;
});

// The starting crowd and traffic.
G.vehicles.spawnTraffic(TRAFFIC_COUNT);
G.vehicles.spawnParked(PARKED_COUNT);
for (let i = 0; i < PED_COUNT; i += 1) G.peds.spawn();

// --- Screens -------------------------------------------------------------------
const status = document.getElementById('status');
function announce(message) {
  status.textContent = message;
}

function setMode(mode) {
  G.mode = mode;
  G.hud.show('hud', mode === 'play' || mode === 'garage');
  G.hud.show('title', mode === 'title');
  G.hud.show('pause', mode === 'paused');
  G.hud.show('garage', mode === 'garage');
  G.hud.show('busted', mode === 'busted');
  G.hud.show('wasted', mode === 'wasted');
  G.hud.show('complete', mode === 'complete');
  render.setMode(mode === 'title' ? 'orbit' : 'follow');
}

function startGame(fromSave) {
  G.audio.init();
  if (fromSave) {
    G.save.load();
    G.hud.note('Save loaded — welcome back to Solmar');
  }
  setMode('play');
  if (!G.missions.current && !G.missions.state.gameComplete && !G.missions.state.failed) {
    G.missions.startMission(G.missions.state.index);
  }
  announce('Playing. Drive with W A S D. E enters a car.');
}

let respawnT = 0;
function respawn(atHospital) {
  const p = G.player.player;
  const spot = atHospital ? LOCATIONS.hospital : LOCATIONS.policeStation;
  if (p.car) {
    p.car.driver = 'parked';
    p.car = null;
  }
  p.mode = 'foot';
  p.x = spot.x;
  p.z = spot.z;
  p.heading = 0;
  p.speed = 0;
  p.health = 100;
  p.armour = 0;
  p.dead = false;
  p.busted = false;
  p.mesh.group.visible = true;
  G.police.reset();
  const lost = Math.floor(p.money * 0.1);
  p.money -= lost;
  G.hud.note(lost > 0 ? `You lost $${lost.toLocaleString('en-US')}` : 'Back on your feet');
  setMode('play');
}

// --- Garage purchases ------------------------------------------------------------
const PAINT_HEX = [0xe86a2c, 0x38b8c8, 0x1a1d22, 0xe078a0, 0x9ac83c];
let paintIdx = 0;
G.garageBuy = function garageBuy(kind) {
  const p = G.player.player;
  const car = p.car;
  if (!car) return;
  if (kind === 'engine' && car.engine < 3) {
    const price = UPGRADES.engine[car.engine + 1];
    if (p.money >= price) {
      p.money -= price;
      car.engine += 1;
      G.audio.pickup();
    }
  } else if (kind === 'armour' && car.armour < 3) {
    const price = UPGRADES.armour[car.armour + 1];
    if (p.money >= price) {
      p.money -= price;
      car.armour += 1;
      car.maxHp = car.def.hp * (1 + car.armour * 0.25);
      car.hp = Math.min(car.maxHp, car.hp + car.def.hp * 0.25);
      G.audio.pickup();
    }
  } else if (kind === 'repair') {
    if (p.money >= 150 && car.hp < car.maxHp) {
      p.money -= 150;
      car.hp = car.maxHp;
      car.dead = false;
      G.audio.pickup();
    }
  } else if (kind === 'paint') {
    if (p.money >= UPGRADES.paintPrice) {
      p.money -= UPGRADES.paintPrice;
      paintIdx = (paintIdx + 1) % PAINT_HEX.length;
      car.color = PAINT_HEX[paintIdx];
      car.mesh.bodyMat.color.setHex(car.color);
      G.audio.pickup();
    }
  }
  G.hud.fillGarage();
};

// --- Events ------------------------------------------------------------------------
function handleEvents() {
  for (const event of G.events.splice(0)) {
    if (event.type === 'wantedUp') {
      G.hud.note(`WANTED LEVEL ${event.stars}${event.stars >= 4 ? ' — AIR UNIT DEPLOYED' : ''}`);
    } else if (event.type === 'rp') {
      // A rank-up is announced when the RP crosses a threshold.
      const ranks = [0, 500, 1200, 2200, 3500, 5200, 7500, 10500];
      const names = ['ROOKIE', 'RUNNER', 'HUSTLER', 'WHEELMAN', 'ENFORCER', 'OPERATOR', 'LIEUTENANT', 'KINGPIN'];
      for (let i = 1; i < ranks.length; i += 1) {
        if (event.before < ranks[i] && event.after >= ranks[i]) {
          G.hud.banner(`RANK UP — ${names[i]}`, 'The city is starting to know your name');
          G.audio.missionDone();
        }
      }
    } else if (event.type === 'medallion') {
      G.hud.note(`Sun Medallion ${event.count}/12 — +$500`);
    } else if (event.type === 'crew') {
      G.hud.note(event.text);
    } else if (event.type === 'carjack') {
      G.hud.note('Car stolen — the SCP noticed');
    } else if (event.type === 'busted') {
      setMode('busted');
      respawnT = 3;
      announce('Busted by the SCP.');
    } else if (event.type === 'wasted') {
      setMode('wasted');
      respawnT = 3;
      announce('Wasted.');
    } else if (event.type === 'gameComplete') {
      setMode('complete');
    }
  }
}

// --- Input that lives outside the simulation ---------------------------------------
function handleMenus() {
  if (G.mode === 'title') {
    // Enter starts a new game; the on-screen buttons start or continue.
    if (pressed(input, 'Enter')) startGame(false);
    return;
  }
  if (G.mode === 'complete') {
    if (pressed(input, 'Enter')) setMode('play');
    return;
  }
  if (G.mode === 'busted' || G.mode === 'wasted') return;

  if (pressed(input, 'Escape') || pressed(input, 'KeyP')) {
    if (G.mode === 'play') {
      G.hud.fillPause();
      setMode('paused');
    } else if (G.mode === 'paused' || G.mode === 'garage') {
      setMode('play');
    }
    return;
  }
  if (G.mode === 'paused') {
    if (pressed(input, 'Enter')) setMode('play');
    return;
  }
  if (G.mode === 'garage') {
    if (pressed(input, 'KeyG') || pressed(input, 'Enter')) setMode('play');
    return;
  }

  // Playing.
  const p = G.player.player;
  if (pressed(input, 'KeyN')) {
    const st = G.audio.nextStation();
    G.hud.note(`Radio: ${st.freq} ${st.name} — ${st.genre}`);
  }
  if (pressed(input, 'KeyM')) {
    G.hud.fillPause();
    setMode('paused');
  }
  if (pressed(input, 'KeyG') && p.mode === 'car' && Math.hypot(p.x - LOCATIONS.garage.x, p.z - LOCATIONS.garage.z) < 12) {
    G.hud.fillGarage();
    setMode('garage');
  }
  if (pressed(input, 'KeyF') && p.mode === 'foot' && Math.hypot(p.x - LOCATIONS.gunShop.x, p.z - LOCATIONS.gunShop.z) < 10) {
    if (p.money >= 200) {
      p.money -= 200;
      p.ammo = freshAmmo();
      G.hud.note('Ammo restocked — $200');
      G.audio.pickup();
    } else {
      G.hud.note('Not enough cash for ammo');
    }
  }
  if (G.missions.state.failed && pressed(input, 'Enter')) {
    G.missions.retryMission();
  }
  // Weapon wheel: hold Tab, pick with the mouse, release to confirm.
  if (pressed(input, 'Tab')) G.hud.showWheel(true);
  if (G.hud.wheelOpen) {
    G.hud.updateWheel(input.mouseX, input.mouseY);
    if (!down(input, 'Tab') && !G.hud.wheelSticky) G.hud.confirmWheel();
  }
}

// --- Title screen buttons ------------------------------------------------------------
document.getElementById('title-start').addEventListener('click', () => startGame(false));
const continueBtn = document.getElementById('title-continue');
if (G.save.hasSave()) {
  continueBtn.classList.remove('hidden');
  continueBtn.addEventListener('click', () => startGame(true));
}
document.getElementById('btn-resume').addEventListener('click', () => setMode('play'));
document.getElementById('btn-save').addEventListener('click', () => {
  G.save.save();
  G.hud.note('Game saved');
});
document.getElementById('btn-restart').addEventListener('click', () => {
  G.missions.startMission(G.missions.state.index);
  setMode('play');
});
document.getElementById('btn-title').addEventListener('click', () => setMode('title'));
document.getElementById('btn-complete').addEventListener('click', () => setMode('play'));
document.getElementById('garage-close').addEventListener('click', () => setMode('play'));

// --- The loop ---------------------------------------------------------------------------
let last = performance.now();
let accumulator = 0;
let frames = 0;

function stepWorld(dt) {
  G.time.elapsed += dt;
  G.time.clock += dt / 60;
  G.player.update(dt);
  G.vehicles.update(dt);
  G.peds.update(dt);
  G.police.update(dt);
  G.missions.update(dt);
  // Medallions spin; taken ones hide.
  for (let i = 0; i < world.medallions.length; i += 1) {
    const mesh = medallionMeshes[i];
    mesh.visible = !world.medallions[i].taken;
    if (mesh.visible) mesh.rotation.y += dt * 2;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  frames += 1;

  handleMenus();

  if (G.mode === 'play') {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      stepWorld(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
    handleEvents();
    // Audio follows the car and the nearest police unit.
    const p = G.player.player;
    let nearest = Infinity;
    for (const u of G.police.police.units) {
      nearest = Math.min(nearest, Math.hypot(u.car.x - p.x, u.car.z - p.z));
    }
    G.audio.update(dt, {
      inCar: p.mode === 'car',
      speed: p.mode === 'car' && p.car ? p.car.speed : 0,
      policeNear: nearest === Infinity ? 0 : nearest,
    });
    G.hud.update(dt);
  } else if (G.mode === 'title') {
    // Attract mode: the city lives behind the title.
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      G.time.elapsed += STEP;
      G.vehicles.update(STEP);
      G.peds.update(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
  } else if (G.mode === 'busted' || G.mode === 'wasted') {
    respawnT -= dt;
    if (respawnT <= 0) respawn(G.mode === 'wasted');
  }

  const p = G.player.player;
  render.update(dt, G.time.elapsed, {
    x: p.x, z: p.z, heading: p.heading,
    speed: p.mode === 'car' && p.car ? p.car.speed : p.speed,
    inCar: p.mode === 'car',
  });
  render.render();
  endFrame(input);

  if (shot && frames === 3) window.__shotReady = true;
}

// --- Boot ---------------------------------------------------------------------------------
if (shot) {
  // Screenshot mode: no title screen, stage the scene, then play live.
  setMode('play');
  G.hud.show('hud', true);
  stageShot(shot, G);
  announce(`Solmar screenshot scene: ${shot}.`);
} else {
  setMode('title');
  G.hud.show('hud', false);
  announce('Solmar. Press Enter or click to start.');
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.mode === 'play') {
    G.hud.fillPause();
    setMode('paused');
  }
});

requestAnimationFrame(frame);
