import { EventType } from '../../engine/eventQueue';
import type { SimEvent } from '../../engine/eventQueue';
import { Action } from '../../engine/action';
import type { ActionCastContext, ActionResult } from '../../engine/action';
import type { IGameState } from '../../engine/i_game_state';
import type { GameState } from '../../engine/gameState';
import { SHAMAN_ENHANCEMENT_BUFFS } from '../../data/spells/shaman_enhancement';
import { requireShamanSpellData } from '../../dbc/shaman_spell_data';
import type { RngInstance } from '../../engine/rng';
import { rollChance } from '../../engine/rng';
import type { SimEventQueue } from '../../engine/eventQueue';
import { attemptProc, createRppmTracker, type RppmTracker } from '../../engine/rppm';

const MAELSTROM_WEAPON_BUFF = SHAMAN_ENHANCEMENT_BUFFS.get('maelstrom_weapon');
const MAELSTROM_WEAPON_MAX_STACKS = MAELSTROM_WEAPON_BUFF?.maxStacks ?? 10;
const MAELSTROM_WEAPON_SPELL = requireShamanSpellData(344179);
const MAELSTROM_WEAPON_TALENT = requireShamanSpellData(187880);
const ENHANCEMENT_SPEC_PASSIVE = requireShamanSpellData(137041);
const STORM_UNLEASHED_PROC_CHANCE_PER_STACK = 0.02;
const STORM_UNLEASHED_STACKS_PER_PROC = 2;
const TEMPEST_COUNTER_STATE = 'shaman.tempest_counter';
const AMPLIFICATION_CORE = requireShamanSpellData(456369);
const STATIC_ACCUMULATION = requireShamanSpellData(384411);
const ELEMENTAL_TEMPO = requireShamanSpellData(1250364);
const MOLTEN_WEAPON = requireShamanSpellData(224125);
const ICY_EDGE = requireShamanSpellData(224126);
const CRACKLING_SURGE = requireShamanSpellData(224127);
const EARTHEN_WEAPON = requireShamanSpellData(392375);
const TOTEMIC_REBOUND_RPPM = new WeakMap<GameState, RppmTracker>();
// SimC models Tempest as a deterministic spend counter even though the tooltip is
// phrased as a 2% chance per Enhancement MW stack spent, so we accumulate spent MW
// and trigger once every 50 effective stacks.
const TEMPEST_THRESHOLD_MAELSTROM_WEAPON = 50;

type ShamanBuffState = Pick<IGameState, 'applyBuff' | 'currentTime' | 'getBuffStacks'>;
type ShamanDamageSchool = 'physical' | 'fire' | 'frost' | 'nature';

export function getTotemicReboundRppm(state: GameState): RppmTracker {
  let tracker = TOTEMIC_REBOUND_RPPM.get(state);
  if (tracker !== undefined) {
    return tracker;
  }
  tracker = createRppmTracker(10, true);
  TOTEMIC_REBOUND_RPPM.set(state, tracker);
  return tracker;
}

/**
 * Apply a Shaman buff using the spec buffbook for duration/stack metadata and emit
 * the matching trainer buff events when the visible stack count changes.
 */
export function applyShamanBuffStacks(
  state: ShamanBuffState,
  buffId: string,
  stacks: number,
  newEvents: SimEvent[],
): number {
  const buff = SHAMAN_ENHANCEMENT_BUFFS.get(buffId);
  if (!buff) {
    throw new Error(`Unknown Shaman buff '${buffId}'`);
  }

  const stacksBefore = state.getBuffStacks(buffId);
  const stacksAfter = Math.min(buff.maxStacks, Math.max(0, stacks));
  state.applyBuff(buffId, buff.duration, stacksAfter);

  if (stacksBefore <= 0) {
    newEvents.push({
      type: EventType.BUFF_APPLY,
      time: state.currentTime,
      buffId,
      stacks: stacksAfter,
    });
    return stacksAfter;
  }

  if (stacksAfter !== stacksBefore) {
    newEvents.push({
      type: EventType.BUFF_STACK_CHANGE,
      time: state.currentTime,
      buffId,
      stacks: stacksAfter,
      prevStacks: stacksBefore,
    });
  }

  return stacksAfter;
}

