// src/core/class_modules/monk/actions/slicing_winds.ts
import { MonkMeleeAction } from '../monk_action';
import { requireMonkSpellData } from '../../../dbc/monk_spell_data';

export class SlicingWindsAction extends MonkMeleeAction {
  readonly name = 'slicing_winds';
  readonly spellData = requireMonkSpellData(1217411);

  protected override actionIsPhysical(): boolean {
    return false;
  }

  /**
   * Chi cost: 2 (no buff-based reductions for this spell).
   * Override required because Action.chiCost() defaults to 0.
   */
  override chiCost(): number {
    return 2;
  }
}
