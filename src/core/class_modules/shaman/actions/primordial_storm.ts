import type { ActionCastContext, ActionResult } from '../../../engine/action';
import type { SimEvent, SimEventQueue } from '../../../engine/eventQueue';
import { EventType } from '../../../engine/eventQueue';
import type { IGameState } from '../../../engine/i_game_state';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { createSurgingBoltEvent, triggerWhirlingAir } from './surging_totem';
import { triggerFlametongueWeapon, triggerWindfuryWeapon } from './windfury_weapon';
import {
  consumeShamanBuffStacks,
  ShamanAction,
  ShamanMaelstromSpellAction,
  triggerCrashLightningDamageBuff,
  triggerMaelstromWeaponProc,
} from '../shaman_action';

const PRIMORDIAL_STORM = requireShamanSpellData(1218090);
const PRIMORDIAL_STORM_TALENT = requireShamanSpellData(1218047);
const PRIMORDIAL_FIRE = requireShamanSpellData(1218113);
const PRIMORDIAL_FROST = requireShamanSpellData(1218116);
const PRIMORDIAL_LIGHTNING = requireShamanSpellData(1218118);

const PRIMORDIAL_FROST_DELAY_SECONDS = 0.3;
const PRIMORDIAL_LIGHTNING_DELAY_SECONDS = 0.6;
const PRIMORDIAL_FOLLOWUP_DELAY_SECONDS = 0.95;
const PRIMORDIAL_FOLLOWUP_MULTIPLIER = PRIMORDIAL_STORM_TALENT.effectN(2).percent();
const PRIMORDIAL_REDUCED_AOE_TARGETS = PRIMORDIAL_STORM_TALENT.effectN(3).base_value();
const PRIMORDIAL_CHAIN_LIGHTNING_TARGET_CAP = 5;
const THORIMS_INVOCATION_TRIGGER_STATE = 'shaman.thorims_invocation_trigger';
const THORIMS_TRIGGER_LIGHTNING_BOLT = 1;
const THORIMS_TRIGGER_CHAIN_LIGHTNING = 2;

type PrimordialStormCastContext = ActionCastContext & {
  readonly maelstromWeaponStacks: number;
  readonly stormUnleashedActive: boolean;
  readonly targetCount: number;
};

class PrimordialBurstAction extends ShamanAction {
  readonly aoe = -1;
  readonly reducedAoeTargets = PRIMORDIAL_REDUCED_AOE_TARGETS;

  constructor(
    state: IGameState,
    readonly name: 'primordial_fire' | 'primordial_frost' | 'primordial_lightning',
    readonly spellData: typeof PRIMORDIAL_FIRE,
    private readonly school: 'fire' | 'frost' | 'nature',
  ) {
    super(state);
  }

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override actionSchools(): readonly ('fire' | 'frost' | 'nature')[] {
    return [this.school];
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  executeBurst(
    rng: RngInstance,
    isComboStrike: boolean,
    actionMultiplier: number,
    aoeMultiplier: number,
    targetIndex: number,
  ): { damage: number; isCrit: boolean } {
    const snapshot = this.captureSnapshot(isComboStrike);
    snapshot.actionMultiplier *= actionMultiplier;
    return this.calculateDamageFromSnapshot(snapshot, rng, targetIndex, aoeMultiplier);
  }
}

export class PrimordialStormAction extends ShamanMaelstromSpellAction {
  readonly name = 'primordial_storm';
  readonly spellData = PRIMORDIAL_STORM;
  private readonly fireAction: PrimordialBurstAction;
  private readonly frostAction: PrimordialBurstAction;
  private readonly lightningAction: PrimordialBurstAction;

  constructor(state: IGameState) {
    super(state);
    this.fireAction = new PrimordialBurstAction(state, 'primordial_fire', PRIMORDIAL_FIRE, 'fire');
    this.frostAction = new PrimordialBurstAction(state, 'primordial_frost', PRIMORDIAL_FROST, 'frost');
    this.lightningAction = new PrimordialBurstAction(state, 'primordial_lightning', PRIMORDIAL_LIGHTNING, 'nature');
  }

  override preCastFailReason(): 'not_available' | undefined {
    return this.p.isBuffActive('primordial_storm') ? undefined : 'not_available';
  }

