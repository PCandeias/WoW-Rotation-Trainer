import type { ActionResult } from '../../../engine/action';
import type { DamageSnapshot } from '../../../engine/eventQueue';
import { EventType } from '../../../engine/eventQueue';
import type { IGameState } from '../../../engine/i_game_state';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import {
  applyShamanBuffStacks,
  consumeShamanBuffStacks,
  expireShamanBuff,
  ShamanAction,
  triggerMaelstromWeaponProc,
} from '../shaman_action';
import { createAlphaWolfEvents } from './feral_spirit';
import { triggerThorimsInvocation } from './lightning_bolt';
import { triggerFlametongueWeapon, triggerWindfuryWeapon } from './windfury_weapon';

const CRASH_LIGHTNING_BUFF = requireShamanSpellData(187874);
const CRASH_LIGHTNING_PROC = requireShamanSpellData(195592);
const STORM_UNLEASHED_RANK4 = requireShamanSpellData(1252373);
const CRASH_LIGHTNING_UNLEASHED = requireShamanSpellData(1252431);
const ELECTROSTATIC_WAGER_DAMAGE = requireShamanSpellData(1223332);
const CL_CRASH_LIGHTNING_DAMAGE = requireShamanSpellData(333964);

const STORM_UNLEASHED_REPEAT_INTERVAL_SECONDS = 1;

class CrashLightningProcAction extends ShamanAction {
  readonly name = 'crash_lightning_proc';
  readonly spellData = CRASH_LIGHTNING_PROC;
  readonly aoe = -1;
  readonly splitAoeDamage = true;

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const crashLightningStacks = this.p.getBuffStacks('crash_lightning');
    if (crashLightningStacks <= 0) {
      return { damage: 0, isCrit: false, newEvents: [], buffsApplied: [], cooldownAdjustments: [] };
    }

    const snapshot = this.captureSnapshot(isComboStrike);
    const nTargets = Math.min(this.nTargets(), 5);
    let totalDamage = 0;
    let isCrit = false;
    const newEvents: ActionResult['newEvents'] = [];

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const targetSnapshot: DamageSnapshot = {
        ...snapshot,
        actionMultiplier: snapshot.actionMultiplier * crashLightningStacks,
      };
      const impact = this.calculateDamageFromSnapshot(targetSnapshot, rng, targetId, this.aoeDamageMultiplier(targetId, nTargets));
      this.p.addDamage(impact.damage, targetId);
      if (impact.damage > 0) {
        triggerMaelstromWeaponProc(this.p, rng, newEvents);
      }
      totalDamage += impact.damage;
      isCrit = isCrit || impact.isCrit;
    }

    this.p.recordPendingSpellStat(this.name, totalDamage, 1, isCrit);
    return {
      damage: 0,
      isCrit,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}

export class CrashLightningUnleashedAction extends ShamanAction {
  readonly name = 'crash_lightning_unleashed';
  readonly spellData = CRASH_LIGHTNING_UNLEASHED;

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier()
      * (1 + ELECTROSTATIC_WAGER_DAMAGE.effectN(1).percent() * this.p.getBuffStacks('electrostatic_wager_damage'));
  }

  executeOnTarget(targetId: number, rng: RngInstance, isComboStrike: boolean): { amount: number; isCrit: boolean } {
    const snapshot = this.captureSnapshot(isComboStrike);
    const impact = this.calculateDamageFromSnapshot(snapshot, rng, targetId);
    this.p.addDamage(impact.damage, targetId);
    return { amount: impact.damage, isCrit: impact.isCrit };
  }
}

/**
 * Enhancement Crash Lightning cast.
 *
 * This mirrors the first SimC-visible package:
 * - direct Nature AOE hit using WEAPON_BOTH AP
 * - applies the weapon-enhancement buff
 * - grants Converging Storms stacks per target hit
 *
 * Storm Unleashed now uses the shared cooldown-query/start hooks so proc-granted
 * Crash Lightning casts ignore the tracked base cooldown without resetting it.
 * Rank 4 repeat hits are modelled as scheduled delayed impacts, matching SimC's
 * repeating-event shape.
 */
export class CrashLightningAction extends ShamanAction {
  readonly name = 'crash_lightning';
  readonly spellData = CRASH_LIGHTNING_BUFF;
  readonly aoe = -1;
  readonly reducedAoeTargets = CRASH_LIGHTNING_BUFF.effectN(2).base_value();
  private readonly procAction: CrashLightningProcAction;

