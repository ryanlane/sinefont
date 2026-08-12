import { glyphXY } from './path';
import { HARMONICS } from './types';

export interface StrokePoint {
  x: number;
  y: number;
}

/** Resamples a polyline to N+1 points evenly spaced by arc length (not by array index), so
 * variations in drawing speed don't distort the fit -- a pause mid-stroke won't bunch up samples. */
function resampleByArcLength(points: StrokePoint[], N: number): StrokePoint[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return new Array(N + 1).fill(points[0]);

  const out: StrokePoint[] = [];
  let seg = 0;
  for (let n = 0; n <= N; n++) {
    const target = (n / N) * total;
    while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
    const segStart = cum[seg];
    const segEnd = cum[seg + 1];
    const t = segEnd > segStart ? (target - segStart) / (segEnd - segStart) : 0;
    const p0 = points[seg];
    const p1 = points[seg + 1] ?? p0;
    out.push({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t });
  }
  return out;
}

/**
 * Fits a freehand stroke -- captured as an ordered list of (x, y) samples, which may loop back on
 * itself -- with a pair of independent sine series, one per coordinate:
 *
 *   x(t) = advance*t + coeffsX-series(t)
 *   y(t) = coeffsY-series(t)
 *
 * This is the "pendulums" model: each harmonic k is one rotating component contributing to both
 * x and y, and stacking them (like epicycles) can trace any shape, including loops and
 * self-crossings that a plain y=f(x) curve never could (essential for letters like "a" or "o").
 *
 * The stroke is anchored to start at (0, 0) and end at (advance, 0) -- both on the baseline -- so
 * glyphs still join into one continuous line, then resampled evenly by arc length onto an N-point
 * grid and each coordinate is transformed with a Discrete Sine Transform (DST-I), the exact
 * inverse of the basis sin(k*PI*n/N) our harmonics are built from.
 */
export function strokeToParametricCoeffs(
  stroke: StrokePoint[],
  advance: number,
  harmonics: number = HARMONICS
): { coeffsX: number[]; coeffsY: number[] } {
  const anchored: StrokePoint[] = [{ x: 0, y: 0 }, ...stroke, { x: advance, y: 0 }];
  const N = harmonics + 1;
  const resampled = resampleByArcLength(anchored, N);

  const devX: number[] = [];
  const ys: number[] = [];
  for (let n = 1; n < N; n++) {
    const ramp = (n / N) * advance;
    devX.push(resampled[n].x - ramp);
    ys.push(resampled[n].y);
  }

  const coeffsX = new Array(harmonics).fill(0);
  const coeffsY = new Array(harmonics).fill(0);
  for (let k = 1; k <= harmonics; k++) {
    let sx = 0;
    let sy = 0;
    for (let n = 1; n < N; n++) {
      const basis = Math.sin((k * Math.PI * n) / N);
      sx += devX[n - 1] * basis;
      sy += ys[n - 1] * basis;
    }
    coeffsX[k - 1] = (2 / N) * sx;
    coeffsY[k - 1] = (2 / N) * sy;
  }
  return { coeffsX, coeffsY };
}

/** Seeds an editable stroke by densely sampling an already-existing parametric glyph -- used the
 * first time a letter is opened, so the draw canvas shows its current shape as a traceable line
 * rather than a blank baseline. */
export function seedStrokeFromCoeffs(
  coeffsX: number[],
  coeffsY: number[],
  advance: number,
  samples = 60
): StrokePoint[] {
  const stroke: StrokePoint[] = [];
  for (let i = 0; i <= samples; i++) {
    stroke.push(glyphXY(coeffsX, coeffsY, advance, i / samples));
  }
  return stroke;
}
