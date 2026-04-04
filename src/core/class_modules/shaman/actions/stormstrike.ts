import type { ActionCastContext, ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import { EventType, type SimEventQueue } from '../../../engine/eventQueue';
import { rollChance, type RngInstance } from '../../../engine/rng';
import { triggerRideTheLightning } from './chain_lightning';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { triggerCrashLightningProc } from './crash_lightning';
import { triggerThorimsInvocation } from './lightning_bolt';
import { triggerStormsurgeProc } from './stormsurge';
import { triggerFlametongueWeapon, triggerWindfuryWeapon } from './windfury_weapon';
import {
  applyShamanBuffStacks,
  consumeShamanBuffStacks,
  expireShamanBuff,
  ShamanAction,
  ShamanMeleeAction,
  triggerMaelstromWeaponProc,
} from '../shaman_action';

const CONVERGING_STORMS_BUFF = requireShamanSpellData(198300);
const STORMBLAST_TALENT = requireShamanSpellData(319930);
const STORMFLURRY = requireShamanSpellData(344357);
const ELEMENTAL_ASSAULT = requireShamanSpellData(210853);
const LIGHTNING_STRIKES_BUFF = requireShamanSpellData(384451);
const WINNING_STREAK = requireShamanSpellData(1218616);
const STORMFLURRY_DELAY_SECONDS = 0.2;

interface StormstrikeHitResult {
  damage: number;
  isCrit: boolean;
  extraDamage: number;
  newEvents: ActionResult['newEvents'];
}

class StormblastAction extends ShamanAction {
  readonly name = 'stormblast';
  readonly spellData = requireShamanSpellData(390287);

  constructor(
    state: IGameState,
    private readonly useOffHand = false,
    private readonly damageMultiplier = 1,
  ) {
    super(state);
  }

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override effectiveAttackPower(): number {
    if (this.useOffHand) {
      return this.p.getWeaponOffHandAttackPower?.() ?? 0;
    }

    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  override composite_da_multiplier(): number {
    let multiplier = super.composite_da_multiplier();
    const convergingStormsStacks = this.p.getBuffStacks('converging_storms');
    if (convergingStormsStacks > 0) {
      multiplier *= 1 + CONVERGING_STORMS_BUFF.effectN(1).percent() * convergingStormsStacks;
    }
    if (this.p.hasTalent('midnight_season_1_2pc')) {
      multiplier *= 1 + WINNING_STREAK.effectN(1).percent() * this.p.getBuffStacks('winning_streak');
    }
    if (this.p.hasTalent('elemental_assault')) {
      multiplier *= 1 + ELEMENTAL_ASSAULT.effectN(1).percent();
    }
    if (this.p.isBuffActive('lightning_strikes')) {
      multiplier *= 1 + LIGHTNING_STRIKES_BUFF.effectN(1).percent();
    }
    if (this.useOffHand) {
      multiplier *= 0.5;
    }
    return multiplier * this.damageMultiplier;
  }
}

class StormstrikeChildAction extends ShamanMeleeAction {
  constructor(
    state: IGameState,
    readonly name: string,
    readonly spellData = requireShamanSpellData(32175),
    private readonly useOffHand = false,
    private readonly bypassArmor = false,
    private readonly stormblastRowName = `stormblast_${name}`,
    private readonly damageMultiplier = 1,
  ) {
    super(state);
  }

  protected override effectiveAttackPower(): number {
    if (this.useOffHand) {
      return this.p.getWeaponOffHandAttackPower?.() ?? 0;
    }

    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  override composite_target_multiplier(): number {
    if (!this.bypassArmor) {
      return super.composite_target_multiplier();
    }

    return this.p.damageHooks?.getTargetMultiplier?.(this.spellDef(), this.p) ?? 1.0;
  }

  override composite_da_multiplier(): number {
    let multiplier = super.composite_da_multiplier();
    const convergingStormsStacks = this.p.getBuffStacks('converging_storms');
    if (convergingStormsStacks > 0) {
      multiplier *= 1 + CONVERGING_STORMS_BUFF.effectN(1).percent() * convergingStormsStacks;
    }
    if (this.p.hasTalent('midnight_season_1_2pc')) {
      multiplier *= 1 + WINNING_STREAK.effectN(1).percent() * this.p.getBuffStacks('winning_streak');
    }
    if (this.p.hasTalent('elemental_assault')) {
      multiplier *= 1 + ELEMENTAL_ASSAULT.effectN(1).percent();
    }
    if (this.p.isBuffActive('lightning_strikes')) {
      multiplier *= 1 + LIGHTNING_STRIKES_BUFF.effectN(1).percent();
    }
    if (this.useOffHand) {
      multiplier *= 0.5;
    }
    return multiplier * this.damageMultiplier;
  }

  resolveHit(rng: RngInstance, isComboStrike: boolean, stormblastActive: boolean): StormstrikeHitResult {
    const hit = this.calculateDamage(rng, isComboStrike);
    const newEvents: ActionResult['newEvents'] = [];
    let extraDamage = 0;

    if (hit.damage > 0) {
      this.p.recordPendingSpellStat(this.name, hit.damage, 1, hit.isCrit);
      triggerMaelstromWeaponProc(this.p, rng, newEvents);
    }

    if (stormblastActive && hit.damage > 0) {
      const physicalMultiplier = this.total_multiplier(isComboStrike);
      const stormblastMultiplier = new StormblastAction(this.p, this.useOffHand, this.damageMultiplier)
        .total_multiplier(isComboStrike);
      const stormblastRatio = physicalMultiplier > 0 ? stormblastMultiplier / physicalMultiplier : 0;
      extraDamage = hit.damage * STORMBLAST_TALENT.effectN(1).percent() * stormblastRatio;
      this.p.addDamage(extraDamage);
      this.p.recordPendingSpellStat(this.stormblastRowName, extraDamage, 1, false);
    }

    return {
      damage: hit.damage,
      isCrit: hit.isCrit,
      extraDamage,
      newEvents,
    };
  }
}

/**
 * Mirrors SimC's parent Stormstrike/Windstrike family:
 * consume proc windows on cast, snapshot Stormblast for both child hits, then let
 * each child report its own Stormblast damage bucket.
 */
abstract class StormstrikeBaseAction extends ShamanMeleeAction {
  protected abstract readonly mainHandAction: StormstrikeChildAction;
  protected abstract readonly offHandAction: StormstrikeChildAction;

  protected shouldConsumeProcBuffs(): boolean {
    return true;
  }

  protected shouldTriggerSecondaryProcs(): boolean {
    return true;
  }

  protected shouldTriggerStormflurry(): boolean {
    return true;
  }

  protected shouldRecordParentSpellStat(): boolean {
    return true;
  }

  protected resolveStormblastActive(castContext?: ActionCastContext): boolean {
    if (typeof castContext?.stormblastActive === 'boolean') {
      return castContext.stormblastActive === true;
    }
    return this.p.hasTalent('stormblast') && this.p.getBuffStacks('stormblast') > 0;
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    castContext?: ActionCastContext,
  ): ActionResult {
    const result: ActionResult = {
      damage: 0,
      isCrit: false,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };

    const stormblastActive = this.resolveStormblastActive(castContext);
    if (this.shouldConsumeProcBuffs() && this.p.getBuffStacks('stormsurge') > 0) {
      consumeShamanBuffStacks(this.p, 'stormsurge', 1, result.newEvents);
    }
    if (this.shouldConsumeProcBuffs() && stormblastActive) {
      consumeShamanBuffStacks(this.p, 'stormblast', 1, result.newEvents);
    }

    const mainHand = this.mainHandAction.resolveHit(rng, isComboStrike, stormblastActive);
    let totalDamage = mainHand.damage;
    let totalExtraDamage = mainHand.extraDamage;
    result.isCrit = mainHand.isCrit;
    result.newEvents.push(...mainHand.newEvents);
    const mainHandLanded = mainHand.damage > 0;
    let offHandLanded = false;
    if (mainHandLanded) {
      const flametongue = triggerFlametongueWeapon(this.p, rng, isComboStrike);
      result.newEvents.push(...flametongue.newEvents);
    }

    const offHandAttackPower = this.p.getWeaponOffHandAttackPower?.() ?? 0;
    if (offHandAttackPower > 0) {
      const offHand = this.offHandAction.resolveHit(rng, isComboStrike, stormblastActive);
      totalDamage += offHand.damage;
      totalExtraDamage += offHand.extraDamage;
      result.isCrit = result.isCrit || offHand.isCrit;
      result.newEvents.push(...offHand.newEvents);
      if (offHand.damage > 0) {
        offHandLanded = true;
        const flametongue = triggerFlametongueWeapon(this.p, rng, isComboStrike);
        result.newEvents.push(...flametongue.newEvents);
      }
    }

    if (mainHandLanded || offHandLanded) {
      triggerStormsurgeProc(this.p, rng, result.newEvents);
    }

    this.p.addDamage(totalDamage);
    result.damage = totalDamage;

    if (this.shouldTriggerSecondaryProcs()) {
      this.triggerElementalAssault(result.newEvents, rng);
      const crashLightningProc = triggerCrashLightningProc(this.p, queue, rng, isComboStrike);
      result.newEvents.push(...crashLightningProc.newEvents);
      const windfuryProc = triggerWindfuryWeapon(this.p, queue, rng, isComboStrike);
      result.newEvents.push(...windfuryProc.newEvents);
      const shouldTriggerThorimsInvocation = this.name === 'windstrike'
        || (this.name === 'stormstrike' && this.p.isBuffActive('doom_winds'));
      if (shouldTriggerThorimsInvocation) {
        result.newEvents.push(...triggerThorimsInvocation(this.p, queue, rng, isComboStrike).newEvents);
      }
      const rideTheLightning = triggerRideTheLightning(
        this.p,
        queue,
        rng,
        isComboStrike,
        this.name === 'windstrike' ? 'chain_lightning_ws_rtl' : 'chain_lightning_ss_rtl',
      );
      result.newEvents.push(...rideTheLightning.newEvents);
      this.consumeLightningStrikes(result.newEvents);
    }

    if (this.shouldTriggerStormflurry() && this.p.hasTalent('stormflurry') && rollChance(rng, STORMFLURRY.effectN(1).base_value())) {
      result.newEvents.push({
        type: EventType.DELAYED_SPELL_IMPACT,
        time: this.p.currentTime + STORMFLURRY_DELAY_SECONDS,
        spellId: this.name === 'windstrike' ? 'stormflurry_windstrike' : 'stormflurry_stormstrike',
        castContext: { stormblastActive },
      });
    }

    if (this.p.isBuffActive('converging_storms')) {
      expireShamanBuff(this.p, 'converging_storms', result.newEvents);
    }
    if (this.p.hasTalent('midnight_season_1_2pc')) {
      applyShamanBuffStacks(this.p, 'winning_streak', this.p.getBuffStacks('winning_streak') + 1, result.newEvents);
    }

    if (this.shouldRecordParentSpellStat()) {
      this.p.recordPendingSpellStat(this.name, totalDamage, 1, result.isCrit);
    }
    return result;
  }
}

export class StormstrikeAction extends StormstrikeBaseAction {
  readonly name = 'stormstrike';
  readonly spellData = requireShamanSpellData(17364);
  protected readonly mainHandAction: StormstrikeChildAction;
  protected readonly offHandAction: StormstrikeChildAction;

  constructor(state: IGameState) {
    super(state);
    this.mainHandAction = new StormstrikeChildAction(state, 'stormstrike_mh', requireShamanSpellData(32175));
    this.offHandAction = new StormstrikeChildAction(
      state,
      'stormstrike_offhand',
      requireShamanSpellData(32176),
      true,
    );
  }
}

export class WindstrikeAction extends StormstrikeBaseAction {
  readonly name = 'windstrike';
  readonly spellData = requireShamanSpellData(115356);
  protected readonly mainHandAction: StormstrikeChildAction;
  protected readonly offHandAction: StormstrikeChildAction;

  constructor(state: IGameState) {
    super(state);
    this.mainHandAction = new StormstrikeChildAction(
      state,
      'windstrike_mh',
      requireShamanSpellData(115357),
      false,
      true,
    );
    this.offHandAction = new StormstrikeChildAction(
      state,
      'windstrike_offhand',
      requireShamanSpellData(115360),
      true,
      true,
    );
  }
}

abstract class StormflurryBaseAction extends StormstrikeBaseAction {
  protected override shouldConsumeProcBuffs(): boolean {
    return false;
  }

  protected override shouldTriggerSecondaryProcs(): boolean {
    return false;
  }

  protected override shouldRecordParentSpellStat(): boolean {
    return false;
  }
}

export class StormflurryStormstrikeAction extends StormflurryBaseAction {
  readonly name = 'stormflurry_stormstrike';
  readonly spellData = requireShamanSpellData(17364);
  protected readonly mainHandAction: StormstrikeChildAction;
  protected readonly offHandAction: StormstrikeChildAction;

  constructor(state: IGameState) {
    super(state);
    this.mainHandAction = new StormstrikeChildAction(
      state,
      'stormstrike_mh',
      requireShamanSpellData(32175),
      false,
      false,
      'stormblast_stormstrike_mh',
      STORMFLURRY.effectN(2).percent(),
    );
    this.offHandAction = new StormstrikeChildAction(
      state,
      'stormstrike_offhand',
      requireShamanSpellData(32176),
      true,
      false,
      'stormblast_stormstrike_offhand',
      STORMFLURRY.effectN(2).percent(),
    );
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    castContext?: ActionCastContext,
  ): ActionResult {
    return super.execute(queue, rng, isComboStrike, castContext);
  }
}

export class StormflurryWindstrikeAction extends StormflurryBaseAction {
  readonly name = 'stormflurry_windstrike';
  readonly spellData = requireShamanSpellData(115356);
  protected readonly mainHandAction: StormstrikeChildAction;
  protected readonly offHandAction: StormstrikeChildAction;

  constructor(state: IGameState) {
    super(state);
    this.mainHandAction = new StormstrikeChildAction(
      state,
      'windstrike_mh',
      requireShamanSpellData(115357),
      false,
      true,
      'stormblast_windstrike_mh',
      STORMFLURRY.effectN(2).percent(),
    );
    this.offHandAction = new StormstrikeChildAction(
      state,
      'windstrike_offhand',
      requireShamanSpellData(115360),
      true,
      true,
      'stormblast_windstrike_offhand',
      STORMFLURRY.effectN(2).percent(),
    );
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    castContext?: ActionCastContext,
  ): ActionResult {
    return super.execute(queue, rng, isComboStrike, castContext);
  }
}
