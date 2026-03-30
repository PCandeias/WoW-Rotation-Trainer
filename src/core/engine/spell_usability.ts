import type { CooldownState } from '../apl/evaluator';

export interface CooldownChargeInfo {
  current: number;
  max: number;
  nextChargeIn: number;
}

export function getCooldownCharges(
  cooldownState: CooldownState | undefined,
  currentTime: number,
): CooldownChargeInfo | null {
  if (!cooldownState?.maxCharges || !cooldownState?.readyTimes) {
    return null;
  }

  const missingCharges = cooldownState.readyTimes.filter((readyTime) => readyTime > currentTime).length;

  return {
    current: cooldownState.maxCharges - missingCharges,
    max: cooldownState.maxCharges,
    nextChargeIn: missingCharges > 0 ? Math.max(0, cooldownState.readyTimes[0] - currentTime) : 0,
  };
}