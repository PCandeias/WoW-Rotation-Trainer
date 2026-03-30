/**
 * APL Diagnostics — logs which actions were considered and why they were skipped.
 */

import type { GameState } from './gameState';
import type { EvalContext } from '../apl/evaluator';
import { evaluate } from '../apl/evaluator';
import type { Action, ActionList } from '../apl/actionList';
import type { SpellDef } from '../data/spells';
import type { SpecRuntime } from '../runtime/spec_runtime';
import { getAbilityFailReason } from './executor';

export interface AplDecisionLog {
  time: number;
  state: {
    chi: number;
    energy: number;
    gcdReady: number;
    activeChannel: string | null;
  };
  decisions: ActionDecision[];
  selectedAction: string | null;
  selectedSpell: string | null;
}

export interface ActionDecision {
  actionName: string;
  listName: string;
  reason: 'passed' | 'targetIf_failed' | 'condition_failed' | 'not_castable' | 'call_exhausted' | 'error';
  detail?: string;
}

export class AplDiagnosticsEngine {
  private logs: AplDecisionLog[] = [];

  reset(): void {
    this.logs = [];
  }

  walkActionListWithDiagnostics(
    list: ActionList,
    allLists: ActionList[],
    state: GameState,
    ctx: EvalContext,
    runtime: SpecRuntime,
    parentPath = '',
  ): { spell: SpellDef | null; decisions: ActionDecision[] } {
    const decisions: ActionDecision[] = [];
    const listPath = parentPath ? `${parentPath}/${list.name}` : list.name;

    for (const action of list.actions) {
      if (action.type === 'cast') {
        const castAction = action;
        const spell = runtime.resolveActionSpell(castAction, state);
        if (!spell) {
          decisions.push({
            actionName: getActionDiagnosticName(castAction),
            listName: listPath,
            reason: 'not_castable',
            detail: 'unknown_spell',
          });
          continue;
        }

        // target_if check
        if (castAction.targetIf) {
          try {
            evaluate(castAction.targetIf.selector.ast, state, ctx);
          } catch (e) {
            decisions.push({
              actionName: getActionDiagnosticName(castAction),
              listName: listPath,
              reason: 'targetIf_failed',
              detail: (e as Error).message,
            });
            continue;
          }
        }

        // condition check
        if (castAction.condition) {
          const castCtx: EvalContext = { ...ctx, candidateAbility: spell.name };
          try {
            const val = evaluate(castAction.condition.ast, state, castCtx);
            if (val === 0) {
              decisions.push({
                actionName: getActionDiagnosticName(castAction),
                listName: listPath,
                reason: 'condition_failed',
              });
              continue;
            }
          } catch (e) {
            decisions.push({
              actionName: getActionDiagnosticName(castAction),
              listName: listPath,
              reason: 'error',
              detail: (e as Error).message,
            });
            continue;
          }
        }

        // castability check using getAbilityFailReason
        const failReason = getAbilityFailReason(spell, state);
        if (failReason) {
          decisions.push({
            actionName: getActionDiagnosticName(castAction),
            listName: listPath,
            reason: 'not_castable',
            detail: failReason,
          });
          continue;
        }

        // This action can be cast
        decisions.push({
          actionName: getActionDiagnosticName(castAction),
          listName: listPath,
          reason: 'passed',
        });
        return { spell, decisions };
      }

      // condition check for non-cast actions
      if (action.condition) {
        try {
          const val = evaluate(action.condition.ast, state, ctx);
          if (val === 0) {
            decisions.push({
              actionName: getActionDiagnosticName(action),
              listName: listPath,
              reason: 'condition_failed',
            });
            continue;
          }
        } catch (e) {
          decisions.push({
            actionName: getActionDiagnosticName(action),
            listName: listPath,
            reason: 'error',
            detail: (e as Error).message,
          });
          continue;
        }
      }

      if (action.type === 'call_list') {
        const sub = allLists.find((al) => al.name === action.listName);
        if (!sub) {
          decisions.push({
            actionName: action.listName,
            listName: listPath,
            reason: 'not_castable',
            detail: 'list_not_found',
          });
          continue;
        }

        const result = this.walkActionListWithDiagnostics(sub, allLists, state, ctx, runtime, listPath);
        decisions.push(...result.decisions);

        if (result.spell !== null) {
          return { spell: result.spell, decisions };
        }

        // call_action_list continues to next action
        if (action.callType === 'run') {
          // run_action_list stops
          decisions.push({
            actionName: `${action.listName} (exhausted)`,
            listName: listPath,
            reason: 'call_exhausted',
          });
          return { spell: null, decisions };
        }

        continue;
      }

      if (action.type === 'variable') {
        // skip variable actions
        continue;
      }
    }

    return { spell: null, decisions };
  }

  recordDecision(log: AplDecisionLog): void {
    this.logs.push(log);
  }

  getLogs(): AplDecisionLog[] {
    return this.logs;
  }

  /**
   * Format a single GCD's decision log for human-readable output.
   */
  formatDecisionAtTime(time: number): string {
    const log = this.logs.find((l) => l.time === time);
    if (!log) return `[${time.toFixed(2)}s] No log found`;

    const lines: string[] = [];
    lines.push(`[${time.toFixed(2)}s] Chi=${log.state.chi} Energy=${log.state.energy} GCD=${log.state.gcdReady.toFixed(2)}s`);

    for (const d of log.decisions) {
      const emoji = d.reason === 'passed' ? '✓' : '✗';
      const detail = d.detail ? ` (${d.detail})` : '';
      lines.push(`  ${emoji} ${d.listName}/${d.actionName}: ${d.reason}${detail}`);
    }

    if (log.selectedAction) {
      lines.push(`  ▶ Selected: ${log.selectedAction} (${log.selectedSpell})`);
    } else {
      lines.push(`  ▶ No action selected (idle)`);
    }

    return lines.join('\n');
  }

  /**
   * Find all GCDs where action X was considered/selected.
   */
  findActionsInLog(actionName: string, spell?: string): AplDecisionLog[] {
    return this.logs.filter(
      (log) =>
        log.decisions.some((d) => d.actionName === actionName) ||
        (spell && log.selectedSpell === spell),
    );
  }

  /**
   * Compact summary for debugging (early GCDs, divergence points).
   */
  summarizeFirstDiverges(count = 3): string {
    const lines: string[] = [];
    lines.push(`=== First ${count} APL Decisions ===`);

    for (let i = 0; i < Math.min(count, this.logs.length); i++) {
      const log = this.logs[i];
      const decisions = log.decisions
        .filter((d) => d.reason === 'passed' || d.reason === 'condition_failed')
        .slice(0, 5);
      lines.push(`[${log.time.toFixed(2)}s] → ${log.selectedSpell ?? '(idle)'}`);
      for (const d of decisions) {
        if (d.reason === 'passed') {
          lines.push(`    ✓ ${d.actionName}`);
        } else {
          lines.push(`    ✗ ${d.actionName}`);
        }
      }
    }

    return lines.join('\n');
  }
}

function getActionDiagnosticName(action: Action): string {
  if (action.type === 'cast') {
    return action.ability;
  }
  if (action.type === 'call_list') {
    return action.listName;
  }
  return action.name;
}
