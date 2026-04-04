import type { ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import type { SimEvent, SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { rollChance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { adjustLavaLashCooldownForHotHandWindow } from './hot_hand';
import { applyShamanBuffStacks, ShamanAction, ShamanMeleeAction, triggerMaelstromWeaponProc } from '../shaman_action';

const DOOM_WINDS_BUFF = requireShamanSpellData(466772);
const ENHANCED_ELEMENTS = requireShamanSpellData(77223);
const FLAMETONGUE_ATTACK = requireShamanSpellData(10444);
const FLAMETONGUE_ATTACK_IMBUEMENT_MASTERY = requireShamanSpellData(467386);
const FORCEFUL_WINDS_TALENT = requireShamanSpellData(262647);
const HOT_HAND_TALENT = requireShamanSpellData(201900);
const IMBUEMENT_MASTERY = requireShamanSpellData(445028);
const ENHANCED_IMBUES = requireShamanSpellData(462796);
const STORMS_WRATH = requireShamanSpellData(392352);
const WINDFURY_ATTACK = requireShamanSpellData(25504);
const WINDFURY_WEAPON = requireShamanSpellData(319773);
const IMBUEMENT_MASTERY_PROC_CHANCE = 0.07;
const IMBUEMENT_MASTERY_ACCUM_STATE = 'shaman.imbuement_mastery_accum';

export class FlametongueAttackAction extends ShamanAction {
  readonly name = 'flametongue_attack';
  readonly spellData = FLAMETONGUE_ATTACK;

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override actionSchools(): readonly ['fire'] {
    return ['fire'];
  }

  override composite_da_multiplier(): number {
    let multiplier = super.composite_da_multiplier();
    if (this.p.hasTalent('enhanced_imbues')) {
      multiplier *= 1 + ENHANCED_IMBUES.effectN(2).percent();
    }
    return multiplier;
  }
}

class ImbuementMasteryAction extends ShamanAction {
  readonly name = 'flametongue_attack_imbuement_mastery';
  readonly spellData = FLAMETONGUE_ATTACK_IMBUEMENT_MASTERY;
  readonly aoe = -1;
  readonly reducedAoeTargets = IMBUEMENT_MASTERY.effectN(2).base_value();

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override actionSchools(): readonly ['fire'] {
    return ['fire'];
  }

  override composite_da_multiplier(): number {
    let multiplier = super.composite_da_multiplier();
    if (this.p.hasTalent('enhanced_imbues')) {
      multiplier *= 1 + ENHANCED_IMBUES.effectN(3).percent();
    }
    return multiplier;
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

    return { damage: totalDamage, isCrit: anyCrit };
  }
}

interface FlametongueTriggerOptions {
  readonly attacks?: number;
  readonly allowHotHandProc?: boolean;
  readonly allowImbuementMasteryProc?: boolean;
}

export function triggerFlametongueWeapon(
  state: IGameState,
  rng: RngInstance,
  isComboStrike: boolean,
  options: FlametongueTriggerOptions = {},
): ActionResult {
  if (!state.isBuffActive('flametongue_weapon')) {
    return {
      damage: 0,
      isCrit: false,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }

  const attacks = Math.max(1, options.attacks ?? 1);
  const action = new FlametongueAttackAction(state);
  let totalDamage = 0;
  let anyCrit = false;
  const newEvents: SimEvent[] = [];

  for (let hit = 0; hit < attacks; hit += 1) {
    const result = action.calculateDamage(rng, isComboStrike);
    state.addDamage(result.damage);
    totalDamage += result.damage;
    anyCrit = anyCrit || result.isCrit;
    state.recordPendingSpellStat('flametongue_attack', result.damage, 1, result.isCrit);

    if (options.allowImbuementMasteryProc) {
      const imbuementMastery = triggerImbuementMastery(state, rng, isComboStrike);
      totalDamage += imbuementMastery.damage;
      anyCrit = anyCrit || imbuementMastery.isCrit;
    }
  }

  if (
    options.allowHotHandProc
    && state.hasTalent('hot_hand')
    && !state.isBuffActive('hot_hand')
    && rollChance(rng, HOT_HAND_TALENT.proc_chance_pct())
  ) {
    applyShamanBuffStacks(state, 'hot_hand', 1, newEvents);
    const hotHandWindow = state.getBuffRemains?.('hot_hand') ?? 0;
    adjustLavaLashCooldownForHotHandWindow(state, hotHandWindow);
  }

  return {
    damage: totalDamage,
    isCrit: anyCrit,
    newEvents,
    buffsApplied: [],
    cooldownAdjustments: [],
  };
}

export function triggerImbuementMastery(
  state: IGameState,
  rng: RngInstance,
  isComboStrike: boolean,
): ActionResult {
  if (!state.hasTalent('imbuement_mastery')) {
    return {
      damage: 0,
      isCrit: false,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }

  const attemptCount = (state.getNumericState?.(IMBUEMENT_MASTERY_ACCUM_STATE) ?? 0) + 1;
  const procChancePercent = IMBUEMENT_MASTERY_PROC_CHANCE * 100 * attemptCount;
  if (!rollChance(rng, Math.min(100, procChancePercent))) {
    state.setNumericState?.(IMBUEMENT_MASTERY_ACCUM_STATE, attemptCount);
    return {
      damage: 0,
      isCrit: false,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }

  state.setNumericState?.(IMBUEMENT_MASTERY_ACCUM_STATE, 0);
  const result = new ImbuementMasteryAction(state).executeProc(rng, isComboStrike);
  state.recordPendingSpellStat('flametongue_attack_imbuement_mastery', result.damage, 1, result.isCrit);
  return {
    damage: result.damage,
    isCrit: result.isCrit,
    newEvents: [],
    buffsApplied: [],
    cooldownAdjustments: [],
  };
}

export class WindfuryAttackAction extends ShamanMeleeAction {
  readonly name = 'windfury_attack';
  readonly spellData = WINDFURY_ATTACK;

  constructor(state: IGameState) {
    super(state);
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  override composite_da_multiplier(): number {
    let multiplier = super.composite_da_multiplier();

    if (this.p.hasTalent('forceful_winds')) {
      // SimC applies forceful_winds only as a static passive talent multiplier via
      // parse_passive_effects(); the stacking buff (spell 262652) is never triggered.
      multiplier *= 1 + FORCEFUL_WINDS_TALENT.effectN(1).percent();
    }

    if (this.p.hasTalent('imbuement_mastery')) {
      multiplier *= 1 + IMBUEMENT_MASTERY.effectN(2).percent();
    }
    if (this.p.hasTalent('enhanced_imbues')) {
      multiplier *= 1 + ENHANCED_IMBUES.effectN(1).percent();
    }

    if (this.p.isBuffActive('doom_winds')) {
      multiplier *= 1 + DOOM_WINDS_BUFF.effectN(2).percent();
    }

    return multiplier;
  }

  executeProc(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const attacks = this.p.hasTalent('unruly_winds') ? 3 : 2;
    let totalDamage = 0;
    let anyCrit = false;
    let flametongueDamage = 0;
    let flametongueCrit = false;
    const newEvents: SimEvent[] = [];

    for (let hit = 0; hit < attacks; hit += 1) {
      const impact = this.calculateDamage(rng, isComboStrike);
      this.p.addDamage(impact.damage);
      totalDamage += impact.damage;
      anyCrit = anyCrit || impact.isCrit;
      this.p.recordPendingSpellStat(this.name, impact.damage, 1, impact.isCrit);
      triggerMaelstromWeaponProc(this.p, rng, newEvents);
    }

    const flametongue = triggerFlametongueWeapon(this.p, rng, isComboStrike, {
      attacks,
      allowHotHandProc: false,
      allowImbuementMasteryProc: true,
    });
    flametongueDamage += flametongue.damage;
    flametongueCrit = flametongue.isCrit;
    newEvents.push(...flametongue.newEvents);

    return {
      damage: totalDamage + flametongueDamage,
      isCrit: anyCrit || flametongueCrit,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}

export function windfuryProcChance(state: IGameState): number {
  let chance = WINDFURY_WEAPON.proc_chance_pct() / 100;
  if (state.hasTalent('imbuement_mastery')) {
    chance += IMBUEMENT_MASTERY.effectN(1).percent();
  }
  const masteryMultiplier = state.hasTalent('storms_wrath')
    ? 1 + STORMS_WRATH.effectN(2).percent()
    : 1;
  chance += state.getMasteryPercent() * ENHANCED_ELEMENTS.effectN(4).mastery_value() * masteryMultiplier;

  if (state.isBuffActive('doom_winds')) {
    chance *= 1 + DOOM_WINDS_BUFF.effectN(1).percent();
  }

  return Math.max(0, Math.min(1, chance));
}

export function triggerWindfuryWeapon(
  state: IGameState,
  queue: SimEventQueue,
  rng: RngInstance,
  isComboStrike: boolean,
): ActionResult {
  if (!state.isBuffActive('windfury_weapon') || !rollChance(rng, windfuryProcChance(state) * 100)) {
    return { damage: 0, isCrit: false, newEvents: [], buffsApplied: [], cooldownAdjustments: [] };
  }

  const newEvents: SimEvent[] = [];
  // SimC does not trigger the forceful_winds stacking buff (spell 262652); the talent
  // is fully passive (+50% WF damage) via parse_passive_effects().

  const result = new WindfuryAttackAction(state).executeProc(queue, rng, isComboStrike);
  return {
    ...result,
    newEvents: [...newEvents, ...result.newEvents],
  };
}
