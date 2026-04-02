export type GearSlot =
  | 'head'
  | 'neck'
  | 'shoulders'
  | 'back'
  | 'chest'
  | 'wrists'
  | 'hands'
  | 'waist'
  | 'legs'
  | 'feet'
  | 'finger1'
  | 'finger2'
  | 'trinket1'
  | 'trinket2'
  | 'main_hand'
  | 'off_hand';

/** Ordered list of supported gear slots for UI editors and parser helpers. */
export const GEAR_SLOTS: readonly GearSlot[] = [
  'head',
  'neck',
  'shoulders',
  'back',
  'chest',
  'wrists',
  'hands',
  'waist',
  'legs',
  'feet',
  'finger1',
  'finger2',
  'trinket1',
  'trinket2',
  'main_hand',
  'off_hand',
];

export interface LoadoutGearItem {
  slot: GearSlot;
  itemName: string;
  itemId?: number;
  itemLevel?: number;
  enchantId?: number;
  enchantName?: string;
  gemIds: number[];
  bonusIds: number[];
  craftedStats: number[];
  raw: string;
}

export interface LoadoutWeaponEnchant {
  slot: 'main_hand' | 'off_hand';
  enchantName: string;
}

export interface LoadoutConsumables {
  potion: string | null;
  flask: string | null;
  food: string | null;
  augmentation: string | null;
  temporaryEnchants: LoadoutWeaponEnchant[];
}

export interface LoadoutExternalBuffs {
  bloodlust: boolean;
  battleShout: boolean;
  arcaneIntellect: boolean;
  markOfTheWild: boolean;
  powerWordFortitude: boolean;
  skyfury: boolean;
  mysticTouch: boolean;
  chaosBrand?: boolean;
  huntersMark?: boolean;
}

export interface CharacterLoadout {
  consumables: LoadoutConsumables;
  externalBuffs: LoadoutExternalBuffs;
  gear: LoadoutGearItem[];
}

export function createEmptyLoadout(): CharacterLoadout {
  return {
    consumables: {
      potion: null,
      flask: null,
      food: null,
      augmentation: null,
      temporaryEnchants: [],
    },
    externalBuffs: {
      bloodlust: false,
      battleShout: false,
      arcaneIntellect: false,
      markOfTheWild: false,
      powerWordFortitude: false,
      skyfury: false,
      mysticTouch: false,
      chaosBrand: false,
      huntersMark: false,
    },
    gear: [],
  };
}

export function cloneLoadout(loadout: CharacterLoadout | undefined): CharacterLoadout {
  const source = loadout ?? createEmptyLoadout();
  return {
    consumables: {
      potion: source.consumables.potion,
      flask: source.consumables.flask,
      food: source.consumables.food,
      augmentation: source.consumables.augmentation,
      temporaryEnchants: source.consumables.temporaryEnchants.map((enchant) => ({ ...enchant })),
    },
    externalBuffs: { ...source.externalBuffs },
    gear: source.gear.map((item) => ({
      ...item,
      gemIds: [...item.gemIds],
      bonusIds: [...item.bonusIds],
      craftedStats: [...item.craftedStats],
    })),
  };
}

export function withSimcOptimalRaidExternalBuffs(
  loadout: CharacterLoadout,
  enabled = true,
): CharacterLoadout {
  const next = cloneLoadout(loadout);
  next.externalBuffs = {
    ...next.externalBuffs,
    bloodlust: enabled,
    battleShout: enabled,
    arcaneIntellect: enabled,
    markOfTheWild: enabled,
    powerWordFortitude: enabled,
    skyfury: enabled,
    mysticTouch: enabled,
    chaosBrand: enabled,
    huntersMark: enabled,
  };
  return next;
}

/** Returns whether a string is a supported loadout gear slot key. */
export function isGearSlot(key: string): key is GearSlot {
  return GEAR_SLOTS.includes(key as GearSlot);
}