  override createCastContext(): PrimordialStormCastContext {
    const snapshot = super.createCastContext() ?? {};
    return {
      ...snapshot,
      maelstromWeaponStacks: this.maelstromWeaponAffectedStacks(),
      stormUnleashedActive: this.p.isBuffActive('storm_unleashed'),
      targetCount: Math.max(1, this.p.activeEnemies),
    };
  }

  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    castContext?: ActionCastContext,
  ): ActionResult {
    const snapshot = this.resolvePrimordialSnapshot(castContext);
    const immediate = this.executeElementalBurst(
      'primordial_fire',
      this.fireAction,
      _queue,
      rng,
      isComboStrike,
      snapshot,
    );

    const result: ActionResult = {
      damage: 0,
      isCrit: immediate.anyCrit,
      newEvents: [
        this.createDelayedImpact('primordial_frost', PRIMORDIAL_FROST_DELAY_SECONDS, snapshot),
        this.createDelayedImpact('primordial_lightning', PRIMORDIAL_LIGHTNING_DELAY_SECONDS, snapshot),
        this.createDelayedImpact(
          snapshot.targetCount > 1 ? 'chain_lightning_ps' : 'lightning_bolt_ps',
          PRIMORDIAL_FOLLOWUP_DELAY_SECONDS,
          snapshot,
        ),
      ],
      buffsApplied: [],
      cooldownAdjustments: [],
    };

    consumeShamanBuffStacks(this.p, 'primordial_storm', 1, result.newEvents);
    result.newEvents.push(...immediate.newEvents);
    this.finishMaelstromSpender(
      result,
      rng,
      snapshot.maelstromWeaponStacks,
      snapshot.stormUnleashedActive,
    );
    this.triggerFlurryFromCrit(immediate.anyCrit, result.newEvents);
    return result;
  }

  executeScheduledImpact(
    spellId: string,
    castContext: ActionCastContext | undefined,
    queue: SimEventQueue,
    rng: RngInstance,
  ): { damages: { spellId: string; amount: number; isCrit: boolean }[]; anyCrit: boolean; newEvents: SimEvent[] } {
    const snapshot = this.resolvePrimordialSnapshot(castContext);

    switch (spellId) {
      case 'primordial_frost':
        return this.executeElementalBurst('primordial_frost', this.frostAction, queue, rng, false, snapshot);
      case 'primordial_lightning':
        return this.executeElementalBurst('primordial_lightning', this.lightningAction, queue, rng, false, snapshot);
      case 'lightning_bolt_ps':
        return this.executePrimordialLightningBolt(rng, snapshot);
      case 'chain_lightning_ps':
        return this.executePrimordialChainLightning(rng, snapshot);
      default:
        return { damages: [], anyCrit: false, newEvents: [] };
    }
  }

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  private resolvePrimordialSnapshot(castContext?: ActionCastContext): PrimordialStormCastContext {
    const snapshot = this.resolveMaelstromSpellSnapshot(castContext);
    return {
      ...snapshot,
      targetCount:
        typeof castContext?.targetCount === 'number'
          ? Math.max(1, castContext.targetCount)
          : Math.max(1, this.p.activeEnemies),
    };
  }

  private createDelayedImpact(spellId: string, delaySeconds: number, castContext: PrimordialStormCastContext): SimEvent {
    return {
      type: EventType.DELAYED_SPELL_IMPACT,
      time: this.p.currentTime + delaySeconds,
      spellId,
      castContext,
      targetCount: castContext.targetCount,
    };
  }

  private executeElementalBurst(
    spellId: 'primordial_fire' | 'primordial_frost' | 'primordial_lightning',
    action: PrimordialBurstAction,
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    snapshot: PrimordialStormCastContext,
  ): { damages: { spellId: string; amount: number; isCrit: boolean }[]; anyCrit: boolean; newEvents: SimEvent[] } {
    const nTargets = Math.max(1, snapshot.targetCount);
    const damages: { spellId: string; amount: number; isCrit: boolean }[] = [];
    let anyCrit = false;
    const newEvents: SimEvent[] = [];

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const damageResult = action.executeBurst(
        rng,
        isComboStrike,
        this.maelstromWeaponDamageMultiplier(snapshot.maelstromWeaponStacks)
          * this.stormUnleashedDamageMultiplierForSpell(action.spellData.id(), snapshot.stormUnleashedActive),
        this.primordialAoeDamageMultiplier(targetId, nTargets, PRIMORDIAL_REDUCED_AOE_TARGETS),
        targetId,
      );
      this.p.addDamage(damageResult.damage, targetId);
      damages.push({ spellId, amount: damageResult.damage, isCrit: damageResult.isCrit });
      anyCrit = anyCrit || damageResult.isCrit;

      if (damageResult.damage > 0) {
        triggerMaelstromWeaponProc(this.p, rng, newEvents);
      }
      const flametongue = triggerFlametongueWeapon(this.p, rng, isComboStrike);
      const windfury = triggerWindfuryWeapon(this.p, queue, rng, isComboStrike);
      newEvents.push(...flametongue.newEvents, ...windfury.newEvents);
    }

