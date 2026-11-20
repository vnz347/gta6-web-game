// Solmar: the arsenal. Five weapons, from fists to a rifle, each with its
// damage, fire rate, range, spread and magazine. The player module owns the
// shooting; this file only defines what each weapon does.

export const WEAPONS = [
  {
    id: 'fists', name: 'FISTS', short: 'FISTS', key: '1',
    damage: 16, rate: 2.6, range: 2.6, spread: 0, pellets: 1,
    auto: false, mag: Infinity, reserve: Infinity, reload: 0,
  },
  {
    id: 'pistol', name: '.45 PISTOL', short: '.45', key: '2',
    damage: 34, rate: 4, range: 55, spread: 0.012, pellets: 1,
    auto: false, mag: 12, reserve: 60, reload: 1.1,
  },
  {
    id: 'smg', name: 'SMG', short: 'SMG', key: '3',
    damage: 20, rate: 9, range: 46, spread: 0.03, pellets: 1,
    auto: true, mag: 30, reserve: 120, reload: 1.4,
  },
  {
    id: 'shotgun', name: '12G PUMP', short: '12G', key: '4',
    damage: 15, rate: 1.3, range: 26, spread: 0.09, pellets: 6,
    auto: false, mag: 6, reserve: 24, reload: 2.0,
  },
  {
    id: 'rifle', name: 'AR-9', short: 'AR-9', key: '5',
    damage: 45, rate: 6, range: 95, spread: 0.008, pellets: 1,
    auto: true, mag: 30, reserve: 90, reload: 1.6,
  },
];

export function weaponById(id) {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}

export function weaponByKey(key) {
  return WEAPONS.find((w) => w.key === key) ?? null;
}

/** Fresh ammo state: every weapon starts with a full magazine and reserve. */
export function freshAmmo() {
  const ammo = {};
  for (const w of WEAPONS) ammo[w.id] = { inMag: w.mag, reserve: w.reserve };
  return ammo;
}

/** Damage at a distance: full up close, half at the weapon's max range. */
export function damageAt(weapon, distance) {
  const t = Math.min(1, distance / weapon.range);
  return weapon.damage * (1 - 0.5 * t);
}
