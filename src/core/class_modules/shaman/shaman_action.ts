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
import { adjustLavaLashCooldownForHotHandWindow } from './actions/hot_hand';

const MAELSTROM_WEAPON_SPELL = requireShamanSpellData(344179);
const MAELSTROM_WEAPON_TALENT = requireShamanSpellData(187880);
const ENHANCEMENT_SPEC_PASSIVE = requireShamanSpellData(137041);
const FLURRY_BUFF = requireShamanSpellData(382889);
const STORM_UNLEASHED_PROC_CHANCE_PER_STACK_PERCENT = 2;
const STORM_UNLEASHED_DAMAGE = requireShamanSpellData(1262761);
const TEMPEST_COUNTER_STATE = 'shaman.tempest_counter';
const AMPLIFICATION_CORE = requireShamanSpellData(456369);
const ELEMENTAL_ASSAULT = requireShamanSpellData(210853);
const STATIC_ACCUMULATION = requireShamanSpellData(384411);
const ELEMENTAL_TEMPO = requireShamanSpellData(1250364);
const RAGING_MAELSTROM = requireShamanSpellData(384143);
const OVERFLOWING_MAELSTROM = requireShamanSpellData(384149);
const ELEMENTAL_WEAPONS = requireShamanSpellData(384355);
const FIRE_AND_ICE = requireShamanSpellData(382886);
const LIGHTNING_STRIKES = requireShamanSpellData(384450);
const LIGHTNING_STRIKES_BUFF = requireShamanSpellData(384451);
const THUNDER_CAPACITOR = requireShamanSpellData(1262635);
const TOTEMIC_MOMENTUM = requireShamanSpellData(1260644);
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
const STORM_UNLEASHED_SPELL_IDS = new Set([188196, 188443, 452201, 1218113, 1218116, 1218118]);
const STORM_UNLEASHED_IMBUE_ACTIONS = new Set([
  'flametongue_attack',
  'flametongue_attack_imbuement_mastery',
  'windfury_attack',
]);

function maelstromWeaponMaxStacks(state: Pick<IGameState, 'hasTalent'>): number {
  return MAELSTROM_WEAPON_SPELL.max_stacks()
    + (state.hasTalent('raging_maelstrom') ? RAGING_MAELSTROM.effectN(1).base_value() : 0);
}

function maelstromWeaponMaxConsumedStacks(state: Pick<IGameState, 'hasTalent'>): number {
  return MAELSTROM_WEAPON_TALENT.effectN(2).base_value()
    + (state.hasTalent('overflowing_maelstrom') ? OVERFLOWING_MAELSTROM.effectN(2).base_value() : 0);
}

function activeWeaponImbueCount(state: Pick<IGameState, 'isBuffActive'>): number {
  return Number(state.isBuffActive('flametongue_weapon')) + Number(state.isBuffActive('windfury_weapon'));
}

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

/**
 * SimC's hidden Chain Lightning rider stacks a separate next-Crash-Lightning damage
 * buff by the number of targets hit, capped by the buff spell's max-stacks metadata.
 */
