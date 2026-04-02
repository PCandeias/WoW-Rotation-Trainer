import type { ActionResult } from '../../../engine/action';
import type { DamageSnapshot, SimEventQueue } from '../../../engine/eventQueue';
import type { IGameState } from '../../../engine/i_game_state';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { FlameShockAction } from './flame_shock';
import { applyShamanBuffStacks, ShamanAction } from '../shaman_action';

const VOLTAIC_BLAZE = requireShamanSpellData(470057);
const VOLTAIC_BLAZE_DAMAGE = requireShamanSpellData(1259101);

export function triggerVoltaicBlazeProc(state: IGameState, newEvents: ActionResult['newEvents']): void {
  if (!state.hasTalent('voltaic_blaze')) {
    return;
  }

  applyShamanBuffStacks(state, 'voltaic_blaze', 1, newEvents);
}

class VoltaicBlazeDamageAction extends ShamanAction {
  readonly name = 'voltaic_blaze_damage';
  readonly spellData = VOLTAIC_BLAZE_DAMAGE;
  readonly aoe = 1 + VOLTAIC_BLAZE.effectN(4).base_value();
  private readonly flameShockAction: FlameShockAction;

  constructor(state: IGameState) {
    super(state);
    this.flameShockAction = new FlameShockAction(state);
  }

  protected override actionIsPhysical(): boolean {
    return false;
  }

  override composite_crit_chance(): number {
    return 1;
  }

  executeTargets(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): { damage: number; isCrit: boolean; newEvents: ActionResult['newEvents'] } {
    const snapshot = this.captureSnapshot(isComboStrike);
    const nTargets = this.nTargets();
    let totalDamage = 0;
    let isCrit = false;
    const newEvents: ActionResult['newEvents'] = [];

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const targetSnapshot: DamageSnapshot = {
        ...snapshot,
        targetMultiplier: snapshot.targetMultiplier * this.aoeDamageMultiplier(targetId, nTargets),
      };
      const impact = this.calculateDamageFromSnapshot(targetSnapshot, rng);
      this.p.addDamage(impact.damage, targetId);
      totalDamage += impact.damage;
      isCrit = isCrit || impact.isCrit;

      const flameShock = this.flameShockAction.executeOnTarget(queue, rng, isComboStrike, targetId);
      newEvents.push(...flameShock.newEvents);
    }

    return { damage: totalDamage, isCrit, newEvents };
  }
}

export class VoltaicBlazeAction extends ShamanAction {
  readonly name = 'voltaic_blaze';
  readonly spellData = VOLTAIC_BLAZE;
  private readonly damageAction: VoltaicBlazeDamageAction;

  constructor(state: IGameState) {
    super(state);
    this.damageAction = new VoltaicBlazeDamageAction(state);
  }

  protected override actionIsPhysical(): boolean {
    return false;
  }

  override preCastFailReason(): 'not_available' | undefined {
    return this.p.isBuffActive('voltaic_blaze') ? undefined : 'not_available';
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const result: ActionResult = {
      damage: 0,
      isCrit: false,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };

    this.pushMaelstromWeaponStacks(this.spellData.effectN(2).base_value(), result.newEvents);

    const impact = this.damageAction.executeTargets(queue, rng, isComboStrike);
    result.isCrit = impact.isCrit;
    result.newEvents.push(...impact.newEvents);

    this.p.recordPendingSpellStat(this.name, impact.damage, 1, impact.isCrit);
    return result;
  }
}
