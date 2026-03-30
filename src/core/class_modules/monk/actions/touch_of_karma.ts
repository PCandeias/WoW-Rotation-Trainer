import { SpellData } from '../../../dbc/spell_data';
import { Action, type ActionResult } from '../../../engine/action';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';

export class TouchOfKarmaAction extends Action {
  readonly name = 'touch_of_karma';
  readonly spellData = new SpellData(122470, 'Touch of Karma');

  override execute(
    _queue: SimEventQueue,
    _rng: RngInstance,
    _isComboStrike: boolean,
  ): ActionResult {
    return {
      damage: 0,
      isCrit: false,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}