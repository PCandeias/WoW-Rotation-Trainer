/**
 * GameLoop — bridges wall-clock time to simulation time.
 *
 * Manages requestAnimationFrame loop, speed multiplier, pause/resume,
 * player input injection, and event processing.
 */

import { EventType } from './eventQueue';
import type { SimEvent } from './eventQueue';
import type { SimEventQueue } from './eventQueue';
import type { GameState } from './gameState';
import { drainQueue } from './spellQueue';

// ---------------------------------------------------------------------------
// GameLoopConfig
// ---------------------------------------------------------------------------

export interface GameLoopConfig {
  /** Simulation speed multiplier. Default: 1.0. */
  speedMultiplier?: number;
  /** Called after each frame with the current state and processed events. */
  onFrame?: (state: GameState, events: SimEvent[]) => void;
  /** Called when the encounter ends (simTime >= encounterDuration or ENCOUNTER_END event). */
  onEncounterEnd?: (state: GameState) => void;
}

function noopOnFrame(_state: GameState, _events: SimEvent[]): void {
  // Default callback intentionally does nothing.
}

function noopOnEncounterEnd(_state: GameState): void {
  // Default callback intentionally does nothing.
}

// ---------------------------------------------------------------------------
// GameLoop
// ---------------------------------------------------------------------------

export class GameLoop {
  private state: GameState;
  private queue: SimEventQueue;
  private config: Required<GameLoopConfig>;
  private speedMultiplier: number;
  private isRunning = false;
  private isPaused = false;
  private simTime = 0;
  private wallStartTime = 0;
  private pausedAt = 0;
  private totalPausedTime = 0;
  private rafHandle: number | null = null;

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------

  /** Current simulation time in seconds. */
  get currentSimTime(): number {
    return this.simTime;
  }

  /** Whether the loop is currently running (not stopped). */
  get running(): boolean {
    return this.isRunning;
  }

  /** Whether the loop is currently paused. */
  get paused(): boolean {
    return this.isPaused;
  }

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(state: GameState, queue: SimEventQueue, config?: GameLoopConfig) {
    this.state = state;
    this.queue = queue;
    this.speedMultiplier = config?.speedMultiplier ?? 1.0;
    this.config = {
      speedMultiplier: this.speedMultiplier,
      onFrame: config?.onFrame ?? noopOnFrame,
      onEncounterEnd: config?.onEncounterEnd ?? noopOnEncounterEnd,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start the loop. Idempotent — calling while already running is a no-op.
   * @param wallNow - Current wall-clock timestamp (performance.now() in production).
   */
  start(wallNow: number): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.wallStartTime = wallNow;
    this.totalPausedTime = 0;
    this.simTime = 0;
    this._scheduleFrame();
  }

  /**
   * Pause the loop. simTime stops advancing.
   * @param wallNow - Current wall-clock timestamp.
   */
  pause(wallNow: number): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    this.pausedAt = wallNow;
  }

  /**
   * Resume from a paused state.
   * @param wallNow - Current wall-clock timestamp.
   */
  resume(wallNow: number): void {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.totalPausedTime += wallNow - this.pausedAt;
    this._scheduleFrame();
  }

  /**
   * Stop the loop entirely (e.g. component unmount).
   */
  stop(): void {
    this.isRunning = false;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  /**
   * Inject a player ability press. Queues a PLAYER_INPUT event at current simTime.
   * @param spellId - The spell identifier to inject.
   */
  injectInput(spellId: string): void {
    this.queue.push({
      type: EventType.PLAYER_INPUT,
      time: this.simTime,
      ability: spellId,
    });
  }

  /**
   * Inject a player cancel input. Queues a PLAYER_CANCEL event at current simTime.
   */
  injectCancel(): void {
    this.queue.push({
      type: EventType.PLAYER_CANCEL,
      time: this.simTime,
    });
  }

  // ---------------------------------------------------------------------------
  // Frame processing
  // ---------------------------------------------------------------------------

  /**
   * Advance the simulation by processing a single frame.
   * Called by the rAF callback or directly in tests.
   *
   * @param wallNow - Wall-clock timestamp (performance.now()) for this frame.
   */
  tick(wallNow: number): void {
    this.rafHandle = null;
    if (!this.isRunning || this.isPaused) return;

    // Compute new simTime from wall-clock elapsed time
    const wallElapsed = (wallNow - this.wallStartTime - this.totalPausedTime) / 1000; // seconds
    const newSimTime = wallElapsed * this.speedMultiplier;

    // Clamp to encounter duration
    const maxTime = this.state.encounterDuration;
    this.simTime = Math.min(newSimTime, maxTime);
    this.state.currentTime = this.simTime;
    this.state.updateTimeBasedHealth();

    // Process all events with time <= current simTime
    const processedEvents: SimEvent[] = [];
    while (!this.queue.isEmpty()) {
      const next = this.queue.peek();
      if (next.time > this.simTime) break;
      const event = this.queue.pop();
      processedEvents.push(event);
      this._processEvent(event);
    }

    // Fire queued ability if GCD is ready
    const queued = drainQueue(this.state);
    if (queued) {
      this.queue.push({
        type: EventType.PLAYER_INPUT,
        time: this.simTime,
        ability: queued,
      });
    }

    this.config.onFrame(this.state, processedEvents);

    // Check encounter end
    if (this.simTime >= maxTime) {
      this.isRunning = false;
      this.config.onEncounterEnd(this.state);
      return;
    }

    this._scheduleFrame();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Process a single event. Handles structural events (ENCOUNTER_END) here;
   * combat events are handled externally via the onFrame callback.
   */
  private _processEvent(event: SimEvent): void {
    if (event.type === EventType.ENCOUNTER_END) {
      this.isRunning = false;
      this.config.onEncounterEnd(this.state);
    }
  }

  private _scheduleFrame(): void {
    if (!this.isRunning || this.isPaused || this.rafHandle !== null) {
      return;
    }

    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafHandle = requestAnimationFrame((ts) => this.tick(ts));
    }
  }
}
