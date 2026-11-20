// Solmar: the city. Builds the layout from a seed — buildings, palms, props,
// medallions — paints the ground texture the renderer and the minimap share,
// and answers collision and place questions. No Three.js here: render.js
// turns these specs into meshes.

import { AVENUE_NAMES, DISTRICTS, MEDALLIONS, STREET_NAMES, WORLD, districtAt } from './config.js';
import { int, makeRng, pick, range, shuffle } from './random.js';

// Named places the missions, the garage and the respawns use.
export const LOCATIONS = {
  garage: { x: 148, z: 96, name: 'Rook\u2019s Garage' },
  gunShop: { x: -72, z: 8, name: 'Ironworks Arms' },
  hospital: { x: 8, z: -72, name: 'Solmar General' },
  policeStation: { x: -8, z: 72, name: 'SCP Central' },
  pier: { x: 252, z: 248, name: 'Marina Pier' },
  plaza: { x: -160, z: -160, name: 'Founder Plaza' },
  villa: { x: -168, z: -252, name: 'Hill Villa' },
  vault: { x: -208, z: 244, name: 'Dock Vault' },
  start: { x: 152, z: 84, name: 'Marina Avenue' },
};

const GROUND_PX = 2048;
const SCALE = GROUND_PX / (WORLD.half * 2);

function toPx(v) {
  return (v + WORLD.half) * SCALE;
}

// Facade palettes per district, picked per building.
const FACADE_COLORS = ['#e8dcc8', '#d9c9a8', '#c8d4dc', '#e0b8a0', '#d8d2c4', '#c4d0b8', '#e8c8c8', '#b8c8d8'];

