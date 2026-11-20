// Solmar: the story. Eight missions in a chain, each a list of stages —
// drive-to, steal, deliver, checkpoints, lose-the-heat, survive, wreck —
// plus the fare side-job (passengers who pay cash) and the objective
// beacons the world shows for all of it.

import { FARES } from './config.js';
import { pick, range } from './random.js';

const DIALOGUE = {
  sable: { name: 'SABLE', color: '#e07840' },
  finn: { name: 'FINN', color: '#4a9e5c' },
  nadia: { name: 'NADIA', color: '#38b8c8' },
  rook: { name: 'ROOK', color: '#ffd21f' },
};

const MISSIONS = [
  {
    name: 'Back Behind the Wheel', giver: 'sable', reward: 800, rp: 400,
    brief: [
      ['sable', 'Rook. You still owe me a drive. Meet me at the Marina Pier.'],
      ['rook', 'One drive. Then I am done, Sable.'],
      ['sable', 'Sure you are. Keys are in the ignition. Move.'],
    ],
    stages: [
      { type: 'goto', x: 252, z: 248, text: 'Drive to the Marina meet' },
      { type: 'gotoTimed', x: -160, z: -160, time: 110, text: 'Get Sable to Founder Plaza' },
    ],
  },
  {
    name: 'The Marina Run', giver: 'finn', reward: 1200, rp: 500,
    brief: [
      ['finn', 'A Cometa GT is sitting at the docks, no alarm, no owner in sight.'],
      ['finn', 'Bring it to the garage in one piece and the SCP will notice. Count on it.'],
    ],
    stages: [
      { type: 'steal', carType: 'sports', x: -208, z: 236, heading: 0, wanted: 2, text: 'Steal the Cometa GT from the docks' },
      { type: 'deliver', x: 148, z: 96, text: 'Deliver the Cometa to the garage' },
    ],
  },
  {
    name: 'Heat on the Strip', giver: 'nadia', reward: 1500, rp: 600,
    brief: [
      ['nadia', 'The SCP is running a sweep down the Strand tonight.'],
      ['nadia', 'Hit my three checkpoints, then vanish. If they catch you, I never met you.'],
    ],
    stages: [
      { type: 'checkpoints', points: [[240, -160], [240, 0], [240, 160]], wanted: 3, text: 'Hit the checkpoints down the Strand' },
      { type: 'lose', text: 'Lose the heat' },
    ],
  },
  {
    name: 'Dockside Exchange', giver: 'sable', reward: 1800, rp: 700,
    brief: [
      ['sable', 'A package is waiting at the Dock Vault. Somebody downtown wants it more.'],
      ['sable', 'Two minutes, Rook. The buyer does not wait.'],
    ],
    stages: [
      { type: 'goto', x: -208, z: 244, text: 'Pick up the package at the Dock Vault' },
      { type: 'gotoTimed', x: 40, z: -40, time: 120, text: 'Deliver the package downtown' },
    ],
  },
  {
    name: "The Fixer's Favor", giver: 'finn', reward: 1400, rp: 600,
    brief: [
      ['finn', 'Three clients, three rides, no questions. The Fixer remembers a favour.'],
      ['rook', 'Since when do I drive a cab?'],
      ['finn', 'Since the cab pays. Go.'],
    ],
    stages: [
      { type: 'taxi', count: 3, text: 'Drive the Fixer\u2019s clients' },
    ],
  },
  {
    name: 'Wreck the Courier', giver: 'nadia', reward: 2200, rp: 800,
    brief: [
      ['nadia', 'A rival courier van is running the Strand to the Marina. It carries our route book.'],
      ['nadia', 'Wreck it before it reaches the pier. Ram it, shoot it, I do not care how.'],
    ],
    stages: [
      { type: 'wreck', from: [240, -200], to: [248, 240], text: 'Wreck the courier van before it reaches the Marina' },
    ],
  },
  {
    name: 'Payday at the Docks', giver: 'sable', reward: 3000, rp: 1000,
    brief: [
      ['sable', 'The vault job is on. Get to the docks, hold the SCP off, and bring the haul home.'],
      ['rook', 'Hold them off how long?'],
      ['sable', 'Long enough. Try not to get shot.'],
    ],
    stages: [
      { type: 'goto', x: -208, z: 244, text: 'Reach the Dock Vault' },
      { type: 'survive', time: 75, wanted: 4, text: 'Hold off the SCP' },
      { type: 'goto', x: 148, z: 96, text: 'Get the haul to the garage' },
    ],
  },
  {
    name: 'One Last Run', giver: 'finn', reward: 5000, rp: 1500,
    brief: [
      ['finn', 'A gold Cometa, downtown, one owner, no security. The Villa buyer pays in full.'],
      ['finn', 'The whole city will be on you. One last run, Rook. Make it clean.'],
    ],
    stages: [
      { type: 'steal', carType: 'sports', x: 8, z: -8, heading: Math.PI, wanted: 5, color: 0xe8c33a, text: 'Take the gold Cometa from Downtown' },
      { type: 'deliver', x: -168, z: -252, text: 'Deliver the Cometa to the Hill Villa' },
    ],
  },
];

