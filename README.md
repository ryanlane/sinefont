# sinefont

A cursive React font that's 100% sine waves. Every glyph is a parametric curve —
`x(t)` and `y(t)` are each their own sum of harmonics, like a handful of pendulums
swinging together — so letters can loop, animate with a gentle idle wiggle, and
morph smoothly from one word to the next.

```tsx
import { SineText } from 'sinefont';

export default function App() {
  return <SineText text="hello" animate fontSize={96} />;
}
```

## Install

```sh
npm install sinefont
```

Requires React 18 or 19 (`react` and `react-dom` are peer dependencies, not
bundled).

## Usage

```tsx
import { useState } from 'react';
import { SineText } from 'sinefont';

export default function App() {
  const [text, setText] = useState('hello');

  return (
    <>
      <SineText
        text={text}
        animate
        wiggleAmount={3}
        wiggleSpeed={1}
        morphDuration={600}
        color="#7dd3fc"
        strokeWidth={4}
        fontSize={120}
      />
      <input value={text} onChange={(e) => setText(e.target.value)} />
    </>
  );
}
```

Changing `text` doesn't just swap the drawing — each glyph's harmonics smoothly
tween from the old shape to the new one, so words morph into each other instead
of popping.

### Props

| Prop            | Type                      | Default         | Description                                                        |
| ---------------- | ------------------------- | --------------- | -------------------------------------------------------------------- |
| `text`          | `string`                  | —               | The word/phrase to render. Change it anytime.                       |
| `glyphs`        | `Record<string, GlyphDef>`| built-in font   | A custom font to render with. See [Custom fonts](#custom-fonts).    |
| `fontSize`      | `number`                  | `96`            | Font size in px.                                                    |
| `color`         | `string`                  | `currentColor`  | Stroke color.                                                        |
| `strokeWidth`   | `number`                  | `4`             | Stroke width.                                                        |
| `letterSpacing` | `number`                  | `10`            | Extra space between glyphs (font units).                            |
| `animate`       | `boolean`                 | `false`         | Turns on the continuous idle wiggle.                                 |
| `wiggleAmount`  | `number`                  | `3`             | Wiggle strength.                                                     |
| `wiggleSpeed`   | `number`                  | `1`             | Wiggle speed.                                                        |
| `morphDuration` | `number`                  | `600`           | Milliseconds to morph from the previous word to a new one.          |
| `className`     | `string`                  | —               | Passed to the underlying `<svg>`.                                    |
| `style`         | `React.CSSProperties`     | —               | Passed to the underlying `<svg>`.                                    |

## Custom fonts

`sinefont` ships with a small built-in cursive alphabet, but you can bring your
own — draw one with the glyph editor (see [Drawing your own font](#drawing-your-own-font)
below), download it as JSON, and load it at runtime:

```tsx
import { useEffect, useState } from 'react';
import { SineText, loadGlyphFont, type GlyphDef } from 'sinefont';

export default function App() {
  const [font, setFont] = useState<Record<string, GlyphDef>>();

  useEffect(() => {
    loadGlyphFont('/fonts/my-handwriting.json').then(setFont);
  }, []);

  if (!font) return null;
  return <SineText text="hello" glyphs={font} animate />;
}
```

`loadGlyphFont` just fetches and validates the JSON file — you can also build a
`glyphs` map by hand, or generate one programmatically, since it's plain data:
`{ [letter]: { advance, coeffsX, coeffsY, marks? } }`.

## Drawing your own font

This repo is also the font-drawing tool. Clone it, run the app, and use the
"Glyph Editor" tab to draw letters by hand (freehand strokes get fitted to sine
harmonics automatically), preview them animated, and export:

```sh
git clone https://github.com/ryanlane/sinefont.git
cd sinefont
npm install
npm run dev
```

From the editor you can:

- **Copy code** — paste straight into `src/lib/sinefont/glyphs.ts` as the
  built-in alphabet.
- **Download JSON** — get a `sinefont-glyphs.json` file. Drop it in this
  project's `public/` folder and the app picks it up automatically on next
  load (no code changes) — or use it with `loadGlyphFont` in any other project,
  per [Custom fonts](#custom-fonts) above.

Edits also autosave to `localStorage` as you draw, so refreshing the page
during a drawing session won't lose your work.

## Publishing / building the package

`npm run dev` and `npm run build` build the demo app (this README, the editor,
etc.). The publishable library itself — just `src/lib/sinefont` — is built
separately:

```sh
npm run build:lib
```

This emits `dist/sinefont.mjs` (ESM), `dist/sinefont.cjs` (CJS), and type
declarations, which is what actually ships to npm (see the `files` field in
`package.json`).

## License

MIT
