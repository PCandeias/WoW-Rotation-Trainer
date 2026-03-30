/**
 * Generic spell and buff contracts shared across all specs.
 */

export type AutoAttackInterruptionMode = 'continue' | 'suppress';

export interface AutoAttackInterruptionPolicy {
  /** Whether cast start should delay the currently pending swing timers. */
  delayAtCastStart?: boolean;
  /** How melee auto attacks behave while this spell is the active foreground channel. */
  duringChannel?: AutoAttackInterruptionMode;
}

export interface SpellDef {
  id: number;
  name: string;
  displayName: string;
  energyCost: number;
  chiCost: number;
  chiGain: number;
  cooldown: number;
  hasteScalesCooldown: boolean;
  isChanneled: boolean;
  channelDuration: number;
  channelTicks: number;
  isOnGcd: boolean;
  requiresGcdReady?: boolean;
  usableDuringCurrentGcd?: boolean;
  apCoefficient: number;
  baseDmgMin: number;
  baseDmgMax: number;
  buffApplied?: string;
  buffDuration?: number;
  buffMaxStacks?: number;
  requiresComboStrike: boolean;
  talentRequired?: string;
  isWdp: boolean;
  isZenith: boolean;
  isExecute: boolean;
  executeHpDamage: number;
  isPhysical?: boolean;
  /**
   * Whether this spell participates in combo-strike tracking (SimC: may_combo_strike).
   * Defaults to false, matching SimC's action_t base class.  Registered Action
   * subclasses may override via mayComboStrike(); this field provides a fallback
   * for unregistered spell executions.
   */
  mayComboStrike?: boolean;
  autoAttackInterruption?: AutoAttackInterruptionPolicy;
}

export interface BuffDef {
  id: string;
  displayName: string;
  duration: number;
  maxStacks: number;
  isHarmful: boolean;
}

export function spellRequiresGcdReady(spell: SpellDef): boolean {
  return spell.requiresGcdReady ?? spell.isOnGcd;
}

export function spellUsableDuringCurrentGcd(spell: SpellDef): boolean {
  return spell.usableDuringCurrentGcd ?? false;
}
