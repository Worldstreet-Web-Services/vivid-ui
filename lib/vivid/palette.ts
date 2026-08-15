// The brand palette, defined once.
//
// Metallic silver, dollar green and metallic gold on black. Nothing else. The
// shader takes these as uniforms and the interface chrome takes them as CSS
// custom properties, so the particles and the text around them cannot drift
// apart.
//
// Colour is characterisation, not decoration (see docs/research-futuristic-
// ai-presence.md §1). At rest she is silver with green and gold in her; each
// state pulls the whole presence toward one colour and one meaning: green when
// she is attending to you, silver-white when she is working, gold when she
// speaks. Those are the only moments the colour changes.

/** As the CSS sees them: sRGB hex. */
export const HEX = {
  // Metallic silver, three stops: the body's shadow, its face, its highlight.
  silverDeep: "#6E7480",
  silver: "#B8BEC8",
  silverBright: "#EEF1F5",
  // Dollar green: the green of the bill, not a neon.
  green: "#3FA66B",
  greenBright: "#7FD69C",
  // Metallic gold, two stops: the metal and its glint.
  gold: "#D4A73A",
  goldBright: "#F5DE8A",
  // Near-white with a hair of warmth, for the hottest points only.
  white: "#FFF8EC",
  ink: "#000000",
} as const;

export type PaletteName = keyof typeof HEX;

/**
 * The same colour as a shader vec3, 0..1 per channel.
 *
 * Deliberately NOT converted to linear. The renderer sets no colour
 * management and the fragment shader writes gl_FragColor raw, so every value
 * in it is a display value: that is the space the whole look, and the bloom
 * on top of it, was tuned in. Handing the shader linear values here would
 * quietly darken everything against that tuning.
 */
export function vec3(name: PaletteName): [number, number, number] {
  const n = parseInt(HEX[name].slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
