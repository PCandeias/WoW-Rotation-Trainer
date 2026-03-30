import type { AstNode } from './parser';
import type { ActionList, Action } from './actionList';
import { MONK_WW_BUFFS, MONK_WW_SPELLS } from '../data/spells/monk_windwalker';
import type { BuffDef, SpellDef } from '../data/spells';

export interface AplCompatibilityIssues {
  unsupportedActions: Set<string>;
  unsupportedProperties: Set<string>;
  unsupportedTargetIfActions: Set<string>;
}

export interface AplCompatibilityCatalog {
  spells: ReadonlyMap<string, SpellDef>;
  buffs: ReadonlyMap<string, BuffDef>;
}

const APL_BUFF_ALIASES = new Map<string, string>([
  ['combo_breaker', 'blackout_reinforcement'],
  ['dance_of_chiji', 'dance_of_chi_ji'],
  ['zenith', 'celestial_conduit_active'],
]);
const SYNTHETIC_BUFF_NAMES = new Set(['flurry_charge']);
const COOLDOWN_PROPS = new Set(['ready', 'up', 'remains', 'duration', 'full_recharge_time']);
const BUFF_PROPS = new Set(['up', 'remains', 'stack']);

const DEFAULT_CATALOG: AplCompatibilityCatalog = {
  spells: MONK_WW_SPELLS,
  buffs: MONK_WW_BUFFS,
};

export const DEFAULT_APL_UNSUPPORTED_ACTION_ALLOWLIST = new Set([
  'ancestral_call',
  'arcane_pulse',
  'arcane_torrent',
  'auto_attack',
  'bag_of_tricks',
  'blood_fury',
  'chi_torpedo',
  'fireblood',
  'flying_serpent_kick',
  'haymaker',
  'invoke_external_buff',
  'lights_judgment',
  'rocket_barrage',
  'roll',
  'snapshot_stats',
  'spear_hand_strike',
  'thorn_bloom',
  'use_item',
]);

export const DEFAULT_APL_UNSUPPORTED_PROPERTY_ALLOWLIST = new Set<string>([
  'buff.heart_of_the_jade_serpent.remains',
  'buff.heart_of_the_jade_serpent.up',
  'buff.heart_of_the_jade_serpent_unity_within.remains',
  'buff.heart_of_the_jade_serpent_unity_within.up',
  'buff.heart_of_the_jade_serpent_yulons_avatar.up',
  'buff.invoke_xuen_the_white_tiger.remains',
  'buff.invoke_xuen_the_white_tiger.up',
  'buff.power_infusion.up',
  'cooldown.invoke_power_infusion_0.duration',
]);

const SUPPORTED_TARGET_IF_MODES = new Set(['max', 'min', 'first']);

export const DEFAULT_APL_UNSUPPORTED_TARGET_IF_ALLOWLIST = new Set<string>();

function visitAst(node: AstNode, visit: (node: AstNode) => void): void {
  visit(node);
  switch (node.kind) {
    case 'UnaryOp':
      visitAst(node.operand, visit);
      break;
    case 'BinaryOp':
      visitAst(node.left, visit);
      visitAst(node.right, visit);
      break;
    case 'NumberLiteral':
    case 'PropertyAccess':
      break;
  }
}

function visitActionAst(action: Action, visit: (node: AstNode) => void): void {
  if (action.condition) {
    visitAst(action.condition.ast, visit);
  }
  if (action.type === 'cast' && action.targetIf) {
    visitAst(action.targetIf.selector.ast, visit);
  }
  if (action.type === 'variable') {
    visitAst(action.valueExpr, visit);
  }
}

function isSupportedBuffName(name: string, catalog: AplCompatibilityCatalog): boolean {
  return catalog.buffs.has(name) || APL_BUFF_ALIASES.has(name) || SYNTHETIC_BUFF_NAMES.has(name);
}

