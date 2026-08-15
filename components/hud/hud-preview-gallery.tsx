"use client";

// The HUD primitives laid out for judging in isolation. Rendered by
// app/hud-preview/page.tsx, which gates it out of production.
import { useRef } from "react";
import { HudFrame } from "@/components/hud/hud-frame";
import { TalkRing } from "@/components/hud/talk-ring";
import { StatusStrip } from "@/components/hud/status-strip";
import { LanguageSelect } from "@/components/ui/language-select";
import type { PresenceHandle } from "@/lib/vivid/scene";

export function HudPreviewGallery() {
  // A stand-in presence with a fixed input level, so the ring's fill can be
  // seen without a microphone.
  const fake = useRef<PresenceHandle>({
    setState: () => {},
    getState: () => "listening",
    setListeningStream: () => {},
    attachTts: () => {},
    levels: () => ({ input: 0.45, output: 0, beat: 0 }),
    dispose: () => {},
  });
  return (
    <main className="min-h-screen bg-black p-12 text-silver">
      <p className="font-display mb-8 text-[13px] tracking-[0.5em] text-silver-bright">V I V I D</p>
      <div className="flex flex-wrap items-center gap-10">
        <HudFrame>
          <p className="font-hud text-[11px] tracking-[0.3em] text-silver-bright">SHE IS HERE</p>
        </HudFrame>
        <HudFrame accent delay={200}>
          <p className="font-hud text-[11px] tracking-[0.3em] text-silver-bright">
            SHE IS LISTENING <span className="text-gold">LOW</span>
          </p>
        </HudFrame>
        <TalkRing handle={fake} recording={false} disabled={false} onPress={() => {}} startLabel="START" stopLabel="STOP" />
        <TalkRing handle={fake} recording={true} disabled={false} onPress={() => {}} startLabel="START" stopLabel="STOP" />
        <TalkRing handle={fake} recording={false} disabled={true} onPress={() => {}} startLabel="START" stopLabel="STOP" />
        <div className="relative pt-40">
          <LanguageSelect value="EN" onChange={() => {}} />
        </div>
      </div>
      <div className="mt-16 flex flex-col gap-4">
        <StatusStrip state="connecting" connected={false} status="connecting... (ws.example)" language="English" />
        <StatusStrip state="idle" connected status="ready" language="Yorùbá" />
        <StatusStrip state="error" connected={false} status="connection error" language="English" />
      </div>
    </main>
  );
}
