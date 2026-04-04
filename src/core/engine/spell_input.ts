import type { SpellDef } from '../data/spells';
import type { GameState } from './gameState';
import { getAbilityFailReason, getEffectiveChiCost, type FailReason } from './executor';

export interface SpellInputStatus {
  failReason?: FailReason;
  canPress: boolean;
  visuallyUsable: boolean;
}

export function getSpellInputStatus(
  spell: SpellDef,
  state: GameState,
): SpellInputStatus {
  const failReason = getAbilityFailReason(spell, state);
  const chiCost = getEffectiveChiCost(spell, state);
  const hasEnoughEnergy = spell.energyCost <= 0 || state.getEnergy() >= spell.energyCost;
  const hasEnoughChi = chiCost <= 0 || state.chi >= chiCost;
  const hasEnoughResources = hasEnoughEnergy && hasEnoughChi;

  return {
    failReason,
    // Allow the player to attempt pressing even when gated by timing/lock,
    // but block hard-gated reasons like talent_missing, not_available, execute_not_ready, etc.
    canPress:
      failReason === undefined
      || failReason === 'on_gcd'
      || failReason === 'channel_locked'
      || failReason === 'cast_locked',
    // Show the icon as usable when only timing prevents the cast; dim it
    // for hard blocks (talent_missing, not_available, execute_not_ready, etc.).
    visuallyUsable:
      hasEnoughResources
      && (
        failReason === undefined
        || failReason === 'on_gcd'
        || failReason === 'channel_locked'
        || failReason === 'cast_locked'
        || failReason === 'on_cooldown'
      ),
  };
}

export function buildSpellInputStatusMap(
  state: GameState,
  spells: Iterable<SpellDef>,
): Map<string, SpellInputStatus> {
  const result = new Map<string, SpellInputStatus>();

  for (const spell of spells) {
    result.set(spell.name, getSpellInputStatus(spell, state));
  }

  return result;
}
