import type { CharacterProfile } from '../data/profileParser';

export interface ProfileGearItem {
  slot: string;
  label: string;
  name: string;
  itemId?: string;
  bonusId?: string;
}

export interface ProfileReport {
  gearIlvl?: number;
  consumables: Record<string, string>;
  selectedTalents: string[];
  talentRanks: { id: string; rank: number }[];
  setBonuses: string[];
  gearItems: ProfileGearItem[];
  weaponItems: ProfileGearItem[];
  trinketItems: ProfileGearItem[];
}

const SLOT_LABELS: Record<string, string> = {
  head: 'Head',
  neck: 'Neck',
  shoulders: 'Shoulders',
  back: 'Back',
  chest: 'Chest',
  wrists: 'Wrists',
  hands: 'Hands',
  waist: 'Waist',
  legs: 'Legs',
  feet: 'Feet',
  finger1: 'Ring 1',
  finger2: 'Ring 2',
  trinket1: 'Trinket 1',
  trinket2: 'Trinket 2',
  main_hand: 'Main Hand',
  off_hand: 'Off Hand',
};

const ITEM_SLOTS = new Set(Object.keys(SLOT_LABELS));
const CONSUMABLE_KEYS = new Set([
  'potion',
  'flask',
  'food',
  'augmentation',
  'temporary_enchant',
]);

function titleCaseToken(token: string): string {
  return token.length === 0 ? token : token[0].toUpperCase() + token.slice(1);
}

function humanizeSlug(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map(titleCaseToken)
    .join(' ');
}

function parseKeyValueLine(line: string): { key: string; value: string } | null {
  const eqIndex = line.indexOf('=');
  if (eqIndex === -1) {
    return null;
  }

  return {
    key: line.slice(0, eqIndex).trim(),
    value: line.slice(eqIndex + 1).trim(),
  };
}

function parseGearItem(slot: string, value: string): ProfileGearItem {
  const parts = value.split(',');
  const rawName = parts[0]?.trim() ?? '';
  const fields = new Map<string, string>();

  for (const field of parts.slice(1)) {
    const [fieldKey, fieldValue] = field.split('=');
    if (!fieldKey || fieldValue === undefined) {
      continue;
    }
    fields.set(fieldKey.trim(), fieldValue.trim());
  }

  return {
    slot,
    label: SLOT_LABELS[slot] ?? humanizeSlug(slot),
    name: rawName.length > 0 ? humanizeSlug(rawName) : '(unnamed item)',
    itemId: fields.get('id'),
    bonusId: fields.get('bonus_id'),
  };
}

function compareTalentEntries(
  a: { id: string; rank: number },
  b: { id: string; rank: number },
): number {
  if (a.id === b.id) {
    return a.rank - b.rank;
  }
  return a.id.localeCompare(b.id);
}

export function buildProfileReport(profile: CharacterProfile): ProfileReport {
  const consumables: Record<string, string> = {};
  const setBonuses = new Set<string>();
  const gearItems: ProfileGearItem[] = [];
  let gearIlvl: number | undefined;
  const rawLines = profile.rawLines ?? [];
  const talentRanksMap = profile.talentRanks ?? new Map<string, number>();
  const talentSet = profile.talents ?? new Set<string>();
  const hasExplicitTalentLine = profile.rawTalentString.trim().length > 0
    || rawLines.some((line) => line.startsWith('talents='));

  for (const rawLine of rawLines) {
    const parsed = parseKeyValueLine(rawLine);
    if (!parsed) {
      continue;
    }

    const { key, value } = parsed;

    if (CONSUMABLE_KEYS.has(key)) {
      consumables[key] = value;
      continue;
    }

    if (key === 'gear_ilvl') {
      const parsedIlvl = Number.parseFloat(value);
      if (Number.isFinite(parsedIlvl)) {
        gearIlvl = parsedIlvl;
      }
      continue;
    }

    if (key === 'set_bonus') {
      const [setBonusId, enabledValue] = value.split('=');
      if (setBonusId && enabledValue === '1') {
        setBonuses.add(setBonusId);
      }
      continue;
    }

    if (ITEM_SLOTS.has(key)) {
      if (value.trim().length === 0) {
        continue;
      }
      gearItems.push(parseGearItem(key, value));
    }
  }

  const talentRanks = [...talentRanksMap.entries()]
    .map(([id, rank]) => ({ id, rank }))
    .sort(compareTalentEntries);
  const selectedTalents = (
    talentRanks.length > 0
      ? talentRanks.map((entry) => entry.id)
      : hasExplicitTalentLine
        ? [...talentSet].filter((id) => !setBonuses.has(id))
        : []
  ).sort((a, b) => a.localeCompare(b));

  const weaponItems = gearItems.filter((item) => item.slot === 'main_hand' || item.slot === 'off_hand');
  const trinketItems = gearItems.filter((item) => item.slot === 'trinket1' || item.slot === 'trinket2');

  return {
    gearIlvl,
    consumables,
    selectedTalents,
    talentRanks,
    setBonuses: [...setBonuses].sort((a, b) => a.localeCompare(b)),
    gearItems,
    weaponItems,
    trinketItems,
  };
}
