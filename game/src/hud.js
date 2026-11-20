// Solmar: everything on the screen that is not the 3D world. The mission
// tracker, the police response panel, the minimap, health and armour, money,
// stars, rank, weapon slots, crew abilities, speed, radio, dialogue, the
// weapon wheel, the title / pause / garage menus, banners and toasts.
// Values are cached: the DOM is touched only when a value changes.

import { CREW, STATIONS, UPGRADES, VEHICLES, districtAt, rankFor } from './config.js';
import { WEAPONS } from './weapons.js';
import { LOCATIONS } from './world.js';

function $(id) {
  return document.getElementById(id);
}

export function createHud(G) {
  const els = {};
  for (const id of [
    'hud', 'mt', 'mt-title', 'mt-stage', 'mt-objective', 'mt-next', 'mt-target', 'mt-target-fill',
    'pp', 'pp-count', 'pp-list', 'loc-name', 'loc-street', 'loc-zone',
    'minimap', 'hp-fill', 'hp-num', 'ar-fill', 'ar-num',
    'clock', 'money', 'stars', 'airunit', 'rank-name', 'rank-num', 'rank-fill', 'rank-rp',
    'weapons', 'crew', 'speed', 'veh-name', 'veh-dmg', 'radio',
    'dlg', 'dlg-avatar', 'dlg-name', 'dlg-text', 'crosshair', 'prompt',
    'banner', 'banner-title', 'banner-sub', 'note', 'dmg', 'obj-arrow', 'obj-arrow-dist',
    'wheel', 'wheel-center',
    'title', 'title-continue', 'pause', 'pause-map', 'pause-missions', 'pause-stats',
    'garage', 'garage-list', 'garage-money', 'busted', 'wasted', 'complete', 'vignette',
  ]) els[id] = $(id);

  const last = {};
  function set(id, value) {
    if (last[id] !== value) {
      last[id] = value;
      const el = els[id];
      if (el) el.textContent = value;
    }
  }
  function setHtml(id, value) {
    if (last[id] !== value) {
      last[id] = value;
      const el = els[id];
      if (el) el.innerHTML = value;
    }
  }
  function show(id, on) {
    const el = els[id];
    if (el) el.classList.toggle('hidden', !on);
  }

  // --- Weapon slots and crew cards (built once) ------------------------------
  const slotEls = [];
  for (const w of WEAPONS) {
    const div = document.createElement('div');
    div.className = 'wslot';
    div.innerHTML = `<span class="wkey">${w.key}</span><span class="wname">${w.short}</span><span class="wammo"></span>`;
    els.weapons.appendChild(div);
    slotEls.push({ w, div, ammo: div.querySelector('.wammo') });
  }
  const crewEls = [];
  for (const c of CREW) {
    const div = document.createElement('div');
    div.className = 'crew-card';
    div.innerHTML = `<span class="ckey">${c.key}</span><div class="crew-body"><span class="cability">${c.ability}</span><span class="cname">${c.name} · ${c.role}</span></div><span class="ccd"></span>`;
    els.crew.appendChild(div);
    crewEls.push({ c, div, cd: div.querySelector('.ccd') });
  }

  // --- Dialogue queue ---------------------------------------------------------
  const dlgQueue = [];
  let dlgT = 0;
  let dlgShowing = null;
  function say(name, text, color) {
    dlgQueue.push({ name, text, color });
  }
  // A dialogue line that stays up (screenshot staging uses it).
  function saySticky(name, text, color) {
    dlgQueue.length = 0;
    dlgShowing = { name, text, color };
    dlgT = 60;
    set('dlg-name', name);
    set('dlg-text', text);
    els['dlg-avatar'].textContent = name.slice(0, 1);
    els['dlg-avatar'].style.background = color;
    show('dlg', true);
  }
  function clearDialogue() {
    dlgQueue.length = 0;
    dlgShowing = null;
    show('dlg', false);
  }
  function updateDialogue(dt) {
    if (dlgShowing) {
      dlgT -= dt;
      if (dlgT <= 0) {
        dlgShowing = null;
        show('dlg', false);
      }
    }
    if (!dlgShowing && dlgQueue.length > 0) {
      dlgShowing = dlgQueue.shift();
      dlgT = 4.5;
      set('dlg-name', dlgShowing.name);
      set('dlg-text', dlgShowing.text);
      els['dlg-avatar'].textContent = dlgShowing.name.slice(0, 1);
      els['dlg-avatar'].style.background = dlgShowing.color;
      show('dlg', true);
    }
  }

  // --- Banner and toast -------------------------------------------------------
  let bannerT = 0;
  function banner(title, sub) {
    set('banner-title', title);
    set('banner-sub', sub || '');
    show('banner', true);
    bannerT = 3.6;
  }
  function clearBanner() {
    bannerT = 0;
    show('banner', false);
  }
  const noteQueue = [];
  let noteT = 0;
  function note(text) {
    noteQueue.push(text);
  }
  function updateNotices(dt) {
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) show('banner', false);
    }
    if (noteT > 0) {
      noteT -= dt;
      if (noteT <= 0) show('note', false);
    } else if (noteQueue.length > 0) {
      set('note', noteQueue.shift());
      show('note', true);
      noteT = 4;
    }
  }

  // --- Damage flash ------------------------------------------------------------
  let dmgT = 0;
  function flashDamage() {
    dmgT = 0.5;
  }
  function updateDamage(dt) {
    const p = G.player.player;
    if (dmgT > 0) dmgT = Math.max(0, dmgT - dt);
    const low = p.health < 30 ? 0.25 + Math.sin(G.time.elapsed * 4) * 0.08 : 0;
    els.dmg.style.opacity = String(Math.min(0.85, dmgT * 1.6 + low));
    els.vignette.style.opacity = p.health < 30 ? '1' : '0';
  }

  // --- Minimap -----------------------------------------------------------------
  const mm = els.minimap.getContext('2d');
  const MM = 190;
  function drawMinimap() {
    const p = G.player.player;
    mm.clearRect(0, 0, MM, MM);
    mm.save();
    mm.beginPath();
    mm.rect(0, 0, MM, MM);
    mm.clip();
    mm.drawImage(G.world.groundCanvas, 0, 0, MM, MM);
    const sx = (x) => ((x + 300) / 600) * MM;
    const sz = (z) => ((z + 300) / 600) * MM;
    const blip = (x, z, color, r) => {
      mm.fillStyle = color;
      mm.beginPath();
      mm.arc(sx(x), sz(z), r, 0, Math.PI * 2);
      mm.fill();
      mm.strokeStyle = 'rgba(0,0,0,0.6)';
      mm.lineWidth = 1.5;
      mm.stroke();
    };
    // Fixed points of interest.
    blip(LOCATIONS.garage.x, LOCATIONS.garage.z, '#ffffff', 3.5);
    blip(LOCATIONS.gunShop.x, LOCATIONS.gunShop.z, '#e8e8e8', 3);
    blip(LOCATIONS.hospital.x, LOCATIONS.hospital.z, '#ff8a8a', 3);
    for (const m of G.world.medallions) if (!m.taken) blip(m.x, m.z, '#7fe8ff', 2.5);
    const marker = G.missions.markerPos();
    if (marker) {
      const pulse = 4 + Math.sin(G.time.elapsed * 5) * 1.5;
      blip(marker.x, marker.z, marker.color, pulse);
    }
    // Police: flashing red/blue.
    const flash = Math.floor(G.time.elapsed * 4) % 2 === 0;
    for (const u of G.police.police.units) blip(u.car.x, u.car.z, flash ? '#ff3b30' : '#3b82ff', 3);
    if (G.police.police.heli) blip(G.police.police.heli.x, G.police.police.heli.z, '#ff3b30', 4);
    // The player: a white triangle rotated by heading.
    mm.save();
    mm.translate(sx(p.x), sz(p.z));
    mm.rotate(Math.atan2(Math.sin(p.heading), -Math.cos(p.heading)) + Math.PI);
    mm.fillStyle = '#ffffff';
    mm.strokeStyle = '#111111';
    mm.lineWidth = 1.5;
    mm.beginPath();
    mm.moveTo(0, -8);
    mm.lineTo(5.5, 6);
    mm.lineTo(-5.5, 6);
    mm.closePath();
    mm.fill();
    mm.stroke();
    mm.restore();
    mm.restore();
  }

  // Big map for the pause menu.
  const pm = els['pause-map'].getContext('2d');
  function drawPauseMap() {
    const S = 420;
    pm.clearRect(0, 0, S, S);
    pm.drawImage(G.world.groundCanvas, 0, 0, S, S);
    const p = G.player.player;
    pm.fillStyle = '#ffffff';
    pm.strokeStyle = '#111111';
    pm.lineWidth = 2;
    pm.beginPath();
    pm.arc(((p.x + 300) / 600) * S, ((p.z + 300) / 600) * S, 6, 0, Math.PI * 2);
    pm.fill();
    pm.stroke();
    const marker = G.missions.markerPos();
    if (marker) {
      pm.fillStyle = marker.color;
      pm.beginPath();
      pm.arc(((marker.x + 300) / 600) * S, ((marker.z + 300) / 600) * S, 7, 0, Math.PI * 2);
      pm.fill();
      pm.stroke();
    }
  }

  // --- Weapon wheel -------------------------------------------------------------
  const wheelSegs = [];
  for (const w of WEAPONS) {
    const div = document.createElement('div');
    div.className = 'wheel-seg';
    div.innerHTML = `<span class="wname">${w.name}</span>`;
    els.wheel.appendChild(div);
    wheelSegs.push(div);
  }
  // Arrange the five segments in a ring.
  wheelSegs.forEach((div, i) => {
    const a = (i / WEAPONS.length) * Math.PI * 2 - Math.PI / 2;
    div.style.left = `${50 + Math.cos(a) * 34}%`;
    div.style.top = `${50 + Math.sin(a) * 34}%`;
  });
  let wheelOpen = false;
  let wheelSticky = false;
  let wheelSelected = 0;
  // `sticky` keeps the wheel open without Tab held (screenshot staging).
  function showWheel(on, sticky) {
    wheelOpen = on;
    wheelSticky = on ? !!sticky : false;
    show('wheel', on);
    if (on) {
      wheelSelected = WEAPONS.findIndex((w) => w.id === G.player.player.weapon);
      paintWheel();
    }
  }
  function paintWheel() {
    wheelSegs.forEach((div, i) => div.classList.toggle('sel', i === wheelSelected));
    const w = WEAPONS[wheelSelected];
    const a = G.player.player.ammo[w.id];
    set('wheel-center', `${w.name}\n${w.mag === Infinity ? '∞' : `${a.inMag} / ${a.reserve}`}`);
  }
  function updateWheel(mx, my) {
    if (!wheelOpen) return;
    const rect = els.wheel.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = mx - cx;
    const dy = my - cy;
    if (Math.hypot(dx, dy) < 30) return;
    let a = Math.atan2(dy, dx) + Math.PI / 2;
    if (a < 0) a += Math.PI * 2;
    const idx = Math.floor(((a / (Math.PI * 2)) * WEAPONS.length + 0.5)) % WEAPONS.length;
    if (idx !== wheelSelected) {
      wheelSelected = idx;
      paintWheel();
      G.audio.select();
    }
  }
  function confirmWheel() {
    if (!wheelOpen) return;
    G.player.player.weapon = WEAPONS[wheelSelected].id;
    G.player.player.reloadT = 0;
    showWheel(false);
  }

  // --- Pause menu ---------------------------------------------------------------
  function fillPause() {
    drawPauseMap();
    const rows = G.missions.MISSIONS.map((m, i) => {
      const status = i < G.missions.state.completed ? 'DONE' : i === G.missions.state.index && G.missions.current ? 'ACTIVE' : i === G.missions.state.index ? 'NEXT' : 'LOCKED';
      return `<div class="mrow ${status.toLowerCase()}"><span>${i + 1}. ${m.name}</span><span>$${m.reward} · ${m.rp} RP</span><span class="mstatus">${status}</span></div>`;
    }).join('');
    setHtml('pause-missions', rows);
    const p = G.player.player;
    const s = p.stats;
    setHtml('pause-stats', [
      ['Missions done', `${s.missionsDone} / 8`],
      ['Fares done', String(s.faresDone)],
      ['Medallions', `${s.medallions} / 12`],
      ['Distance driven', `${(s.distanceDriven / 1000).toFixed(1)} km`],
      ['Top speed', `${Math.round(s.topSpeed)} km/h`],
      ['Cars stolen', String(s.carsStolen)],
      ['Times busted', String(s.timesBusted)],
      ['Times wasted', String(s.timesWasted)],
    ].map(([k, v]) => `<div class="srow"><span>${k}</span><b>${v}</b></div>`).join(''));
  }

  // --- Garage ---------------------------------------------------------------------
  function fillGarage() {
    const p = G.player.player;
    const car = p.car;
    set('garage-money', `$${p.money.toLocaleString('en-US')}`);
    if (!car) {
      setHtml('garage-list', '<div class="grow">Bring a car to upgrade it.</div>');
      return;
    }
    const rows = [];
    const engNext = car.engine + 1;
    rows.push(`<div class="grow"><span>Engine — Tier ${car.engine}/3</span><span>${engNext <= 3 ? `$${UPGRADES.engine[engNext].toLocaleString('en-US')}` : 'MAX'}</span><button data-buy="engine" ${engNext > 3 || p.money < UPGRADES.engine[engNext] ? 'disabled' : ''}>UPGRADE</button></div>`);
    const armNext = car.armour + 1;
    rows.push(`<div class="grow"><span>Armour — Tier ${car.armour}/3</span><span>${armNext <= 3 ? `$${UPGRADES.armour[armNext].toLocaleString('en-US')}` : 'MAX'}</span><button data-buy="armour" ${armNext > 3 || p.money < UPGRADES.armour[armNext] ? 'disabled' : ''}>UPGRADE</button></div>`);
    rows.push(`<div class="grow"><span>Repair (${Math.round((car.hp / car.maxHp) * 100)}% condition)</span><span>$150</span><button data-buy="repair" ${p.money < 150 || car.hp >= car.maxHp ? 'disabled' : ''}>REPAIR</button></div>`);
    rows.push(`<div class="grow"><span>Respray — ${UPGRADES.paints.join(' · ')}</span><span>$${UPGRADES.paintPrice}</span><button data-buy="paint" ${p.money < UPGRADES.paintPrice ? 'disabled' : ''}>PAINT</button></div>`);
    setHtml('garage-list', rows.join(''));
    els['garage-list'].querySelectorAll('button[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => G.garageBuy(btn.dataset.buy));
    });
  }

  // --- Per-frame HUD refresh ---------------------------------------------------------
  function update(dt) {
    const p = G.player.player;
    updateDialogue(dt);
    updateNotices(dt);
    updateDamage(dt);

    // Mission tracker.
    const t = G.missions.tracker();
    set('mt-title', t.title);
    set('mt-stage', t.stage);
    set('mt-objective', t.objective);
    set('mt-next', t.next ? `NEXT  ${t.next}` : '');
    show('mt-target', t.targetHp !== null && t.targetHp !== undefined);
    if (t.targetHp !== null && t.targetHp !== undefined) {
      els['mt-target-fill'].style.width = `${t.targetHp}%`;
    }

    // Police panel.
    const stars = G.police.police.stars;
    show('pp', stars > 0);
    if (stars > 0) {
      const units = G.police.visibleUnits();
      set('pp-count', `${units.length} UNITS`);
      const shown = units.slice(0, 4).map((u) => `<div class="prow"><span class="pname">${u.name}</span><span class="prole">${u.role}</span><span class="pdist">${u.dist} m</span></div>`).join('');
      setHtml('pp-list', shown + (units.length > 4 ? `<div class="prow more">+${units.length - 4} more</div>` : ''));
    }

    // Location.
    const d = districtAt(p.x, p.z);
    set('loc-name', d.name);
    set('loc-street', G.world.nearestRoadName(p.x, p.z));
    set('loc-zone', d.status);

    // Health / armour.
    els['hp-fill'].style.width = `${Math.max(0, p.health)}%`;
    els['ar-fill'].style.width = `${Math.max(0, p.armour)}%`;
    set('hp-num', String(Math.ceil(p.health)));
    set('ar-num', String(Math.ceil(p.armour)));

    // Clock, money, stars, rank.
    const mins = Math.floor(G.time.clock) % (24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm2 = String(mins % 60).padStart(2, '0');
    set('clock', `${hh}:${mm2}`);
    set('money', `$${p.money.toLocaleString('en-US')}`);
    set('stars', '★'.repeat(stars) + '☆'.repeat(5 - stars));
    els.stars.classList.toggle('hot', stars > 0);
    show('airunit', !!G.police.police.heli);
    const rank = rankFor(p.rp);
    set('rank-num', `RANK ${rank.index + 1}`);
    set('rank-name', rank.name);
    set('rank-rp', rank.span > 0 ? `${rank.into.toLocaleString('en-US')} / ${rank.span.toLocaleString('en-US')} RP` : 'MAX RANK');
    els['rank-fill'].style.width = rank.span > 0 ? `${Math.min(100, (rank.into / rank.span) * 100)}%` : '100%';

    // Weapon slots.
    for (const s of slotEls) {
      const a = p.ammo[s.w.id];
      s.div.classList.toggle('sel', s.w.id === p.weapon);
      const text = s.w.mag === Infinity ? '∞' : `${a.inMag}/${a.reserve}`;
      if (s.ammo.textContent !== text) s.ammo.textContent = text;
    }
    // Crew cards.
    for (let i = 0; i < crewEls.length; i += 1) {
      const cd = p.crewCooldowns[i];
      crewEls[i].div.classList.toggle('ready', cd <= 0);
      const text = cd > 0 ? `${Math.ceil(cd)}s` : 'READY';
      if (crewEls[i].cd.textContent !== text) crewEls[i].cd.textContent = text;
    }

    // Speed, vehicle, radio.
    if (p.mode === 'car' && p.car) {
      set('speed', String(Math.round(Math.abs(p.car.speed) * 3.6)));
      set('veh-name', VEHICLES[p.car.type].name.toUpperCase());
      const dmg = Math.round((1 - p.car.hp / p.car.maxHp) * 100);
      set('veh-dmg', dmg <= 0 ? 'PRISTINE' : `${dmg}% DENTED`);
    } else {
      set('speed', String(Math.round(Math.abs(p.speed) * 3.6)));
      set('veh-name', 'ON FOOT');
      set('veh-dmg', '');
    }
    const st = G.audio.station;
    set('radio', `${st.freq} ${st.name} — ${st.genre}`);

    // Crosshair and prompts.
    const armed = p.mode === 'foot' && p.weapon !== 'fists';
    show('crosshair', armed && !wheelOpen);
    let prompt = '';
    if (p.mode === 'foot') {
      const car = G.vehicles.nearest(p.x, p.z, 5, (c) => !c.dead);
      if (car) prompt = 'E — ENTER CAR';
      else if (Math.hypot(p.x - LOCATIONS.gunShop.x, p.z - LOCATIONS.gunShop.z) < 10) prompt = 'F — BUY AMMO ($200)';
    } else if (Math.hypot(p.x - LOCATIONS.garage.x, p.z - LOCATIONS.garage.z) < 12) {
      prompt = 'G — GARAGE';
    }
    set('prompt', prompt);

    // Objective arrow: points at the marker when it is far off-screen.
    const marker = G.missions.markerPos();
    if (marker) {
      const dx = marker.x - p.x;
      const dz = marker.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 45) {
        const bearing = Math.atan2(dx, dz);
        const rel = bearing - p.heading;
        const a = Math.PI - rel;
        const rx = Math.sin(a);
        const ry = -Math.cos(a);
        const R = Math.min(window.innerWidth, window.innerHeight) * 0.36;
        els['obj-arrow'].style.left = `${window.innerWidth / 2 + rx * R}px`;
        els['obj-arrow'].style.top = `${window.innerHeight / 2 + ry * R}px`;
        els['obj-arrow'].style.transform = `translate(-50%, -50%) rotate(${a}rad)`;
        set('obj-arrow-dist', `${Math.round(dist)} m`);
        show('obj-arrow', true);
      } else {
        show('obj-arrow', false);
      }
    } else {
      show('obj-arrow', false);
    }

    drawMinimap();
  }

  return {
    update, say, saySticky, clearDialogue, banner, clearBanner, note, flashDamage,
    showWheel, updateWheel, confirmWheel,
    fillPause, fillGarage, drawPauseMap,
    show, set,
    get wheelOpen() { return wheelOpen; },
    get wheelSticky() { return wheelSticky; },
  };
}
