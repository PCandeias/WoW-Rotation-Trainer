import type { CSSProperties } from 'react';
import type { GameStateSnapshot } from '@core/engine/gameState';
import { T } from '@ui/theme/elvui';

export interface SegmentedResourcePresentation {
  readonly testIdPrefix: string;
  readonly label: string;
  readonly current: (gameState: GameStateSnapshot) => number;
  readonly max: (gameState: GameStateSnapshot) => number;
  readonly activeGradient: string;
  readonly inactiveGradient: string;
  readonly borderColor: string;
  readonly backgroundColor: string;
  readonly glowColor: string;
}

export interface BarResourcePresentation {
  readonly label?: string;
  readonly current: (gameState: GameStateSnapshot, currentTime: number) => number;
  readonly max: (gameState: GameStateSnapshot, currentTime: number) => number;
  readonly valueText?: (value: number, max: number) => string;
  readonly showValueText?: boolean;
  readonly color: string;
  readonly trackColor: string;
  readonly borderColor: string;
  readonly trackStyle?: CSSProperties;
  readonly fillStyle?: CSSProperties;
  readonly valueTextStyle?: CSSProperties;
}

export interface SpecResourcePresentation {
  readonly accentColor: string;
  readonly top?: SegmentedResourcePresentation;
  readonly bottom?: BarResourcePresentation;
}

function resolveCurrentEnergy(gameState: GameStateSnapshot, currentTime: number): number {
  return Math.floor(
    Math.min(
      gameState.energyMax,
      gameState.energyAtLastUpdate + gameState.energyRegenRate * (currentTime - gameState.energyLastUpdated),
    ),
  );
}

function resolveBuffStacks(gameState: GameStateSnapshot, buffId: string): number {
  return gameState.buffs.get(buffId)?.stacks ?? 0;
}

const MONK_RESOURCE_PRESENTATION: SpecResourcePresentation = {
  accentColor: T.classMonk,
  top: {
    testIdPrefix: 'chi-orb',
    label: 'Chi',
    current: (gameState) => gameState.chi,
    max: (gameState) => gameState.chiMax,
    activeGradient: 'linear-gradient(180deg, #cbd571 0%, #b7c055 45%, #9ea83d 100%)',
    inactiveGradient: 'linear-gradient(180deg, #0f2436 0%, #091421 100%)',
    borderColor: '#193548',
    backgroundColor: '#07131e',
    glowColor: T.chi,
  },
  bottom: {
    label: 'Energy',
    current: (gameState, currentTime) => resolveCurrentEnergy(gameState, currentTime),
    max: (gameState) => gameState.energyMax,
    showValueText: false,
    valueText: (value, max) => `${Math.round((value / Math.max(1, max)) * 100)}%`,
    color: '#c2cb5f',
    trackColor: '#07131e',
    borderColor: '#193548',
    trackStyle: { borderRadius: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' },
    fillStyle: { background: 'linear-gradient(90deg, #d4dc7b 0%, #c2cb5f 45%, #b0ba50 100%)' },
    valueTextStyle: { color: '#20a4ff', fontSize: '10px', letterSpacing: '0.02em', borderRadius: 0 },
  },
};

const SHAMAN_RESOURCE_PRESENTATION: SpecResourcePresentation = {
  accentColor: '#0070de',
  top: {
    testIdPrefix: 'maelstrom-weapon',
    label: 'Maelstrom Weapon',
    current: (gameState) => resolveBuffStacks(gameState, 'maelstrom_weapon'),
    max: () => 10,
    activeGradient: 'linear-gradient(180deg, #9b7bff 0%, #6f8fff 45%, #3fc4ff 100%)',
    inactiveGradient: 'linear-gradient(180deg, #10172a 0%, #0a1020 100%)',
    borderColor: '#244b78',
    backgroundColor: '#07111f',
    glowColor: '#7b8cff',
  },
  bottom: {
    current: () => 100,
    max: () => 100,
    showValueText: false,
    color: '#4c7dff',
    trackColor: '#07111f',
    borderColor: '#244b78',
    trackStyle: { borderRadius: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' },
    fillStyle: { background: 'linear-gradient(90deg, #6f8fff 0%, #4c7dff 45%, #36b8ff 100%)' },
    valueTextStyle: { color: '#d9e6ff', fontSize: '10px', letterSpacing: '0.02em', borderRadius: 0 },
  },
};

const DEFAULT_RESOURCE_PRESENTATION: SpecResourcePresentation = {
  ...MONK_RESOURCE_PRESENTATION,
};

const RESOURCE_PRESENTATION_BY_PROFILE_SPEC = new Map<string, SpecResourcePresentation>([
  ['monk', MONK_RESOURCE_PRESENTATION],
  ['shaman', SHAMAN_RESOURCE_PRESENTATION],
  ['paladin', DEFAULT_RESOURCE_PRESENTATION],
  ['demonhunter', DEFAULT_RESOURCE_PRESENTATION],
  ['mage', DEFAULT_RESOURCE_PRESENTATION],
]);

export function getResourcePresentationForProfileSpec(profileSpec: string): SpecResourcePresentation {
  const presentation = RESOURCE_PRESENTATION_BY_PROFILE_SPEC.get(profileSpec);
  if (!presentation) {
    throw new Error(`No resource presentation registered for profile spec '${profileSpec}'`);
  }
  return presentation;
}