export function expireShamanBuff(
  state: ShamanBuffState & Pick<IGameState, 'expireBuff'>,
  buffId: string,
  newEvents: SimEvent[],
): void {
  if (state.getBuffStacks(buffId) <= 0) {
    return;
  }

  state.expireBuff(buffId);
  newEvents.push({
    type: EventType.BUFF_EXPIRE,
    time: state.currentTime,
    buffId,
  });
}

export function consumeShamanBuffStacks(
  state: ShamanBuffState & Pick<IGameState, 'expireBuff'>,
  buffId: string,
  stacksToConsume: number,
  newEvents: SimEvent[],
): number {
  const stacksBefore = state.getBuffStacks(buffId);
  if (stacksBefore <= 0 || stacksToConsume <= 0) {
    return stacksBefore;
  }

  const stacksAfter = Math.max(0, stacksBefore - stacksToConsume);
  if (stacksAfter === 0) {
    expireShamanBuff(state, buffId, newEvents);
    return 0;
  }

  applyShamanBuffStacks(state, buffId, stacksAfter, newEvents);
  return stacksAfter;
}

export function triggerMaelstromWeaponProc(
  state: IGameState,
  rng: RngInstance,
  newEvents: SimEvent[],
  stacks = 1,
): boolean {
  if (stacks <= 0 || !state.hasTalent('maelstrom_weapon')) {
    return false;
  }

  if (!rollChance(rng, MAELSTROM_WEAPON_TALENT.proc_chance_pct())) {
    return false;
  }

  const stacksAfter = Math.min(MAELSTROM_WEAPON_MAX_STACKS, state.getBuffStacks('maelstrom_weapon') + stacks);
  applyShamanBuffStacks(state, 'maelstrom_weapon', stacksAfter, newEvents);
  return true;
}

/**
 * Base Enhancement Shaman action helpers shared by the first registered actions.
 */
export abstract class ShamanAction extends Action {
  protected actionSchools(): readonly ShamanDamageSchool[] {
    return this.actionIsPhysical() ? ['physical'] : ['nature'];
  }

  override composite_da_multiplier(): number {
    let multiplier = super.composite_da_multiplier();
    if (!this.actionIsPhysical()) {
      multiplier *= 1 + ENHANCEMENT_SPEC_PASSIVE.effectN(1).percent();
    }
    return multiplier;
  }

  override composite_player_multiplier(isComboStrike: boolean): number {
    let multiplier = super.composite_player_multiplier(isComboStrike);
    if (!this.actionIsPhysical()) {
      multiplier *= 1 + this.p.getMasteryPercent() / 100;
    }
    if (this.p.isBuffActive('amplification_core')) {
      multiplier *= 1 + AMPLIFICATION_CORE.effectN(1).percent();
    }
    for (const school of this.actionSchools()) {
      const schoolBonus = this.schoolBuffBonus(school);
      if (schoolBonus > 0) {
        multiplier *= 1 + schoolBonus;
      }
    }
    return multiplier;
  }

  protected override snapshotMasteryMultiplier(_isComboStrike: boolean): number {
    return this.actionIsPhysical() ? 1.0 : 1 + this.p.getMasteryPercent() / 100;
  }

  protected pushMaelstromWeaponStacks(stacks: number, newEvents: SimEvent[]): void {
    if (stacks <= 0 || !this.p.hasTalent('maelstrom_weapon')) {
      return;
    }

    const stacksBefore = this.p.getBuffStacks('maelstrom_weapon');
    const stacksAfter = Math.min(MAELSTROM_WEAPON_MAX_STACKS, stacksBefore + stacks);
    applyShamanBuffStacks(this.p, 'maelstrom_weapon', stacksAfter, newEvents);
  }

  protected triggerStaticAccumulationRefund(stacks: number, newEvents: SimEvent[], rng: RngInstance): void {
    if (stacks <= 0 || !this.p.hasTalent('static_accumulation')) {
      return;
    }
    if (!rollChance(rng, STATIC_ACCUMULATION.effectN(2).percent())) {
      return;
    }
    this.pushMaelstromWeaponStacks(stacks, newEvents);
  }

