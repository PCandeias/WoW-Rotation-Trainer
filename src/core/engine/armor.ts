import type { IGameState } from './i_game_state';

/**
 * SimC armor mitigation constant for level-90 validation profiles.
 *
 * The mitigation formula is: mitigation = armor / (armor + K)
 * where K = 3430 is the base expected_stat armor constant at level 90.
 *
 * The difficulty-specific expected_stat_mod multipliers (e.g. 1.18073 for
 * Mythic) scale the target creature's ARMOR VALUE, not this constant.
 * SimC debug confirms: armor=1293.6, K=3430 → factor = 1-1293.6/4723.6 = 0.72614.
 */
export const ARMOR_COEFF_L90 = 3430;

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

  return 1 - effectiveArmor / (effectiveArmor + ARMOR_COEFF_L90);
}
