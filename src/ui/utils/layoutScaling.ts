import { useEffect, useState } from 'react';

export const FIXED_SCENE_WIDTH = 1920;
export const FIXED_SCENE_HEIGHT = 1080;

interface ViewportSize {
  width: number;
  height: number;
}

function getViewportSize(): ViewportSize {
  if (typeof window === 'undefined') {
    return { width: FIXED_SCENE_WIDTH, height: FIXED_SCENE_HEIGHT };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function computeFixedSceneScale(
  viewportWidth: number,
  viewportHeight: number,
  options?: {
    paddingX?: number;
    paddingY?: number;
  },
): number {
  const availableWidth = Math.max(320, viewportWidth - (options?.paddingX ?? 0));
  const availableHeight = Math.max(240, viewportHeight - (options?.paddingY ?? 0));

  return Math.min(
    availableWidth / FIXED_SCENE_WIDTH,
    availableHeight / FIXED_SCENE_HEIGHT,
  );
}

export function useFixedSceneScale(options?: {
  paddingX?: number;
  paddingY?: number;
}): number {
  const [viewport, setViewport] = useState<ViewportSize>(() => getViewportSize());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const updateViewport = (): void => {
      setViewport(getViewportSize());
    };

    window.addEventListener('resize', updateViewport);
    return (): void => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  return computeFixedSceneScale(viewport.width, viewport.height, options);
}
