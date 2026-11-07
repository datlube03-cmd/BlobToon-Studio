import { AspectRatio, computeSafeArea, getCaptionMetrics, verifyCaptionRatiosInvariant } from '../aspect';

export interface WordTiming {
  word: string;
  startSec: number;
  endSec: number;
}

export interface MeasuredWord extends WordTiming {
  width: number;
  x: number;
  y: number;
  centerX: number;
  centerY: number;
}

let fredokaLoaded = false;
let fredokaPromise: Promise<void> | null = null;
let fontFallbackWarning: string | null = null;

export const VIETNAMESE_FONT_TEST_STRING = 'Bạn nằm với tới tay cầm';

export function getFontFallbackWarning(): string | null {
  return fontFallbackWarning;
}

function checkVietnameseGlyphSupport(): string | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  // Compare Vietnamese precomposed glyphs ('ớ', 'ằ', 'ậ') width in Fredoka vs fallback families
  for (const glyph of ['ớ', 'ằ', 'ậ']) {
    ctx.font = '700 64px "Fredoka", monospace';
    const wMono = ctx.measureText(glyph).width;
    ctx.font = '700 64px monospace';
    const baseMono = ctx.measureText(glyph).width;
    ctx.font = '700 64px "Fredoka", serif';
    const wSerif = ctx.measureText(glyph).width;
    ctx.font = '700 64px serif';
    const baseSerif = ctx.measureText(glyph).width;
    if (Math.abs(wMono - baseMono) < 0.05 && Math.abs(wSerif - baseSerif) < 0.05 && Math.abs(wMono - wSerif) > 0.5) {
      return `Cảnh báo Font: Ký tự tiếng Việt "${glyph}" đang bị rơi về font dự phòng (fallback).`;
    }
  }
  return null;
}

/**
 * Loads Fredoka Bold (700) from Google Fonts with the Vietnamese test string
 * "Bạn nằm với tới tay cầm" before any measuring or drawing.
 */
export async function ensureFredokaFontLoaded(): Promise<void> {
  if (fredokaLoaded) return;
  if (!fredokaPromise) {
    fredokaPromise = (async () => {
      if (typeof document !== 'undefined' && 'fonts' in document) {
        try {
          await document.fonts.load('700 48px "Fredoka"', VIETNAMESE_FONT_TEST_STRING);
          await document.fonts.ready;
          fontFallbackWarning = checkVietnameseGlyphSupport();
        } catch {
          fontFallbackWarning = 'Không thể tải font Fredoka Bold (subset vietnamese) từ Google Fonts.';
        }
      }
      fredokaLoaded = true;
      const check = verifyCaptionRatiosInvariant();
      console.info('[BlobToon Captions Check] 4-Ratio Invariant:', check.passed, check.rows);
    })();
  }
  return fredokaPromise;
}

/**
 * Spreads word timings across the audio duration proportionally by character count.
 */
export function computeWordTimingsByCharCount(
  text: string,
  startSec: number,
  durationSec: number,
): WordTiming[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const totalChars = Math.max(
    1,
    words.reduce((sum, w) => sum + w.length, 0),
  );
  const safeDur = Math.max(0.15, durationSec);
  let cursor = startSec;

  return words.map((word, idx) => {
    const share = (word.length / totalChars) * safeDur;
    const wStart = cursor;
    const wEnd = idx === words.length - 1 ? startSec + safeDur : cursor + share;
    cursor = wEnd;
    return { word, startSec: wStart, endSec: wEnd };
  });
}

/**
 * Measures and wraps words into at most 2 centered lines within maxWidthPx
 * using ctx.measureText with the exact Fredoka 700 font.
 * Never justifies or stretches words.
 */