export function createWorld(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const colliders = [];
  const palms = [];
  const props = []; // {kind, x, z, ...} — lights, containers, yachts, billboards
  const medallions = [];

  const { avenues, streets, roadWidth, strandWidth, beachX, waterX, half } = WORLD;

  function addCollider(minX, maxX, minZ, maxZ) {
    colliders.push({ minX, maxX, minZ, maxZ });
  }

  // --- Buildings, one block at a time -------------------------------------
  // A block is the cell between two neighbouring avenues and two streets.
  for (let ai = 0; ai < avenues.length - 1; ai += 1) {
    for (let si = 0; si < streets.length - 1; si += 1) {
      const x0 = avenues[ai] + (ai === avenues.length - 2 ? strandWidth / 2 : roadWidth / 2) + 3;
      const x1 = avenues[ai + 1] - roadWidth / 2 - 3;
      const z0 = streets[si] + roadWidth / 2 + 3;
      const z1 = streets[si + 1] - roadWidth / 2 - 3;
      if (x1 - x0 < 18 || z1 - z0 < 18) continue;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (cx > beachX - 8) continue; // sand holds no buildings
      const district = districtAt(cx, cz);
      // Founder Plaza stays open: palms and benches, no buildings.
      if (Math.abs(cx - LOCATIONS.plaza.x) < 40 && Math.abs(cz - LOCATIONS.plaza.z) < 40) {
        for (let p = 0; p < 8; p += 1) {
          palms.push({ x: cx + range(rng, -28, 28), z: cz + range(rng, -28, 28), s: range(rng, 0.9, 1.2) });
        }
        continue;
      }
      const isDowntown = district.name === 'DOWNTOWN';
      const isDocks = district.name === 'DOCKS';
      const isHills = district.name === 'HILLS';
      const isMarina = district.name === 'MARINA';
      let count = 1;
      if (isDowntown) count = 1;
      else if (isDocks) count = 2;
      else if (isHills) count = 2;
      else count = int(rng, 1, 3);
      for (let b = 0; b < count; b += 1) {
        let w; let d; let h;
        if (isDowntown) {
          w = range(rng, 26, 40); d = range(rng, 26, 40); h = range(rng, 26, 64);
        } else if (isDocks) {
          w = range(rng, 30, 48); d = range(rng, 16, 24); h = range(rng, 8, 12);
        } else if (isHills) {
          w = range(rng, 14, 22); d = range(rng, 14, 22); h = range(rng, 6, 9);
        } else if (isMarina) {
          w = range(rng, 16, 26); d = range(rng, 14, 22); h = range(rng, 6, 11);
        } else {
          w = range(rng, 16, 30); d = range(rng, 16, 30); h = range(rng, 9, 24);
        }
        const bx = range(rng, x0 + w / 2, x1 - w / 2);
        const bz = range(rng, z0 + d / 2, z1 - d / 2);
        // Keep buildings from overlapping each other in the same block.
        let clash = false;
        for (const other of buildings) {
          if (Math.abs(other.x - bx) < (other.w + w) / 2 + 3 && Math.abs(other.z - bz) < (other.d + d) / 2 + 3) {
            clash = true;
            break;
          }
        }
        if (clash) continue;
        const style = h <= 12 ? 'low' : h <= 25 ? 'mid' : 'tall';
        buildings.push({ x: bx, z: bz, w, d, h, style, color: pick(rng, FACADE_COLORS), district: district.name });
        addCollider(bx - w / 2, bx + w / 2, bz - d / 2, bz + d / 2);
      }
    }
  }

  // --- Palms ---------------------------------------------------------------
  // Both sides of Strand Boulevard, the beach, the plaza and the marina.
  for (let z = -280; z <= 280; z += 13) {
    palms.push({ x: 227, z: z + range(rng, -2, 2), s: range(rng, 0.9, 1.25) });
    palms.push({ x: 253, z: z + 6 + range(rng, -2, 2), s: range(rng, 0.9, 1.25) });
  }
  for (let i = 0; i < 40; i += 1) {
    palms.push({ x: range(rng, 258, 276), z: range(rng, -280, 280), s: range(rng, 0.8, 1.3) });
  }
  for (let i = 0; i < 24; i += 1) {
    palms.push({ x: range(rng, 150, 220), z: range(rng, 210, 280), s: range(rng, 0.9, 1.2) });
  }

  // --- Props: street lights, containers, yachts, billboards ---------------
  for (const ax of avenues) {
    for (let z = -260; z <= 260; z += 40) {
      props.push({ kind: 'light', x: ax + 8, z });
    }
  }
  for (let i = 0; i < 46; i += 1) {
    props.push({
      kind: 'container', x: range(rng, -280, -120), z: range(rng, 210, 280),
      color: pick(rng, ['#b8543e', '#3e7ab8', '#4a9e5c', '#c8a03e', '#7a5ea8']), rot: rng() > 0.5 ? 0 : Math.PI / 2,
    });
  }
  for (const c of props.filter((p) => p.kind === 'container')) {
    addCollider(c.x - 3, c.x + 3, c.z - 6.5, c.z + 6.5);
  }
  for (let i = 0; i < 7; i += 1) {
    props.push({ kind: 'yacht', x: 292 + range(rng, 0, 6), z: 215 + i * 11, s: range(rng, 0.8, 1.3) });
  }
  props.push({ kind: 'billboard', x: 226, z: -40, rot: -Math.PI / 2, text: 'SOLMAR' });
  props.push({ kind: 'billboard', x: 226, z: 120, rot: -Math.PI / 2, text: 'VISIT PALM STRAND' });
  props.push({ kind: 'billboard', x: -6, z: -120, rot: 0, text: 'COMETA GT' });

  // --- Medallions: 12 hidden Sun Medallions --------------------------------
  const spots = [
    { x: 262, z: -220 }, { x: 262, z: 40 }, { x: 262, z: 200 }, { x: -160, z: -160 },
    { x: -240, z: 240 }, { x: -208, z: 244 }, { x: -168, z: -252 }, { x: 40, z: -240 },
    { x: 160, z: -160 }, { x: -40, z: 160 }, { x: 80, z: 240 }, { x: 240, z: -80 },
  ];
  shuffle(rng, spots);
  for (let i = 0; i < MEDALLIONS; i += 1) {
    medallions.push({ x: spots[i].x, z: spots[i].z, taken: false });
  }

  // --- Ground texture -------------------------------------------------------
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = GROUND_PX;
  groundCanvas.height = GROUND_PX;
  paintGround(groundCanvas.getContext('2d'), { buildings, districtAt });

  // --- Queries --------------------------------------------------------------
  function collideCircle(x, z, r) {
    let hit = false;
    const min = -half + 4;
    const max = half - 4;
    if (x < min + r) { x = min + r; hit = true; }
    if (x > max - r) { x = max - r; hit = true; }
    if (z < min + r) { z = min + r; hit = true; }
    if (z > max - r) { z = max - r; hit = true; }
    if (x + r > waterX - 2) { x = waterX - 2 - r; hit = true; }
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 < 0.0001) {
        // Centre inside the box: push out along the smallest penetration.
        const pushes = [
          { d: x - c.minX + r, x: c.minX - r, z },
          { d: c.maxX - x + r, x: c.maxX + r, z },
          { d: z - c.minZ + r, x, z: c.minZ - r },
          { d: c.maxZ - z + r, x, z: c.maxZ + r },
        ];
        pushes.sort((a, b) => a.d - b.d);
        x = pushes[0].x;
        z = pushes[0].z;
      } else {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      }
    }
    return { x, z, hit };
  }

  function nearestRoadName(x, z) {
    let bestA = Infinity; let nameA = '';
    for (const ax of avenues) {
      const d = Math.abs(x - ax);
      if (d < bestA) { bestA = d; nameA = AVENUE_NAMES[String(ax)]; }
    }
    let bestS = Infinity; let nameS = '';
    for (const sz of streets) {
      const d = Math.abs(z - sz);
      if (d < bestS) { bestS = d; nameS = STREET_NAMES[String(sz)]; }
    }
    return bestA <= bestS ? nameA : nameS;
  }

  function isSand(x) {
    return x > beachX;
  }

  function randomRoadPoint() {
    if (rng() < 0.5) {
      const ax = pick(rng, avenues);
      return { x: ax + (rng() < 0.5 ? -3.5 : 3.5), z: range(rng, -280, 280), heading: rng() < 0.5 ? 0 : Math.PI };
    }
    const sz = pick(rng, streets);
    return { x: range(rng, -280, 220), z: sz + (rng() < 0.5 ? -3.5 : 3.5), heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  }

  return {
    seed, buildings, colliders, palms, props, medallions, groundCanvas,
    collideCircle, nearestRoadName, isSand, randomRoadPoint,
  };
}

