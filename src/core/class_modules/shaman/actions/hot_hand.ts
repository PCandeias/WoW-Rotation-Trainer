import type { IGameState } from '../../../engine/i_game_state';

const HOT_HAND_COOLDOWN_RATE_BONUS_BY_RANK = [0, 34, 100] as const;

function hotHandTalentValueByRank(values: readonly number[], rank: number): number {
  if (rank <= 0) {
    return 0;
  }

  return values[Math.min(rank, values.length - 1)] ?? 0;
}

export function applyTemporaryCooldownRate(baseDuration: number, rateBonusPct: number, activeWindowSeconds: number): number {
  if (baseDuration <= 0 || rateBonusPct <= 0 || activeWindowSeconds <= 0) {
    return baseDuration;
  }

  const rateMultiplier = 1 + rateBonusPct / 100;
  const acceleratedWindow = activeWindowSeconds * rateMultiplier;
  if (baseDuration <= acceleratedWindow) {
    return baseDuration / rateMultiplier;
  }

  return baseDuration - activeWindowSeconds * (rateMultiplier - 1);
}

export function scaleCooldownReductionForTemporaryRate(
  baseDuration: number,
  reductionSeconds: number,
  rateBonusPct: number,
  activeWindowSeconds: number,
): number {
  if (reductionSeconds <= 0) {
    return 0;
  }
  if (baseDuration <= 0 || rateBonusPct <= 0 || activeWindowSeconds <= 0) {
    return Math.min(reductionSeconds, baseDuration);
  }

  const adjustedDuration = applyTemporaryCooldownRate(baseDuration, rateBonusPct, activeWindowSeconds);
  const adjustedReducedDuration = applyTemporaryCooldownRate(
    Math.max(0, baseDuration - reductionSeconds),
    rateBonusPct,
    activeWindowSeconds,
  );
  return Math.max(0, adjustedDuration - adjustedReducedDuration);
}

export function scaleCooldownReductionForCurrentRate(reductionSeconds: number, rateBonusPct: number): number {
  if (reductionSeconds <= 0 || rateBonusPct <= 0) {
    return reductionSeconds;
  }

  return reductionSeconds / (1 + rateBonusPct / 100);
}

export function adjustLavaLashCooldownForHotHandWindow(
  state: IGameState,
  hotHandWindowSeconds: number,
  existingHotHandWindowSeconds = 0,
): void {
  if (hotHandWindowSeconds <= 0) {
    return;
  }

  const hotHandRank = state.getTalentRank('hot_hand');
  const hotHandRateBonusPct = hotHandTalentValueByRank(HOT_HAND_COOLDOWN_RATE_BONUS_BY_RANK, hotHandRank);
  if (hotHandRateBonusPct <= 0) {
    return;
  }

  const lavaLashRemains = state.getCooldownRemains('lava_lash');
  if (lavaLashRemains <= existingHotHandWindowSeconds) {
    return;
  }

  const adjustedRemains = existingHotHandWindowSeconds + applyTemporaryCooldownRate(
    lavaLashRemains - existingHotHandWindowSeconds,
    hotHandRateBonusPct,
    hotHandWindowSeconds,
  );
  if (lavaLashRemains > adjustedRemains) {
    state.adjustCooldown('lava_lash', lavaLashRemains - adjustedRemains);
  }
}
