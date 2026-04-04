import type { ActionResult } from '../../../engine/action';
import type { DamageSnapshot, SimEventQueue } from '../../../engine/eventQueue';
import { EventType } from '../../../engine/eventQueue';
import type { IGameState } from '../../../engine/i_game_state';
import type { RngInstance } from '../../../engine/rng';
import { rollChance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { ShamanAction } from '../shaman_action';

const FLAME_SHOCK_DOT_DURATION_SECONDS = 18;
const FLAME_SHOCK_REFRESH_EXTENSION_CAP_SECONDS = FLAME_SHOCK_DOT_DURATION_SECONDS * 0.3;
const FLAME_SHOCK_BASE_TICK_INTERVAL_SECONDS = 2;
const FLAME_SHOCK_MAX_ACTIVE_TARGETS = 6;
const LASHING_FLAMES_DEBUFF = requireShamanSpellData(334168);
const FLAME_SHOCK_NEXT_TICK_STATE_PREFIX = 'shaman.flame_shock.next_tick';

export class FlameShockAction extends ShamanAction {
  readonly name = 'flame_shock';
  readonly spellData = requireShamanSpellData(188389);

  constructor(state: IGameState) {
    super(state);
  }

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override actionSchools(): readonly ('fire')[] {
    return ['fire'];
  }

  override preCastFailReason(): 'not_available' | undefined {
    return this.p.hasTalent('voltaic_blaze') ? 'not_available' : undefined;
  }

  private targetMultiplierFor(targetId: number): number {
    let multiplier = super.composite_target_multiplier();
    if (this.p.isTargetDebuffActive?.('lashing_flames', targetId)) {
      multiplier *= 1 + LASHING_FLAMES_DEBUFF.effectN(1).percent();
    }
    return multiplier;
  }

  override composite_target_multiplier(): number {
    return this.targetMultiplierFor(0);
  }

  private enforceActiveTargetCap(targetId: number): void {
    if (this.p.isTargetDebuffActive?.('flame_shock', targetId)) {
      return;
    }

    const activeTargets: { targetId: number; instanceId: number }[] = [];
    for (let candidateTargetId = 0; candidateTargetId < (this.p.activeEnemies ?? 1); candidateTargetId += 1) {
      if (!this.p.isTargetDebuffActive?.('flame_shock', candidateTargetId)) {
        continue;
      }

      activeTargets.push({
        targetId: candidateTargetId,
        instanceId: this.p.getTargetDebuffInstanceId?.('flame_shock', candidateTargetId) ?? 0,
      });
    }

    if (activeTargets.length < FLAME_SHOCK_MAX_ACTIVE_TARGETS) {
      return;
    }

    activeTargets.sort((left, right) => left.instanceId - right.instanceId);
    const targetToExpire = activeTargets[0];
    if (!targetToExpire) {
      return;
    }

    this.p.expireTargetDebuff?.('flame_shock', targetToExpire.targetId);
  }

  private buildDotSnapshot(isComboStrike: boolean, targetId: number): DamageSnapshot {
    const snapshot = this.captureSnapshot(isComboStrike);
    return {
      ...snapshot,
      apCoefficient: this.spellData.effectN(2).ap_coeff(),
      spellPowerCoefficient: this.spellData.effectN(2).sp_coeff(),
      targetMultiplier: this.targetMultiplierFor(targetId),
    };
  }

  private nextTickStateId(targetId: number): string {
    return `${FLAME_SHOCK_NEXT_TICK_STATE_PREFIX}.${targetId}`;
  }

  private effectiveDotDuration(targetId: number): number {
    const remaining = this.p.getTargetDebuffRemains?.('flame_shock', targetId) ?? 0;
    return FLAME_SHOCK_DOT_DURATION_SECONDS + Math.min(remaining, FLAME_SHOCK_REFRESH_EXTENSION_CAP_SECONDS);
  }

  private nextTickTimeSeconds(targetId: number, tickInterval: number): number {
    if (!this.p.isTargetDebuffActive?.('flame_shock', targetId)) {
      return this.p.currentTime + tickInterval;
    }

    const nextTickAt = this.p.getOptionalNumericState?.(this.nextTickStateId(targetId));
    if (nextTickAt !== undefined && nextTickAt > this.p.currentTime) {
      return nextTickAt;
    }

    return this.p.currentTime + tickInterval;
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    return this.executeOnTarget(queue, rng, isComboStrike, 0);
  }

  executeOnTarget(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    targetId: number,
  ): ActionResult {
    const newEvents: ActionResult['newEvents'] = [];
    this.enforceActiveTargetCap(targetId);
    const snapshot = this.captureSnapshot(isComboStrike);
    snapshot.targetMultiplier = this.targetMultiplierFor(targetId);
    const impact = this.calculateDamageFromSnapshot(snapshot, rng);
    const result: ActionResult = {
      damage: impact.damage,
      isCrit: impact.isCrit,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
    this.p.addDamage(result.damage, targetId);
    const dotDuration = this.effectiveDotDuration(targetId);
    const tickInterval = FLAME_SHOCK_BASE_TICK_INTERVAL_SECONDS / (1 + this.p.getHastePercent() / 100);
    const nextTickTime = this.nextTickTimeSeconds(targetId, tickInterval);
    const dotInstanceId = this.p.applyTargetDebuff?.('flame_shock', dotDuration, targetId, 1) ?? 0;
    const nextTickDelay = Math.max(0, nextTickTime - this.p.currentTime);
    const totalTicks = Math.max(1, 1 + Math.floor((dotDuration - nextTickDelay) / tickInterval));
    const dotSnapshot = this.buildDotSnapshot(isComboStrike, targetId);
    dotSnapshot.tickIntervalSeconds = tickInterval;
    this.p.setOptionalNumericState?.(this.nextTickStateId(targetId), nextTickTime);

    for (let index = 0; index < totalTicks; index += 1) {
      result.newEvents.push({
        type: EventType.DOT_TICK,
        time: nextTickTime + tickInterval * index,
        spellId: this.name,
        debuffId: 'flame_shock',
        targetId,
        dotInstanceId,
        tickNumber: index + 1,
        snapshot: dotSnapshot,
        totalTicks,
      });
    }

    this.p.recordPendingSpellStat(this.name, result.damage, 1, result.isCrit);
    return result;
  }

  override dot_tick(
    _state: IGameState,
    rng: RngInstance,
    snapshot: DamageSnapshot,
    _tickNum: number,
    targetId: number,
  ): ActionResult {
    const baseDamage = snapshot.baseDmgMin
      + snapshot.apCoefficient * snapshot.attackPower
      + (snapshot.spellPowerCoefficient ?? 0) * (snapshot.spellPower ?? 0);
    const combined = snapshot.actionMultiplier
      * snapshot.playerMultiplier
      * snapshot.masteryMultiplier
      * snapshot.hitComboMultiplier
      * snapshot.versatilityMultiplier
      * this.targetMultiplierFor(targetId);
    const isCrit = rollChance(rng, snapshot.critChance);
    const damage = baseDamage * combined * (isCrit ? this.critDamageMultiplier() : 1.0);

    if (snapshot.tickIntervalSeconds !== undefined) {
      _state.setOptionalNumericState?.(this.nextTickStateId(targetId), _state.currentTime + snapshot.tickIntervalSeconds);
    }
    _state.addDamage(damage, targetId);
    return {
      damage,
      isCrit,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}
