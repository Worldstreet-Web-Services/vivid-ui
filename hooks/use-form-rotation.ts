"use client";

import { useEffect, type RefObject } from "react";
import { CONSTELLATION } from "@/lib/vivid/morph-targets";
import { FormSequencer } from "@/lib/vivid/sequencer";
import type { PresenceHandle } from "@/lib/vivid/scene";

// The rotation changes every few seconds, so it is polled rather than run off
// the render loop. Four times a second is far finer than anything it decides
// and costs a handful of comparisons.
const TICK = 250;

/**
 * Drives the form rotation from the presence's own state.
 *
 * The state is read back from the handle rather than passed in, because the
 * handle is what actually knows: React's copy arrives a render later, and a
 * rotation that acted on a stale state could morph her out of a sentence.
 */
export function useFormRotation(handle: RefObject<PresenceHandle | null>) {
  useEffect(() => {
    const sequencer = new FormSequencer();
    // Forms that failed to load. Without this the rotation would ask for a
    // missing car four times a second for as long as the tab is open.
    const unavailable = new Set<string>();

    const want = (name: string, presence: PresenceHandle) => {
      if (unavailable.has(name)) return false;
      if (presence.hasForm(name)) return true;
      void presence.loadForm(name).then((ok) => {
        if (!ok) unavailable.add(name);
      });
      return false;
    };

    const tick = () => {
      const presence = handle.current;
      if (!presence) return;
      const now = performance.now();
      const state = presence.getState();

      // A held form is being looked at on purpose, so while she is idle it
      // stands in for whatever the rotation wanted. It does not outrank her
      // being spoken to: the moment the state leaves idle the sequencer's
      // answer wins, exactly as it would with nothing held.
      const held = presence.getHeldForm();
      const proposed = sequencer.formFor(now, state);
      const next = held && state === "idle" ? held : proposed;
      // Home needs no fetch: it is where the particles already are.
      if (next !== presence.getMorphTarget()) {
        if (next === CONSTELLATION || want(next, presence)) presence.setMorphTarget(next);
      }

      // Fetch the next one during the gap, so a showcase starts on time rather
      // than after a download.
      const soon = sequencer.upcoming(now, state);
      if (soon) want(soon, presence);
    };

    const id = window.setInterval(tick, TICK);
    return () => window.clearInterval(id);
  }, [handle]);
}
