import type { ActionCastContext, ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { consumeShamanBuffStacks, ShamanMaelstromSpellAction } from '../shaman_action';

const TEMPEST = requireShamanSpellData(452201);
const THORIMS_INVOCATION_TRIGGER_STATE = 'shaman.thorims_invocation_trigger';
const THORIMS_TRIGGER_LIGHTNING_BOLT = 1;
const THORIMS_TRIGGER_CHAIN_LIGHTNING = 2;

export class TempestAction extends ShamanMaelstromSpellAction {
  readonly name = 'tempest';
  readonly spellData = TEMPEST;
  readonly aoe = -1;
  readonly reducedAoeTargets = TEMPEST.effectN(3).base_value();
  readonly baseAoeMultiplier = TEMPEST.effectN(2).percent();

  constructor(state: IGameState) {
    super(state);
  }

  override preCastFailReason(): 'not_available' | undefined {
    return this.p.isBuffActive('tempest') ? undefined : 'not_available';
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * this.thunderCapacitorDamageMultiplier();
  }

  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    castContext?: ActionCastContext,
  ): ActionResult {
    const snapshot = this.resolveMaelstromSpellSnapshot(castContext);
    const nTargets = this.nTargets();
    let totalDamage = 0;
    let anyCrit = false;

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const targetResult = this.calculateSpellDamageWithSnapshot(
        rng,
        isComboStrike,
        snapshot.maelstromWeaponStacks,
        snapshot.stormUnleashedActive,
        this.aoeDamageMultiplier(targetId, nTargets),
        targetId,
      );
      totalDamage += targetResult.damage;
      anyCrit = anyCrit || targetResult.isCrit;
    }

    const result: ActionResult = {
      damage: totalDamage,
      isCrit: anyCrit,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };

    const stacksConsumed = this.finishMaelstromSpender(
      result,
      rng,
      snapshot.maelstromWeaponStacks,
      snapshot.stormUnleashedActive,
    );
    this.triggerThunderCapacitorRefund(stacksConsumed, result.newEvents, rng);
    this.p.recordPendingSpellStat(this.name, totalDamage, 1, anyCrit);
    this.triggerFlurryFromCrit(result.isCrit, result.newEvents);
    consumeShamanBuffStacks(this.p, 'tempest', 1, result.newEvents);
    this.p.setNumericState?.(
      THORIMS_INVOCATION_TRIGGER_STATE,
      nTargets > 1 ? THORIMS_TRIGGER_CHAIN_LIGHTNING : THORIMS_TRIGGER_LIGHTNING_BOLT,
    );

    return result;
  }
}
