import { useEffect, useRef, useState } from 'react';
import {
  alignInstances,
  buildWordPath,
  jitterSize,
  lerpInstances,
  parseText,
  totalWidth,
} from './path';
import type { BaselineWaveParams } from './path';
import type { GlyphDef, GlyphInstance } from './types';
import { BASELINE_Y, UNITS_PER_EM } from './layout';

export interface SineTextProps {
  /** the word/phrase to render -- change it any time, it will morph smoothly */
  text: string;
  /**
   * A custom font to render with, as a `{letter: GlyphDef}` map -- see `loadGlyphFont` to load one
   * from a JSON file (e.g. one downloaded from the glyph editor), or build one yourself. Falls
   * back to sinefont's own built-in alphabet if omitted.
   */
  glyphs?: Record<string, GlyphDef>;
  /** font size in px; internally the glyphs live on a fixed-height em square (see layout.ts) */
  fontSize?: number;
  /** stroke color */
  color?: string;
  strokeWidth?: number;
  letterSpacing?: number;
  /** continuous idle wiggle */
  animate?: boolean;
  wiggleSpeed?: number;
  wiggleAmount?: number;
  /** ms to morph from the previous word to a new one */
  morphDuration?: number;
  /**
   * Randomly varies each letter's size by up to this fraction (0..1) so identical letters don't
   * come out identical -- e.g. 0.15 lets a letter render anywhere from 85% to 115% of its normal
   * size. Re-rolled fresh whenever `text` (or this prop) changes. Default 0 (off).
   */
  sizeJitter?: number;
  /**
   * Amplitude (in font units) of a gentle random wave the whole line sits on instead of a
   * dead-straight baseline, like natural handwriting drift. Frequency/phase are re-rolled fresh
   * whenever `text` (or this prop) changes. Default 0 (off).
   */
  baselineJitter?: number;
  className?: string;
  style?: React.CSSProperties;
}

const MARGIN = 20;

function randomWave(amplitude: number): BaselineWaveParams {
  return { amplitude, frequency: 0.012 + Math.random() * 0.02, phase: Math.random() * Math.PI * 2 };
}

export function SineText({
  text,
  glyphs,
  fontSize = 96,
  color = 'currentColor',
  strokeWidth = 4,
  letterSpacing = 10,
  animate = false,
  wiggleSpeed = 1,
  wiggleAmount = 3,
  morphDuration = 600,
  sizeJitter = 0,
  baselineJitter = 0,
  className,
  style,
}: SineTextProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const targetRef = useRef<GlyphInstance[]>(jitterSize(parseText(text, glyphs), sizeJitter));
  const morphStartRef = useRef<number>(performance.now());
  const morphFromRef = useRef<GlyphInstance[]>(targetRef.current);
  const baselineWaveRef = useRef<BaselineWaveParams>(randomWave(baselineJitter));

  // live props, read from the persistent RAF loop without restarting it
  const liveRef = useRef({ animate, wiggleSpeed, wiggleAmount, morphDuration, letterSpacing, baselineJitter });
  liveRef.current = { animate, wiggleSpeed, wiggleAmount, morphDuration, letterSpacing, baselineJitter };

  const [viewBoxWidth, setViewBoxWidth] = useState(() =>
    Math.max(totalWidth(targetRef.current, letterSpacing), 1) + MARGIN * 2
  );

  // text, font, or jitter settings changed: snapshot whatever is currently on screen as the new
  // morph start, and re-roll a fresh randomization for the new target
  useEffect(() => {
    const now = performance.now();
    const elapsed = now - morphStartRef.current;
    const t = Math.min(1, Math.max(0, elapsed / liveRef.current.morphDuration));
    const [prevAligned, nextAligned] = alignInstances(morphFromRef.current, targetRef.current);
    morphFromRef.current = lerpInstances(prevAligned, nextAligned, t);

    targetRef.current = jitterSize(parseText(text, glyphs), sizeJitter);
    baselineWaveRef.current = randomWave(baselineJitter);
    morphStartRef.current = now;

    const w = Math.max(
      totalWidth(morphFromRef.current, liveRef.current.letterSpacing),
      totalWidth(targetRef.current, liveRef.current.letterSpacing),
      1
    );
    setViewBoxWidth(w + MARGIN * 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, glyphs, sizeJitter, baselineJitter]);

  useEffect(() => {
    let raf = 0;

    const tick = (now: number) => {
      const { animate, wiggleSpeed, wiggleAmount, morphDuration, letterSpacing, baselineJitter } = liveRef.current;
      const t = Math.min(1, Math.max(0, (now - morphStartRef.current) / morphDuration));
      const [prevAligned, nextAligned] = alignInstances(morphFromRef.current, targetRef.current);
      const current = lerpInstances(prevAligned, nextAligned, t);

      const d = buildWordPath(current, {
        letterSpacing,
        baselineY: BASELINE_Y,
        wiggle: animate
          ? { time: now / 1000, amount: wiggleAmount, speed: wiggleSpeed }
          : undefined,
        baseline: baselineJitter > 0 ? { ...baselineWaveRef.current, amplitude: baselineJitter } : undefined,
      });

      if (pathRef.current) pathRef.current.setAttribute('d', d);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg
      viewBox={`0 0 ${viewBoxWidth} ${UNITS_PER_EM}`}
      width={(viewBoxWidth / UNITS_PER_EM) * fontSize}
      height={fontSize}
      className={className}
      style={style}
    >
      <path
        ref={pathRef}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`translate(${MARGIN}, 0)`}
      />
    </svg>
  );
}
