// Solmar: a tiny seeded RNG (mulberry32) plus the helpers the world builder,
// traffic and screenshot staging share. Same seed, same city, every time.

export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) | 0;
    let h = Math.imul(s ^ (s >>> 15), s | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max). */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** Integer in [min, max]. */
export function int(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of `items`, uniformly. */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

/** Fisher-Yates shuffle, in place, on the seeded RNG. */
export function shuffle(rng, items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

/** Clamp `v` into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Shortest signed angle from `a` to `b`, in radians. */
export function angleTo(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
