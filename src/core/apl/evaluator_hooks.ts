/**
 * Evaluator hook interface for spec/class modules.
 *
 * These hooks let spec modules extend buff resolution inside the APL evaluator
 * without embedding spec-specific branches in generic evaluator code.
 * Implementations are supplied by the spec runtime (e.g. monk_runtime.ts)
 * and attached to GameState before evaluation begins.
 */

import type { BuffState } from './evaluator';

export interface EvaluatorHooks {
  /**
   * Resolve a logical buff name to a BuffState.
   *
   * Called before the evaluator's default `state.buffs.get(name)` lookup.
   * Use this to implement multi-key aliases (e.g. `zenith` → `zenith` or
   * `celestial_conduit_active`) where the alias lookup needs custom priority
   * logic that cannot be expressed as a simple name remap.
   *
   * Return a `BuffState` (possibly from a different underlying key) to use
   * that value, or `undefined` to fall through to the standard lookup.
   */
  resolveBuffAlias?(
    buffName: string,
    lookupBuff: (name: string) => BuffState | undefined,
    currentTime: number,
  ): BuffState | undefined;

  /**
   * Handle a custom buff property query.
   *
   * Called before the evaluator attempts to answer `buff.<buffName>.<prop>`
   * via a standard `BuffState` lookup. Use this to implement spec-owned
   * counters that are not stored as ordinary buff stacks (e.g. `flurry_charge`
   * backed by a numeric state key).
   *
   * Return a number if the hook handled the query, or `undefined` to fall
   * through to normal `BuffState`-based resolution.
   */
  resolveCustomBuffState?(
    buffName: string,
    prop: string,
    lookupBuff: (name: string) => BuffState | undefined,
    currentTime: number,
    getNumericState: (stateId: string) => number,
  ): number | undefined;
}
