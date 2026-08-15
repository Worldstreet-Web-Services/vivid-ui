// A dev page for judging the HUD primitives in isolation. Not linked from
// anywhere; visit /hud-preview. Not found in production, so it carries no
// fake presence into a real deployment.
import { notFound } from "next/navigation";
import { HudPreviewGallery } from "@/components/hud/hud-preview-gallery";

export default function HudPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HudPreviewGallery />;
}
