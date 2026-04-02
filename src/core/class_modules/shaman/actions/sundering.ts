import type { ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { triggerStormsurgeProc } from './stormsurge';
import { triggerFlametongueWeapon, triggerWindfuryWeapon } from './windfury_weapon';
import { applyFeralSpiritWolfBuff } from './feral_spirit';
import { applyShamanBuffStacks, consumeShamanBuffStacks, ShamanAction, triggerMaelstromWeaponProc } from '../shaman_action';
import { whirlingEarthMultiplier } from './surging_totem';

const SUNDERING = requireShamanSpellData(197214);
const SUNDERING_SPLITSTREAM = requireShamanSpellData(467283);
const SPLITSTREAM_TALENT = requireShamanSpellData(445035);

function countActiveFlameShockTargets(state: IGameState): number {
  if (!state.getTargetDebuffRemains) {
    return state.isTargetDebuffActive?.('flame_shock') ? 1 : 0;
  }

  let count = 0;
  for (let targetId = 0; targetId < Math.max(1, state.activeEnemies); targetId += 1) {
    if (state.getTargetDebuffRemains('flame_shock', targetId) > 0) {
      count += 1;
    }
  }
  return count;
}

class SunderingSplitstreamAction extends ShamanAction {
  readonly name = 'sundering_splitstream';
  readonly spellData = SUNDERING_SPLITSTREAM;
  readonly aoe = -1;

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  protected override actionSchools(): readonly ('physical' | 'fire')[] {
    return ['physical', 'fire'];
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier()
      * (1 + SPLITSTREAM_TALENT.effectN(1).percent());
  }

  executeProc(rng: RngInstance, isComboStrike: boolean): { damage: number; isCrit: boolean } {
    const snapshot = this.captureSnapshot(isComboStrike);
    const nTargets = this.nTargets();
    let totalDamage = 0;
    let anyCrit = false;

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const impact = this.calculateDamageFromSnapshot({
        ...snapshot,
        targetMultiplier: snapshot.targetMultiplier * this.aoeDamageMultiplier(targetId, nTargets),
      }, rng);
      this.p.addDamage(impact.damage, targetId);
      totalDamage += impact.damage;
      anyCrit = anyCrit || impact.isCrit;
    }

    this.p.recordPendingSpellStat(this.name, totalDamage, 1, anyCrit);
    return { damage: totalDamage, isCrit: anyCrit };
  }
}

/**
 * Enhancement Sundering.
 *
 * SimC models this as a weapon-based Enhancement attack that is still affected by
 * Enhanced Elements, so the trainer keeps it on `ShamanAction`'s elemental path
 * while sourcing damage from main-hand attack power and resolving it as an AOE hit.
 */
export class SunderingAction extends ShamanAction {
  readonly name = 'sundering';
  readonly spellData = SUNDERING;
  readonly aoe = -1;
  private readonly splitstreamAction: SunderingSplitstreamAction;

  constructor(state: IGameState) {
    super(state);
    this.splitstreamAction = new SunderingSplitstreamAction(state);
  }

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  protected override actionSchools(): readonly ('physical' | 'fire')[] {
    return ['physical', 'fire'];
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * whirlingEarthMultiplier(this.p);
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const snapshot = this.captureSnapshot(isComboStrike);
    let totalDamage = 0;
    let anyCrit = false;

    for (let targetId = 0; targetId < this.nTargets(); targetId += 1) {
      const impact = this.calculateDamageFromSnapshot({
        ...snapshot,
        targetMultiplier: snapshot.targetMultiplier * this.aoeDamageMultiplier(targetId, this.nTargets()),
      }, rng);
      this.p.addDamage(impact.damage, targetId);
      totalDamage += impact.damage;
      anyCrit = anyCrit || impact.isCrit;
    }

    this.p.recordPendingSpellStat(this.name, totalDamage, 1, anyCrit);
    const procEvents: ActionResult['newEvents'] = [];
    if (totalDamage > 0) {
      triggerStormsurgeProc(this.p, rng, procEvents);
      triggerMaelstromWeaponProc(this.p, rng, procEvents);
    }
    const flametongue = triggerFlametongueWeapon(this.p, rng, isComboStrike);
    const splitstream = this.p.hasTalent('splitstream')
      ? this.splitstreamAction.executeProc(rng, isComboStrike)
      : { damage: 0, isCrit: false };
    const windfury = triggerWindfuryWeapon(this.p, queue, rng, isComboStrike);
    if (this.p.hasTalent('primordial_storm')) {
      applyShamanBuffStacks(this.p, 'primordial_storm', 1, windfury.newEvents);
    }
    if (this.p.hasTalent('surging_elements')) {
      const surgingElementsStacks = countActiveFlameShockTargets(this.p);
      if (surgingElementsStacks > 0) {
        applyShamanBuffStacks(this.p, 'surging_elements', surgingElementsStacks, windfury.newEvents);
      }
    }
    if (this.p.hasTalent('feral_spirit')) {
      applyFeralSpiritWolfBuff(this.p, 'molten_weapon', windfury.newEvents);
    }
    if (this.p.isBuffActive('whirling_earth')) {
      consumeShamanBuffStacks(this.p, 'whirling_earth', 1, windfury.newEvents);
    }

    return {
      damage: 0,
      isCrit: anyCrit || flametongue.isCrit || splitstream.isCrit || windfury.isCrit,
      newEvents: [...procEvents, ...flametongue.newEvents, ...windfury.newEvents],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}