  protected attemptTotemicReboundProc(newEvents: SimEvent[], rng: RngInstance, _spellId: string): boolean {
    if (!this.p.hasTalent('totemic_rebound') || !this.p.isBuffActive('surging_totem')) {
      return false;
    }
    const tracker = getTotemicReboundRppm(this.p as GameState);
    if (!attemptProc(tracker, this.p.currentTime, this.p.getHastePercent(), rng)) {
      return false;
    }
    applyShamanBuffStacks(this.p, 'totemic_rebound', this.p.getBuffStacks('totemic_rebound') + 1, newEvents);
    return true;
  }

  protected maelstromWeaponAffectedStacks(): number {
    if (!this.p.hasTalent('maelstrom_weapon')) {
      return 0;
    }

    return Math.min(MAELSTROM_WEAPON_MAX_STACKS, this.p.getBuffStacks('maelstrom_weapon'));
  }

  protected maelstromWeaponDamageMultiplier(stacks = this.maelstromWeaponAffectedStacks()): number {
    if (stacks <= 0) {
      return 1;
    }

    return 1 + MAELSTROM_WEAPON_SPELL.effectN(2).percent() * stacks;
  }

  protected maelstromWeaponCastTimeMultiplier(stacks = this.maelstromWeaponAffectedStacks()): number {
    if (stacks <= 0) {
      return 1;
    }

    return Math.max(0, 1 - MAELSTROM_WEAPON_SPELL.effectN(1).percent() * stacks);
  }

  protected stormUnleashedDamageMultiplier(_active = this.p.isBuffActive('storm_unleashed')): number {
    return 1;
  }

  protected consumeMaelstromWeapon(stacks: number, newEvents: SimEvent[], rng: RngInstance): number {
    if (stacks <= 0) {
      return 0;
    }

    const stacksBefore = this.p.getBuffStacks('maelstrom_weapon');
    const stacksToConsume = Math.min(stacks, Math.min(MAELSTROM_WEAPON_MAX_STACKS, stacksBefore));
    if (stacksToConsume <= 0) {
      return 0;
    }

    consumeShamanBuffStacks(this.p, 'maelstrom_weapon', stacksToConsume, newEvents);
    this.triggerTempest(stacksToConsume, newEvents);

    if (
      this.p.hasTalent('storm_unleashed')
      && rollChance(rng, stacksToConsume * STORM_UNLEASHED_PROC_CHANCE_PER_STACK)
    ) {
      const stacksAfterProc = this.p.getBuffStacks('storm_unleashed') + STORM_UNLEASHED_STACKS_PER_PROC;
      applyShamanBuffStacks(this.p, 'storm_unleashed', stacksAfterProc, newEvents);
    }

    if (this.p.hasTalent('elemental_tempo')) {
      const strikeReductionSeconds = stacksToConsume * (ELEMENTAL_TEMPO.effectN(3).base_value() / 1000);
      const lavaLashReductionSeconds = stacksToConsume * (ELEMENTAL_TEMPO.effectN(4).base_value() / 1000);
      this.p.adjustCooldown('stormstrike', strikeReductionSeconds);
      this.p.adjustCooldown('lava_lash', lavaLashReductionSeconds);
    }

    return stacksToConsume;
  }

  protected triggerTempest(resourceCount: number, newEvents: SimEvent[]): void {
    if (resourceCount <= 0 || !this.p.hasTalent('tempest')) {
      return;
    }

    const currentCounter = this.p.getNumericState?.(TEMPEST_COUNTER_STATE) ?? 0;
    let nextCounter = currentCounter + resourceCount;
    while (nextCounter >= TEMPEST_THRESHOLD_MAELSTROM_WEAPON) {
      nextCounter -= TEMPEST_THRESHOLD_MAELSTROM_WEAPON;
      const currentStacks = this.p.getBuffStacks('tempest');
      applyShamanBuffStacks(this.p, 'tempest', currentStacks + 1, newEvents);
    }
    this.p.setNumericState?.(TEMPEST_COUNTER_STATE, nextCounter);
  }

