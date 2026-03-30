import type { IGameState } from './i_game_state';

/**
 * SimC armor mitigation constants for level-90 validation profiles:
 * - Base expected_stat armor constant at level 90: 3430
 * - Mythic (difficulty=16) expected_stat_mod entries for armor_constant:
 *     entry 18:  armor_constant=1.000000
 *     entry 395: armor_constant=1.180730
 *     entry 424: armor_constant=1.000000
 *   Product = 1.0 × 1.18073 × 1.0 = 1.18073
 *
 * Previous code incorrectly used creature_spell_damage (1.173) from entry 18
 * as a second armor_constant factor, inflating the coefficient from ~4050 to ~4750.
 */
export const ARMOR_COEFF_L90_BASE = 3430;
export const ARMOR_CONSTANT_MOD_MYTHIC = 1.18073;
export const ARMOR_COEFF_L90_MYTHIC = ARMOR_COEFF_L90_BASE * ARMOR_CONSTANT_MOD_MYTHIC;

/**
 * Physical damage multiplier after target armor and armor penetration.
 */
export function computePhysicalArmorMultiplier(
  state: Pick<IGameState, 'targetArmor'>,
  armorPenPercent: number,
): number {
  const effectiveArmor = state.targetArmor * (1 - armorPenPercent / 100);
  if (effectiveArmor <= 0) {
    return 1.0;
  }

  return 1 - effectiveArmor / (effectiveArmor + ARMOR_COEFF_L90_MYTHIC);
}
