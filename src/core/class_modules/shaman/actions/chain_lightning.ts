import type { ActionCastContext, ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { ShamanMaelstromSpellAction, triggerCrashLightningDamageBuff } from '../shaman_action';
import { createSurgingBoltEvent, triggerWhirlingAir } from './surging_totem';
import { createAlphaWolfEvents } from './feral_spirit';

const MAX_CHAIN_LIGHTNING_TARGETS = 5;
const RIDE_THE_LIGHTNING_CHAIN_LIGHTNING = requireShamanSpellData(211094);
const THORIMS_INVOCATION_TRIGGER_STATE = 'shaman.thorims_invocation_trigger';
const THORIMS_TRIGGER_CHAIN_LIGHTNING = 2;

/**
 * Enhancement Chain Lightning.
 *
 * Uses the same Maelstrom Weapon hard-cast/spend pipeline as Lightning Bolt,
 * but resolves damage independently on up to five targets.
 */
export class ChainLightningAction extends ShamanMaelstromSpellAction {
  readonly name = 'chain_lightning';
  readonly spellData = requireShamanSpellData(188443);
  readonly aoe = -1;
  readonly reducedAoeTargets = 0;

  constructor(state: IGameState) {
    super(state);
  }

  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    castContext?: ActionCastContext,
  ): ActionResult {
    const snapshot = this.resolveMaelstromSpellSnapshot(castContext);
    const nTargets = Math.min(MAX_CHAIN_LIGHTNING_TARGETS, Math.max(1, this.p.activeEnemies));
    let totalDamage = 0;
    let anyCrit = false;

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const damageResult = this.calculateSpellDamageWithSnapshot(
        rng,
        isComboStrike,
        snapshot.maelstromWeaponStacks,
        snapshot.stormUnleashedActive,
        this.aoeDamageMultiplier(targetId, nTargets),
        targetId,
      );
      totalDamage += damageResult.damage;
      anyCrit = anyCrit || damageResult.isCrit;
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
    this.triggerFlurryFromCrit(result.isCrit, result.newEvents);
    if (this.attemptTotemicReboundProc(result.newEvents, rng, this.name)) {
      result.newEvents.push(createSurgingBoltEvent(this.p.currentTime, 0));
    }
    triggerWhirlingAir(this.p, 0, result.newEvents);
    this.triggerStaticAccumulationRefund(snapshot.maelstromWeaponStacks, result.newEvents, rng);
    if (this.p.hasTalent('alpha_wolf') && this.p.isBuffActive('feral_spirit')) {
      result.newEvents.push(...createAlphaWolfEvents(this.p.currentTime, this.p));
    }
    triggerCrashLightningDamageBuff(this.p, nTargets, result.newEvents);
    this.p.setNumericState?.(THORIMS_INVOCATION_TRIGGER_STATE, THORIMS_TRIGGER_CHAIN_LIGHTNING);

    return result;
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * this.thunderCapacitorDamageMultiplier();
  }
}

class RideTheLightningChainLightningAction extends ShamanMaelstromSpellAction {
  constructor(
    state: IGameState,
    private readonly childName: 'chain_lightning_ll_rtl' | 'chain_lightning_ss_rtl' | 'chain_lightning_ws_rtl',
  ) {
    super(state);
  }

  readonly spellData = RIDE_THE_LIGHTNING_CHAIN_LIGHTNING;
  readonly name = 'ride_the_lightning';
  readonly aoe = -1;
  readonly reducedAoeTargets = 0;

  override castTime(): number {
    return 0;
  }

  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const nTargets = Math.min(MAX_CHAIN_LIGHTNING_TARGETS, Math.max(1, this.p.activeEnemies));
    let totalDamage = 0;
    let anyCrit = false;

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const damageResult = this.calculateSpellDataDamageWithSnapshot(
        this.spellData,
        rng,
        isComboStrike,
        0,
        false,
        this.aoeDamageMultiplier(targetId, nTargets),
        targetId,
      );
      this.p.addDamage(damageResult.damage, targetId);
      totalDamage += damageResult.damage;
      anyCrit = anyCrit || damageResult.isCrit;
    }

    this.p.recordPendingSpellStat(this.childName, totalDamage, 1, anyCrit);
    this.p.recordPendingSpellStat(this.name, totalDamage, 0, anyCrit);
    const newEvents: ActionResult['newEvents'] = [];
    if (this.attemptTotemicReboundProc(newEvents, rng, this.childName)) {
      newEvents.push(createSurgingBoltEvent(this.p.currentTime, 0));
    }
    triggerWhirlingAir(this.p, 0, newEvents);
    triggerCrashLightningDamageBuff(this.p, nTargets, newEvents);

    return {
      damage: totalDamage,
      isCrit: anyCrit,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * this.thunderCapacitorDamageMultiplier();
  }
}

export function triggerRideTheLightning(
  state: IGameState,
  queue: SimEventQueue,
  rng: RngInstance,
  isComboStrike: boolean,
  childName: 'chain_lightning_ll_rtl' | 'chain_lightning_ss_rtl' | 'chain_lightning_ws_rtl',
): ActionResult {
  if (!state.hasTalent('ride_the_lightning')) {
    return {
      damage: 0,
      isCrit: false,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }

  return new RideTheLightningChainLightningAction(state, childName).execute(queue, rng, isComboStrike);
}

export class ChainLightningThorimsInvocationAction extends ShamanMaelstromSpellAction {
  readonly name = 'chain_lightning_ti';
  readonly spellData = requireShamanSpellData(188443);
  readonly aoe = -1;
  readonly reducedAoeTargets = 0;

  constructor(state: IGameState) {
    super(state);
  }

  override castTime(): number {
    return 0;
  }

  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const snapshot = this.resolveMaelstromSpellSnapshot();
    const nTargets = Math.min(MAX_CHAIN_LIGHTNING_TARGETS, Math.max(1, this.p.activeEnemies));
    let totalDamage = 0;
    let anyCrit = false;

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const damageResult = this.calculateSpellDamageWithSnapshot(
        rng,
        isComboStrike,
        snapshot.maelstromWeaponStacks,
        snapshot.stormUnleashedActive,
        this.aoeDamageMultiplier(targetId, nTargets),
        targetId,
      );
      this.p.addDamage(damageResult.damage, targetId);
      totalDamage += damageResult.damage;
      anyCrit = anyCrit || damageResult.isCrit;
    }

    const result: ActionResult = {
      damage: totalDamage,
      isCrit: anyCrit,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };

    this.p.recordPendingSpellStat(this.name, totalDamage, 1, anyCrit);
    this.p.recordPendingSpellStat('thorims_invocation', totalDamage, 0, anyCrit);

    const stacksConsumed = this.finishMaelstromSpender(
      result,
      rng,
      snapshot.maelstromWeaponStacks,
      snapshot.stormUnleashedActive,
    );
    this.triggerThunderCapacitorRefund(stacksConsumed, result.newEvents, rng);
    this.triggerFlurryFromCrit(result.isCrit, result.newEvents);
    if (this.attemptTotemicReboundProc(result.newEvents, rng, this.name)) {
      result.newEvents.push(createSurgingBoltEvent(this.p.currentTime, 0));
    }
    triggerWhirlingAir(this.p, 0, result.newEvents);
    if (this.p.hasTalent('alpha_wolf') && this.p.isBuffActive('feral_spirit')) {
      result.newEvents.push(...createAlphaWolfEvents(this.p.currentTime, this.p));
    }
    triggerCrashLightningDamageBuff(this.p, nTargets, result.newEvents);

    return result;
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * this.thunderCapacitorDamageMultiplier();
  }
}
