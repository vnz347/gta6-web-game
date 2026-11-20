// Solmar: shared constants. One source of truth for the city layout, the
// progression curve, the crew, the radio stations and the tuning numbers
// every other module reads. Nothing here touches the DOM or Three.js.

// World: x east, z south, y up. The city is a 600 x 600 square; the beach
// and the ocean run along the east edge.
export const WORLD = {
  half: 300,
  beachX: 228, // sand starts here
  waterX: 282, // the sea; nothing drives past it
  roadWidth: 14,
  strandWidth: 20, // Strand Boulevard is the wide beachfront avenue
  // North-south avenues (x) and east-west streets (z), 80 apart.
  avenues: [-240, -160, -80, 0, 80, 160, 240],
  streets: [-240, -160, -80, 0, 80, 160, 240],
};

export const AVENUE_NAMES = {
  '-240': 'Cliff Road', '-160': 'Old Mill Road', '-80': 'Harbour Avenue',
  0: 'Founder Avenue', 80: 'Central Avenue', 160: 'Marina Avenue', 240: 'Strand Boulevard',
};
export const STREET_NAMES = {
  '-240': 'Sunset Street', '-160': 'Palm Street', '-80': 'Coral Street',
  0: 'Union Street', 80: 'Bayside Street', 160: 'Tide Street', 240: 'Anchor Street',
};

// Districts, checked top to bottom; each has a display name, a turf status
// line for the HUD and a palette the world builder uses for its buildings.
export const DISTRICTS = [
  { name: 'PALM STRAND', test: (x, z) => x > 200, status: 'TOURIST STRIP', tint: 0xf2e3c4 },
  { name: 'MARINA', test: (x, z) => z > 200 && x >= 0, status: 'YACHT BASIN', tint: 0xdfe9ea },
  { name: 'DOCKS', test: (x, z) => z > 200 && x < 0, status: 'FREIGHT YARD', tint: 0xc9c2b2 },
  { name: 'OLD TOWN', test: (x, z) => x < -80 && z < 0, status: 'HISTORIC QUARTER', tint: 0xe8d9b0 },
  { name: 'DOWNTOWN', test: (x, z) => x > -80 && x < 80 && z > -80 && z < 80, status: 'CITY CENTRE', tint: 0xcfd6dd },
  { name: 'HILLS', test: (x, z) => z < -200, status: 'VILLA RIDGE', tint: 0xd8e2c8 },
  { name: 'CROSSTOWN', test: () => true, status: 'MIXED STREETS', tint: 0xddd8cc },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (d.test(x, z)) return d;
  return DISTRICTS[DISTRICTS.length - 1];
}

// Ranks: RP thresholds and the name the HUD shows.
export const RANKS = [
  { rp: 0, name: 'ROOKIE' },
  { rp: 500, name: 'RUNNER' },
  { rp: 1200, name: 'HUSTLER' },
  { rp: 2200, name: 'WHEELMAN' },
  { rp: 3500, name: 'ENFORCER' },
  { rp: 5200, name: 'OPERATOR' },
  { rp: 7500, name: 'LIEUTENANT' },
  { rp: 10500, name: 'KINGPIN' },
];

export function rankFor(rp) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i += 1) if (rp >= RANKS[i].rp) idx = i;
  const next = RANKS[idx + 1];
  return { index: idx, name: RANKS[idx].name, into: rp - RANKS[idx].rp, span: next ? next.rp - RANKS[idx].rp : 0 };
}

// The crew: three specialists, each with one ability on a key and a
// cooldown. Names and callsigns are original to Solmar.
export const CREW = [
  { key: 'Z', name: 'SABLE', role: 'Driver', ability: 'NITRO SURGE', desc: 'Short burst of top speed', cooldown: 25 },
  { key: 'X', name: 'FINN', role: 'Mechanic', ability: 'FIELD REPAIR', desc: 'Patches up your ride', cooldown: 40 },
  { key: 'C', name: 'NADIA', role: 'Lookout', ability: 'DEAD ZONE', desc: 'Drops one wanted star', cooldown: 60 },
];

// Radio: three original stations. The audio engine turns each pattern into
// a generative loop; no audio files are shipped.
export const STATIONS = [
  { freq: '101.2', name: 'SOL FM', genre: 'Coast Pop', bpm: 100, root: 220 },
  { freq: '88.3', name: 'VOLT', genre: 'Night Synth', bpm: 122, root: 196 },
  { freq: '104.7', name: 'BAJA', genre: 'Street Latin', bpm: 112, root: 246.9 },
];

// Vehicle types: top speed in world units per second, acceleration, grip,
// seats and the damage they can take. 1 unit/s reads as ~3.6 km/h on the HUD.
export const VEHICLES = {
  sports: { name: 'Cometa GT', top: 44, accel: 17, grip: 9.5, hp: 100, price: 0 },
  sedan: { name: 'Brisa Sedan', top: 34, accel: 12, grip: 8, hp: 100, price: 0 },
  coupe: { name: 'Falco Coupe', top: 38, accel: 14, grip: 9, hp: 100, price: 0 },
  pickup: { name: 'Toro Pickup', top: 32, accel: 11, grip: 7.5, hp: 120, price: 0 },
  van: { name: 'Vela Van', top: 28, accel: 9, grip: 7, hp: 140, price: 0 },
  police: { name: 'SCP Interceptor', top: 40, accel: 16, grip: 9.5, hp: 130, price: 0 },
};

// Wanted: heat thresholds per star, and how many police units answer.
export const WANTED = {
  thresholds: [0, 100, 250, 450, 650, 850],
  units: [0, 2, 3, 4, 5, 6],
  heliAt: 4, // the air unit joins at four stars
  decay: 9, // heat lost per second while no unit sees the player
};

// Heat gained by each crime.
export const HEAT = { hitPed: 120, hitCar: 40, hitCop: 160, shot: 25, carjack: 60 };

// Garage upgrades: three tiers each for engine and armour, plus paint.
export const UPGRADES = {
  engine: [0, 1200, 2600, 4500],
  armour: [0, 900, 2000, 3400],
  paints: ['Sunset Orange', 'Ocean Teal', 'Midnight Black', 'Coral Pink', 'Lime Flash'],
  paintPrice: 400,
};

export const FARES = { min: 150, max: 420 };
export const MEDALLIONS = 12; // hidden Sun Medallions, $500 each
export const MEDALLION_REWARD = 500;
export const SAVE_KEY = 'solmar-save-v1';

// The in-game clock starts here (minutes after midnight) and runs one
// game-minute per real second.
export const CLOCK_START = 15 * 60 + 47;

// The simulation's fixed step, in seconds: 60 updates a second whatever the
// display's rate.
export const STEP = 1 / 60;
