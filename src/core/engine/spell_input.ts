import type { SpellDef } from '../data/spells';
import type { GameState } from './gameState';
import { getAbilityFailReason, type FailReason } from './executor';

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

  return {
    failReason,
    canPress: failReason === undefined || failReason === 'on_gcd' || failReason === 'channel_locked',
    visuallyUsable:
      failReason === undefined
      || failReason === 'on_gcd'
      || failReason === 'channel_locked'
      || failReason === 'on_cooldown',
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