import type { GlyphDef, GlyphInstance } from './types';
import { HARMONICS, padCoeffs, SPACE_GLYPH } from './types';
import { lookupGlyph } from './glyphs';

const SAMPLES_PER_GLYPH = 36;
const DOT_RADIUS = 5;

/** (x(t), y(t)) for a glyph's parametric sine series, t in [0, 1]. See types.ts for the model. */
export function glyphXY(coeffsX: number[], coeffsY: number[], advance: number, t: number): { x: number; y: number } {
  let x = advance * t;
  let y = 0;
  const n = Math.max(coeffsX.length, coeffsY.length);
  for (let k = 0; k < n; k++) {
    const harmonic = k + 1;
    const basis = Math.sin(harmonic * Math.PI * t);
    x += (coeffsX[k] ?? 0) * basis;
    y += (coeffsY[k] ?? 0) * basis;
  }
  return { x, y };
}

export function parseText(text: string, glyphs?: Record<string, GlyphDef>): GlyphInstance[] {
  return Array.from(text).map((ch) => {
    const g: GlyphDef = glyphs ? glyphs[ch.toLowerCase()] ?? SPACE_GLYPH : lookupGlyph(ch);
    return {
      advance: g.advance,
      coeffsX: padCoeffs(g.coeffsX),
      coeffsY: padCoeffs(g.coeffsY),
      marks: g.marks,
      isSpace: ch === ' ',
    };
  });
}

/**
 * Randomly scales each letter's size (advance + harmonic amplitudes together, so shape stays
 * proportional) by up to +/-`amount` (0..1). Safe for continuity: every glyph already returns to
 * exactly (0, 0)/(advance, 0) at its own boundaries regardless of amplitude, so scaling one letter
 * independently from its neighbors never leaves a gap -- it just makes that letter a genuinely
 * different (still self-consistent) size, the way a hand varies letter size within a word.
 */
export function jitterSize(
  instances: GlyphInstance[],
  amount: number,
  rng: () => number = Math.random
): GlyphInstance[] {
  if (amount <= 0) return instances;
  return instances.map((g) => {
    if (g.isSpace || g.advance <= 0.01) return g;
    const scale = 1 + (rng() * 2 - 1) * amount;
    return {
      ...g,
      advance: g.advance * scale,
      coeffsX: g.coeffsX.map((c) => c * scale),
      coeffsY: g.coeffsY.map((c) => c * scale),
      marks: g.marks?.map((m) =>
        m.type === 'dot'
          ? { ...m, x: m.x * scale, y: m.y * scale }
          : { ...m, x1: m.x1 * scale, y1: m.y1 * scale, x2: m.x2 * scale, y2: m.y2 * scale }
      ),
    };
  });
}

