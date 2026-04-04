import type { ActionCastContext, ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { ShamanMaelstromSpellAction } from '../shaman_action';
import { ChainLightningThorimsInvocationAction } from './chain_lightning';
import { createSurgingBoltEvent, triggerWhirlingAir } from './surging_totem';
import { TempestAction } from './tempest';

const THORIMS_INVOCATION = requireShamanSpellData(384444);
const THORIMS_INVOCATION_TRIGGER_STATE = 'shaman.thorims_invocation_trigger';
const THORIMS_TRIGGER_LIGHTNING_BOLT = 1;
const THORIMS_TRIGGER_CHAIN_LIGHTNING = 2;

/**
 * Enhancement Lightning Bolt.
 *
 * Mirrors the first real Maelstrom Weapon spender path:
 * - hard-cast time reduced by MW stacks
 * - direct damage increased by MW stacks
 * - MW is consumed on execute
 * - MW spending can proc Storm Unleashed
 */
export class LightningBoltAction extends ShamanMaelstromSpellAction {
  readonly name = 'lightning_bolt';
  readonly spellData = requireShamanSpellData(188196);

  constructor(state: IGameState) {
    super(state);
  }

  override preCastFailReason(): 'not_available' | undefined {
    return this.p.isBuffActive('tempest') ? 'not_available' : undefined;
  }

  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    castContext?: ActionCastContext,
  ): ActionResult {
    const snapshot = this.resolveMaelstromSpellSnapshot(castContext);
    const damageResult = this.calculateSpellDamageWithSnapshot(
      rng,
      isComboStrike,
      snapshot.maelstromWeaponStacks,
      snapshot.stormUnleashedActive,
    );

    const result: ActionResult = {
      damage: damageResult.damage,
      isCrit: damageResult.isCrit,
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
    this.p.setNumericState?.(THORIMS_INVOCATION_TRIGGER_STATE, THORIMS_TRIGGER_LIGHTNING_BOLT);

    return result;
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * this.thunderCapacitorDamageMultiplier();
  }
}

export class LightningBoltThorimsInvocationAction extends ShamanMaelstromSpellAction {
  readonly name = 'lightning_bolt_ti';
  readonly spellData = requireShamanSpellData(188196);

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
    const maelstromWeaponStacks = Math.min(
      this.maelstromWeaponAffectedStacks(),
      THORIMS_INVOCATION.effectN(1).base_value(),
    );
    const stormUnleashedActive = this.p.isBuffActive('storm_unleashed');
    const damageResult = this.calculateSpellDamageWithSnapshot(
      rng,
      isComboStrike,
      maelstromWeaponStacks,
      stormUnleashedActive,
    );

    const result: ActionResult = {
      damage: damageResult.damage,
      isCrit: damageResult.isCrit,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };

    this.p.addDamage(damageResult.damage);
    this.p.recordPendingSpellStat(this.name, damageResult.damage, 1, damageResult.isCrit);
    this.p.recordPendingSpellStat('thorims_invocation', damageResult.damage, 0, damageResult.isCrit);

    const stacksConsumed = this.finishMaelstromSpender(
      result,
      rng,
      maelstromWeaponStacks,
      stormUnleashedActive,
    );
    this.triggerThunderCapacitorRefund(stacksConsumed, result.newEvents, rng);
    this.triggerFlurryFromCrit(damageResult.isCrit, result.newEvents);
    if (this.attemptTotemicReboundProc(result.newEvents, rng, this.name)) {
      result.newEvents.push(createSurgingBoltEvent(this.p.currentTime, 0));
    }
    triggerWhirlingAir(this.p, 0, result.newEvents);

    return result;
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * this.thunderCapacitorDamageMultiplier();
  }
}

export function triggerThorimsInvocation(
  state: IGameState,
  queue: SimEventQueue,
  rng: RngInstance,
  isComboStrike: boolean,
): ActionResult {
  if (!state.hasTalent('thorims_invocation') || state.getBuffStacks('maelstrom_weapon') <= 0) {
    return {
      damage: 0,
      isCrit: false,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }

  if (state.isBuffActive('tempest')) {
    const storedPrimer = state.getNumericState?.(THORIMS_INVOCATION_TRIGGER_STATE) ?? THORIMS_TRIGGER_LIGHTNING_BOLT;
    const result = new TempestAction(state).execute(queue, rng, isComboStrike);
    state.addDamage(result.damage);
    state.recordPendingSpellStat('thorims_invocation', result.damage, 0, result.isCrit);
    state.setNumericState?.(THORIMS_INVOCATION_TRIGGER_STATE, storedPrimer);
    return result;
  }

  if (state.getNumericState?.(THORIMS_INVOCATION_TRIGGER_STATE) === THORIMS_TRIGGER_CHAIN_LIGHTNING) {
    return new ChainLightningThorimsInvocationAction(state).execute(queue, rng, isComboStrike);
  }

  return new LightningBoltThorimsInvocationAction(state).execute(queue, rng, isComboStrike);
}
