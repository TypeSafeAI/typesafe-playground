/**
 * Functional xorshift32, the same generator the chess lab uses, with its state
 * carried in game state instead of a closure. Stepping a game stays pure, and
 * the same seed always yields the same world.
 */
export function seedRandom(seed: number, salt = 0): number {
  let state = (Math.trunc(seed) ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0 || 1;
  // Discard a few outputs so nearby seeds diverge quickly.
  for (let i = 0; i < 4; i++) state = nextRandom(state)[1];
  return state;
}

/** Returns a float in [0, 1) and the next generator state. */
export function nextRandom(state: number): [number, number] {
  let x = state >>> 0 || 1;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;
  x >>>= 0;
  return [x / 0x100000000, x];
}

/** An integer in [0, n) and the next generator state. */
export function nextInt(state: number, n: number): [number, number] {
  const [value, next] = nextRandom(state);
  return [Math.floor(value * n), next];
}

/** A policy-side generator for baselines. Never shared with the world. */
export function policyRandom(seed: number): () => number {
  let state = seedRandom(seed, 7919);
  return () => {
    const [value, next] = nextRandom(state);
    state = next;
    return value;
  };
}
