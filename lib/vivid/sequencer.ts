// What form should be on screen, and when.
//
// The rule the whole thing exists to enforce: the sequencer PROPOSES, the state
// decides. She is a presence first and a showreel second, so nothing the
// sequencer wants can interrupt her while she is being spoken to. That falls
// out of the shape here rather than being policed by a flag: whenever she is
// not idle the answer is a constant, so there is nothing to change mid-sentence.
//
// Timing is measured, never accumulated, so a dropped frame or a backgrounded
// tab cannot make the rotation drift.

import { CONSTELLATION } from "@/lib/vivid/morph-targets";
import type { VividState } from "@/lib/vivid/state";

/**
 * Who she is when addressed.
 *
 * Fixed, not rotated. The interface calls her "she" in all five languages, and
 * a presence that changes sex between one sentence and the next is not a
 * presence. The male bust stays registered for the form controls.
 */
export const HUMAN = "human-female";

export interface SequencerTiming {
  /** Constellation held after a conversation, before showing anything off. */
  restAfterTalk: number;
  /** How long one business form stays up. */
  showcaseHold: number;
  /** Constellation held between two showcases. */
  restBetween: number;
}

export const DEFAULT_TIMING: SequencerTiming = {
  // Long enough that the end of a conversation is not immediately followed by
  // an advert, short enough that a page left open still has something to watch.
  restAfterTalk: 14_000,
  showcaseHold: 9_000,
  restBetween: 6_000,
};

/**
 * The businesses, as slots rather than a flat list.
 *
 * Each slot is one turn of the rotation, and a slot with several members hands
 * out the next one each time its turn comes round. There are seven cars: flat,
 * they would be seven turns out of ten and the rotation would read as a car
 * showroom that occasionally shows a building.
 */
export const SHOWCASE: readonly (readonly string[])[] = [
  [
    "car-falcon",
    "car-c-series",
    "car-og-series",
    "car-passion",
    "car-r2",
    "car-v-series",
    "car-vc-series",
  ],
  ["interlink"],
  ["building"],
];

/** The form for a given turn of the rotation, counted from the first ever. */
export function showcaseAt(turn: number, showcase = SHOWCASE): string {
  const slot = showcase[turn % showcase.length];
  // Each slot advances only on its own turns, so the cars step one at a time
  // rather than jumping four models forward between appearances.
  const round = Math.floor(turn / showcase.length);
  return slot[round % slot.length];
}

/**
 * Where the rotation is within one stretch of idleness.
 *
 * Returns the turn number to show, or null while resting. Pure: the same
 * elapsed time always gives the same answer.
 */
export function turnAt(idleFor: number, timing: SequencerTiming): number | null {
  if (idleFor < timing.restAfterTalk) return null;
  const cycle = timing.showcaseHold + timing.restBetween;
  const since = idleFor - timing.restAfterTalk;
  if (since % cycle >= timing.showcaseHold) return null;
  return Math.floor(since / cycle);
}

export class FormSequencer {
  private idleSince: number | null = null;
  /** Turns completed before the current stretch of idleness began. */
  private turnsBefore = 0;
  private lastTurn: number | null = null;

  constructor(
    private readonly timing: SequencerTiming = DEFAULT_TIMING,
    private readonly showcase: readonly (readonly string[])[] = SHOWCASE
  ) {}

  /**
   * The form that should be on screen now.
   *
   * Safe to call every frame: it is a few comparisons and returns the same
   * answer until the clock moves it on.
   */
  formFor(now: number, state: VividState): string {
    if (state !== "idle") {
      // Addressed. Everything the rotation wanted is dropped, and the answer
      // stays constant until she is idle again, so no form change can land in
      // the middle of a sentence.
      this.idleSince = null;
      return state === "assembling" ? CONSTELLATION : HUMAN;
    }

    if (this.idleSince === null) {
      this.idleSince = now;
      // Carry the rotation across the conversation rather than restarting it,
      // or every conversation would be followed by the same car.
      if (this.lastTurn !== null) this.turnsBefore = this.lastTurn + 1;
      this.lastTurn = null;
    }

    const turn = turnAt(now - this.idleSince, this.timing);
    if (turn === null) return CONSTELLATION;
    const absolute = this.turnsBefore + turn;
    this.lastTurn = absolute;
    return showcaseAt(absolute, this.showcase);
  }

  /**
   * The form the rotation will want next, or null if it is not worth guessing.
   *
   * Used to fetch a form before it is due, so a showcase begins on time instead
   * of after a download. Only answers while she is idle and resting: during a
   * showcase the next one is far enough off to be someone else's problem, and
   * while she is speaking there is no rotation to predict.
   */
  upcoming(now: number, state: VividState): string | null {
    if (state !== "idle" || this.idleSince === null) return null;
    if (turnAt(now - this.idleSince, this.timing) !== null) return null;
    const next = this.lastTurn === null ? this.turnsBefore : this.lastTurn + 1;
    return showcaseAt(next, this.showcase);
  }
}
