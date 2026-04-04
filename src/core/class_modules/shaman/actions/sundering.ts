import type { ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { triggerFlametongueWeapon, triggerWindfuryWeapon } from './windfury_weapon';
import { applyFeralSpiritWolfBuff } from './feral_spirit';
import { applyShamanBuffStacks, consumeShamanBuffStacks, ShamanAction, triggerMaelstromWeaponProc } from '../shaman_action';
import { canTriggerEarthsurge, TremorEarthsurgeAction, whirlingEarthMultiplier } from './surging_totem';
import { spawnSearingTotemEvents } from './lively_totems';

const SUNDERING = requireShamanSpellData(197214);
const SUNDERING_SPLITSTREAM = requireShamanSpellData(467283);
const SPLITSTREAM_TALENT = requireShamanSpellData(445035);
const SURGING_ELEMENTS_TALENT = requireShamanSpellData(382042);
const LASHING_FLAMES_DEBUFF = requireShamanSpellData(334168);

export class SunderingSplitstreamAction extends ShamanAction {
  readonly name = 'sundering_splitstream';
  readonly spellData = SUNDERING_SPLITSTREAM;
  readonly aoe = -1;
  private readonly earthsurgeAction: TremorEarthsurgeAction;

  constructor(state: IGameState) {
    super(state);
    this.earthsurgeAction = new TremorEarthsurgeAction(state);
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
    return super.composite_da_multiplier()
      * SPLITSTREAM_TALENT.effectN(1).percent();
  }

  executeProc(rng: RngInstance, isComboStrike: boolean): { damage: number; isCrit: boolean } {
    const snapshot = this.captureSnapshot(isComboStrike);
    const nTargets = this.nTargets();
    let totalDamage = 0;
    let anyCrit = false;

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const impact = this.calculateDamageFromSnapshot(snapshot, rng, targetId, this.aoeDamageMultiplier(targetId, nTargets));
      this.p.addDamage(impact.damage, targetId);
      totalDamage += impact.damage;
      anyCrit = anyCrit || impact.isCrit;
    }

    this.p.recordPendingSpellStat(this.name, totalDamage, 1, anyCrit);
    if (canTriggerEarthsurge(this.p)) {
      const earthsurge = this.earthsurgeAction.executePulse(rng, isComboStrike, SPLITSTREAM_TALENT.effectN(1).percent());
      anyCrit = anyCrit || earthsurge.some((damage) => damage.isCrit);
    }
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
  private readonly earthsurgeAction: TremorEarthsurgeAction;

  constructor(state: IGameState) {
    super(state);
    this.earthsurgeAction = new TremorEarthsurgeAction(state);
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

  override preCastFailReason(): 'not_available' | undefined {
    if (!this.p.isCooldownReady(this.name)) {
      return undefined;
    }
    return this.p.isBuffActive('primordial_storm') ? 'not_available' : undefined;
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
      const impact = this.calculateDamageFromSnapshot(snapshot, rng, targetId, this.aoeDamageMultiplier(targetId, this.nTargets()));
      this.p.addDamage(impact.damage, targetId);
      totalDamage += impact.damage;
      anyCrit = anyCrit || impact.isCrit;
    }

    let earthsurgeCrit = false;
    if (totalDamage > 0 && canTriggerEarthsurge(this.p)) {
      const earthsurge = this.earthsurgeAction.executePulse(rng, isComboStrike);
      earthsurgeCrit = earthsurge.some((damage) => damage.isCrit);
    }

    this.p.recordPendingSpellStat(this.name, totalDamage, 1, anyCrit);
    const procEvents: ActionResult['newEvents'] = [];
    if (totalDamage > 0) {
      triggerMaelstromWeaponProc(this.p, rng, procEvents);
    }
    const flametongue = triggerFlametongueWeapon(this.p, rng, isComboStrike);
    const windfury = triggerWindfuryWeapon(this.p, queue, rng, isComboStrike);
    if (this.p.hasTalent('lashing_flames')) {
      for (let targetId = 0; targetId < this.nTargets(); targetId += 1) {
        this.p.applyTargetDebuff?.('lashing_flames', LASHING_FLAMES_DEBUFF.duration_ms() / 1000, targetId, 1);
      }
    }
    if (this.p.hasTalent('primordial_storm')) {
      applyShamanBuffStacks(this.p, 'primordial_storm', 1, windfury.newEvents);
    }
    if (this.p.hasTalent('surging_elements')) {
      applyShamanBuffStacks(this.p, 'surging_elements', 1, windfury.newEvents);
      this.pushMaelstromWeaponStacks(SURGING_ELEMENTS_TALENT.effectN(3).base_value(), windfury.newEvents);
    }
    if (this.p.hasTalent('feral_spirit')) {
      applyFeralSpiritWolfBuff(this.p, 'molten_weapon', windfury.newEvents);
    }
    if (this.p.isBuffActive('whirling_earth')) {
      consumeShamanBuffStacks(this.p, 'whirling_earth', 1, windfury.newEvents);
      // SimC sundering_t::execute(): if whirling_earth is consumed, spawn a searing totem.
      spawnSearingTotemEvents(this.p, rng, windfury.newEvents);
    }

    return {
      damage: 0,
      isCrit: anyCrit || earthsurgeCrit || flametongue.isCrit || windfury.isCrit,
      newEvents: [...procEvents, ...flametongue.newEvents, ...windfury.newEvents],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}
