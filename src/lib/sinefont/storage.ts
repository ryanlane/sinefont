import type { GlyphDef } from './types';

const STORAGE_KEY = 'sinefont:glyphs:v1';

function isGlyphDef(v: unknown): v is GlyphDef {
  if (!v || typeof v !== 'object') return false;
  const g = v as Record<string, unknown>;
  return typeof g.advance === 'number' && Array.isArray(g.coeffsX) && Array.isArray(g.coeffsY);
}

/** Accepts either a bare `{letter: GlyphDef}` map or the `{harmonics, glyphs}` wrapper the editor
 * downloads, and returns only the entries that actually look like glyphs. Used anywhere glyph data
 * comes from outside the app's own state -- a fetched file, an imported file, localStorage. */
export function sanitizeGlyphMap(parsed: unknown): Record<string, GlyphDef> | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = 'glyphs' in parsed ? (parsed as { glyphs: unknown }).glyphs : parsed;
  if (!candidate || typeof candidate !== 'object') return null;
  const out: Record<string, GlyphDef> = {};
  for (const [letter, def] of Object.entries(candidate)) {
    if (isGlyphDef(def)) out[letter] = def;
  }
  return out;
}

/** Reads any glyph edits saved in this browser. Returns null if there's nothing stored, storage
 * is unavailable (SSR, privacy mode), or the saved data doesn't look like glyphs. */
export function loadStoredGlyphs(): Record<string, GlyphDef> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeGlyphMap(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStoredGlyphs(glyphs: Record<string, GlyphDef>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(glyphs));
  } catch {
    // storage full or unavailable (e.g. private browsing) -- edits just won't persist
  }
}

export function clearStoredGlyphs(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
