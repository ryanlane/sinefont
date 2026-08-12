/** Number of sine harmonics per axis, per glyph. Kept fairly high so hand-drawn strokes can be
 * captured with enough fidelity to render loops and tight corners. */
export const HARMONICS = 32;

/**
 * A glyph is a parametric curve traced by t in [0, 1] -- like a collection of pendulums (one per
 * harmonic) swinging at integer multiples of a base frequency, added together. Both coordinates
 * are their own independent sine series in t:
 *
 *   x(t) = advance*t + sum coeffsX[k] * sin((k+1) * PI * t)
 *   y(t) =              sum coeffsY[k] * sin((k+1) * PI * t)
 *
 * x(t) is a straight-line ramp from 0 to `advance` plus a sine wiggle around it, so it doesn't
 * have to move strictly left-to-right -- the pen can loop back on itself (essential for cursive
 * shapes like a lowercase "a" or "o"). Because every harmonic vanishes at t=0 and t=1, every
 * glyph starts at exactly (0, 0) and ends at exactly (advance, 0) -- both on the baseline -- which
 * is what lets glyphs join into one continuous cursive stroke with no extra joining logic.
 */
/** A detached mark the pen lifts to draw separately from the main stroke -- a dot (i, j) or a
 * crossbar (t, f). Positions are in the same font-unit space as the main stroke, y measured up
 * from the baseline. */
export type GlyphMark =
  | { type: 'dot'; x: number; y: number }
  | { type: 'bar'; x1: number; y1: number; x2: number; y2: number };

export interface GlyphDef {
  /** horizontal advance width, in font units */
  advance: number;
  /** amplitude of each harmonic k=1..HARMONICS shaping x(t) around its linear ramp */
  coeffsX: number[];
  /** amplitude of each harmonic k=1..HARMONICS shaping y(t) (height above the baseline) */
  coeffsY: number[];
  marks?: GlyphMark[];
}

export interface GlyphInstance {
  advance: number;
  coeffsX: number[];
  coeffsY: number[];
  marks?: GlyphMark[];
  /** true if the pen should lift here (a real space) rather than draw a flat connector */
  isSpace?: boolean;
}

export const BLANK_GLYPH: GlyphDef = {
  advance: 0,
  coeffsX: new Array(HARMONICS).fill(0),
  coeffsY: new Array(HARMONICS).fill(0),
};

export const SPACE_GLYPH: GlyphDef = {
  advance: 34,
  coeffsX: new Array(HARMONICS).fill(0),
  coeffsY: new Array(HARMONICS).fill(0),
};

/** Normalizes a coeffs array to exactly HARMONICS entries (older/shorter glyphs pad with zeros)
 * so every GlyphInstance can be lerped index-for-index regardless of how many harmonics it was
 * authored with. */
export function padCoeffs(coeffs: number[]): number[] {
  const out = coeffs.slice(0, HARMONICS);
  while (out.length < HARMONICS) out.push(0);
  return out;
}
