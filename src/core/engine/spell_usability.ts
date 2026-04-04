import type { CooldownState } from '../apl/evaluator';

export interface CooldownChargeInfo {
  current: number;
  max: number;
  nextChargeIn: number;
}

export function getCooldownCharges(
  cooldownState: CooldownState | undefined,
  currentTime: number,
  defaultMaxCharges?: number,
): CooldownChargeInfo | null {
  if (!cooldownState?.maxCharges || !cooldownState?.readyTimes) {
    if (!defaultMaxCharges || defaultMaxCharges <= 1) {
      return null;
    }

    return {
      current: defaultMaxCharges,
      max: defaultMaxCharges,
      nextChargeIn: 0,
    };
  }

  const maxCharges = cooldownState.maxCharges;
  if (maxCharges <= 1) {
    return null;
  }

  const missingCharges = cooldownState.readyTimes.filter((readyTime) => readyTime > currentTime).length;

  return {
    current: maxCharges - missingCharges,
    max: maxCharges,
    nextChargeIn: missingCharges > 0 ? Math.max(0, cooldownState.readyTimes[0] - currentTime) : 0,
  };
}