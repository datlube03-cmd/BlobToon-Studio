import { useEffect, useState } from 'react';
import opentype, { type Font } from 'opentype.js';
import { continueRender, delayRender } from 'remotion';
import { FREDOKA_BOLD_TTF_BASE64 } from './fredokaBase64';

export const BUNDLED_FONT_FAMILY = 'Fredoka';
export const BUNDLED_FONT_FILE_PATH = 'assets/fonts/Fredoka-Bold.ttf';
export const BUNDLED_FONT_LICENSE_PATH = 'assets/fonts/OFL.txt';
export const BUNDLED_FONT_FAMILIES = [BUNDLED_FONT_FAMILY] as const;

let cachedOpentypeFont: Font | null = null;

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Resolves a requested `fontFamily` string (e.g. from a Skill's `renderParams.fontFamily`)
 * against the repository's bundled OFL fonts. Falls back to `BUNDLED_FONT_FAMILY` ('Fredoka')
 * whenever the requested font is not bundled in `assets/fonts/`.
 */
export function resolveBundledFontFamily(requestedFontFamily?: string): string {
  if (!requestedFontFamily || !requestedFontFamily.trim()) {
    return BUNDLED_FONT_FAMILY;
  }
  const candidates = requestedFontFamily
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''));

  for (const candidate of candidates) {
    const matched = BUNDLED_FONT_FAMILIES.find(
      (bundled) => bundled.toLowerCase() === candidate.toLowerCase()
    );
    if (matched) {
      return matched;
    }
  }
  return BUNDLED_FONT_FAMILY;
}

/**
 * Returns the parsed `opentype.Font` instance for the bundled OFL font (`Fredoka-Bold.ttf`).
 * Never uses a system font or hardcoded character width lookup table.
 */
export function getBundledOpentypeFont(_fontFamily?: string): Font {
  if (!cachedOpentypeFont) {
    const arrayBuffer = base64ToArrayBuffer(FREDOKA_BOLD_TTF_BASE64);
    cachedOpentypeFont = opentype.parse(arrayBuffer);
  }
  return cachedOpentypeFont;
}

/**
 * Measures the exact pixel advance width of `text` at `fontSize` using `opentype.js`
 * against the bundled `Fredoka-Bold.ttf` font (with kerning enabled).
 */
export function measureTextWithBundledFont(
  text: string,
  fontSize: number,
  letterSpacing = 0,
  fontFamily?: string
): number {
  if (!text || fontSize <= 0) return 0;
  const resolvedFamily = resolveBundledFontFamily(fontFamily);
  const font = getBundledOpentypeFont(resolvedFamily);
  const advanceWidth = font.getAdvanceWidth(text, fontSize, { kerning: true });
  const extraTracking = text.length > 1 ? (text.length - 1) * letterSpacing : 0;
  return Math.ceil(advanceWidth + extraTracking);
}

/**
 * Returns an `@font-face` CSS rule for the bundled `Fredoka-Bold.ttf` font.
 */
export function getBundledFontFaceCss(): string {
  return `@font-face {
  font-family: '${BUNDLED_FONT_FAMILY}';
  src: url('/fonts/Fredoka-Bold.ttf') format('truetype'),
       url('data:font/ttf;base64,${FREDOKA_BOLD_TTF_BASE64}') format('truetype');
  font-weight: 700 800;
  font-style: normal;
  font-display: block;
}`;
}

/**
 * Explicitly loads the bundled OFL font (`Fredoka-Bold.ttf`) in Remotion using
 * `@font-face` / `FontFace` + `delayRender` / `continueRender`.
 */
export function useLoadBundledFontInRemotion(): boolean {
  const [loaded, setLoaded] = useState<boolean>(() => typeof window === 'undefined');
  const [handle] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return delayRender(`Loading bundled OFL font: ${BUNDLED_FONT_FAMILY}`);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    let cancelled = false;

    async function loadFont() {
      try {
        if (typeof FontFace !== 'undefined' && document?.fonts) {
          const face = new FontFace(
            BUNDLED_FONT_FAMILY,
            `url(data:font/ttf;base64,${FREDOKA_BOLD_TTF_BASE64}) format('truetype')`,
            { weight: '700', style: 'normal' }
          );
          const loadedFace = await face.load();
          document.fonts.add(loadedFace);
        }
      } catch {
        // Ignore if FontFace API is unsupported in test DOM
      } finally {
        if (!cancelled) {
          setLoaded(true);
          if (handle !== null) {
            try {
              continueRender(handle);
            } catch {
              // Ignore if outside Remotion context
            }
          }
        }
      }
    }

    loadFont();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return loaded;
}
