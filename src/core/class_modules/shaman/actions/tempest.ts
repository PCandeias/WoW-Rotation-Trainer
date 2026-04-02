import type { ActionCastContext, ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { consumeShamanBuffStacks, ShamanMaelstromSpellAction } from '../shaman_action';
import { triggerVoltaicBlazeProc } from './voltaic_blaze';

const TEMPEST = requireShamanSpellData(452201);

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

    this.finishMaelstromSpender(
      result,
      rng,
      snapshot.maelstromWeaponStacks,
      snapshot.stormUnleashedActive,
    );
    triggerVoltaicBlazeProc(this.p, result.newEvents);
    consumeShamanBuffStacks(this.p, 'tempest', 1, result.newEvents);

    return result;
  }
}
