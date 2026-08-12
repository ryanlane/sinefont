import { useEffect, useRef, useState } from 'react';
import {
  alignInstances,
  buildWordPath,
  lerpInstances,
  parseText,
  totalWidth,
} from './path';
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
  className?: string;
  style?: React.CSSProperties;
}

const MARGIN = 20;

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
  className,
  style,
}: SineTextProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const targetRef = useRef<GlyphInstance[]>(parseText(text, glyphs));
  const morphStartRef = useRef<number>(performance.now());
  const morphFromRef = useRef<GlyphInstance[]>(targetRef.current);

  // live props, read from the persistent RAF loop without restarting it
  const liveRef = useRef({ animate, wiggleSpeed, wiggleAmount, morphDuration, letterSpacing });
  liveRef.current = { animate, wiggleSpeed, wiggleAmount, morphDuration, letterSpacing };

  const [viewBoxWidth, setViewBoxWidth] = useState(() =>
    Math.max(totalWidth(targetRef.current, letterSpacing), 1) + MARGIN * 2
  );

  // text (or the font itself) changed: snapshot whatever is currently on screen as the new morph start
  useEffect(() => {
    const now = performance.now();
    const elapsed = now - morphStartRef.current;
    const t = Math.min(1, Math.max(0, elapsed / liveRef.current.morphDuration));
    const [prevAligned, nextAligned] = alignInstances(morphFromRef.current, targetRef.current);
    morphFromRef.current = lerpInstances(prevAligned, nextAligned, t);

    targetRef.current = parseText(text, glyphs);
    morphStartRef.current = now;

    const w = Math.max(
      totalWidth(morphFromRef.current, liveRef.current.letterSpacing),
      totalWidth(targetRef.current, liveRef.current.letterSpacing),
      1
    );
    setViewBoxWidth(w + MARGIN * 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, glyphs]);

  useEffect(() => {
    let raf = 0;

    const tick = (now: number) => {
      const { animate, wiggleSpeed, wiggleAmount, morphDuration, letterSpacing } = liveRef.current;
      const t = Math.min(1, Math.max(0, (now - morphStartRef.current) / morphDuration));
      const [prevAligned, nextAligned] = alignInstances(morphFromRef.current, targetRef.current);
      const current = lerpInstances(prevAligned, nextAligned, t);

      const d = buildWordPath(current, {
        letterSpacing,
        baselineY: BASELINE_Y,
        wiggle: animate
          ? { time: now / 1000, amount: wiggleAmount, speed: wiggleSpeed }
          : undefined,
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
