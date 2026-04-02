import { getBuffPresentationRegistryForProfileSpec } from '@ui/specs/specBuffPresentation';
import { getCooldownTrackerDefinitionsForProfileSpec } from '@ui/specs/specCooldownPresentation';
import {
  getTrainerSpecDefinition,
  getTrainerSpecUiDefaults,
  type TrainerSpecId,
} from '@ui/specs/specCatalog';

export interface TrackerCatalogEntry {
  id: string;
  spellId?: number;
  iconName?: string;
  emoji: string;
  displayName: string;
  supportsProcGlow?: boolean;
}

export const CONSUMABLE_TRACKERS: readonly TrackerCatalogEntry[] = [
  { id: 'berserking', spellId: 26297, iconName: 'racial_troll_berserk', emoji: '🔴', displayName: 'Berserking' },
  { id: 'algethar_puzzle', spellId: 193701, iconName: 'inv_misc_enggizmos_18', emoji: '💎', displayName: "Algeth'ar Puzzle Box" },
  { id: 'potion', iconName: 'inv_12_profession_alchemy_voidpotion_red', emoji: '🧪', displayName: 'Potion' },
];

function getUniqueIds(entryIds: readonly string[], optionIds: readonly string[]): string[] {
  return [...new Set([...entryIds, ...optionIds])];
}

export function getCooldownTrackerCatalogForSpec(
  selectedSpec: TrainerSpecId,
): {
  essential: readonly TrackerCatalogEntry[];
  utility: readonly TrackerCatalogEntry[];
  all: readonly TrackerCatalogEntry[];
} {
  const specDefinition = getTrainerSpecDefinition(selectedSpec);
  const specUiDefaults = getTrainerSpecUiDefaults(selectedSpec);
  const cooldownDefinitions = getCooldownTrackerDefinitionsForProfileSpec(specDefinition.profileSpec);
  const entryOptionIds = Object.keys(specUiDefaults.cooldowns.essential.entryOptions);
  const utilityOptionIds = Object.keys(specUiDefaults.cooldowns.utility.entryOptions);

  const buildEntries = (entryIds: readonly string[]): TrackerCatalogEntry[] => entryIds.flatMap((entryId) => {
    const definition = cooldownDefinitions[entryId];
    if (!definition) {
      return [];
    }

    return [{
      id: entryId,
      iconName: definition.iconName,
      emoji: definition.emoji,
      displayName: definition.displayName,
      supportsProcGlow: definition.procBuffId !== undefined || definition.procOverride !== undefined,
    }];
  });

  const essentialIds = getUniqueIds(
    specUiDefaults.cooldowns.essential.trackedEntryIds,
    entryOptionIds.filter((entryId) => specUiDefaults.cooldowns.essential.entryOptions[entryId]?.cooldownGroup !== 'utility'),
  );
  const utilityIds = getUniqueIds(
    specUiDefaults.cooldowns.utility.trackedEntryIds,
    utilityOptionIds.filter((entryId) => specUiDefaults.cooldowns.utility.entryOptions[entryId]?.cooldownGroup === 'utility'),
  );

  const essential = buildEntries(essentialIds);
  const utility = buildEntries(utilityIds);
  return {
    essential,
    utility,
    all: [...essential, ...utility],
  };
}

export function getBuffTrackerCatalogForSpec(selectedSpec: TrainerSpecId): readonly TrackerCatalogEntry[] {
  const specDefinition = getTrainerSpecDefinition(selectedSpec);
  const specUiDefaults = getTrainerSpecUiDefaults(selectedSpec);
  const buffRegistry = getBuffPresentationRegistryForProfileSpec(specDefinition.profileSpec);
  const buffSpellIds = specUiDefaults.buffSpellIds;
  const entryIds = getUniqueIds(
    [
      ...specUiDefaults.buffs.iconTracker.trackedEntryIds,
      ...specUiDefaults.buffs.barTracker.trackedEntryIds,
    ],
    [
      ...Object.keys(specUiDefaults.buffs.iconTracker.entryOptions),
      ...Object.keys(specUiDefaults.buffs.barTracker.entryOptions),
    ],
  );

  return entryIds.flatMap((entryId) => {
    const definition = buffRegistry[entryId];
    if (!definition) {
      return [];
    }

    const entryOptions = specUiDefaults.buffs.iconTracker.entryOptions[entryId]
      ?? specUiDefaults.buffs.barTracker.entryOptions[entryId];

    return [{
      id: entryId,
      spellId: buffSpellIds[entryId],
      iconName: definition.iconName,
      emoji: definition.emoji ?? '?',
      displayName: definition.displayName ?? entryId,
      supportsProcGlow: entryOptions !== undefined,
    }];
  });
}

export function getCatalogEntryIds(entries: readonly TrackerCatalogEntry[]): string[] {
  return entries.map((entry) => entry.id);
}