/** Parses SimC-style temporary enchant strings into the loadout model. */
export function parseTemporaryEnchants(value: string): CharacterLoadout['consumables']['temporaryEnchants'] {
  if (value.trim() === '' || value.trim() === 'disabled') {
    return [];
  }

  return value
    .split('/')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [slot, enchantName] = entry.split(':', 2);
      if ((slot === 'main_hand' || slot === 'off_hand') && enchantName) {
        return { slot, enchantName };
      }
      throw new Error(`Invalid temporary_enchant entry '${entry}'`);
    });
}

/** Serializes temporary enchants back into the compact SimC-style editor string. */
export function stringifyTemporaryEnchants(
  enchants: readonly CharacterLoadout['consumables']['temporaryEnchants'][number][],
): string {
  return enchants.map((entry) => `${entry.slot}:${entry.enchantName}`).join('/');
}

/** Upserts a single gear slot using the same parsing rules as the profile parser. */
export function upsertGearItem(loadout: CharacterLoadout, slot: GearSlot, value: string, raw = `${slot}=${value}`): void {
  const existingIndex = loadout.gear.findIndex((item) => item.slot === slot);
  if (value.trim().length === 0) {
    if (existingIndex >= 0) {
      loadout.gear.splice(existingIndex, 1);
    }
    return;
  }

  const rawSegments = value.split(',').map((segment) => segment.trim());
  const itemName = rawSegments[0] ?? '';
  const segments = rawSegments.slice(1).filter(Boolean);
  const allowedKeys = new Set(['id', 'ilevel', 'enchant', 'enchant_id', 'gem_id', 'bonus_id', 'crafted_stats']);
  const kv = new Map<string, string>();
  for (const segment of segments) {
    const [segmentKey, ...rest] = segment.split('=');
    if (!segmentKey || rest.length === 0) {
      throw new Error(`Malformed gear segment '${segment}' for slot '${slot}'`);
    }
    const normalizedKey = segmentKey.trim();
    if (!allowedKeys.has(normalizedKey)) {
      throw new Error(`Unsupported gear field '${normalizedKey}' for slot '${slot}'`);
    }
    kv.set(normalizedKey, rest.join('=').trim());
  }

  const parseList = (fieldName: string, rawValue: string | undefined): number[] => {
    if (!rawValue) {
      return [];
    }

    return rawValue.split('/').map((part) => {
      const parsed = Number.parseInt(part.trim(), 10);
      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid numeric value for gear ${fieldName}: '${part.trim()}'`);
      }
      return parsed;
    });
  };

  const nextItem: LoadoutGearItem = {
    slot,
    itemName,
    itemId: parseOptionalInt('id', kv.get('id')),
    itemLevel: parseOptionalInt('ilevel', kv.get('ilevel')),
    enchantId: parseOptionalInt('enchant_id', kv.get('enchant_id')),
    enchantName: kv.get('enchant'),
    gemIds: parseList('gem_id', kv.get('gem_id')),
    bonusIds: parseList('bonus_id', kv.get('bonus_id')),
    craftedStats: parseList('crafted_stats', kv.get('crafted_stats')),
    raw,
  };

  if (existingIndex >= 0) {
    loadout.gear[existingIndex] = nextItem;
    return;
  }

  loadout.gear.push(nextItem);
}

/** Serializes a gear item into the editable value format used by the loadout panel. */
export function stringifyGearItemValue(item: LoadoutGearItem): string {
  const segments = [item.itemName];
  if (item.itemId !== undefined) {
    segments.push(`id=${item.itemId}`);
  }
  if (item.itemLevel !== undefined) {
    segments.push(`ilevel=${item.itemLevel}`);
  }
  if (item.enchantId !== undefined) {
    segments.push(`enchant_id=${item.enchantId}`);
  }
  if (item.enchantName) {
    segments.push(`enchant=${item.enchantName}`);
  }
  if (item.gemIds.length > 0) {
    segments.push(`gem_id=${item.gemIds.join('/')}`);
  }
  if (item.bonusIds.length > 0) {
    segments.push(`bonus_id=${item.bonusIds.join('/')}`);
  }
  if (item.craftedStats.length > 0) {
    segments.push(`crafted_stats=${item.craftedStats.join('/')}`);
  }
  return segments.join(',');
}

function parseOptionalInt(fieldName: string, value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for gear ${fieldName}: '${value}'`);
  }
  return parsed;
}
