import { useEffect, useState } from 'react';
import { initGlyphs, SineText } from './lib/sinefont';
import { GlyphEditor } from './tool/GlyphEditor';

const WORDS = ['hello', 'wave', 'sine', 'oasis', 'shine', 'the quick brown fox jumps over the lazy dog'];

function Demo() {
  const [text, setText] = useState('hello');
  const [animate, setAnimate] = useState(true);
  const [wiggleAmount, setWiggleAmount] = useState(3);
  const [wiggleSpeed, setWiggleSpeed] = useState(1);
  const [morphDuration, setMorphDuration] = useState(600);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
      <div style={{ background: '#111', borderRadius: 12, padding: '32px 24px', width: '100%', boxSizing: 'border-box', overflowX: 'auto' }}>
        <SineText
          text={text}
          animate={animate}
          wiggleAmount={wiggleAmount}
          wiggleSpeed={wiggleSpeed}
          morphDuration={morphDuration}
          color="#7dd3fc"
          fontSize={120}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {WORDS.map((w) => (
          <button
            key={w}
            onClick={() => setText(w)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: '1px solid #333',
              background: w === text ? '#7dd3fc' : '#1a1a1a',
              color: w === text ? '#111' : '#eee',
              cursor: 'pointer',
            }}
          >
            {w}
          </button>
        ))}
      </div>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="type any word (letters: a e h i l n o s v w)"
        style={{ padding: 8, width: '100%', maxWidth: 420, borderRadius: 8, border: '1px solid #333', background: '#1a1a1a', color: '#eee', boxSizing: 'border-box' }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 420, textAlign: 'left' }}>
        <label>
          <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} /> wiggle
        </label>
        <label>
          wiggle amount: {wiggleAmount}
          <input type="range" min={0} max={10} step={0.5} value={wiggleAmount} onChange={(e) => setWiggleAmount(Number(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label>
          wiggle speed: {wiggleSpeed}
          <input type="range" min={0} max={3} step={0.1} value={wiggleSpeed} onChange={(e) => setWiggleSpeed(Number(e.target.value))} style={{ width: '100%' }} />
        </label>
        <label>
          morph duration: {morphDuration}ms
          <input type="range" min={100} max={2000} step={50} value={morphDuration} onChange={(e) => setMorphDuration(Number(e.target.value))} style={{ width: '100%' }} />
        </label>
      </div>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<'demo' | 'editor'>('demo');
  // gate the first render on the sinefont-glyphs.json lookup so nothing renders with the seed
  // alphabet only to immediately flip to a different one a moment later
  const [glyphsReady, setGlyphsReady] = useState(false);
  useEffect(() => {
    initGlyphs().then(() => setGlyphsReady(true));
  }, []);

  if (!glyphsReady) return null;

  // an isolated, chrome-free render of just the logo -- for generating a clean hero screenshot
  // (see scripts/screenshot.cjs), not part of the normal app UI
  if (new URLSearchParams(window.location.search).has('bare')) {
    return (
      <div style={{ display: 'inline-block', alignSelf: 'center', padding: 40, background: '#111', borderRadius: 16 }}>
        <SineText text="sinefont" fontSize={220} strokeWidth={6} color="#7dd3fc" animate wiggleAmount={2} />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 24px 64px', textAlign: 'left' }}>
      <h1 style={{ display: 'flex', justifyContent: 'center', margin: '32px 0' }}>
        <SineText text="sinefont" fontSize={64} strokeWidth={4} color="var(--text-h)" />
      </h1>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
        <button
          onClick={() => setTab('demo')}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #333', background: tab === 'demo' ? '#7dd3fc' : '#1a1a1a', color: tab === 'demo' ? '#111' : '#eee', cursor: 'pointer' }}
        >
          Demo
        </button>
        <button
          onClick={() => setTab('editor')}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #333', background: tab === 'editor' ? '#7dd3fc' : '#1a1a1a', color: tab === 'editor' ? '#111' : '#eee', cursor: 'pointer' }}
        >
          Glyph Editor
        </button>
      </div>
      {tab === 'demo' ? <Demo /> : <GlyphEditor />}
    </div>
  );
}

export default App;
