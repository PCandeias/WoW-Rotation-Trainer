/**
 * Represents an individual enemy target in the simulation.
 * Each target has independent health tracking.
 * Mirrors SimC's `enemy_t` in a simplified form.
 */
export interface Target {
  /** 0-indexed target ID. 0 = primary target. */
  readonly id: number;
  /** Maximum health of this target. */
  readonly maxHealth: number;
  /** Current health (decreases as damage is dealt, minimum 1 for training dummies). */
  currentHealth: number;
  /** Health as a percentage (0–100). Derived from currentHealth/maxHealth. */
  healthPct: number;
}

/**
 * Create a new target with full health.
 */
export function createTarget(id: number, maxHealth: number): Target {
  return {
    id,
    maxHealth,
    currentHealth: maxHealth,
    healthPct: maxHealth > 0 ? 100 : 100,
  };
}
