import type { ActionList, CastAction } from '../apl/actionList';
import type { BuffDef, SpellDef } from '../data/spells/types';
import type { CharacterProfile } from '../data/profileParser';
import type { GameState } from '../engine/gameState';
import type { ClassModule } from '../class_modules/class_module';
import type { SimEvent, SimEventQueue } from '../engine/eventQueue';
import type { RngInstance } from '../engine/rng';

export interface SpecRuntimeEventResult {
  readonly handled: boolean;
  readonly damages?: readonly {
    readonly spellId: string;
    readonly amount: number;
    readonly isCrit: boolean;
  }[];
  readonly damage?: {
    readonly spellId: string;
    readonly amount: number;
    readonly isCrit: boolean;
  };
}

export interface SpecRuntime {
  readonly specId: string;
  readonly spells: ReadonlyMap<string, SpellDef>;
  readonly buffs: ReadonlyMap<string, BuffDef>;
  readonly defaultApl: string;
  readonly module: ClassModule;
  initializeState(state: GameState, profile: CharacterProfile): void;
  resolveActionSpell(action: CastAction, state: GameState): SpellDef | null;
  assertDefaultAplCompatibility(actionLists: ActionList[]): void;
  processScheduledEvent?(
    event: SimEvent,
    state: GameState,
    queue: SimEventQueue,
    rng: RngInstance,
    encounterDuration: number,
  ): SpecRuntimeEventResult;
}
