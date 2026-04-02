import type { ActionCastContext, ActionResult } from '../../../engine/action';
import type { SimEvent, SimEventQueue } from '../../../engine/eventQueue';
import { EventType } from '../../../engine/eventQueue';
import type { IGameState } from '../../../engine/i_game_state';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { consumeShamanBuffStacks, ShamanMaelstromSpellAction } from '../shaman_action';

const PRIMORDIAL_STORM = requireShamanSpellData(1218090);
const PRIMORDIAL_STORM_TALENT = requireShamanSpellData(1218047);
const PRIMORDIAL_FIRE = requireShamanSpellData(1218113);
const PRIMORDIAL_FROST = requireShamanSpellData(1218116);
const PRIMORDIAL_LIGHTNING = requireShamanSpellData(1218118);

const PRIMORDIAL_FROST_DELAY_SECONDS = 0.3;
const PRIMORDIAL_LIGHTNING_DELAY_SECONDS = 0.6;
const PRIMORDIAL_FOLLOWUP_DELAY_SECONDS = 0.95;
const PRIMORDIAL_FOLLOWUP_MULTIPLIER = 1 + PRIMORDIAL_STORM_TALENT.effectN(2).percent();
const PRIMORDIAL_REDUCED_AOE_TARGETS = PRIMORDIAL_STORM_TALENT.effectN(3).base_value();
const PRIMORDIAL_CHAIN_LIGHTNING_TARGET_CAP = 5;

type PrimordialStormCastContext = ActionCastContext & {
  readonly maelstromWeaponStacks: number;
  readonly stormUnleashedActive: boolean;
  readonly targetCount: number;
};

export class PrimordialStormAction extends ShamanMaelstromSpellAction {
  readonly name = 'primordial_storm';
  readonly spellData = PRIMORDIAL_STORM;

  constructor(state: IGameState) {
    super(state);
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
      PRIMORDIAL_FIRE,
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
    this.finishMaelstromSpender(
      result,
      rng,
      snapshot.maelstromWeaponStacks,
      snapshot.stormUnleashedActive,
    );

    return result;
  }

  executeScheduledImpact(
    spellId: string,
    castContext: ActionCastContext | undefined,
    rng: RngInstance,
  ): { damages: { spellId: string; amount: number; isCrit: boolean }[]; anyCrit: boolean } {
    const snapshot = this.resolvePrimordialSnapshot(castContext);

    switch (spellId) {
      case 'primordial_frost':
        return this.executeElementalBurst('primordial_frost', PRIMORDIAL_FROST, rng, false, snapshot);
      case 'primordial_lightning':
        return this.executeElementalBurst('primordial_lightning', PRIMORDIAL_LIGHTNING, rng, false, snapshot);
      case 'lightning_bolt_ps':
        return this.executePrimordialLightningBolt(rng, snapshot);
      case 'chain_lightning_ps':
        return this.executePrimordialChainLightning(rng, snapshot);
      default:
        return { damages: [], anyCrit: false };
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
    spellData: typeof PRIMORDIAL_FIRE,
    rng: RngInstance,
    isComboStrike: boolean,
    snapshot: PrimordialStormCastContext,
  ): { damages: { spellId: string; amount: number; isCrit: boolean }[]; anyCrit: boolean } {
    const nTargets = Math.max(1, snapshot.targetCount);
    const damages: { spellId: string; amount: number; isCrit: boolean }[] = [];
    let anyCrit = false;

    for (let targetId = 0; targetId < nTargets; targetId += 1) {
      const damageResult = this.calculateSpellDataDamageWithSnapshot(
        spellData,
        rng,
        isComboStrike,
        snapshot.maelstromWeaponStacks,
        snapshot.stormUnleashedActive,
        this.primordialAoeDamageMultiplier(targetId, nTargets, PRIMORDIAL_REDUCED_AOE_TARGETS),
      );
      this.p.addDamage(damageResult.damage, targetId);
      damages.push({ spellId, amount: damageResult.damage, isCrit: damageResult.isCrit });
      anyCrit = anyCrit || damageResult.isCrit;
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

    return { damages, anyCrit };
  }

  private executePrimordialLightningBolt(
    rng: RngInstance,
    snapshot: PrimordialStormCastContext,
  ): { damages: { spellId: string; amount: number; isCrit: boolean }[]; anyCrit: boolean } {
    const result = this.calculateSpellDataDamageWithSnapshot(
      requireShamanSpellData(188196),
      rng,
      false,
      snapshot.maelstromWeaponStacks,
      snapshot.stormUnleashedActive,
      PRIMORDIAL_FOLLOWUP_MULTIPLIER,
    );
    this.p.addDamage(result.damage);
    this.p.recordPendingSpellStat('lightning_bolt_ps', result.damage, 1, result.isCrit);
    this.p.recordPendingSpellStat(this.name, result.damage, 0, result.isCrit);
    return {
      damages: [{ spellId: 'lightning_bolt_ps', amount: result.damage, isCrit: result.isCrit }],
      anyCrit: result.isCrit,
    };
  }

  private executePrimordialChainLightning(
    rng: RngInstance,
    snapshot: PrimordialStormCastContext,
  ): { damages: { spellId: string; amount: number; isCrit: boolean }[]; anyCrit: boolean } {
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
        PRIMORDIAL_FOLLOWUP_MULTIPLIER,
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

    return { damages, anyCrit };
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
