import type { ArcSliderPath, ChallengePoint, SliderPath } from './noteTypes';

function distanceBetween(left: ChallengePoint, right: ChallengePoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

function getClockwiseSweep(startAngle: number, endAngle: number): number {
  const start = normalizeAngle(startAngle);
  const end = normalizeAngle(endAngle);
  return start >= end ? start - end : start + (Math.PI * 2) - end;
}

function getCounterClockwiseSweep(startAngle: number, endAngle: number): number {
  const start = normalizeAngle(startAngle);
  const end = normalizeAngle(endAngle);
  return end >= start ? end - start : (Math.PI * 2) - start + end;
}

function getArcSweep(path: ArcSliderPath): number {
  return path.clockwise
    ? getClockwiseSweep(path.startAngle, path.endAngle)
    : getCounterClockwiseSweep(path.startAngle, path.endAngle);
}

function getShortestAngularDistance(left: number, right: number): number {
  const normalizedDelta = Math.abs(normalizeAngle(left) - normalizeAngle(right));
  return Math.min(normalizedDelta, (Math.PI * 2) - normalizedDelta);
}

/**
 * Returns the start and end points for any supported Challenge slider path.
 */
export function getSliderEndpoints(path: SliderPath): { start: ChallengePoint; end: ChallengePoint } {
  return {
    start: path.start,
    end: path.end,
  };
}

/**
 * Returns the point that matches the supplied normalized slider progress.
 */
export function getSliderPointAtProgress(path: SliderPath, progressRatio: number): ChallengePoint {
  const clampedProgress = Math.max(0, Math.min(1, progressRatio));

  if (path.kind === 'line') {
    return {
      x: path.start.x + (path.end.x - path.start.x) * clampedProgress,
      y: path.start.y + (path.end.y - path.start.y) * clampedProgress,
    };
  }

  const sweep = getArcSweep(path);
  const direction = path.clockwise ? -1 : 1;
  const angle = path.startAngle + (sweep * clampedProgress * direction);
  return {
    x: path.center.x + Math.cos(angle) * path.radius,
    y: path.center.y + Math.sin(angle) * path.radius,
  };
}

/**
 * Projects a pointer position onto a Challenge slider path and returns normalized progress.
 */
export function projectSliderProgress(path: SliderPath, point: ChallengePoint, hitAllowance: number): number {
  if (path.kind === 'line') {
    const sliderLength = distanceBetween(path.start, path.end);
    if (sliderLength === 0) {
      return distanceBetween(point, path.start) <= hitAllowance ? 1 : 0;
    }

    const fromStartX = point.x - path.start.x;
    const fromStartY = point.y - path.start.y;
    const projectionDistance = ((fromStartX * (path.end.x - path.start.x)) + (fromStartY * (path.end.y - path.start.y))) / sliderLength;
    const clampedDistance = Math.max(0, Math.min(sliderLength, projectionDistance));
    const nearest = {
      x: path.start.x + ((path.end.x - path.start.x) * clampedDistance) / sliderLength,
      y: path.start.y + ((path.end.y - path.start.y) * clampedDistance) / sliderLength,
    };
    const lateralDistance = distanceBetween(point, nearest);
    if (lateralDistance > hitAllowance) {
      return 0;
    }

    return clampedDistance / sliderLength;
  }

  const distanceFromCenter = distanceBetween(point, path.center);
  if (Math.abs(distanceFromCenter - path.radius) > hitAllowance) {
    return 0;
  }

  const angle = Math.atan2(point.y - path.center.y, point.x - path.center.x);
  const sweep = getArcSweep(path);
  const travelled = path.clockwise
    ? getClockwiseSweep(path.startAngle, angle)
    : getCounterClockwiseSweep(path.startAngle, angle);

  if (travelled > sweep) {
    const distanceToStart = distanceBetween(point, path.start);
    const distanceToEnd = distanceBetween(point, path.end);
    const angularDistanceToStart = getShortestAngularDistance(angle, path.startAngle);
    const angularDistanceToEnd = getShortestAngularDistance(angle, path.endAngle);

    if (distanceToStart <= hitAllowance || angularDistanceToStart <= angularDistanceToEnd) {
      return 0;
    }

    if (distanceToEnd <= hitAllowance) {
      return 1;
    }

    return 0;
  }

  return Math.max(0, Math.min(1, travelled / Math.max(sweep, 0.001)));
}

/**
 * Converts a slider path into SVG path data for the Challenge overlay.
 */
export function describeSliderPath(path: SliderPath): string {
  if (path.kind === 'line') {
    return `M ${path.start.x} ${path.start.y} L ${path.end.x} ${path.end.y}`;
  }

  const sweep = getArcSweep(path);
  const largeArcFlag = sweep > Math.PI ? 1 : 0;
  const sweepFlag = path.clockwise ? 0 : 1;
  return `M ${path.start.x} ${path.start.y} A ${path.radius} ${path.radius} 0 ${largeArcFlag} ${sweepFlag} ${path.end.x} ${path.end.y}`;
}
