import { describe, expect, it } from "vitest";
import { CONSTELLATION } from "@/lib/vivid/morph-targets";
import {
  DEFAULT_TIMING,
  FormSequencer,
  HUMAN,
  SHOWCASE,
  showcaseAt,
  turnAt,
} from "@/lib/vivid/sequencer";

const T = DEFAULT_TIMING;
const CYCLE = T.showcaseHold + T.restBetween;

describe("turnAt", () => {
  it("rests before showing anything off", () => {
    expect(turnAt(0, T)).toBeNull();
    expect(turnAt(T.restAfterTalk - 1, T)).toBeNull();
    expect(turnAt(T.restAfterTalk, T)).toBe(0);
  });

  it("returns to the constellation between showcases", () => {
    // The form has to come apart and go home, or the rotation reads as a
    // slideshow of objects rather than as one thing changing shape.
    expect(turnAt(T.restAfterTalk + T.showcaseHold - 1, T)).toBe(0);
    expect(turnAt(T.restAfterTalk + T.showcaseHold, T)).toBeNull();
    expect(turnAt(T.restAfterTalk + CYCLE, T)).toBe(1);
  });

  it("counts turns without drifting", () => {
    // Measured from the start every time rather than accumulated, so a dropped
    // frame or a backgrounded tab cannot shift the rotation.
    for (const turn of [0, 1, 7, 40, 999]) {
      expect(turnAt(T.restAfterTalk + turn * CYCLE + 10, T)).toBe(turn);
    }
  });

  it("gives the same answer for the same moment", () => {
    const at = T.restAfterTalk + 3 * CYCLE + 500;
    expect(turnAt(at, T)).toBe(turnAt(at, T));
  });
});

describe("showcaseAt", () => {
  it("visits every slot before repeating one", () => {
    const first = SHOWCASE.map((_, i) => showcaseAt(i));
    expect(new Set(first).size).toBe(SHOWCASE.length);
  });

  it("steps the cars one at a time", () => {
    // There are seven cars and four slots. If a slot advanced on every turn
    // rather than on its own turns, the cars would jump four models between
    // appearances and most would never be seen.
    const cars = SHOWCASE[0];
    for (let round = 0; round < cars.length; round++) {
      expect(showcaseAt(round * SHOWCASE.length)).toBe(cars[round]);
    }
  });

  it("shows every car eventually", () => {
    const seen = new Set<string>();
    for (let turn = 0; turn < SHOWCASE.length * SHOWCASE[0].length; turn++) {
      seen.add(showcaseAt(turn));
    }
    for (const car of SHOWCASE[0]) expect(seen.has(car)).toBe(true);
  });

  it("never runs out", () => {
    expect(typeof showcaseAt(100_000)).toBe("string");
  });
});

describe("FormSequencer", () => {
  it("stays home while assembling", () => {
    expect(new FormSequencer().formFor(0, "assembling")).toBe(CONSTELLATION);
  });

  it("becomes human the moment she is addressed", () => {
    const s = new FormSequencer();
    expect(s.formFor(0, "idle")).toBe(CONSTELLATION);
    expect(s.formFor(100, "listening")).toBe(HUMAN);
  });

  it("holds one form for the whole of a conversation", () => {
    // The rule the sequencer exists to enforce. A form change landing in the
    // middle of a sentence would read as a glitch, so while she is being
    // spoken to the answer must not depend on the clock at all.
    const s = new FormSequencer();
    const forms = new Set<string>();
    let now = 0;
    for (const state of ["listening", "thinking", "speaking", "speaking", "thinking"] as const) {
      for (let i = 0; i < 40; i++) {
        now += 1_000;
        forms.add(s.formFor(now, state));
      }
    }
    expect([...forms]).toEqual([HUMAN]);
  });

  it("does not advertise the moment she stops talking", () => {
    const s = new FormSequencer();
    s.formFor(0, "speaking");
    expect(s.formFor(1_000, "idle")).toBe(CONSTELLATION);
    expect(s.formFor(1_000 + T.restAfterTalk - 1, "idle")).toBe(CONSTELLATION);
    expect(s.formFor(1_000 + T.restAfterTalk, "idle")).toBe(showcaseAt(0));
  });

  it("runs the rotation while she is left alone", () => {
    const s = new FormSequencer();
    const at = (ms: number) => s.formFor(ms, "idle");
    expect(at(0)).toBe(CONSTELLATION);
    expect(at(T.restAfterTalk)).toBe(showcaseAt(0));
    expect(at(T.restAfterTalk + T.showcaseHold + 1)).toBe(CONSTELLATION);
    expect(at(T.restAfterTalk + CYCLE)).toBe(showcaseAt(1));
    expect(at(T.restAfterTalk + 2 * CYCLE)).toBe(showcaseAt(2));
  });

  it("picks up the rotation where it left off after a conversation", () => {
    // Otherwise every conversation is followed by the same car, and a visitor
    // who talks to her twice sees the showcase reset both times.
    const s = new FormSequencer();
    // The idle clock starts on the first call, so it has to be started.
    s.formFor(0, "idle");
    expect(s.formFor(T.restAfterTalk, "idle")).toBe(showcaseAt(0));
    expect(s.formFor(T.restAfterTalk + CYCLE, "idle")).toBe(showcaseAt(1));

    s.formFor(60_000, "listening");
    s.formFor(61_000, "speaking");

    expect(s.formFor(70_000, "idle")).toBe(CONSTELLATION);
    expect(s.formFor(70_000 + T.restAfterTalk, "idle")).toBe(showcaseAt(2));
  });

  it("restarts the rest each time she is addressed", () => {
    const s = new FormSequencer();
    s.formFor(0, "idle");
    s.formFor(T.restAfterTalk - 500, "idle");
    // Interrupted just before the first showcase was due.
    s.formFor(T.restAfterTalk - 400, "listening");
    s.formFor(T.restAfterTalk - 300, "idle");
    expect(s.formFor(T.restAfterTalk + 200, "idle")).toBe(CONSTELLATION);
  });

  describe("upcoming", () => {
    it("names the next form while resting, so it can be fetched in time", () => {
      const s = new FormSequencer();
      s.formFor(0, "idle");
      expect(s.upcoming(0, "idle")).toBe(showcaseAt(0));
    });

    it("says nothing once the form it predicted is on screen", () => {
      const s = new FormSequencer();
      s.formFor(0, "idle");
      s.formFor(T.restAfterTalk, "idle");
      expect(s.upcoming(T.restAfterTalk, "idle")).toBeNull();
    });

    it("looks past the form currently showing", () => {
      const s = new FormSequencer();
      s.formFor(0, "idle");
      s.formFor(T.restAfterTalk, "idle");
      const resting = T.restAfterTalk + T.showcaseHold + 100;
      expect(s.formFor(resting, "idle")).toBe(CONSTELLATION);
      expect(s.upcoming(resting, "idle")).toBe(showcaseAt(1));
    });

    it("predicts nothing while she is busy", () => {
      const s = new FormSequencer();
      expect(s.upcoming(0, "speaking")).toBeNull();
      expect(s.upcoming(0, "listening")).toBeNull();
    });
  });
});
