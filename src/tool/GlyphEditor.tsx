import { useEffect, useRef, useState } from 'react';
import { GLYPHS, resetGlyphs, syncGlyphs } from '../lib/sinefont/glyphs';
import { buildWordPath } from '../lib/sinefont/path';
import type { StrokePoint } from '../lib/sinefont/dst';
import { seedStrokeFromCoeffs, strokeToParametricCoeffs } from '../lib/sinefont/dst';
import type { GlyphDef, GlyphInstance, GlyphMark } from '../lib/sinefont/types';
import { HARMONICS, SPACE_GLYPH } from '../lib/sinefont/types';
import { BASELINE_Y, MAX_ASCENT, MAX_DESCENT, UNITS_PER_EM } from '../lib/sinefont/layout';

const MARGIN = 20;
const DRAW_HEIGHT = 480;

function cloneGlyphs(src: Record<string, GlyphDef>): Record<string, GlyphDef> {
  const out: Record<string, GlyphDef> = {};
  for (const [k, v] of Object.entries(src)) {
    out[k] = {
      advance: v.advance,
      coeffsX: [...v.coeffsX],
      coeffsY: [...v.coeffsY],
      marks: v.marks?.map((m) => ({ ...m })),
    };
  }
  return out;
}

function instancesFromText(text: string, map: Record<string, GlyphDef>): GlyphInstance[] {
  return Array.from(text).map((ch) => {
    const g = ch === ' ' ? SPACE_GLYPH : map[ch.toLowerCase()] ?? SPACE_GLYPH;
    return { advance: g.advance, coeffsX: [...g.coeffsX], coeffsY: [...g.coeffsY], marks: g.marks, isSpace: ch === ' ' };
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const blankCoeffs = () => new Array(HARMONICS).fill(0);
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
const isBlankGlyph = (g: GlyphDef | undefined) =>
  !g || (g.coeffsX.every((c) => c === 0) && g.coeffsY.every((c) => c === 0));

/** Small self-contained animated preview: renders a fixed set of glyph instances, optionally wiggling. */
function LivePreview({
  instances,
  animate,
  height = 160,
}: {
  instances: GlyphInstance[];
  animate: boolean;
  height?: number;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const width =
    instances.reduce((s, g) => s + g.advance, 0) + 10 * Math.max(0, instances.length - 1) + MARGIN * 2;

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const d = buildWordPath(instances, {
        letterSpacing: 10,
        baselineY: BASELINE_Y,
        wiggle: animate ? { time: now / 1000, amount: 3, speed: 1 } : undefined,
      });
      if (pathRef.current) pathRef.current.setAttribute('d', d);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [instances, animate]);

  return (
    <svg viewBox={`0 0 ${Math.max(width, 1)} ${UNITS_PER_EM}`} height={height} style={{ background: '#111', borderRadius: 8 }}>
      <line x1={0} y1={BASELINE_Y} x2={width} y2={BASELINE_Y} stroke="#333" strokeWidth={1} />
      <path
        ref={pathRef}
        fill="none"
        stroke="#7dd3fc"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`translate(${MARGIN}, 0)`}
      />
    </svg>
  );
}

/**
 * Big freehand drawing surface: press and drag to draw the letter as one continuous line -- it can
 * loop back on itself (needed for shapes like "a" or "o"). Every pointerdown starts a fresh stroke
 * that replaces whatever was there. Separately, `marks` (dots for i/j, crossbars for t/f) are
 * shown as draggable yellow handles that don't interact with the main stroke at all.
 *
 * The SVG is sized explicitly (not `width="100%"`) so its displayed aspect ratio always matches
 * the viewBox exactly -- otherwise `preserveAspectRatio` letterboxes the content into a narrower
 * centered strip than the visible dark box, and clicks/drags outside that strip silently miss.
 */
function DrawCanvas({
  letter,
  advance,
  stroke,
  onStrokeChange,
  marks,
  onDotMove,
  onBarEndpointMove,
  onRemoveMark,
}: {
  letter: string;
  advance: number;
  stroke: StrokePoint[];
  onStrokeChange: (stroke: StrokePoint[]) => void;
  marks: GlyphMark[];
  onDotMove: (index: number, x: number, y: number) => void;
  onBarEndpointMove: (index: number, which: 'a' | 'b', x: number, y: number) => void;
  onRemoveMark: (index: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragPointsRef = useRef<StrokePoint[]>([]);
  const viewWidth = advance + MARGIN * 2;
  const displayWidth = Math.round(DRAW_HEIGHT * (viewWidth / UNITS_PER_EM));

  const toMath = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x - MARGIN, y: BASELINE_Y - loc.y };
  };

  const addPoint = (clientX: number, clientY: number) => {
    const { x, y } = toMath(clientX, clientY);
    dragPointsRef.current = [
      ...dragPointsRef.current,
      { x: clamp(x, 0, advance), y: clamp(y, -MAX_DESCENT, MAX_ASCENT) },
    ];
    onStrokeChange(dragPointsRef.current);
  };

  const polylinePoints = stroke.map((p) => `${p.x + MARGIN},${BASELINE_Y - p.y}`).join(' ');

  const markHandle = (
    key: string,
    hx: number,
    hy: number,
    onMove: (x: number, y: number) => void,
    onRemove: () => void
  ) => (
    <circle
      key={key}
      cx={hx + MARGIN}
      cy={BASELINE_Y - hy}
      r={7}
      fill="#facc15"
      stroke="#111"
      strokeWidth={1.5}
      style={{ cursor: 'grab' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!(e.currentTarget as SVGCircleElement).hasPointerCapture(e.pointerId)) return;
        const { x, y } = toMath(e.clientX, e.clientY);
        onMove(clamp(x, 0, advance), clamp(y, -MAX_DESCENT, MAX_ASCENT));
      }}
      onPointerUp={(e) => (e.currentTarget as SVGCircleElement).releasePointerCapture(e.pointerId)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
    />
  );

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewWidth} ${UNITS_PER_EM}`}
        height={DRAW_HEIGHT}
        width={displayWidth}
        style={{ background: '#111', borderRadius: 8, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
      >
        <line x1={0} y1={BASELINE_Y} x2={viewWidth} y2={BASELINE_Y} stroke="#333" strokeWidth={1} />
        <line x1={MARGIN} y1={0} x2={MARGIN} y2={UNITS_PER_EM} stroke="#2a2a2a" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={viewWidth - MARGIN} y1={0} x2={viewWidth - MARGIN} y2={UNITS_PER_EM} stroke="#2a2a2a" strokeWidth={1} strokeDasharray="3 3" />
        <text
          x={MARGIN + advance / 2}
          y={BASELINE_Y}
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize={170}
          fill="#fff"
          opacity={0.08}
          pointerEvents="none"
        >
          {letter}
        </text>
        <rect
          x={0}
          y={0}
          width={viewWidth}
          height={UNITS_PER_EM}
          fill="transparent"
          onPointerDown={(e) => {
            (e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
            dragPointsRef.current = [];
            addPoint(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (!(e.currentTarget as SVGRectElement).hasPointerCapture(e.pointerId)) return;
            addPoint(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => (e.currentTarget as SVGRectElement).releasePointerCapture(e.pointerId)}
        />
        {stroke.length > 1 && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#f472b6"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}
        {marks.map((mark, i) =>
          mark.type === 'dot' ? (
            markHandle(`dot-${i}`, mark.x, mark.y, (x, y) => onDotMove(i, x, y), () => onRemoveMark(i))
          ) : (
            <g key={`bar-${i}`}>
              <line
                x1={mark.x1 + MARGIN}
                y1={BASELINE_Y - mark.y1}
                x2={mark.x2 + MARGIN}
                y2={BASELINE_Y - mark.y2}
                stroke="#facc15"
                strokeWidth={3}
                strokeLinecap="round"
                pointerEvents="none"
              />
              {markHandle(`bar-${i}-a`, mark.x1, mark.y1, (x, y) => onBarEndpointMove(i, 'a', x, y), () => onRemoveMark(i))}
              {markHandle(`bar-${i}-b`, mark.x2, mark.y2, (x, y) => onBarEndpointMove(i, 'b', x, y), () => onRemoveMark(i))}
            </g>
          )
        )}
      </svg>
      <p style={{ fontSize: 12, opacity: 0.6, margin: '6px 0 0' }}>
        press and drag to draw the letter as one stroke, looping back if you need to &middot; drawing again replaces it
        <br />
        yellow handles are dots/crossbars &middot; drag to reposition &middot; double-click to remove
      </p>
    </div>
  );
}

/** Animated read-only preview of the sine-series reconstruction fitted to the drawn stroke. */
function ResultPreview({
  advance,
  coeffsX,
  coeffsY,
  marks,
  animate,
}: {
  advance: number;
  coeffsX: number[];
  coeffsY: number[];
  marks?: GlyphMark[];
  animate: boolean;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const viewWidth = advance + MARGIN * 2;
  const height = DRAW_HEIGHT * 0.6;
  const displayWidth = Math.round(height * (viewWidth / UNITS_PER_EM));

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const d = buildWordPath([{ advance, coeffsX, coeffsY, marks }], {
        letterSpacing: 0,
        baselineY: BASELINE_Y,
        wiggle: animate ? { time: now / 1000, amount: 3, speed: 1 } : undefined,
      });
      if (pathRef.current) pathRef.current.setAttribute('d', d);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [advance, coeffsX, coeffsY, marks, animate]);

  return (
    <svg viewBox={`0 0 ${viewWidth} ${UNITS_PER_EM}`} height={height} width={displayWidth} style={{ background: '#111', borderRadius: 8, display: 'block' }}>
      <line x1={0} y1={BASELINE_Y} x2={viewWidth} y2={BASELINE_Y} stroke="#333" strokeWidth={1} />
      <path
        ref={pathRef}
        fill="none"
        stroke="#7dd3fc"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`translate(${MARGIN}, 0)`}
      />
    </svg>
  );
}

export function GlyphEditor() {
  const [glyphMap, setGlyphMap] = useState<Record<string, GlyphDef>>(() => cloneGlyphs(GLYPHS));
  const [strokeMap, setStrokeMap] = useState<Record<string, StrokePoint[]>>({});
  const extraLetters = Object.keys(glyphMap).filter((k) => k !== ' ' && !ALPHABET.includes(k));
  const letters = [...ALPHABET, ...extraLetters];
  const [currentLetter, setCurrentLetter] = useState('a');
  const [newLetter, setNewLetter] = useState('');
  const [sampleWord, setSampleWord] = useState('hello');
  const [wiggleOn, setWiggleOn] = useState(true);
  const [copied, setCopied] = useState(false);

  const current = glyphMap[currentLetter] ?? { advance: 60, coeffsX: blankCoeffs(), coeffsY: blankCoeffs() };
  const currentMarks = current.marks ?? [];

  // the first time a letter is opened, trace its existing curve as a starting stroke
  useEffect(() => {
    setStrokeMap((prev) => {
      if (prev[currentLetter]) return prev;
      const g = glyphMap[currentLetter] ?? { advance: 60, coeffsX: blankCoeffs(), coeffsY: blankCoeffs() };
      return { ...prev, [currentLetter]: seedStrokeFromCoeffs(g.coeffsX, g.coeffsY, g.advance) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLetter]);

  const currentStroke = strokeMap[currentLetter] ?? [];

  const setStrokeForCurrent = (stroke: StrokePoint[]) => {
    setStrokeMap((prev) => ({ ...prev, [currentLetter]: stroke }));
    const { coeffsX, coeffsY } = strokeToParametricCoeffs(stroke, current.advance);
    setGlyphMap((prev) => ({ ...prev, [currentLetter]: { ...prev[currentLetter], advance: current.advance, coeffsX, coeffsY } }));
  };

  const updateAdvance = (newAdvance: number) => {
    const scale = current.advance > 0 ? newAdvance / current.advance : 1;
    const rescaled = currentStroke.map((p) => ({ ...p, x: p.x * scale }));
    setStrokeMap((prev) => ({ ...prev, [currentLetter]: rescaled }));
    const { coeffsX, coeffsY } = strokeToParametricCoeffs(rescaled, newAdvance);
    setGlyphMap((prev) => ({ ...prev, [currentLetter]: { ...prev[currentLetter], advance: newAdvance, coeffsX, coeffsY } }));
  };

  const setMarksForCurrent = (marks: GlyphMark[]) => {
    setGlyphMap((prev) => ({
      ...prev,
      [currentLetter]: { ...prev[currentLetter], marks: marks.length ? marks : undefined },
    }));
  };

  const addDot = () => setMarksForCurrent([...currentMarks, { type: 'dot', x: current.advance / 2, y: MAX_ASCENT * 0.75 }]);
  const addBar = () =>
    setMarksForCurrent([
      ...currentMarks,
      { type: 'bar', x1: current.advance * 0.15, y1: MAX_ASCENT * 0.45, x2: current.advance * 0.85, y2: MAX_ASCENT * 0.45 },
    ]);
  const moveDot = (index: number, x: number, y: number) =>
    setMarksForCurrent(currentMarks.map((m, i) => (i === index && m.type === 'dot' ? { ...m, x, y } : m)));
  const moveBarEndpoint = (index: number, which: 'a' | 'b', x: number, y: number) =>
    setMarksForCurrent(
      currentMarks.map((m, i) => {
        if (i !== index || m.type !== 'bar') return m;
        return which === 'a' ? { ...m, x1: x, y1: y } : { ...m, x2: x, y2: y };
      })
    );
  const removeMark = (index: number) => setMarksForCurrent(currentMarks.filter((_, i) => i !== index));

  const clearCurrent = () => {
    setStrokeForCurrent([]);
    setMarksForCurrent([]);
  };

  const addLetter = () => {
    const ch = newLetter.trim().toLowerCase().slice(0, 1);
    if (!ch || ch === ' ') return;
    setGlyphMap((prev) => ({
      ...prev,
      [ch]: prev[ch] ?? { advance: 60, coeffsX: blankCoeffs(), coeffsY: blankCoeffs() },
    }));
    setCurrentLetter(ch);
    setNewLetter('');
  };

  // auto-saves to this browser's localStorage, debounced so a drag/draw gesture doesn't write on
  // every pointer move -- only once things settle down for a moment
  useEffect(() => {
    const timeout = setTimeout(() => syncGlyphs(glyphMap), 400);
    return () => clearTimeout(timeout);
  }, [glyphMap]);

  const resetAll = () => {
    if (!window.confirm('Discard all locally-saved edits and restore the seed alphabet?')) return;
    resetGlyphs();
    setGlyphMap(cloneGlyphs(GLYPHS));
    setStrokeMap({});
    setCurrentLetter('a');
  };

  const exportCode = () => {
    const round = (n: number) => Math.round(n * 100) / 100;
    const markCode = (m: GlyphMark) =>
      m.type === 'dot'
        ? `{ type: 'dot', x: ${round(m.x)}, y: ${round(m.y)} }`
        : `{ type: 'bar', x1: ${round(m.x1)}, y1: ${round(m.y1)}, x2: ${round(m.x2)}, y2: ${round(m.y2)} }`;
    const lines = Object.entries(glyphMap)
      .filter(([k]) => k !== ' ')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, g]) => {
        const marksCode = g.marks?.length ? `, marks: [${g.marks.map(markCode).join(', ')}]` : '';
        return `  ${JSON.stringify(k)}: { advance: ${round(g.advance)}, coeffsX: [${g.coeffsX.map(round).join(', ')}], coeffsY: [${g.coeffsY.map(round).join(', ')}]${marksCode} },`;
      });
    return `export const GLYPHS: Record<string, GlyphDef> = {\n${lines.join('\n')}\n  ' ': SPACE_GLYPH,\n};`;
  };

  const copyExport = async () => {
    await navigator.clipboard.writeText(exportCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const exportJSON = () => {
    const glyphs = Object.fromEntries(Object.entries(glyphMap).filter(([k]) => k !== ' '));
    return JSON.stringify({ harmonics: HARMONICS, glyphs }, null, 2);
  };

  const downloadJSON = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sinefont-glyphs.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const importJSON = async (file: File) => {
    setImportError(null);
    try {
      const parsed = JSON.parse(await file.text());
      const glyphs = parsed?.glyphs ?? parsed; // accept either the {harmonics, glyphs} wrapper or a bare map
      if (!glyphs || typeof glyphs !== 'object') throw new Error('not a glyph map');
      for (const [letter, g] of Object.entries<GlyphDef>(glyphs)) {
        if (
          typeof g?.advance !== 'number' ||
          !Array.isArray(g?.coeffsX) ||
          !Array.isArray(g?.coeffsY)
        ) {
          throw new Error(`"${letter}" isn't a valid glyph`);
        }
      }
      setGlyphMap((prev) => ({ ...prev, ...(glyphs as Record<string, GlyphDef>) }));
      setStrokeMap((prev) => {
        const next = { ...prev };
        for (const letter of Object.keys(glyphs)) delete next[letter];
        return next;
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'could not read that file');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1200, margin: '0 auto' }}>
      <section>
        <h2 style={{ marginBottom: 8 }}>Letter</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {letters.map((l) => (
            <button
              key={l}
              onClick={() => setCurrentLetter(l)}
              title={isBlankGlyph(glyphMap[l]) ? 'not drawn yet' : undefined}
              style={{
                width: 34,
                height: 34,
                fontWeight: l === currentLetter ? 700 : 400,
                background: l === currentLetter ? '#7dd3fc' : '#222',
                color: l === currentLetter ? '#111' : '#eee',
                opacity: l === currentLetter ? 1 : isBlankGlyph(glyphMap[l]) ? 0.4 : 1,
                border: '1px solid #333',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {l}
            </button>
          ))}
          <input
            value={newLetter}
            onChange={(e) => setNewLetter(e.target.value)}
            placeholder="+"
            maxLength={1}
            style={{ width: 34, height: 34, textAlign: 'center', borderRadius: 6, border: '1px solid #333', background: '#1a1a1a', color: '#eee' }}
          />
          <button onClick={addLetter} style={{ height: 34, padding: '0 10px', borderRadius: 6, border: '1px solid #333', background: '#222', color: '#eee', cursor: 'pointer' }}>
            add
          </button>
          <button
            onClick={resetAll}
            style={{ height: 34, padding: '0 10px', borderRadius: 6, border: '1px solid #333', background: '#222', color: '#eee', cursor: 'pointer', marginLeft: 'auto' }}
          >
            reset to defaults
          </button>
        </div>
        <p style={{ fontSize: 12, opacity: 0.6, margin: '6px 0 0' }}>
          edits save automatically in this browser and reload with the page
        </p>
      </section>

      <section style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 480px', minWidth: 320 }}>
          <h2 style={{ marginBottom: 8 }}>Draw: "{currentLetter}"</h2>
          <label style={{ display: 'block', marginBottom: 8, maxWidth: 300 }}>
            advance (width): {current.advance}
            <input
              type="range"
              min={20}
              max={160}
              value={current.advance}
              onChange={(e) => updateAdvance(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              onClick={clearCurrent}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #333', background: '#222', color: '#eee', cursor: 'pointer' }}
            >
              clear
            </button>
            <button
              onClick={addDot}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #333', background: '#222', color: '#eee', cursor: 'pointer' }}
            >
              + dot
            </button>
            <button
              onClick={addBar}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #333', background: '#222', color: '#eee', cursor: 'pointer' }}
            >
              + crossbar
            </button>
          </div>
          <DrawCanvas
            letter={currentLetter}
            advance={current.advance}
            stroke={currentStroke}
            onStrokeChange={setStrokeForCurrent}
            marks={currentMarks}
            onDotMove={moveDot}
            onBarEndpointMove={moveBarEndpoint}
            onRemoveMark={removeMark}
          />
        </div>

        <div style={{ flex: '1 1 380px', minWidth: 280 }}>
          <h2 style={{ marginBottom: 8 }}>
            Result
            <label style={{ marginLeft: 16, fontSize: 14, fontWeight: 400 }}>
              <input type="checkbox" checked={wiggleOn} onChange={(e) => setWiggleOn(e.target.checked)} /> wiggle
            </label>
          </h2>
          <ResultPreview advance={current.advance} coeffsX={current.coeffsX} coeffsY={current.coeffsY} marks={current.marks} animate={wiggleOn} />

          <h2 style={{ margin: '24px 0 8px' }}>Preview in a word</h2>
          <input
            value={sampleWord}
            onChange={(e) => setSampleWord(e.target.value)}
            style={{ marginBottom: 8, padding: 6, borderRadius: 6, border: '1px solid #333', background: '#1a1a1a', color: '#eee', width: '100%', boxSizing: 'border-box' }}
          />
          <LivePreview instances={instancesFromText(sampleWord, glyphMap)} animate={wiggleOn} height={120} />

          <h2 style={{ margin: '24px 0 8px' }}>Export</h2>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
            Copy this into <code>src/lib/sinefont/glyphs.ts</code> to save your changes permanently, or download a
            JSON file to back up, share, or load into another browser.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <button onClick={copyExport} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #333', background: '#222', color: '#eee', cursor: 'pointer' }}>
              {copied ? 'copied!' : 'copy code'}
            </button>
            <button onClick={downloadJSON} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #333', background: '#222', color: '#eee', cursor: 'pointer' }}>
              download JSON
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #333', background: '#222', color: '#eee', cursor: 'pointer' }}
            >
              load JSON
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importJSON(file);
                e.target.value = '';
              }}
            />
          </div>
          {importError && <p style={{ fontSize: 13, color: '#f87171', marginTop: 0 }}>{importError}</p>}
          <pre style={{ background: '#111', padding: 12, borderRadius: 8, overflowX: 'auto', fontSize: 11, maxHeight: 200 }}>
            {exportCode()}
          </pre>
        </div>
      </section>
    </div>
  );
}
