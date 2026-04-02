import type { ActionCastContext, ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { ShamanMaelstromSpellAction } from '../shaman_action';
import { createSurgingBoltEvent, triggerWhirlingAir } from './surging_totem';
import { triggerVoltaicBlazeProc } from './voltaic_blaze';

const THORIMS_INVOCATION = requireShamanSpellData(384444);

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

    this.finishMaelstromSpender(
      result,
      rng,
      snapshot.maelstromWeaponStacks,
      snapshot.stormUnleashedActive,
    );
    if (this.attemptTotemicReboundProc(result.newEvents, rng, this.name)) {
      result.newEvents.push(createSurgingBoltEvent(this.p.currentTime, 0));
    }
    triggerVoltaicBlazeProc(this.p, result.newEvents);
    triggerWhirlingAir(this.p, 0, result.newEvents);
    this.triggerStaticAccumulationRefund(snapshot.maelstromWeaponStacks, result.newEvents, rng);

    return result;
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
      this.p.getBuffStacks('maelstrom_weapon'),
      THORIMS_INVOCATION.effectN(1).base_value(),
    );
    const stormUnleashedActive = this.p.isBuffActive('storm_unleashed');
    const damageResult = this.calculateSpellDamageWithSnapshot(
      rng,
      isComboStrike,
      maelstromWeaponStacks,
      stormUnleashedActive,
    );

    this.p.addDamage(damageResult.damage);
    this.p.recordPendingSpellStat(this.name, damageResult.damage, 1, damageResult.isCrit);
    this.p.recordPendingSpellStat('thorims_invocation', damageResult.damage, 0, damageResult.isCrit);
    const newEvents: ActionResult['newEvents'] = [];
    triggerVoltaicBlazeProc(this.p, newEvents);

    return {
      damage: damageResult.damage,
      isCrit: damageResult.isCrit,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
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

  return new LightningBoltThorimsInvocationAction(state).execute(queue, rng, isComboStrike);
}
