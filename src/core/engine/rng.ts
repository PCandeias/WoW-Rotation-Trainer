/**
 * Seedable PRNG using Mulberry32 algorithm
 * Fast, deterministic, 32-bit state, suitable for game simulations
 */

/**
 * RngInstance represents a seeded random number generator
 * All methods are deterministic and the state is fully serializable
 */
export interface RngInstance {
  /**
   * Generate the next random number in [0, 1)
   */
  next(): number;

  /**
   * Get the current internal state (a 32-bit integer).
   * Returns the post-advance state. Calling setState(getState()) followed by next()
   * reproduces the roll *after* the current one.
   */
  getState(): number;

  /**
   * Set the internal state, allowing replay/restore of sequences
   */
  setState(state: number): void;
}

/**
 * Create a new RNG instance seeded with the given value
 * @param seed - A number used to initialize the generator (any integer works)
 * @returns An RngInstance with next(), getState(), and setState() methods
 */
export function createRng(seed: number): RngInstance {
  let state = seed >>> 0; // Convert to unsigned 32-bit integer

  return {
    next(): number {
      // Mulberry32 algorithm
      let t = (state += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
    },

    getState(): number {
      return state;
    },

    setState(s: number): void {
      state = s >>> 0; // Ensure it's a valid unsigned 32-bit integer
    },
  };
}

/**
 * Roll a chance test with the given percent probability
 * @param rng - The RNG instance to use
 * @param percent - Probability in range [0, 100]
 * @returns true if the roll succeeds (with probability = percent/100)
 * @throws {RangeError} if percent is outside [0, 100]
 */
export function rollChance(rng: RngInstance, percent: number): boolean {
  if (percent < 0 || percent > 100) {
    throw new RangeError(`rollChance: percent must be in [0, 100], got ${percent}`);
  }
  return rng.next() * 100 < percent;
}

/**
 * Roll a random integer in the range [min, max] inclusive
 * @param rng - The RNG instance to use
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns A random integer in [min, max]
 * @throws {RangeError} if min > max
 */
export function rollRange(rng: RngInstance, min: number, max: number): number {
  if (min > max) {
    throw new RangeError(`rollRange: min (${min}) must be <= max (${max})`);
  }
  return Math.floor(rng.next() * (max - min + 1)) + min;
}