export function totalWidth(instances: GlyphInstance[], letterSpacing: number): number {
  if (instances.length === 0) return 0;
  return instances.reduce((sum, g) => sum + g.advance, 0) + letterSpacing * (instances.length - 1);
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Pad two glyph-instance arrays to equal length with zero-shape/zero-width blanks, so every
 * index can be lerped 1:1 -- growing letters start from a flat point, shrinking ones collapse to one. */
export function alignInstances(
  a: GlyphInstance[],
  b: GlyphInstance[]
): [GlyphInstance[], GlyphInstance[]] {
  const len = Math.max(a.length, b.length);
  const blank = (): GlyphInstance => ({
    advance: 0,
    coeffsX: new Array(HARMONICS).fill(0),
    coeffsY: new Array(HARMONICS).fill(0),
  });
  const aOut = Array.from({ length: len }, (_, i) => a[i] ?? blank());
  const bOut = Array.from({ length: len }, (_, i) => b[i] ?? blank());
  return [aOut, bOut];
}

export function lerpInstances(
  a: GlyphInstance[],
  b: GlyphInstance[],
  tRaw: number
): GlyphInstance[] {
  const t = easeInOutCubic(Math.min(1, Math.max(0, tRaw)));
  return a.map((ga, i) => {
    const gb = b[i];
    return {
      advance: lerp(ga.advance, gb.advance, t),
      coeffsX: ga.coeffsX.map((c, k) => lerp(c, gb.coeffsX[k], t)),
      coeffsY: ga.coeffsY.map((c, k) => lerp(c, gb.coeffsY[k], t)),
      // marks (dots/crossbars) and pen-lift state aren't interpolated shape-to-shape -- they just
      // snap over at the midpoint of the morph. isSpace in particular must snap rather than OR:
      // an index that used to be a space (e.g. it fell on a space in a previous, longer text) but
      // is now a real letter must stop being treated as a permanent pen-lift once the target says
      // otherwise, or that letter would never draw again.
      marks: t < 0.5 ? ga.marks : gb.marks,
      isSpace: t < 0.5 ? ga.isSpace : gb.isSpace,
    };
  });
}

export interface WiggleParams {
  time: number;
  amount: number;
  speed: number;
}

/** A gentle wave the whole line of text sits on, instead of a dead-straight baseline -- evaluated
 * as one continuous function of each sample's absolute x position, so it never introduces gaps
 * between letters (unlike per-letter jitter, which can't touch the baseline without breaking
 * continuity). frequency/phase are normally randomized once per text, not per frame. */
export interface BaselineWaveParams {
  amplitude: number;
  frequency: number;
  phase: number;
}

function baselineWaveAt(x: number, wave: BaselineWaveParams | undefined): number {
  return wave ? wave.amplitude * Math.sin(x * wave.frequency + wave.phase) : 0;
}

/**
 * Nudges each harmonic's amplitude over time. Weighted so low harmonics (broad, gentle sway)
 * move the most and high harmonics (fine detail, sharp corners) barely move at all -- otherwise,
 * with 32 harmonics all wiggling equally, the sum reads as noisy shimmer instead of a calm wave.
 */
function wiggledCoeffs(
  coeffs: number[],
  wiggle: WiggleParams | undefined,
  axisPhase: number,
  axisWeight: number
): number[] {
  if (!wiggle || wiggle.amount === 0) return coeffs;
  return coeffs.map((c, k) => {
    const harmonic = k + 1;
    const decay = 1 / harmonic;
    return (
      c +
      wiggle.amount *
        decay *
        axisWeight *
        Math.sin(wiggle.time * wiggle.speed * (0.6 * harmonic + 1) + harmonic * 1.7 + axisPhase)
    );
  });
}

/** A small circle subpath (two half-circle arcs), used to draw a dot. */
function circleSubpath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`;
}

/** Smooth an SVG polyline into quadratic bezier segments through midpoints. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    d += ` Q ${p0.x} ${p0.y} ${mid.x} ${mid.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/**
 * Builds one SVG path `d` string for a whole word/line: baseline y = baselineY, math-up is svg-up
 * (y is flipped). Runs of non-space glyphs become separate subpaths (the pen "lifts" over spaces).
 * Each glyph is traced parametrically (t: 0..1), so loops and self-crossings render correctly.
 */
export function buildWordPath(
  instances: GlyphInstance[],
  opts: { letterSpacing: number; baselineY: number; wiggle?: WiggleParams; baseline?: BaselineWaveParams }
): string {
  const { letterSpacing, baselineY, wiggle, baseline } = opts;
  let cursorX = 0;
  let currentRun: { x: number; y: number }[] = [];
  const subpaths: string[] = [];

  const flushRun = () => {
    if (currentRun.length > 1) subpaths.push(smoothPath(currentRun));
    currentRun = [];
  };

  for (const glyph of instances) {
    if (glyph.isSpace || glyph.advance <= 0.01) {
      flushRun();
      cursorX += glyph.advance + letterSpacing;
      continue;
    }
    const coeffsX = wiggledCoeffs(glyph.coeffsX, wiggle, 1.3, 0.5);
    const coeffsY = wiggledCoeffs(glyph.coeffsY, wiggle, 0, 1);
    for (let s = 0; s <= SAMPLES_PER_GLYPH; s++) {
      const t = s / SAMPLES_PER_GLYPH;
      const { x: localX, y: localY } = glyphXY(coeffsX, coeffsY, glyph.advance, t);
      const absX = cursorX + localX;
      currentRun.push({ x: absX, y: baselineY - localY - baselineWaveAt(absX, baseline) });
    }
    const bob = wiggle ? wiggle.amount * 0.3 * Math.sin(wiggle.time * wiggle.speed * 2.2 + 0.7) : 0;
    for (const mark of glyph.marks ?? []) {
      if (mark.type === 'dot') {
        const dotDrift = baselineWaveAt(cursorX + mark.x, baseline);
        subpaths.push(circleSubpath(cursorX + mark.x, baselineY - mark.y - bob - dotDrift, DOT_RADIUS));
      } else {
        const drift1 = baselineWaveAt(cursorX + mark.x1, baseline);
        const drift2 = baselineWaveAt(cursorX + mark.x2, baseline);
        subpaths.push(
          `M ${cursorX + mark.x1} ${baselineY - mark.y1 - bob - drift1} L ${cursorX + mark.x2} ${baselineY - mark.y2 - bob - drift2}`
        );
      }
    }
    cursorX += glyph.advance + letterSpacing;
  }
  flushRun();

  return subpaths.join(' ');
}