function validatePropertyPath(path: string[], catalog: AplCompatibilityCatalog): string | null {
  const [root, ...rest] = path;

  switch (root) {
    case 'chi':
      return rest.length === 0 || (rest.length === 1 && ['max', 'deficit'].includes(rest[0])) ? null : path.join('.');
    case 'energy':
      return rest.length === 0 || (rest.length === 1 && ['max', 'deficit', 'time_to_max'].includes(rest[0])) ? null : path.join('.');
    case 'buff': {
      if (rest.length !== 2) return path.join('.');
      const [name, prop] = rest;
      return isSupportedBuffName(name, catalog) && BUFF_PROPS.has(prop) ? null : path.join('.');
    }
    case 'cooldown': {
      if (rest.length !== 2) return path.join('.');
      const [name, prop] = rest;
      return catalog.spells.has(name) && COOLDOWN_PROPS.has(prop) ? null : path.join('.');
    }
    case 'talent':
      return rest.length === 1 || (rest.length === 2 && rest[1] === 'enabled') ? null : path.join('.');
    case 'combo_strike':
      return rest.length === 0 ? null : path.join('.');
    case 'variable':
      return rest.length === 1 ? null : path.join('.');
    case 'prev_gcd':
      return rest.length === 2 ? null : path.join('.');
    case 'prev':
      return rest.length === 1 ? null : path.join('.');
    case 'active_enemies':
    case 'fight_remains':
    case 'time':
      return rest.length === 0 ? null : path.join('.');
    case 'trinket': {
      if (rest.length < 2) return path.join('.');
      const [, ...trinketRest] = rest;
      if (trinketRest.length === 1 && ['up', 'has_use_buff'].includes(trinketRest[0])) return null;
      if (trinketRest.length === 2 && trinketRest[0] === 'cooldown' && ['remains', 'ready'].includes(trinketRest[1])) return null;
      if (trinketRest.length === 2 && trinketRest[0] === 'is') return null;
      return path.join('.');
    }
    case 'target':
      return (
        (rest.length === 1 && rest[0] === 'time_to_die') ||
        (rest.length === 2 && rest[0] === 'health' && rest[1] === 'pct') ||
        (rest.length === 3 && rest[0] === 'debuff' && rest[1] === 'casting' && rest[2] === 'react')
      )
        ? null
        : path.join('.');
    case 'fight_style':
      return rest.length === 1 ? null : path.join('.');
    case 'gcd':
      return rest.length === 1 && rest[0] === 'max' ? null : path.join('.');
    case 'movement':
      return rest.length === 1 && rest[0] === 'distance' ? null : path.join('.');
    case 'pet':
      return rest.length === 2 && rest[1] === 'active' ? null : path.join('.');
    default:
      return path.join('.');
  }
}

export function collectAplCompatibilityIssues(
  actionLists: ActionList[],
  catalog: AplCompatibilityCatalog = DEFAULT_CATALOG,
): AplCompatibilityIssues {
  const unsupportedActions = new Set<string>();
  const unsupportedProperties = new Set<string>();
  const unsupportedTargetIfActions = new Set<string>();

  for (const list of actionLists) {
    for (const action of list.actions) {
      if (action.type === 'cast' && !catalog.spells.has(action.ability)) {
        unsupportedActions.add(action.ability);
      }
      if (action.type === 'cast' && action.targetIf) {
        if (!SUPPORTED_TARGET_IF_MODES.has(action.targetIf.mode)) {
          unsupportedTargetIfActions.add(action.ability);
        }
      }

      visitActionAst(action, (node) => {
        if (node.kind !== 'PropertyAccess') return;
        const unsupported = validatePropertyPath(node.path, catalog);
        if (unsupported !== null) {
          unsupportedProperties.add(unsupported);
        }
      });
    }
  }

  return { unsupportedActions, unsupportedProperties, unsupportedTargetIfActions };
}

export function findUnexpectedDefaultAplCompatibilityIssues(
  actionLists: ActionList[],
  catalog: AplCompatibilityCatalog = DEFAULT_CATALOG,
): AplCompatibilityIssues {
  const issues = collectAplCompatibilityIssues(actionLists, catalog);

  return {
    unsupportedActions: new Set(
      [...issues.unsupportedActions].filter((action) => !DEFAULT_APL_UNSUPPORTED_ACTION_ALLOWLIST.has(action))
    ),
    unsupportedProperties: new Set(
      [...issues.unsupportedProperties].filter((path) => !DEFAULT_APL_UNSUPPORTED_PROPERTY_ALLOWLIST.has(path))
    ),
    unsupportedTargetIfActions: new Set(
      [...issues.unsupportedTargetIfActions].filter((action) => !DEFAULT_APL_UNSUPPORTED_TARGET_IF_ALLOWLIST.has(action))
    ),
  };
}
