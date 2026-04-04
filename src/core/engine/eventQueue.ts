/**
 * Event queue for the WoW Rotation Trainer combat simulation engine.
 *
 * Implements a generic binary min-heap priority queue (`PriorityQueue<T>`) and a
 * specialised `SimEventQueue` that orders `SimEvent` entries by simulation time.
 * Equal-time events are returned in FIFO (insertion) order — achieved by tagging
 * each inserted item with a monotonically-increasing sequence number and using it
 * as a tie-breaker in the comparator.
 */

// ---------------------------------------------------------------------------
// SimEvent type definitions
// ---------------------------------------------------------------------------

export enum EventType {
  ENCOUNTER_START,
  ENCOUNTER_END,
  GCD_READY,
  OFF_GCD_READY,
  RESOURCE_THRESHOLD_READY,
  PLAYER_INPUT,
  PLAYER_CANCEL,
  QUEUED_ABILITY_FIRE,
  CAST_START,
  ABILITY_CAST,
  CHANNEL_START,
  CHANNEL_TICK,
  DOT_TICK,
  CHANNEL_END,
  COOLDOWN_READY,
  BUFF_APPLY,
  BUFF_EXPIRE,
  BUFF_STACK_CHANGE,
  AUTO_ATTACK_MH,
  AUTO_ATTACK_OH,
  DELAYED_SPELL_IMPACT,
  ENERGY_CAP_CHECK,
  TIGEREYE_BREW_TICK,
  COMBAT_WISDOM_TICK,
}

// Use string literal IDs initially — SpellId and BuffId will be defined more precisely later
export type SpellId = string;
export type BuffId = string;

import type { ActionCastContext } from './action';

// DamageSnapshot is defined in damage.ts — import for local use and re-export for consumers
import type { DamageSnapshot } from './damage';
export type { DamageSnapshot };

export type SimEvent =
  | { type: EventType.ENCOUNTER_START | EventType.ENCOUNTER_END; time: number }
  | {
      type:
        | EventType.GCD_READY
        | EventType.OFF_GCD_READY
        | EventType.QUEUED_ABILITY_FIRE;
      time: number;
      token?: number;
    }
  | { type: EventType.RESOURCE_THRESHOLD_READY; time: number; token: number }
  | { type: EventType.PLAYER_INPUT; time: number; ability: SpellId }
  | { type: EventType.PLAYER_CANCEL; time: number }
  | { type: EventType.CAST_START; time: number; spellId: SpellId; duration: number; castId: number }
  | {
      type: EventType.ABILITY_CAST;
      time: number;
      spellId: SpellId;
      castId?: number;
      isComboStrike?: boolean;
      castContext?: ActionCastContext;
    }
  | {
      type: EventType.CHANNEL_START;
      time: number;
      spellId: SpellId;
      snapshot: DamageSnapshot;
      channelId?: number;
      /** Haste-scaled channel duration in seconds */
      duration: number;
    }
  | {
      type: EventType.CHANNEL_TICK;
      time: number;
      spellId: SpellId;
      tickNumber: number;
      snapshot: DamageSnapshot;
      channelId?: number;
      /** Total number of ticks for this channel (for debug log "N of M" display). */
      totalTicks: number;
    }
  | {
      type: EventType.DOT_TICK;
      time: number;
      spellId: SpellId;
      debuffId: BuffId;
      targetId: number;
      dotInstanceId: number;
      tickNumber: number;
      snapshot: DamageSnapshot;
      /** Total number of ticks for this dot (for debug log "N of M" display). */
      totalTicks: number;
    }
  | {
      type: EventType.CHANNEL_END;
      time: number;
      spellId: SpellId;
      channelId?: number;
      interrupted?: boolean;
    }
  | { type: EventType.COOLDOWN_READY; time: number; spellId: SpellId }
  | { type: EventType.BUFF_APPLY; time: number; buffId: BuffId; stacks?: number; duration?: number }
  | { type: EventType.BUFF_EXPIRE; time: number; buffId: BuffId }
  | {
      type: EventType.BUFF_STACK_CHANGE;
      time: number;
      buffId: BuffId;
      stacks: number;
      /** Stack count before this change (used to distinguish increase from timer refresh). */
      prevStacks: number;
    }
  | { type: EventType.AUTO_ATTACK_MH | EventType.AUTO_ATTACK_OH; time: number }
  | {
      type: EventType.DELAYED_SPELL_IMPACT;
      time: number;
      spellId: SpellId;
      castContext?: ActionCastContext;
      targetId?: number;
      targetCount?: number;
    }
  | { type: EventType.ENERGY_CAP_CHECK; time: number }
  | { type: EventType.TIGEREYE_BREW_TICK; time: number }
  | { type: EventType.COMBAT_WISDOM_TICK; time: number };

