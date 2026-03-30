/**
 * APL Action List Parser for SimulationCraft (SimC) `.simc` files.
 *
 * Converts raw SimC action list text into structured ActionList[] that the
 * simulation engine's APL bot can execute.
 *
 * Pipeline stage:
 *   .simc text → actionList parser → ActionList[] → APL runner
 */

import { tokenize } from './tokenizer';
import { parse } from './parser';
import type { AstNode } from './parser';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Variable mutation operations supported by SimC APL. */
export type VariableOp = 'set' | 'min' | 'max' | 'add' | 'sub' | 'mul' | 'div' | 'pow' | 'reset';

/**
 * Sub-list execution behaviour.
 *
 * - `'call'` — `call_action_list`: if no action fires in the sub-list,
 *   execution continues with the next action in the caller.
 * - `'run'`  — `run_action_list`: after walking the sub-list, stop regardless.
 */
export type ActionListCallType = 'call' | 'run';

/** A parsed `if=` condition, storing both the AST and the original source text. */
export interface ParsedCondition {
  /** Parsed AST (from the Pratt parser). Numeric dot-segments are slot-prefixed (e.g. `slot1`). */
  ast: AstNode;
  /** Original `if=` expression text for debugging (before pre-processing). */
  source: string;
}

/** Parsed `target_if=` selector, split into aggregation mode and expression. */
export interface ParsedTargetIf {
  /** Aggregation mode, e.g. `"max"` in `target_if=max:target.time_to_die`. */
  mode: string;
  /** Parsed selector expression after the `:`. */
  selector: ParsedCondition;
  /** Original `target_if=` source text. */
  source: string;
}

/** Shared base for all action types. */
export interface BaseAction {
  condition?: ParsedCondition;
}

/** A regular ability cast (including potions, racials, use_items, etc.). */
export interface CastAction extends BaseAction {
  type: 'cast';
  /** SimC ability name, e.g. `"tiger_palm"`, `"fists_of_fury"`. */
  ability: string;
  /** Parsed `target_if=` selector. Evaluated by the APL runner for target-selection semantics. */
  targetIf?: ParsedTargetIf;
  /** Additional SimC key/value params such as `name=` or `slot=` for use_item actions. */
  params?: Record<string, string>;
}

/** A call to a named sub-action-list. */
export interface CallListAction extends BaseAction {
  type: 'call_list';
  /** Name of the sub-list to execute. */
  listName: string;
  callType: ActionListCallType;
}

/** A variable mutation action. */
export interface VariableAction extends BaseAction {
  type: 'variable';
  /** Variable name. */
  name: string;
  op: VariableOp;
  /** Parsed `value=` expression (defaults to `NumberLiteral(0)` for `op=reset`). */
  valueExpr: AstNode;
}

export type Action = CastAction | CallListAction | VariableAction;

/** A named action list (e.g. `"default"` or `"cooldowns"`). */
export interface ActionList {
  /** `"default"` for `actions+=…`, or the dotted name for `actions.X+=…`. */
  name: string;
  actions: Action[];
}

// ---------------------------------------------------------------------------
// ActionListParseError
// ---------------------------------------------------------------------------

/**
 * Thrown when the action list parser encounters a structurally invalid line.
 */
