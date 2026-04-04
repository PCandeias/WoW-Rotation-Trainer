import type { GameState } from '../engine/gameState';
import type { RngInstance } from '../engine/rng';
import { rollChance } from '../engine/rng';
import { requireSharedPlayerEffectSpellData } from './player_effect_spell_data';

export type WeaponHand = 'mainHand' | 'offHand';

const SKYFURY_SPELL = requireSharedPlayerEffectSpellData(462854);
const SKYFURY_PROC_CHANCE_PCT = SKYFURY_SPELL.proc_chance_pct();
const SKYFURY_ICD_SECONDS = SKYFURY_SPELL.internal_cooldown_ms() / 1000;
const SKYFURY_LAST_PROC_AT_STATE_ID = 'shared.skyfury.last_proc_at';
const SKYFURY_PROC_SPELL_IDS = {
  mainHand: 'skyfury_proc_mh',
  offHand: 'skyfury_proc_oh',
} as const;

export interface SkyfuryProcContext {
  hand: WeaponHand;
  state: GameState;
  rng: RngInstance;
  replayAutoAttack: () => number;
}

/**
 * Handles shared Skyfury proc bookkeeping and reporting while leaving the replayed
 * swing's class-specific resolution to the caller.
 */
export function maybeTriggerSkyfuryProc(ctx: SkyfuryProcContext): number {
  const { hand, state, rng, replayAutoAttack } = ctx;
  if (!state.isBuffActive('skyfury')) {
    return 0;
  }

  const lastProcAt = state.getOptionalNumericState(SKYFURY_LAST_PROC_AT_STATE_ID) ?? Number.NEGATIVE_INFINITY;
  if (state.currentTime < lastProcAt + SKYFURY_ICD_SECONDS) {
    return 0;
  }
  if (!rollChance(rng, SKYFURY_PROC_CHANCE_PCT)) {
    return 0;
  }

  state.setOptionalNumericState(SKYFURY_LAST_PROC_AT_STATE_ID, state.currentTime);
  state.recordPendingSpellStat(SKYFURY_PROC_SPELL_IDS[hand], 0, 1);
  return replayAutoAttack();
}
