import type { ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { triggerRideTheLightning } from './chain_lightning';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { triggerCrashLightningProc } from './crash_lightning';
import { triggerThorimsInvocation } from './lightning_bolt';
import { triggerFlametongueWeapon, triggerWindfuryWeapon } from './windfury_weapon';
import {
  applyShamanBuffStacks,
  consumeShamanBuffStacks,
  expireShamanBuff,
  ShamanMeleeAction,
} from '../shaman_action';

const CONVERGING_STORMS_BUFF = requireShamanSpellData(198300);
const STORMBLAST_TALENT = requireShamanSpellData(319930);
const WINNING_STREAK = requireShamanSpellData(1218616);

interface StormstrikeHitResult {
  damage: number;
  isCrit: boolean;
  extraDamage: number;
  newEvents: ActionResult['newEvents'];
}

class StormstrikeChildAction extends ShamanMeleeAction {
  constructor(
    state: IGameState,
    readonly name: string,
    readonly spellData = requireShamanSpellData(32175),
    private readonly useOffHand = false,
    private readonly bypassArmor = false,
    private readonly stormblastRowName = `stormblast_${name}`,
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
    return multiplier;
  }

  resolveHit(rng: RngInstance, isComboStrike: boolean, stormblastActive: boolean): StormstrikeHitResult {
    const hit = this.calculateDamage(rng, isComboStrike);
    const newEvents: ActionResult['newEvents'] = [];
    let extraDamage = 0;

    if (stormblastActive && hit.damage > 0) {
      extraDamage = hit.damage * STORMBLAST_TALENT.effectN(1).percent();
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

    const stormblastActive = this.p.hasTalent('stormblast') && this.p.getBuffStacks('stormblast') > 0;
    if (this.p.getBuffStacks('stormsurge') > 0) {
      consumeShamanBuffStacks(this.p, 'stormsurge', 1, result.newEvents);
    }
    if (stormblastActive) {
      consumeShamanBuffStacks(this.p, 'stormblast', 1, result.newEvents);
    }

    const mainHand = this.mainHandAction.resolveHit(rng, isComboStrike, stormblastActive);
    let totalDamage = mainHand.damage;
    let totalExtraDamage = mainHand.extraDamage;
    result.isCrit = mainHand.isCrit;
    result.newEvents.push(...mainHand.newEvents);
      if (mainHand.damage > 0) {
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
        const flametongue = triggerFlametongueWeapon(this.p, rng, isComboStrike);
        result.newEvents.push(...flametongue.newEvents);
      }
    }

    this.p.addDamage(totalDamage);

    const crashLightningProc = triggerCrashLightningProc(this.p, queue, rng, isComboStrike);
    result.newEvents.push(...crashLightningProc.newEvents);
    const windfuryProc = triggerWindfuryWeapon(this.p, queue, rng, isComboStrike);
    result.newEvents.push(...windfuryProc.newEvents);
    const shouldTriggerThorimsInvocation = this.name === 'windstrike'
      || (this.name === 'stormstrike' && this.p.isBuffActive('doom_winds'));
    if (shouldTriggerThorimsInvocation) {
      const thorimsInvocation = triggerThorimsInvocation(this.p, queue, rng, isComboStrike);
      result.isCrit = result.isCrit || thorimsInvocation.isCrit;
      result.newEvents.push(...thorimsInvocation.newEvents);
    }
    const rideTheLightning = triggerRideTheLightning(
      this.p,
      queue,
      rng,
      isComboStrike,
      this.name === 'windstrike' ? 'chain_lightning_ws_rtl' : 'chain_lightning_ss_rtl',
    );
    result.isCrit = result.isCrit || rideTheLightning.isCrit;

    if (this.p.isBuffActive('converging_storms')) {
      expireShamanBuff(this.p, 'converging_storms', result.newEvents);
    }
    if (this.p.hasTalent('midnight_season_1_2pc')) {
      applyShamanBuffStacks(this.p, 'winning_streak', this.p.getBuffStacks('winning_streak') + 1, result.newEvents);
    }

    this.p.recordPendingSpellStat(this.name, totalDamage, 1, result.isCrit);
    this.pushMaelstromWeaponStacks(1, result.newEvents);
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