export function createMissions(G) {
  const { world, render, rng } = G;
  const beacon = render.makeBeacon(0xffd21f);
  beacon.group.visible = false;
  const fareBeacon = render.makeBeacon(0x51d88a);
  fareBeacon.group.visible = false;

  const state = {
    index: 0, // next mission to start
    current: null, // {def, stageIdx, stage, timer, taxi, target, missionCar}
    failed: null, // {reason} while the retry prompt shows
    completed: 0,
    gameComplete: false,
    fare: null, // {pickup, drop, leg, reward, passenger}
    fareTimer: 12,
    nextMissionT: 0,
  };

  function say(who, text) {
    const d = DIALOGUE[who];
    G.hud.say(d.name, text, d.color);
  }

  function applyWanted(stars) {
    const thresholds = [0, 100, 250, 450, 650, 850];
    if (G.police.police.stars < stars) {
      G.police.addHeat(thresholds[stars] - G.police.police.heat + 5);
    }
  }

  function setBeacon(x, z) {
    beacon.group.visible = true;
    beacon.group.position.set(x, 0, z);
  }

  function hideBeacon() {
    beacon.group.visible = false;
  }

  function startStage() {
    const cur = state.current;
    const stage = cur.def.stages[cur.stageIdx];
    cur.stage = stage;
    cur.timer = stage.time ?? 0;
    cur.taxi = null;
    cur.target = null;
    if (stage.type === 'goto' || stage.type === 'gotoTimed') {
      setBeacon(stage.x, stage.z);
    } else if (stage.type === 'steal') {
      cur.missionCar = G.vehicles.spawn(stage.carType, stage.x, stage.z, stage.heading, 'parked', { color: stage.color });
      setBeacon(stage.x, stage.z);
    } else if (stage.type === 'deliver') {
      setBeacon(stage.x, stage.z);
    } else if (stage.type === 'checkpoints') {
      if (stage.wanted) applyWanted(stage.wanted);
      cur.checkpoint = 0;
      setBeacon(stage.points[0][0], stage.points[0][1]);
    } else if (stage.type === 'lose') {
      hideBeacon();
    } else if (stage.type === 'survive') {
      if (stage.wanted) applyWanted(stage.wanted);
      hideBeacon();
    } else if (stage.type === 'taxi') {
      cur.taxi = { done: 0, leg: 'pickup', point: null, drop: null };
      nextTaxiPoint();
    } else if (stage.type === 'wreck') {
      const [fx, fz] = stage.from;
      const [tx, tz] = stage.to;
      cur.target = G.vehicles.spawn('van', fx, fz, Math.atan2(tx - fx, tz - fz), 'mission', { hp: 220 });
      cur.targetDest = { x: tx, z: tz };
      setBeacon(fx, fz);
    }
  }

  function nextTaxiPoint() {
    const cur = state.current;
    const p = world.randomRoadPoint();
    const d = world.randomRoadPoint();
    cur.taxi.point = { x: p.x, z: p.z };
    cur.taxi.drop = { x: d.x, z: d.z };
    cur.taxi.leg = 'pickup';
    setBeacon(p.x, p.z);
  }

  function startMission(index) {
    const def = MISSIONS[index];
    state.index = index;
    state.failed = null;
    state.current = { def, stageIdx: 0, stage: null, timer: 0, taxi: null, target: null, missionCar: null };
    G.hud.banner(`MISSION ${index + 1} — ${def.name.toUpperCase()}`, def.brief[0][1]);
    for (const [who, text] of def.brief) say(who, text);
    startStage();
    G.audio.missionStart();
  }

  function advanceStage() {
    const cur = state.current;
    cur.stageIdx += 1;
    if (cur.stageIdx >= cur.def.stages.length) {
      completeMission();
      return;
    }
    startStage();
    G.audio.stageDone();
  }

  function completeMission() {
    const cur = state.current;
    const def = cur.def;
    G.player.addMoney(def.reward);
    G.player.addRp(def.rp);
    G.player.player.stats.missionsDone += 1;
    state.completed += 1;
    hideBeacon();
    G.hud.banner('MISSION COMPLETE', `+$${def.reward}   +${def.rp} RP`);
    say(def.giver, pick(rng, ['Clean work, Rook.', 'That is how it is done.', 'The city is talking about you now.']));
    G.audio.missionDone();
    G.save.autosave();
    state.current = null;
    if (state.index + 1 >= MISSIONS.length) {
      state.gameComplete = true;
      G.events.push({ type: 'gameComplete' });
    } else {
      state.nextMissionT = 6;
    }
  }

  function failMission(reason) {
    const cur = state.current;
    if (cur && cur.target && !cur.target.dead) {
      // The courier van keeps driving away; leave it as traffic.
      cur.target.driver = 'traffic';
    }
    hideBeacon();
    state.failed = { reason, index: state.index };
    state.current = null;
    G.hud.banner('MISSION FAILED', reason);
    G.audio.missionFail();
  }

  function retryMission() {
    if (!state.failed) return;
    startMission(state.failed.index);
  }

  // --- Fares (side job) ------------------------------------------------------
  function offerFare() {
    const p = world.randomRoadPoint();
    const d = world.randomRoadPoint();
    const reward = Math.round(range(rng, FARES.min, FARES.max) / 10) * 10;
    state.fare = {
      pickup: { x: p.x, z: p.z }, drop: { x: d.x, z: d.z },
      leg: 'pickup', reward,
      passenger: pick(rng, ['A tourist', 'A dock worker', 'A night nurse', 'A street vendor', 'A film student']),
    };
    fareBeacon.group.visible = true;
    fareBeacon.group.position.set(p.x, 0, p.z);
    G.hud.note(`${state.fare.passenger} needs a ride — $${reward}`);
  }

  function updateFare(dt) {
    if (!state.fare) {
      state.fareTimer -= dt;
      if (state.fareTimer <= 0) {
        state.fareTimer = 25;
        offerFare();
      }
      return;
    }
    const f = state.fare;
    const p = G.player.player;
    const target = f.leg === 'pickup' ? f.pickup : f.drop;
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d < 9) {
      if (f.leg === 'pickup') {
        f.leg = 'drop';
        fareBeacon.group.position.set(f.drop.x, 0, f.drop.z);
        say('rook', 'Hop in. Where to?');
        G.hud.note(`Drive ${f.passenger.toLowerCase()} to the drop-off`);
      } else {
        G.player.addMoney(f.reward);
        G.player.addRp(60);
        p.stats.faresDone += 1;
        G.hud.note(`Fare done — +$${f.reward}`);
        G.audio.pickup();
        fareBeacon.group.visible = false;
        state.fare = null;
        state.fareTimer = 20;
      }
    }
  }

  function updateTargetVan(dt) {
    const cur = state.current;
    const van = cur.target;
    if (!van || van.dead) return;
    const dest = cur.targetDest;
    const dx = dest.x - van.x;
    const dz = dest.z - van.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 12) {
      failMission('The courier reached the Marina.');
      return;
    }
    // Drive south along the Strand, dodging nothing: it is in a hurry.
    const desired = Math.atan2(dx, dz);
    let diff = desired - van.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2));
    G.vehicles.stepCar(van, dt, van.speed < 17 ? 0.8 : 0, steer, false);
    beacon.group.position.set(van.x, 0, van.z);
  }

  function update(dt) {
    // Beacon spin and bob.
    if (beacon.group.visible) {
      beacon.ring.rotation.z += dt * 1.5;
      beacon.gem.position.y = 5.5 + Math.sin(G.time.elapsed * 2.2) * 0.5;
      beacon.gem.rotation.y += dt * 2;
    }
    if (fareBeacon.group.visible) {
      fareBeacon.ring.rotation.z += dt * 1.5;
      fareBeacon.gem.position.y = 5.5 + Math.sin(G.time.elapsed * 2.2 + 1) * 0.5;
      fareBeacon.gem.rotation.y += dt * 2;
    }

    if (state.nextMissionT > 0) {
      state.nextMissionT -= dt;
      if (state.nextMissionT <= 0) startMission(state.index + 1);
    }

    updateFare(dt);

    const cur = state.current;
    if (!cur) return;
    const stage = cur.stage;
    const p = G.player.player;
    const distTo = (x, z) => Math.hypot(x - p.x, z - p.z);

    if (stage.type === 'goto') {
      if (distTo(stage.x, stage.z) < 9) advanceStage();
    } else if (stage.type === 'gotoTimed') {
      cur.timer -= dt;
      if (distTo(stage.x, stage.z) < 9) advanceStage();
      else if (cur.timer <= 0) failMission('Out of time.');
    } else if (stage.type === 'steal') {
      if (p.mode === 'car' && p.car === cur.missionCar) {
        if (stage.wanted) applyWanted(stage.wanted);
        say(cur.def.giver, 'You have it. Now get out of there.');
        advanceStage();
      }
    } else if (stage.type === 'deliver') {
      if (p.mode === 'car' && p.car === cur.missionCar && distTo(stage.x, stage.z) < 10) advanceStage();
      else if (cur.missionCar && cur.missionCar.dead) failMission('The car is wrecked.');
      else if (p.mode === 'car' && p.car !== cur.missionCar && cur.missionCar) {
        // The player left the mission car behind: point back at it.
        setBeacon(cur.missionCar.x, cur.missionCar.z);
      } else if (p.mode === 'car' && p.car === cur.missionCar) {
        setBeacon(stage.x, stage.z);
      }
    } else if (stage.type === 'checkpoints') {
      const pt = stage.points[cur.checkpoint];
      if (distTo(pt[0], pt[1]) < 11) {
        cur.checkpoint += 1;
        G.audio.stageDone();
        if (cur.checkpoint >= stage.points.length) advanceStage();
        else setBeacon(stage.points[cur.checkpoint][0], stage.points[cur.checkpoint][1]);
      }
    } else if (stage.type === 'lose') {
      if (G.police.police.stars === 0) advanceStage();
    } else if (stage.type === 'survive') {
      cur.timer -= dt;
      if (cur.timer <= 0) advanceStage();
    } else if (stage.type === 'taxi') {
      const t = cur.taxi;
      const target = t.leg === 'pickup' ? t.point : t.drop;
      if (distTo(target.x, target.z) < 9) {
        if (t.leg === 'pickup') {
          t.leg = 'drop';
          setBeacon(t.drop.x, t.drop.z);
        } else {
          t.done += 1;
          G.player.addMoney(200);
          if (t.done >= stage.count) advanceStage();
          else nextTaxiPoint();
        }
      }
    } else if (stage.type === 'wreck') {
      if (cur.target.dead) {
        say('nadia', 'The van is scrap. The route book is ours.');
        advanceStage();
      } else {
        updateTargetVan(dt);
      }
    }
  }

  // What the mission tracker shows.
  function tracker() {
    const cur = state.current;
    if (!cur) {
      if (state.failed) {
        return { title: 'MISSION FAILED', stage: '', objective: state.failed.reason, next: 'Press ENTER to retry' };
      }
      if (state.gameComplete) {
        return { title: 'SOLMAR IS YOURS', stage: '', objective: 'Every mission complete. Free roam!', next: 'Fares and medallions remain' };
      }
      return { title: 'FREE ROAM', stage: '', objective: 'Explore Solmar — the next job comes soon', next: state.fare ? 'A fare is waiting (green marker)' : '' };
    }
    const def = cur.def;
    const stage = cur.stage;
    const total = def.stages.length;
    const next = cur.stageIdx + 1 < total ? def.stages[cur.stageIdx + 1].text : 'Mission complete';
    let objective = stage.text;
    let targetHp = null;
    if (stage.type === 'checkpoints') objective = `${stage.text} (${cur.checkpoint}/${stage.points.length})`;
    if (stage.type === 'gotoTimed' || stage.type === 'survive') objective = `${stage.text} — ${Math.max(0, Math.ceil(cur.timer))}s`;
    if (stage.type === 'taxi') objective = `${stage.text} (${cur.taxi.done}/${stage.count}) — ${cur.taxi.leg === 'pickup' ? 'pick up the client' : 'drop the client off'}`;
    if (stage.type === 'wreck' && cur.target) targetHp = Math.max(0, Math.round((cur.target.hp / cur.target.maxHp) * 100));
    return {
      title: `MISSION ${state.index + 1} · ${def.name.toUpperCase()}`,
      stage: `STAGE ${cur.stageIdx + 1}/${total}`,
      objective, next, targetHp,
    };
  }

  function markerPos() {
    if (beacon.group.visible) return { x: beacon.group.position.x, z: beacon.group.position.z, color: '#ffd21f' };
    if (fareBeacon.group.visible) return { x: fareBeacon.group.position.x, z: fareBeacon.group.position.z, color: '#51d88a' };
    return null;
  }

  return {
    state, MISSIONS, startMission, retryMission, update, tracker, markerPos,
    get current() { return state.current; },
  };
}

export { DIALOGUE };
