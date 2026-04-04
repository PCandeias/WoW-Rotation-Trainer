import type { ActionResult } from '../../../engine/action';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { IGameState } from '../../../engine/i_game_state';
import { rollChance } from '../../../engine/rng';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { triggerLivelyTotemsVolleys } from './lively_totems';
import { FireNovaAction } from './fire_nova';
import { FlameShockAction } from './flame_shock';
import { ShamanAction } from '../shaman_action';

const VOLTAIC_BLAZE = requireShamanSpellData(470057);
const VOLTAIC_BLAZE_DAMAGE = requireShamanSpellData(1259101);
const FIRE_NOVA = requireShamanSpellData(1260666);

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

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() / 1.08;
  }

  override composite_player_multiplier(isComboStrike: boolean): number {
    const fullMasteryMultiplier = 1 + this.p.getMasteryPercent() / 100;
    const simcVoltaicBlazeMasteryMultiplier = 1 + this.p.getMasteryPercent() / 200;
    return super.composite_player_multiplier(isComboStrike)
      / fullMasteryMultiplier
      * simcVoltaicBlazeMasteryMultiplier;
  }

  protected override snapshotMasteryMultiplier(_isComboStrike: boolean): number {
    return 1 + this.p.getMasteryPercent() / 200;
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
      const impact = this.calculateDamageFromSnapshot(snapshot, rng, targetId, this.aoeDamageMultiplier(targetId, nTargets));
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
  private readonly fireNovaAction: FireNovaAction;

  constructor(state: IGameState) {
    super(state);
    this.damageAction = new VoltaicBlazeDamageAction(state);
    this.fireNovaAction = new FireNovaAction(state);
  }

  protected override actionIsPhysical(): boolean {
    return false;
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
    if (this.p.hasTalent('fire_nova') && rollChance(rng, FIRE_NOVA.effectN(2).base_value())) {
      result.isCrit = this.fireNovaAction.executeProc(rng, isComboStrike).isCrit || result.isCrit;
    }

    const impact = this.damageAction.executeTargets(queue, rng, isComboStrike);
    result.isCrit = impact.isCrit;
    result.newEvents.push(...impact.newEvents);

    const livelyTotems = triggerLivelyTotemsVolleys(this.p, queue, rng, isComboStrike);
    result.newEvents.push(...livelyTotems.newEvents);
    result.isCrit = result.isCrit || livelyTotems.isCrit;

    this.p.recordPendingSpellStat(this.name, impact.damage, 1, impact.isCrit);
    return result;
  }
}