// Paint the 2048px ground: base, water, beach, blocks, roads, dashes,
// crosswalks, plaza and dock markings. The minimap draws this same canvas.
function paintGround(ctx, { buildings, districtAt: atDistrict }) {
  const { avenues, streets, roadWidth, strandWidth, beachX, waterX, half } = WORLD;
  ctx.fillStyle = '#b3ac9c';
  ctx.fillRect(0, 0, GROUND_PX, GROUND_PX);

  // Water with a lighter shore band, then the sand.
  ctx.fillStyle = '#2b7ea6';
  ctx.fillRect(toPx(waterX), 0, GROUND_PX - toPx(waterX), GROUND_PX);
  ctx.fillStyle = '#4a9cc0';
  ctx.fillRect(toPx(waterX - 6), 0, toPx(6), GROUND_PX);
  ctx.fillStyle = '#eedca8';
  ctx.fillRect(toPx(beachX), 0, toPx(waterX) - toPx(beachX), GROUND_PX);

  // Hills grass and a central park block.
  ctx.fillStyle = '#8fb36e';
  ctx.fillRect(0, 0, GROUND_PX, toPx(-200));
  ctx.fillStyle = '#7fae6a';
  ctx.fillRect(toPx(0), toPx(80), toPx(80) - toPx(0), toPx(160) - toPx(80));

  // Blocks: sidewalk border, then the block's own ground.
  for (let ai = 0; ai < avenues.length - 1; ai += 1) {
    for (let si = 0; si < streets.length - 1; si += 1) {
      const left = avenues[ai] + (ai === avenues.length - 2 ? strandWidth / 2 : roadWidth / 2);
      const right = avenues[ai + 1] - roadWidth / 2;
      const top = streets[si] + roadWidth / 2;
      const bottom = streets[si + 1] - roadWidth / 2;
      if (right <= beachX) {
        ctx.fillStyle = '#cfc9b8';
        ctx.fillRect(toPx(left), toPx(top), toPx(right) - toPx(left), toPx(bottom) - toPx(top));
        const district = atDistrict((left + right) / 2, (top + bottom) / 2);
        ctx.fillStyle = district.name === 'DOCKS' ? '#98938a' : district.name === 'DOWNTOWN' ? '#b9bcc0' : '#c4bfae';
        ctx.fillRect(toPx(left + 3), toPx(top + 3), toPx(right - 3) - toPx(left + 3), toPx(bottom - 3) - toPx(top + 3));
      }
    }
  }

  // Plaza rings at Founder Plaza.
  ctx.strokeStyle = '#a89f88';
  ctx.lineWidth = 4;
  for (const r of [10, 18, 26]) {
    ctx.beginPath();
    ctx.arc(toPx(LOCATIONS.plaza.x), toPx(LOCATIONS.plaza.z), r * SCALE, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Roads: asphalt strips, then dashes, then crosswalks.
  ctx.fillStyle = '#33363b';
  for (const ax of avenues) {
    const w = ax === 240 ? strandWidth : roadWidth;
    ctx.fillRect(toPx(ax - w / 2), 0, w * SCALE, GROUND_PX);
  }
  for (const sz of streets) {
    ctx.fillRect(0, toPx(sz - roadWidth / 2), GROUND_PX, roadWidth * SCALE);
  }
  ctx.fillStyle = '#e8c33a';
  for (const ax of avenues) {
    for (let z = -half; z < half; z += 12) {
      ctx.fillRect(toPx(ax) - 1, toPx(z), 2, 6 * SCALE);
    }
  }
  ctx.fillStyle = '#e8e8e8';
  for (const sz of streets) {
    for (let x = -half; x < half; x += 12) {
      ctx.fillRect(toPx(x), toPx(sz) - 1, 6 * SCALE, 2);
    }
  }
  ctx.fillStyle = '#d8d8d8';
  for (const ax of avenues) {
    for (const sz of streets) {
      for (let i = -3; i <= 3; i += 1) {
        ctx.fillRect(toPx(ax - 6 + i * 2), toPx(sz - roadWidth / 2 - 2), 1.2 * SCALE, 2 * SCALE);
        ctx.fillRect(toPx(ax - 6 + i * 2), toPx(sz + roadWidth / 2), 1.2 * SCALE, 2 * SCALE);
      }
    }
  }

  // Marina piers jutting into the water.
  ctx.fillStyle = '#6e6258';
  for (let i = 0; i < 4; i += 1) {
    ctx.fillRect(toPx(278), toPx(212 + i * 18), toPx(298) - toPx(278), 3 * SCALE);
  }

  // Building footprints, darkened, so the map reads as a city.
  ctx.fillStyle = 'rgba(60, 58, 52, 0.35)';
  for (const b of buildings) {
    ctx.fillRect(toPx(b.x - b.w / 2), toPx(b.z - b.d / 2), b.w * SCALE, b.d * SCALE);
  }
}
