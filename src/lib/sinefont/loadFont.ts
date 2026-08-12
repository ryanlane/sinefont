import type { GlyphDef } from './types';
import { sanitizeGlyphMap } from './storage';

/**
 * Fetches a sinefont font file (JSON) from a URL and returns it as a `{letter: GlyphDef}` map --
 * pass the result straight to `<SineText glyphs={...} />`. Accepts either the `{harmonics, glyphs}`
 * wrapper the glyph editor's "download JSON" button produces, or a bare glyph map.
 *
 * This is the piece that lets a consuming app load its own custom alphabet at runtime instead of
 * bundling sinefont's built-in one:
 *
 * ```tsx
 * const [font, setFont] = useState<Record<string, GlyphDef>>();
 * useEffect(() => { loadGlyphFont('/fonts/my-handwriting.json').then(setFont); }, []);
 * return font ? <SineText text="hello" glyphs={font} /> : null;
 * ```
 *
 * Throws if the file can't be fetched or doesn't look like a sinefont font, so wrap the call in a
 * try/catch (or a `.catch(...)`) if you want to fall back to something instead of leaving the
 * promise unhandled.
 */
export async function loadGlyphFont(url: string): Promise<Record<string, GlyphDef>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`loadGlyphFont: could not fetch "${url}" (${res.status})`);
  const parsed = await res.json();
  const glyphs = sanitizeGlyphMap(parsed);
  if (!glyphs || Object.keys(glyphs).length === 0) {
    throw new Error(`loadGlyphFont: "${url}" doesn't look like a sinefont glyph file`);
  }
  return glyphs;
}