export function layoutCaptionLines(
  ctx: CanvasRenderingContext2D,
  timings: WordTiming[],
  aspect: AspectRatio,
  centerX: number,
  topY: number,
): { lines: MeasuredWord[][]; fontSize: number; outline: number; lineHeight: number } {
  const m = getCaptionMetrics(aspect);
  const { fontSize, wordGap, lineHeight, outline, maxWidthPx } = m;

  ctx.save();
  ctx.font = `700 ${fontSize}px "Fredoka", sans-serif`;
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  }

  const widths = timings.map((t) => ctx.measureText(t.word).width);
  ctx.restore();

  // Group into lines up to maxWidthPx, capped at 2 centered lines
  const rawLines: { items: WordTiming[]; widths: number[] }[] = [];
  let curItems: WordTiming[] = [];
  let curWidths: number[] = [];
  let curW = 0;

  for (let i = 0; i < timings.length; i++) {
    const w = widths[i];
    const nextW = curItems.length === 0 ? w : curW + wordGap + w;
    if (curItems.length > 0 && nextW > maxWidthPx && rawLines.length < 1) {
      rawLines.push({ items: curItems, widths: curWidths });
      curItems = [timings[i]];
      curWidths = [w];
      curW = w;
    } else {
      curItems.push(timings[i]);
      curWidths.push(w);
      curW = nextW;
    }
  }
  if (curItems.length > 0) {
    rawLines.push({ items: curItems, widths: curWidths });
  }

  // Enforce at most 2 lines; if overflow on line 2, trim excess words cleanly
  const clampedLines = rawLines.slice(0, 2).map((line) => {
    const keptItems: WordTiming[] = [];
    const keptWidths: number[] = [];
    let accW = 0;
    for (let i = 0; i < line.items.length; i++) {
      const next = keptItems.length === 0 ? line.widths[i] : accW + wordGap + line.widths[i];
      if (keptItems.length > 0 && next > maxWidthPx * 1.06) break;
      keptItems.push(line.items[i]);
      keptWidths.push(line.widths[i]);
      accW = next;
    }
    return { items: keptItems, widths: keptWidths, totalW: accW };
  });

  const measuredLines: MeasuredWord[][] = clampedLines.map((line, lineIdx) => {
    let xCursor = centerX - line.totalW / 2;
    const y = topY + lineIdx * lineHeight;
    return line.items.map((item, idx) => {
      const w = line.widths[idx];
      const mw: MeasuredWord = {
        ...item,
        width: w,
        x: xCursor,
        y,
        centerX: xCursor + w / 2,
        centerY: y + fontSize * 0.35,
      };
      xCursor += w + wordGap;
      return mw;
    });
  });

  return { lines: measuredLines, fontSize, outline, lineHeight };
}

/**
 * Draws word-by-word highlighted captions in the aspect ratio's safe area.
 * Spoken word scales around its own center WITHOUT changing layout of other words.
 */
export function drawWordByWordCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  t: number,
  startSec: number,
  durationSec: number,
  aspect: AspectRatio,
  styleOverride?: { highlightColor?: string; scaleBoost?: number },
): void {
  if (!text.trim()) return;
  const safe = computeSafeArea(aspect);
  const timings = computeWordTimingsByCharCount(text, startSec, durationSec);
  if (timings.length === 0) return;

  const m = getCaptionMetrics(aspect);
  const centerX = safe.left + safe.width / 2;
  const captionBottomY = safe.bottom - m.unit * 0.035;
  const topY = captionBottomY - m.lineHeight * 1.45;

  const { lines, fontSize, outline } = layoutCaptionLines(ctx, timings, aspect, centerX, topY);
  const maxScale = styleOverride?.scaleBoost ?? 1.16;
  const hiColor = styleOverride?.highlightColor || '#facc15';

  ctx.save();
  ctx.font = `700 ${fontSize}px "Fredoka", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  }

  for (const line of lines) {
    for (const word of line) {
      const isSpoken = t >= word.startSec && t <= word.endSec;
      const progress = isSpoken
        ? Math.min(1, (t - word.startSec) / Math.max(0.06, (word.endSec - word.startSec) * 0.35))
        : 0;
      const scale = isSpoken ? 1 + (maxScale - 1) * Math.sin(progress * Math.PI * 0.5) : 1;

      ctx.save();
      ctx.translate(word.centerX, word.centerY);
      if (scale !== 1) ctx.scale(scale, scale);

      ctx.lineWidth = outline;
      ctx.strokeStyle = '#222222';
      ctx.strokeText(word.word, 0, 0);

      ctx.fillStyle = isSpoken ? hiColor : '#ffffff';
      ctx.fillText(word.word, 0, 0);
      ctx.restore();
    }
  }

  ctx.restore();
}