// ---------------------------------------------------------------------------
// Generic PriorityQueue<T>
// ---------------------------------------------------------------------------

/**
 * A binary min-heap priority queue.
 *
 * @typeParam T - The element type stored in the queue.
 *
 * The `comparator` function follows the same convention as `Array.prototype.sort`:
 *   - negative  → `a` has higher priority (extracted first)
 *   - zero      → equal priority
 *   - positive  → `b` has higher priority (extracted first)
 */
export class PriorityQueue<T> {
  private readonly heap: T[] = [];
  private readonly comparator: (a: T, b: T) => number;

  constructor(comparator: (a: T, b: T) => number) {
    this.comparator = comparator;
  }

  /** Number of elements currently in the queue. */
  size(): number {
    return this.heap.length;
  }

  /** Returns `true` when the queue contains no elements. */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Insert an element into the queue in O(log n).
   */
  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * Remove and return the highest-priority element in O(log n).
   * @throws {Error} if the queue is empty.
   */
  pop(): T {
    if (this.heap.length === 0) {
      throw new Error('PriorityQueue: pop() called on empty queue');
    }

    const top = this.heap[0];
    const last = this.heap.pop();

    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      this.sinkDown(0);
    }

    return top;
  }

  /**
   * Return the highest-priority element without removing it in O(1).
   * @throws {Error} if the queue is empty.
   */
  peek(): T {
    if (this.heap.length === 0) {
      throw new Error('PriorityQueue: peek() called on empty queue');
    }
    return this.heap[0];
  }

  /** Remove all elements from the queue. */
  clear(): void {
    this.heap.length = 0;
  }

  // -------------------------------------------------------------------------
  // Private heap helpers
  // -------------------------------------------------------------------------

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.comparator(this.heap[index], this.heap[parent]) < 0) {
        this.swap(index, parent);
        index = parent;
      } else {
        break;
      }
    }
  }

  private sinkDown(index: number): void {
    const n = this.heap.length;

    for (;;) {
      const left = (index << 1) + 1;
      const right = left + 1;
      let smallest = index;

      if (left < n && this.comparator(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && this.comparator(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }

      if (smallest === index) break;

      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const tmp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = tmp;
  }
}

// ---------------------------------------------------------------------------
// SimEventQueue
// ---------------------------------------------------------------------------

/** Internal wrapper stored in the heap — pairs each SimEvent with a sequence
 *  number so that equal-time events are broken in FIFO (insertion) order. */
interface HeapEntry {
  event: SimEvent;
  seq: number;
}

/**
 * Priority queue specialised for `SimEvent`.
 *
 * Events are ordered by ascending `time`.  When two events share the same
 * timestamp they are returned in the order they were inserted (FIFO stable).
 */
export class SimEventQueue {
  private readonly pq: PriorityQueue<HeapEntry>;
  private seq = 0;

  constructor() {
    // NOTE: time should be in seconds (float) — equal-time events are ordered by insertion (FIFO)
    this.pq = new PriorityQueue<HeapEntry>((a, b) => {
      if (a.event.time < b.event.time) return -1;
      if (a.event.time > b.event.time) return 1;
      return a.seq - b.seq; // FIFO tie-break
    });
  }

  /** Insert a `SimEvent` into the queue. O(log n). */
  push(event: SimEvent): void {
    this.pq.push({ event, seq: this.seq++ });
  }

  /**
   * Remove and return the earliest `SimEvent`. O(log n).
   * @throws {Error} if the queue is empty.
   */
  pop(): SimEvent {
    return this.pq.pop().event;
  }

  /**
   * Return the earliest `SimEvent` without removing it. O(1).
   * @throws {Error} if the queue is empty.
   */
  peek(): SimEvent {
    return this.pq.peek().event;
  }

  /** Number of events currently in the queue. */
  size(): number {
    return this.pq.size();
  }

  /** Returns `true` when the queue contains no events. */
  isEmpty(): boolean {
    return this.pq.isEmpty();
  }

  /** Remove all events from the queue. */
  clear(): void {
    this.pq.clear();
    this.seq = 0;
  }
}
