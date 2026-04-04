import type { ActionResult } from '../../../engine/action';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { ShamanAction } from '../shaman_action';

const FIRE_NOVA_EXPLOSION = requireShamanSpellData(333977);

function activeFlameShockTargetIds(state: FireNovaAction['p']): number[] {
  const targetIds: number[] = [];
  const enemyCount = Math.max(1, state.activeEnemies ?? 1);
  for (let targetId = 0; targetId < enemyCount; targetId += 1) {
    if (state.isTargetDebuffActive?.('flame_shock', targetId)) {
      targetIds.push(targetId);
    }
  }
  return targetIds;
}

export class FireNovaAction extends ShamanAction {
  readonly name = 'fire_nova';
  readonly spellData = FIRE_NOVA_EXPLOSION;

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override actionSchools(): readonly ('fire')[] {
    return ['fire'];
  }

  executeProc(rng: RngInstance, isComboStrike: boolean): ActionResult {
    const flameShockTargetIds = activeFlameShockTargetIds(this.p);
    if (flameShockTargetIds.length <= 0) {
      return {
        damage: 0,
        isCrit: false,
        newEvents: [],
        buffsApplied: [],
        cooldownAdjustments: [],
      };
    }

    let totalDamage = 0;
    let anyCrit = false;
    const snapshot = this.captureSnapshot(isComboStrike);

    for (const targetId of flameShockTargetIds) {
      const impact = this.calculateDamageFromSnapshot(snapshot, rng, targetId);
      this.p.addDamage(impact.damage, targetId);
      totalDamage += impact.damage;
      anyCrit = anyCrit || impact.isCrit;
    }

    this.p.recordPendingSpellStat(this.name, totalDamage, 1, anyCrit);
    return {
      damage: totalDamage,
      isCrit: anyCrit,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}
