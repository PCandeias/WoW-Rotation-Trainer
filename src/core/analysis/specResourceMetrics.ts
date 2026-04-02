export interface ResourceWasteMetricDefinition {
  readonly key: string;
  readonly wasteFieldKey: string;
  readonly label: string;
  readonly playerSeriesKey: string;
  readonly trainerSeriesKey: string;
  readonly playerColor: string;
  readonly trainerColor: string;
  readonly summaryLabel: string;
  readonly minorThreshold: number;
  readonly majorThreshold: number;
  readonly occurrenceWeight: number;
  readonly dpsLossPerUnit: number;
  readonly fixHint: string;
}

const MONK_WASTE_METRICS: readonly ResourceWasteMetricDefinition[] = [
  {
    key: 'chi',
    wasteFieldKey: 'chiWasted',
    label: 'Chi Waste',
    playerSeriesKey: 'playerChi',
    trainerSeriesKey: 'trainerChi',
    playerColor: '#1fd58f',
    trainerColor: '#0f8c5a',
    summaryLabel: 'Chi',
    minorThreshold: 1,
    majorThreshold: 2,
    occurrenceWeight: 1,
    dpsLossPerUnit: 180,
    fixHint: 'Spend Chi before it caps.',
  },
  {
    key: 'energy',
    wasteFieldKey: 'energyWasted',
    label: 'Energy Waste',
    playerSeriesKey: 'playerEnergy',
    trainerSeriesKey: 'trainerEnergy',
    playerColor: '#ff6b6b',
    trainerColor: '#b63c3c',
    summaryLabel: 'Energy',
    minorThreshold: 15,
    majorThreshold: 30,
    occurrenceWeight: 25,
    dpsLossPerUnit: 12,
    fixHint: 'Use filler earlier when Energy is about to overflow.',
  },
] as const;

const RESOURCE_WASTE_METRICS_BY_SPEC = new Map<string, readonly ResourceWasteMetricDefinition[]>([
  ['monk_windwalker', MONK_WASTE_METRICS],
  ['shaman_enhancement', []],
  ['paladin_retribution', []],
  ['demonhunter_devourer', []],
  ['mage_arcane', []],
]);

export function getResourceWasteMetricsForSpec(specId: string): readonly ResourceWasteMetricDefinition[] {
  return RESOURCE_WASTE_METRICS_BY_SPEC.get(specId) ?? [];
}