export class ActionListParseError extends Error {
  constructor(
    message: string,
    public readonly line: string,
  ) {
    super(message);
    this.name = 'ActionListParseError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Valid VariableOp values for fast validation. */
const VARIABLE_OPS = new Set<string>([
  'set', 'min', 'max', 'add', 'sub', 'mul', 'div', 'pow', 'reset',
]);

/**
 * Pre-process an APL expression string so that numeric dot-path segments
 * (e.g. `prev_gcd.1.tiger_palm`) are converted to identifier-safe equivalents
 * (`prev_gcd.slot1.tiger_palm`) before tokenizing.
 *
 * The evaluator resolves `slot1` → index 1 (stripping the `slot` prefix).
 *
 * The original source string is preserved separately for debugging.
 *
 * // Note: only handles positive integer numeric segments (e.g. .1., .2.)
 * // Floating-point numeric segments are not supported (rare in practice)
 */
function preprocessExpr(expr: string): string {
  return expr
    .replace(/\.(\d+)\./g, (_m, n: string) => `.slot${n}.`)
    .replace(/\.(\d+)$/, (_m, n: string) => `.slot${n}`);
}

/**
 * Parse an APL expression string into an AST node.
 * Pre-processes numeric dot-segments before tokenizing.
 */
function parseExpr(expr: string): AstNode {
  const processed = preprocessExpr(expr);
  return parse(tokenize(processed));
}

/**
 * Parse an optional `if=` condition from a key-value map.
 * Returns `undefined` if the `if` key is absent.
 */
function parseCondition(kv: Map<string, string>): ParsedCondition | undefined {
  const src = kv.get('if');
  if (src === undefined) return undefined;
  return { ast: parseExpr(src), source: src };
}

/**
 * Parse an optional `target_if=` selector.
 *
 * SimC uses a special `mode:expr` form such as `max:target.time_to_die`.
 * We preserve the mode separately and parse only the expression suffix.
 */
function parseTargetIf(kv: Map<string, string>): ParsedTargetIf | undefined {
  const src = kv.get('target_if');
  if (src === undefined) return undefined;

  const colonIdx = src.indexOf(':');
  if (colonIdx <= 0 || colonIdx === src.length - 1) {
    throw new ActionListParseError(
      "target_if is missing required 'mode:expression' format",
      `target_if=${src}`,
    );
  }

  const mode = src.slice(0, colonIdx).trim();
  const selectorSource = src.slice(colonIdx + 1).trim();
  return {
    mode,
    selector: { ast: parseExpr(selectorSource), source: selectorSource },
    source: src,
  };
}

/**
 * Split a comma-separated SimC parameter string into top-level segments,
 * respecting parentheses depth so that commas inside function calls
 * (e.g. `min(chi,3)`) are not treated as KV separators.
 */
function splitTopLevelCommas(s: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      segments.push(s.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(s.slice(start));
  return segments;
}

/**
 * Split a SimC key=value parameter string into a flat Map.
 *
 * The tricky bit: `value=` can itself contain `=` signs (e.g. APL expressions
 * like `buff.foo.up=0`) AND commas inside function calls (e.g. `value=min(chi,3)`).
 *
 * Strategy: split the parameter string by commas that are NOT inside parentheses,
 * then for each segment split on the first `=` to get key/value. This correctly
 * handles `value=min(chi,3)` (the comma is inside parens, so it is not a segment
 * boundary) as well as `value=...,op=set` (op= is a separate top-level segment).
 *
 * Returns the key-value map (does NOT include the action name itself).
 */
function parseActionParams(paramStr: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!paramStr) return result;

  for (const part of splitTopLevelCommas(paramStr)) {
    if (!part.trim()) continue;
    const eqIdx = part.indexOf('=');
    // Skip segments without '=' (malformed/bare words) or with an empty key
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    result.set(key, val);
  }

  return result;
}

function buildCastParams(kv: Map<string, string>): Record<string, string> | undefined {
  const params: Record<string, string> = {};
  for (const [key, value] of kv.entries()) {
    if (key === 'if' || key === 'target_if') continue;
    params[key] = value;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

// ---------------------------------------------------------------------------
// Line pattern
// ---------------------------------------------------------------------------

/**
 * Match a SimC APL line.
 *
 * Captures:
 *   [1] optional list name (after the dot, before `+=` or `=`)
 *   [2] `+` (present) or `` (absent — initial `=` assignment)
 *   [3] everything after the `/` (action name + optional params)
 *
 * Handles both `actions+=/<action>` and `actions=<action>` forms.
 * Also handles `actions.name+=/<action>` and `actions.name=<action>`.
 */
const LINE_RE = /^actions(?:\.([a-z_][a-z0-9_]*))?(\+)?=\/?(.+)$/;

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse SimC `.simc` action list text into structured ActionList[].
 *
 * @param input - Raw text from a `.simc` file (multiple lines).
 * @returns Ordered array of ActionList objects; each list preserves the
 *          insertion order of its actions as they appear in the source.
 * @throws {ActionListParseError} For structurally invalid action lines.
 */
export function parseActionLists(input: string): ActionList[] {
  // Ordered list names (preserves encounter order)
  const order: string[] = [];
  const listMap = new Map<string, Action[]>();

  function getList(name: string): Action[] {
    if (!listMap.has(name)) {
      order.push(name);
      listMap.set(name, []);
    }
    // Safe: we just ensured the key exists above.
    const existing = listMap.get(name);
    if (existing === undefined) throw new ActionListParseError('Internal: list missing after set', name);
    return existing;
  }

  const lines = input.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    const m = LINE_RE.exec(line);
    if (!m) {
      // Not an actions= line — skip (could be profile metadata, etc.)
      continue;
    }

    const listName = m[1] ?? 'default';
    // m[2] is '+' for +=, undefined for plain =  (both are valid, we treat identically)
    const rest = m[3].trim();

    // Split action name from key=value params
    // The action name is everything up to the first comma
    const commaIdx = rest.indexOf(',');
    const actionName = commaIdx === -1 ? rest : rest.slice(0, commaIdx);
    const paramStr = commaIdx === -1 ? '' : rest.slice(commaIdx + 1);
    const kv = parseActionParams(paramStr);

    const condition = parseCondition(kv);
    const targetIf = parseTargetIf(kv);
    const actions = getList(listName);

    // ------------------------------------------------------------------
    // call_action_list / run_action_list
    // ------------------------------------------------------------------
    if (actionName === 'call_action_list' || actionName === 'run_action_list') {
      const subListName = kv.get('name');
      if (!subListName) {
        throw new ActionListParseError(
          `${actionName} is missing required 'name=' parameter`,
          line,
        );
      }
      const callType: ActionListCallType =
        actionName === 'run_action_list' ? 'run' : 'call';
      const action: CallListAction = { type: 'call_list', listName: subListName, callType };
      if (condition) action.condition = condition;
      actions.push(action);
      continue;
    }

    // ------------------------------------------------------------------
    // variable
    // ------------------------------------------------------------------
    if (actionName === 'variable') {
      const varName = kv.get('name');
      if (!varName) {
        throw new ActionListParseError(
          "variable action is missing required 'name=' parameter",
          line,
        );
      }

      const opRaw = kv.get('op') ?? 'set';
      if (!VARIABLE_OPS.has(opRaw)) {
        throw new ActionListParseError(
          `variable action has unknown op='${opRaw}'`,
          line,
        );
      }
      const op = opRaw as VariableOp;

      const valueStr = kv.get('value');

      let valueExpr: AstNode;
      if (valueStr !== undefined) {
        valueExpr = parseExpr(valueStr);
      } else if (op === 'reset') {
        // op=reset with no value defaults to 0
        valueExpr = { kind: 'NumberLiteral', value: 0 };
      } else {
        throw new ActionListParseError(
          `variable action with op='${op}' is missing required 'value=' parameter`,
          line,
        );
      }

      const action: VariableAction = { type: 'variable', name: varName, op, valueExpr };
      if (condition) action.condition = condition;
      actions.push(action);
      continue;
    }

    // ------------------------------------------------------------------
    // Everything else → CastAction
    // ------------------------------------------------------------------
    const action: CastAction = {
      type: 'cast',
      ability: actionName,
      params: buildCastParams(kv),
    };
    if (condition) action.condition = condition;
    if (targetIf) action.targetIf = targetIf;
    actions.push(action);
  }

  // Build final ordered array
  return order.map((name) => {
    const actions = listMap.get(name);
    if (actions === undefined) throw new ActionListParseError('Internal: list missing during output', name);
    return { name, actions };
  });
}