  constructor(state: IGameState) {
    super(state);
    this.procAction = new CrashLightningProcAction(state);
  }

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponBothAttackPower?.() ?? this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier()
      * (1 + CL_CRASH_LIGHTNING_DAMAGE.effectN(1).percent() * this.p.getBuffStacks('cl_crash_lightning'))
      * (1 + ELECTROSTATIC_WAGER_DAMAGE.effectN(1).percent() * this.p.getBuffStacks('electrostatic_wager_damage'));
  }

  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const snapshot = this.captureSnapshot(isComboStrike);
    const nTargets = this.nTargets();
    let totalDamage = 0;
    let isCrit = false;
    const newEvents: ActionResult['newEvents'] = [];

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const impact = this.calculateDamageFromSnapshot(snapshot, rng, targetId, this.aoeDamageMultiplier(targetId, nTargets));
      this.p.addDamage(impact.damage, targetId);
      if (impact.damage > 0) {
        triggerMaelstromWeaponProc(this.p, rng, newEvents);
      }
      totalDamage += impact.damage;
      isCrit = isCrit || impact.isCrit;
    }

    const result: ActionResult = {
      damage: 0,
      isCrit,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };

    if (totalDamage > 0) {
      const flametongue = triggerFlametongueWeapon(this.p, rng, isComboStrike);
      result.isCrit = result.isCrit || flametongue.isCrit;
      result.newEvents.push(...flametongue.newEvents);

      const windfury = triggerWindfuryWeapon(this.p, _queue, rng, isComboStrike);
      result.isCrit = result.isCrit || windfury.isCrit;
      result.newEvents.push(...windfury.newEvents);
    }

    const crashLightningStacks = this.p.hasTalent('storm_unleashed')
      ? this.p.getBuffStacks('crash_lightning') + 1
      : 1;
    applyShamanBuffStacks(this.p, 'crash_lightning', crashLightningStacks, result.newEvents);

    if (this.p.hasTalent('converging_storms')) {
      const stacks = this.p.getBuffStacks('converging_storms') + nTargets;
      applyShamanBuffStacks(this.p, 'converging_storms', stacks, result.newEvents);
    }

    if (this.p.isBuffActive('storm_unleashed')) {
      consumeShamanBuffStacks(this.p, 'storm_unleashed', 1, result.newEvents);
    }

    expireShamanBuff(this.p, 'cl_crash_lightning', result.newEvents);

    if (this.p.isBuffActive('doom_winds')) {
      const thorimsInvocation = triggerThorimsInvocation(this.p, _queue, rng, isComboStrike);
      result.isCrit = result.isCrit || thorimsInvocation.isCrit;
      result.newEvents.push(...thorimsInvocation.newEvents);
    }

    if (this.p.getTalentRank('storm_unleashed') >= 4) {
      const repeatCount = STORM_UNLEASHED_RANK4.effectN(2).base_value();
      for (let index = 0; index < repeatCount; index += 1) {
        result.newEvents.push({
          type: EventType.DELAYED_SPELL_IMPACT,
          time: this.p.currentTime + STORM_UNLEASHED_REPEAT_INTERVAL_SECONDS * (index + 1),
          spellId: 'crash_lightning_unleashed',
        });
      }
    }

    if (this.p.hasTalent('alpha_wolf') && this.p.isBuffActive('feral_spirit')) {
      result.newEvents.push(...createAlphaWolfEvents(this.p.currentTime, this.p));
    }

    const hiddenStacks = this.p.getBuffStacks('electrostatic_wager_damage');
    if (hiddenStacks > 0) {
      consumeShamanBuffStacks(this.p, 'electrostatic_wager', hiddenStacks, result.newEvents);
      consumeShamanBuffStacks(this.p, 'electrostatic_wager_damage', hiddenStacks, result.newEvents);
      const remainingVisible = this.p.getBuffStacks('electrostatic_wager');
      if (remainingVisible > 0) {
        applyShamanBuffStacks(
          this.p,
          'electrostatic_wager_damage',
          Math.min(ELECTROSTATIC_WAGER_DAMAGE.max_stacks(), remainingVisible),
          result.newEvents,
        );
      }
    }

    this.p.recordPendingSpellStat(this.name, totalDamage, 1, isCrit);
    return result;
  }

  triggerProc(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    return this.procAction.execute(queue, rng, isComboStrike);
  }
}

export function triggerCrashLightningProc(
  state: IGameState & { action_list?: Map<string, unknown> },
  queue: SimEventQueue,
  rng: RngInstance,
  isComboStrike: boolean,
): ActionResult {
  const action = state.action_list?.get('crash_lightning');
  if (!(action instanceof CrashLightningAction) || !state.isBuffActive('crash_lightning')) {
    return { damage: 0, isCrit: false, newEvents: [], buffsApplied: [], cooldownAdjustments: [] };
  }

  return action.triggerProc(queue, rng, isComboStrike);
}
