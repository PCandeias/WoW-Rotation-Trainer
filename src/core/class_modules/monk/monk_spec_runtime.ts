import defaultAplText from '../../data/apls/monk_windwalker.simc?raw';

import type { ActionList, CastAction } from '../../apl/actionList';
import { findUnexpectedDefaultAplCompatibilityIssues } from '../../apl/compat';
import type { SpellDef } from '../../data/spells';
import type { CharacterProfile } from '../../data/profileParser';
import type { GameState } from '../../engine/gameState';
import { resolveSharedUseItemSpell } from '../../shared/player_effect_runtime';
import { MONK_WW_BUFFS, MONK_WW_SPELLS } from '../../data/spells/monk_windwalker';
import type { SpecRuntime } from '../../runtime/spec_runtime';
import { monk_module } from './monk_module';

let defaultAplCompatibilityChecked = false;

function resolveUseItemSpell(action: CastAction, state: GameState): SpellDef | null {
  return resolveSharedUseItemSpell(action, state, MONK_WW_SPELLS);
}

export const monkWindwalkerRuntime: SpecRuntime = {
  specId: 'monk_windwalker',
  spells: MONK_WW_SPELLS,
  buffs: MONK_WW_BUFFS,
  defaultApl: defaultAplText,
  module: monk_module,
  initializeState(state: GameState, _profile: CharacterProfile): void {
    monk_module.init(state);
    if (state.talents.has('ascension')) {
      state.chiMax = 6;
      state.energyMax = 120;
      state.energyRegenMultiplier = 1.1;
      state.recomputeEnergyRegenRate();
    }
    // Monks always self-apply Mystic Touch on first hit (SimC:
    // trigger_mystic_touch in monk_action_t::impact). The external-buff
    // toggle only controls whether OTHER raid members provide it; a monk
    // fighting a target inherently applies it.
    state.assumeMysticTouch = true;
  },
  resolveActionSpell(action: CastAction, state: GameState) {
    const spell = MONK_WW_SPELLS.get(action.ability);
    if (spell) {
      return spell;
    }

    if (action.ability !== 'use_item') {
      return null;
    }

    return resolveUseItemSpell(action, state);
  },
  assertDefaultAplCompatibility(actionLists: ActionList[]) {
    if (defaultAplCompatibilityChecked) {
      return;
    }

    const issues = findUnexpectedDefaultAplCompatibilityIssues(actionLists, {
      spells: MONK_WW_SPELLS,
      buffs: MONK_WW_BUFFS,
    });

    if (
      issues.unsupportedActions.size > 0 ||
      issues.unsupportedProperties.size > 0 ||
      issues.unsupportedTargetIfActions.size > 0
    ) {
      const parts: string[] = [];
      if (issues.unsupportedActions.size > 0) {
        parts.push(`actions: ${[...issues.unsupportedActions].sort().join(', ')}`);
      }
      if (issues.unsupportedProperties.size > 0) {
        parts.push(`properties: ${[...issues.unsupportedProperties].sort().join(', ')}`);
      }
      if (issues.unsupportedTargetIfActions.size > 0) {
        parts.push(`target_if actions: ${[...issues.unsupportedTargetIfActions].sort().join(', ')}`);
      }
      throw new Error(
        `Default APL contains unsupported constructs not in the compatibility allowlist: ${parts.join(' | ')}`
      );
    }

    defaultAplCompatibilityChecked = true;
  },
};
