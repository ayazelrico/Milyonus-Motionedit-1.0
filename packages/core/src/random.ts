/**Hashes a numeric or string seed into an unsigned 32-bit integer using FNV-1a + Murmur3 finalizer. */
const hashSeed = (seed: number | string): number => {
  const str = typeof seed === "number" ? `n:${Object.is(seed, -0) ? 0 : seed}` : `s:${seed}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/** Steps a 32-bit state with Mulberry32 and returns a float in `[0, 1)`. */
const mulberry32Step = (state: number): [nextValue: number, nextState: number] => {
  const nextState = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(nextState ^ (nextState >>> 15), 1 | nextState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, nextState];
};

/**
 * Deterministic pseudo-random float in `[0, 1)` derived purely from `seed`.
 * Safe inside compositions: the same `seed` always produces the exact same number.
 */
export const random = (seed: number | string): number => {
  const [value] = mulberry32Step(hashSeed(seed));
  return value;
};

/**
 * Deterministic pseudo-random float in `[min, max)` derived purely from `seed`.
 */
export const randomRange = (seed: number | string, min: number, max: number): number => {
  if (max < min) throw new Error("randomRange requires max >= min.");
  return min + random(seed) * (max - min);
};

/**
 * Deterministic pseudo-random integer in `[min, max]` (inclusive) derived purely from `seed`.
 */
export const randomInt = (seed: number | string, min: number, max: number): number => {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) throw new Error("randomInt requires max >= min.");
  return lo + Math.floor(random(seed) * (hi - lo + 1));
};

/**
 * Creates a deterministic pseudo-random generator function `() => number` initialized from `seed`.
 * Only call inside a single frame's pure calculation — never persist across renders.
 */
export const createRandom = (seed: number | string): (() => number) => {
  let state = hashSeed(seed);
  return () => {
    const [val, next] = mulberry32Step(state);
    state = next;
    return val;
  };
};
