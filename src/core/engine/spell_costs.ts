import type { SpellDef } from '../data/spells';

interface BuffLike {
  expiresAt: number;
  stacks: number;
}

export interface SpellCostStateLike {
  currentTime: number;
  buffs: ReadonlyMap<string, BuffLike>;
  talents: ReadonlySet<string>;
}

function isBuffActive(state: SpellCostStateLike, buffId: string): boolean {
  return (state.buffs.get(buffId)?.expiresAt ?? 0) > state.currentTime;
}

export function getSharedUiChiCost(spell: SpellDef, state: SpellCostStateLike): number {
  let cost = spell.chiCost;

  if (
    (spell.name === 'blackout_kick' || spell.name === 'blackout_kick_free') &&
    isBuffActive(state, 'blackout_reinforcement')
  ) {
    return 0;
  }

  if (spell.name === 'spinning_crane_kick' && isBuffActive(state, 'dance_of_chi_ji')) {
    return 0;
  }

  if (state.talents.has('harmonic_combo') && spell.name === 'fists_of_fury') {
    cost -= 1;
  }

  if (
    state.talents.has('knowledge_of_the_broken_temple') &&
    (spell.name === 'rising_sun_kick' || spell.name === 'rushing_wind_kick' || spell.name === 'strike_of_the_windlord')
  ) {
    cost -= 1;
  }

  if (isBuffActive(state, 'zenith') || isBuffActive(state, 'celestial_conduit_active')) {
    cost -= 1;
  }

  return Math.max(0, cost);
}