export function triggerCrashLightningDamageBuff(
  state: ShamanBuffState,
  targetsHit: number,
  newEvents: SimEvent[],
): number {
  if (targetsHit <= 1) {
    return state.getBuffStacks('cl_crash_lightning');
  }

  return applyShamanBuffStacks(
    state,
    'cl_crash_lightning',
    state.getBuffStacks('cl_crash_lightning') + targetsHit,
    newEvents,
  );
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
  state: ShamanBuffState & Pick<IGameState, 'expireBuff' | 'removeBuffStack'>,
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

  for (let index = 0; index < stacksToConsume; index += 1) {
    state.removeBuffStack(buffId);
  }
  newEvents.push({
    type: EventType.BUFF_STACK_CHANGE,
    time: state.currentTime,
    buffId,
    stacks: stacksAfter,
    prevStacks: stacksBefore,
  });
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

  const stacksAfter = Math.min(maelstromWeaponMaxStacks(state), state.getBuffStacks('maelstrom_weapon') + stacks);
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

  protected guardianDamageMultiplier(): number {
    return 1 + ENHANCEMENT_SPEC_PASSIVE.effectN(4).percent();
  }

  override composite_da_multiplier(): number {
    let multiplier = super.composite_da_multiplier();
    if (!this.actionIsPhysical()) {
      multiplier *= 1 + ENHANCEMENT_SPEC_PASSIVE.effectN(1).percent();
    }
    multiplier *= this.stormUnleashedImbueMultiplier();
    return multiplier;
  }

  override composite_player_multiplier(isComboStrike: boolean): number {
    let multiplier = super.composite_player_multiplier(isComboStrike);
    multiplier *= this.snapshotPlayerPassiveMultiplier();
    if (!this.actionIsPhysical()) {
      multiplier *= 1 + this.p.getMasteryPercent() / 100;
    }
    return multiplier;
  }

  protected override snapshotPlayerMultiplier(): number {
    return super.snapshotPlayerMultiplier() * this.snapshotPlayerPassiveMultiplier();
  }

  protected override snapshotMasteryMultiplier(_isComboStrike: boolean): number {
    return this.actionIsPhysical() ? 1.0 : 1 + this.p.getMasteryPercent() / 100;
  }

  protected pushMaelstromWeaponStacks(stacks: number, newEvents: SimEvent[]): void {
    if (stacks <= 0 || !this.p.hasTalent('maelstrom_weapon')) {
      return;
    }

    const stacksBefore = this.p.getBuffStacks('maelstrom_weapon');
    const stacksAfter = Math.min(maelstromWeaponMaxStacks(this.p), stacksBefore + stacks);
    applyShamanBuffStacks(this.p, 'maelstrom_weapon', stacksAfter, newEvents);
  }

  protected triggerElementalAssault(newEvents: SimEvent[], rng: RngInstance): void {
    if (!this.p.hasTalent('elemental_assault') || !rollChance(rng, ELEMENTAL_ASSAULT.effectN(3).base_value())) {
      return;
    }

    this.pushMaelstromWeaponStacks(ELEMENTAL_ASSAULT.effectN(2).base_value(), newEvents);
  }

  protected grantElementalAssaultMaelstrom(newEvents: SimEvent[]): void {
    if (!this.p.hasTalent('elemental_assault')) {
      return;
    }

    this.pushMaelstromWeaponStacks(ELEMENTAL_ASSAULT.effectN(2).base_value(), newEvents);
  }

  protected consumeLightningStrikes(newEvents: SimEvent[]): void {
    if (!this.p.isBuffActive('lightning_strikes')) {
      return;
    }

    this.pushMaelstromWeaponStacks(1, newEvents);
    consumeShamanBuffStacks(this.p, 'lightning_strikes', 1, newEvents);
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

    return Math.min(maelstromWeaponMaxConsumedStacks(this.p), this.p.getBuffStacks('maelstrom_weapon'));
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

  protected stormUnleashedDamageMultiplierForSpell(
    spellId: number,
    active = this.p.isBuffActive('storm_unleashed'),
  ): number {
    if (!active || !STORM_UNLEASHED_SPELL_IDS.has(spellId)) {
      return 1;
    }

    const rank = this.p.getTalentRank('storm_unleashed');
    if (rank < 2) {
      return 1;
    }

    return 1 + (rank >= 3 ? 0.15 : STORM_UNLEASHED_DAMAGE.effectN(1).percent());
  }

  protected triggerFlurryFromCrit(isCrit: boolean, newEvents: SimEvent[]): void {
    if (!isCrit || !this.p.hasTalent('flurry')) {
      return;
    }

    applyShamanBuffStacks(this.p, 'flurry', FLURRY_BUFF.max_stacks(), newEvents);
  }

  private stormUnleashedImbueMultiplier(): number {
    if (!this.p.isBuffActive('storm_unleashed') || !STORM_UNLEASHED_IMBUE_ACTIONS.has(this.name)) {
      return 1;
    }

    const rank = this.p.getTalentRank('storm_unleashed');
    if (rank < 2) {
      return 1;
    }

    return 1 + (rank >= 3 ? 0.2 : STORM_UNLEASHED_DAMAGE.effectN(2).percent());
  }

  protected consumeMaelstromWeapon(stacks: number, newEvents: SimEvent[], rng: RngInstance): number {
    if (stacks <= 0) {
      return 0;
    }

    const stacksBefore = this.p.getBuffStacks('maelstrom_weapon');
    const stacksToConsume = Math.min(stacks, Math.min(maelstromWeaponMaxConsumedStacks(this.p), stacksBefore));
    if (stacksToConsume <= 0) {
      return 0;
    }

    consumeShamanBuffStacks(this.p, 'maelstrom_weapon', stacksToConsume, newEvents);
    this.triggerTempest(stacksToConsume, newEvents);

    if (
      this.p.hasTalent('storm_unleashed')
      && rollChance(rng, stacksToConsume * STORM_UNLEASHED_PROC_CHANCE_PER_STACK_PERCENT)
    ) {
      const stacksAfterProc = this.p.getBuffStacks('storm_unleashed') + 1;
      applyShamanBuffStacks(this.p, 'storm_unleashed', stacksAfterProc, newEvents);
    }

    if (this.p.hasTalent('elemental_tempo')) {
      const strikeReductionSeconds = stacksToConsume * (ELEMENTAL_TEMPO.effectN(3).base_value() / 1000);
      const lavaLashReductionSeconds = stacksToConsume * (ELEMENTAL_TEMPO.effectN(3).base_value() / 1000);
      this.p.adjustCooldown('strike', strikeReductionSeconds);
      this.p.adjustCooldown('lava_lash', lavaLashReductionSeconds);
    }

    if (this.p.hasTalent('totemic_momentum') && this.p.isBuffActive('hot_hand')) {
      const hotHandRemaining = this.p.getBuffRemains?.('hot_hand') ?? 0;
      const extensionSeconds = stacksToConsume * (TOTEMIC_MOMENTUM.effectN(1).base_value() / 1000);
      this.p.applyBuff('hot_hand', hotHandRemaining + extensionSeconds, this.p.getBuffStacks('hot_hand'));
      adjustLavaLashCooldownForHotHandWindow(this.p, extensionSeconds, hotHandRemaining);
    }

    // Local SimC currently models the live bug path: Lightning Strikes only procs
    // when a single spender consumes exactly the threshold number of MW stacks.
    if (this.p.hasTalent('lightning_strikes') && stacksToConsume === LIGHTNING_STRIKES.effectN(2).base_value()) {
      const nextStacks = Math.min(LIGHTNING_STRIKES_BUFF.max_stacks(), this.p.getBuffStacks('lightning_strikes') + 1);
      applyShamanBuffStacks(this.p, 'lightning_strikes', nextStacks, newEvents);
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
        return this.p.getBuffStacks('molten_weapon') * MOLTEN_WEAPON.effectN(1).percent()
          + (this.p.hasTalent('fire_and_ice') ? FIRE_AND_ICE.effectN(1).percent() : 0);
      case 'frost':
        return this.p.getBuffStacks('icy_edge') * ICY_EDGE.effectN(1).percent()
          + (this.p.hasTalent('fire_and_ice') ? FIRE_AND_ICE.effectN(1).percent() : 0);
      case 'nature':
        return this.p.getBuffStacks('crackling_surge') * CRACKLING_SURGE.effectN(1).percent();
    }
  }

  private snapshotPlayerPassiveMultiplier(): number {
    let multiplier = 1;
    if (this.p.hasTalent('elemental_weapons')) {
      multiplier *= 1 + ELEMENTAL_WEAPONS.effectN(1).percent() * 0.1 * activeWeaponImbueCount(this.p);
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
    targetId?: number,
  ): { damage: number; isCrit: boolean } {
    return this.calculateSpellDataDamageWithSnapshot(
      this.spellData,
      rng,
      isComboStrike,
      maelstromWeaponStacks,
      stormUnleashedActive,
      targetMultiplier,
      targetId,
    );
  }

  protected calculateSpellDataDamageWithSnapshot(
    spellData: typeof this.spellData,
    rng: RngInstance,
    isComboStrike: boolean,
    maelstromWeaponStacks: number,
    stormUnleashedActive: boolean,
    targetMultiplier = 1,
    targetId?: number,
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
      * this.stormUnleashedDamageMultiplierForSpell(spellData.id(), stormUnleashedActive)
      * this.composite_player_multiplier(isComboStrike)
      * this.composite_target_multiplier(targetId)
      * targetMultiplier;
    const damage = (ap * apCoeff + sp * spCoeff) * damageMultiplier * critMult;
    return { damage, isCrit };
  }

  protected finishMaelstromSpender(
    result: ActionResult,
    rng: RngInstance,
    maelstromWeaponStacks: number,
    _stormUnleashedActive: boolean,
  ): number {
    return this.consumeMaelstromWeapon(maelstromWeaponStacks, result.newEvents, rng);
  }

  protected thunderCapacitorDamageMultiplier(): number {
    if (!this.p.hasTalent('thunder_capacitor')) {
      return 1;
    }
    return 1 + THUNDER_CAPACITOR.effectN(1).percent();
  }

  protected triggerThunderCapacitorRefund(stacksConsumed: number, newEvents: SimEvent[], rng: RngInstance): void {
    if (
      stacksConsumed <= 0
      || !this.p.hasTalent('thunder_capacitor')
      || !rollChance(rng, THUNDER_CAPACITOR.effectN(2).base_value())
    ) {
      return;
    }

    this.pushMaelstromWeaponStacks(stacksConsumed, newEvents);
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
