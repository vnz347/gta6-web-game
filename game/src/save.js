// Solmar: saving. The game autosaves after every mission and on demand
// from the pause menu, into this browser's localStorage. A save holds the
// player's money, RP, mission progress, medallions, stats, position and
// ride — enough to pick up exactly where the player left off.

import { SAVE_KEY } from './config.js';

export function createSave(G) {
  function read() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function hasSave() {
    return read() !== null;
  }

  function write(data) {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  function snapshot() {
    const p = G.player.player;
    return {
      version: 1,
      money: p.money,
      rp: p.rp,
      health: p.health,
      armour: p.armour,
      weapon: p.weapon,
      ammo: p.ammo,
      x: p.x,
      z: p.z,
      heading: p.heading,
      missionIndex: G.missions.state.index,
      completed: G.missions.state.completed,
      gameComplete: G.missions.state.gameComplete,
      medallions: G.world.medallions.map((m) => m.taken),
      stats: p.stats,
      car: p.mode === 'car' && p.car ? {
        type: p.car.type, color: p.car.color, hp: p.car.hp,
        engine: p.car.engine, armour: p.car.armour,
      } : null,
    };
  }

  function save() {
    return write(snapshot());
  }

  function autosave() {
    write(snapshot());
  }

  function load() {
    const data = read();
    if (!data) return false;
    const p = G.player.player;
    p.money = data.money ?? 500;
    p.rp = data.rp ?? 0;
    p.health = data.health ?? 100;
    p.armour = data.armour ?? 0;
    p.weapon = data.weapon ?? 'pistol';
    if (data.ammo) p.ammo = data.ammo;
    p.x = data.x ?? 152;
    p.z = data.z ?? 84;
    p.heading = data.heading ?? Math.PI;
    G.missions.state.index = data.missionIndex ?? 0;
    G.missions.state.completed = data.completed ?? 0;
    G.missions.state.gameComplete = !!data.gameComplete;
    if (Array.isArray(data.medallions)) {
      data.medallions.forEach((taken, i) => {
        if (G.world.medallions[i]) G.world.medallions[i].taken = taken;
      });
    }
    if (data.stats) Object.assign(p.stats, data.stats);
    if (data.car) {
      const car = G.vehicles.spawn(data.car.type, p.x, p.z, p.heading, 'player', {
        color: data.car.color, hp: data.car.hp,
        engine: data.car.engine ?? 0, armour: data.car.armour ?? 0,
      });
      p.car = car;
      p.mode = 'car';
      p.mesh.group.visible = false;
    }
    return true;
  }

  function clear() {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // Storage can be off: nothing to clear.
    }
  }

  return { hasSave, save, autosave, load, clear, read };
}
