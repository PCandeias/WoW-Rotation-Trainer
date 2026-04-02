import type { ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { applyShamanBuffStacks } from '../shaman_action';

const ENHANCED_ELEMENTS = requireShamanSpellData(77223);
const STORMSURGE_PASSIVE = requireShamanSpellData(201845);
const STORMS_WRATH = requireShamanSpellData(392352);

export function stormsurgeProcChance(state: IGameState): number {
  const baseChance = STORMSURGE_PASSIVE.proc_chance_pct() / 100;
  const masteryProcChancePerPoint = ENHANCED_ELEMENTS.effectN(3).mastery_value();
  const masteryMultiplier = state.hasTalent('storms_wrath')
    ? 1 + STORMS_WRATH.effectN(1).percent()
    : 1;

  return Math.min(1, baseChance + state.getMasteryPercent() * masteryProcChancePerPoint * masteryMultiplier);
}

export function resetStrikeCooldown(state: IGameState): void {
  if (!state.restoreCooldownCharge) {
    throw new Error('Shaman strike cooldown reset requires restoreCooldownCharge support');
  }
  state.restoreCooldownCharge('strike');
}

export function triggerStormsurgeProc(
  state: IGameState,
  rng: RngInstance,
  newEvents: ActionResult['newEvents'],
): void {
  if (rng.next() >= stormsurgeProcChance(state)) {
    return;
  }

  applyShamanBuffStacks(state, 'stormsurge', 1, newEvents);
  if (state.hasTalent('stormblast')) {
    applyShamanBuffStacks(state, 'stormblast', state.getBuffStacks('stormblast') + 1, newEvents);
  }
  resetStrikeCooldown(state);
}