    if (damages.length > 0) {
      const totalDamage = damages.reduce((total, entry) => total + entry.amount, 0);
      this.p.recordPendingSpellStat(
        spellId,
        totalDamage,
        1,
        anyCrit,
      );
      this.p.recordPendingSpellStat(this.name, totalDamage, 0, anyCrit);
    }

    return { damages, anyCrit, newEvents };
  }

  private executePrimordialLightningBolt(
    rng: RngInstance,
    snapshot: PrimordialStormCastContext,
  ): { damages: { spellId: string; amount: number; isCrit: boolean }[]; anyCrit: boolean; newEvents: SimEvent[] } {
    const result = this.calculateSpellDataDamageWithSnapshot(
      requireShamanSpellData(188196),
      rng,
      false,
      snapshot.maelstromWeaponStacks,
      snapshot.stormUnleashedActive,
      PRIMORDIAL_FOLLOWUP_MULTIPLIER * this.thunderCapacitorDamageMultiplier(),
      0,
    );
    this.p.addDamage(result.damage);
    this.p.recordPendingSpellStat('lightning_bolt_ps', result.damage, 1, result.isCrit);
    this.p.recordPendingSpellStat(this.name, result.damage, 0, result.isCrit);
    this.p.setNumericState?.(THORIMS_INVOCATION_TRIGGER_STATE, THORIMS_TRIGGER_LIGHTNING_BOLT);
    const newEvents: SimEvent[] = [];
    if (this.attemptTotemicReboundProc(newEvents, rng, 'lightning_bolt_ps')) {
      newEvents.push(createSurgingBoltEvent(this.p.currentTime, 0));
    }
    triggerWhirlingAir(this.p, 0, newEvents);
    return {
      damages: [{ spellId: 'lightning_bolt_ps', amount: result.damage, isCrit: result.isCrit }],
      anyCrit: result.isCrit,
      newEvents,
    };
  }

  private executePrimordialChainLightning(
    rng: RngInstance,
    snapshot: PrimordialStormCastContext,
  ): { damages: { spellId: string; amount: number; isCrit: boolean }[]; anyCrit: boolean; newEvents: SimEvent[] } {
    const nTargets = Math.min(PRIMORDIAL_CHAIN_LIGHTNING_TARGET_CAP, Math.max(1, snapshot.targetCount));
    const damages: { spellId: string; amount: number; isCrit: boolean }[] = [];
    let anyCrit = false;
    let totalDamage = 0;

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const result = this.calculateSpellDataDamageWithSnapshot(
        requireShamanSpellData(188443),
        rng,
        false,
        snapshot.maelstromWeaponStacks,
        snapshot.stormUnleashedActive,
        PRIMORDIAL_FOLLOWUP_MULTIPLIER * this.thunderCapacitorDamageMultiplier(),
        targetId,
      );
      this.p.addDamage(result.damage, targetId);
      totalDamage += result.damage;
      damages.push({ spellId: 'chain_lightning_ps', amount: result.damage, isCrit: result.isCrit });
      anyCrit = anyCrit || result.isCrit;
    }

    if (damages.length > 0) {
      this.p.recordPendingSpellStat('chain_lightning_ps', totalDamage, 1, anyCrit);
      this.p.recordPendingSpellStat(this.name, totalDamage, 0, anyCrit);
    }
    this.p.setNumericState?.(THORIMS_INVOCATION_TRIGGER_STATE, THORIMS_TRIGGER_CHAIN_LIGHTNING);

    const newEvents: SimEvent[] = [];
    triggerCrashLightningDamageBuff(this.p, nTargets, newEvents);
    return { damages, anyCrit, newEvents };
  }

  private primordialAoeDamageMultiplier(chainTarget: number, nTargets: number, reducedTargets: number): number {
    if (chainTarget >= nTargets) {
      return 0;
    }
    if (chainTarget === 0) {
      return 1;
    }
    if (reducedTargets <= 0 || nTargets <= reducedTargets) {
      return 1;
    }
    return Math.sqrt(reducedTargets / nTargets);
  }
}
