import {
  SIMC_PROFILE_WEAPON_DAMAGE_TABLES,
  SIMC_PROFILE_WEAPON_ITEMS,
} from './generated/simcProfileWeaponData';
import type { LoadoutGearItem } from './loadout';

const ITEM_FLAG2_CASTER_WEAPON = 0x00000200; // SimC: data_enums.hh ITEM_FLAG2_CASTER_WEAPON
const INVTYPE_WEAPON = 13;
const INVTYPE_2HWEAPON = 17;
const INVTYPE_RANGED = 15;
const INVTYPE_THROWN = 25;
const INVTYPE_RANGEDRIGHT = 26;
const INVTYPE_WEAPONMAINHAND = 21;
const INVTYPE_WEAPONOFFHAND = 22;
const ITEM_SUBCLASS_WEAPON_BOW = 2;
const ITEM_SUBCLASS_WEAPON_GUN = 3;
const ITEM_SUBCLASS_WEAPON_CROSSBOW = 18;
const ITEM_SUBCLASS_WEAPON_THROWN = 16;
const ITEM_SUBCLASS_WEAPON_WAND = 19;

type SimcWeaponTableName = 'oneHand' | 'oneHandCaster' | 'twoHand' | 'twoHandCaster';

interface SimcGeneratedWeaponItem {
  itemId: number;
  itemName: string;
  resolvedItemLevel: number;
  quality: number;
  inventoryType: number;
  itemSubclass: number;
  flags2: number;
  delayMs: number;
  dmgRange: number;
  tableName: SimcWeaponTableName;
}

const simcProfileWeaponItems = SIMC_PROFILE_WEAPON_ITEMS as Readonly<Record<string, SimcGeneratedWeaponItem>>;
const simcProfileWeaponDamageTables =
  SIMC_PROFILE_WEAPON_DAMAGE_TABLES as Readonly<Partial<Record<SimcWeaponTableName, Readonly<Record<number, readonly number[]>>>>>;

interface DerivedWeaponStats {
  speed: number;
  minDamage: number;
  maxDamage: number;
}

function resolveTableName(item: {
  inventoryType: number;
  itemSubclass: number;
  flags2: number;
}): SimcWeaponTableName | null {
  const isCaster = (item.flags2 & ITEM_FLAG2_CASTER_WEAPON) !== 0;

  if ([INVTYPE_WEAPON, INVTYPE_WEAPONMAINHAND, INVTYPE_WEAPONOFFHAND].includes(item.inventoryType)) {
    return isCaster ? 'oneHandCaster' : 'oneHand';
  }

  if (item.inventoryType === INVTYPE_2HWEAPON) {
    return isCaster ? 'twoHandCaster' : 'twoHand';
  }

  if ([INVTYPE_RANGED, INVTYPE_THROWN, INVTYPE_RANGEDRIGHT].includes(item.inventoryType)) {
    if ([ITEM_SUBCLASS_WEAPON_BOW, ITEM_SUBCLASS_WEAPON_GUN, ITEM_SUBCLASS_WEAPON_CROSSBOW].includes(item.itemSubclass)) {
      return 'twoHand';
    }
    if (item.itemSubclass === ITEM_SUBCLASS_WEAPON_THROWN) {
      return 'oneHand';
    }
    if (item.itemSubclass === ITEM_SUBCLASS_WEAPON_WAND) {
      return 'oneHandCaster';
    }
  }

  return null;
}

export function buildSimcWeaponSignature(item: LoadoutGearItem): string | null {
  if (!item.itemId) {
    return null;
  }
  const sortedBonusIds = [...item.bonusIds].sort((a, b) => a - b);
  const bonusFragment = sortedBonusIds.join('/');
  return `${item.itemId}|${item.itemLevel ?? 0}|${bonusFragment}`;
}

function resolveWeaponDps(item: SimcGeneratedWeaponItem): number | null {
  const tableName = resolveTableName(item);
  if (!tableName) {
    return null;
  }

  const row = simcProfileWeaponDamageTables[tableName]?.[item.resolvedItemLevel];
  if (!row) {
    return null;
  }

  const qualityIndex = item.quality > 6 ? 4 : item.quality;
  return row[qualityIndex] ?? null;
}

/**
 * Mirrors SimC's `dbc_t::weapon_dps` + `item_database::weapon_dmg_min/max`
 * path for checked-in stock profiles. Missing item levels are resolved at
 * generation time from the profile's exact bonus-id package using SimC's
 * bonus/scaling rules, then damage uses the live SimC formula here.
 */
export function deriveWeaponStatsFromSimc(item: LoadoutGearItem | undefined): DerivedWeaponStats | null {
  if (!item) {
    return null;
  }

  const signature = buildSimcWeaponSignature(item);
  if (!signature) {
    return null;
  }

  const simcItem = simcProfileWeaponItems[signature];
  const weaponDps = simcItem ? resolveWeaponDps(simcItem) : null;
  if (!simcItem || weaponDps === null) {
    return null;
  }

  const speed = simcItem.delayMs / 1000;
  const minDamage = Math.floor(weaponDps * speed * (1 - simcItem.dmgRange / 2));
  const maxDamage = Math.floor(weaponDps * speed * (1 + simcItem.dmgRange / 2) + 0.5);

  return {
    speed,
    minDamage,
    maxDamage,
  };
}
