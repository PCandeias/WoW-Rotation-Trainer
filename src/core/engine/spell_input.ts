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
    canPress:
      failReason === undefined
      || failReason === 'on_gcd'
      || failReason === 'channel_locked'
      || failReason === 'cast_locked',
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
