/** Shared layout constants for the font's coordinate space, used by both the runtime renderer
 * (SineText) and the glyph editor tool, so glyphs drawn in the editor line up exactly at render
 * time. Ascent is taller than descent, matching how most typefaces allocate vertical space. */
export const UNITS_PER_EM = 220;
export const BASELINE_Y = 150;
export const MAX_ASCENT = 135;
export const MAX_DESCENT = 65;