  private schoolBuffBonus(school: ShamanDamageSchool): number {
    switch (school) {
      case 'physical':
        return this.p.getBuffStacks('earthen_weapon') * EARTHEN_WEAPON.effectN(1).percent()
          + this.p.getBuffStacks('molten_weapon') * MOLTEN_WEAPON.effectN(3).percent()
          + this.p.getBuffStacks('icy_edge') * ICY_EDGE.effectN(3).percent()
          + this.p.getBuffStacks('crackling_surge') * CRACKLING_SURGE.effectN(3).percent();
      case 'fire':
        return this.p.getBuffStacks('molten_weapon') * MOLTEN_WEAPON.effectN(1).percent();
      case 'frost':
        return this.p.getBuffStacks('icy_edge') * ICY_EDGE.effectN(1).percent();
      case 'nature':
        return this.p.getBuffStacks('crackling_surge') * CRACKLING_SURGE.effectN(1).percent();
    }
  }
}

/**
 * Physical melee Enhancement action base.
 */
export abstract class ShamanMeleeAction extends ShamanAction {
  protected actionIsPhysical(): boolean {
    return true;
  }
}

export abstract class ShamanMaelstromSpellAction extends ShamanAction {
  protected actionIsPhysical(): boolean {
    return false;
  }

  override createCastContext(): ActionCastContext | undefined {
    return {
      maelstromWeaponStacks: this.maelstromWeaponAffectedStacks(),
      stormUnleashedActive: this.p.isBuffActive('storm_unleashed'),
    };
  }

  override castTime(baseDuration: number, hastePercent: number): number {
    const hastedDuration = super.castTime(baseDuration, hastePercent);
    return hastedDuration * this.maelstromWeaponCastTimeMultiplier();
  }

  protected resolveMaelstromSpellSnapshot(castContext?: ActionCastContext): {
    maelstromWeaponStacks: number;
    stormUnleashedActive: boolean;
  } {
    return {
      maelstromWeaponStacks:
        typeof castContext?.maelstromWeaponStacks === 'number'
          ? castContext.maelstromWeaponStacks
          : this.maelstromWeaponAffectedStacks(),
      stormUnleashedActive:
        typeof castContext?.stormUnleashedActive === 'boolean'
          ? castContext.stormUnleashedActive
          : this.p.isBuffActive('storm_unleashed'),
    };
  }

  protected calculateSpellDamageWithSnapshot(
    rng: RngInstance,
    isComboStrike: boolean,
    maelstromWeaponStacks: number,
    stormUnleashedActive: boolean,
    targetMultiplier = 1,
  ): { damage: number; isCrit: boolean } {
    return this.calculateSpellDataDamageWithSnapshot(
      this.spellData,
      rng,
      isComboStrike,
      maelstromWeaponStacks,
      stormUnleashedActive,
      targetMultiplier,
    );
  }

  protected calculateSpellDataDamageWithSnapshot(
    spellData: typeof this.spellData,
    rng: RngInstance,
    isComboStrike: boolean,
    maelstromWeaponStacks: number,
    stormUnleashedActive: boolean,
    targetMultiplier = 1,
  ): { damage: number; isCrit: boolean } {
    const ap = this.effectiveAttackPower();
    const apCoeff = spellData.effectN(1).ap_coeff();
    const sp = this.effectiveSpellPower();
    const spCoeff = spellData.effectN(1).sp_coeff();
    const critChance = this.composite_crit_chance();
    const isCrit = rng.next() < critChance;
    const critMult = isCrit ? this.critDamageMultiplier() : 1.0;
    const damageMultiplier = this.composite_da_multiplier()
      * this.maelstromWeaponDamageMultiplier(maelstromWeaponStacks)
      * this.stormUnleashedDamageMultiplier(stormUnleashedActive)
      * this.composite_player_multiplier(isComboStrike)
      * this.composite_target_multiplier()
      * targetMultiplier;
    const damage = (ap * apCoeff + sp * spCoeff) * damageMultiplier * critMult;
    return { damage, isCrit };
  }

  protected finishMaelstromSpender(
    result: ActionResult,
    rng: RngInstance,
    maelstromWeaponStacks: number,
    _stormUnleashedActive: boolean,
  ): void {
    this.consumeMaelstromWeapon(maelstromWeaponStacks, result.newEvents, rng);
  }

  protected buildDirectDamageResult(
    damage: number,
    isCrit: boolean,
    _queue: SimEventQueue,
  ): ActionResult {
    return {
      damage,
      isCrit,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}
