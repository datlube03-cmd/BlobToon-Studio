import { z } from 'zod';
import {
  BUNDLED_FONT_FAMILY,
  measureTextWithBundledFont,
  resolveBundledFontFamily,
} from './fonts/bundledFont';

export { BUNDLED_FONT_FAMILY, resolveBundledFontFamily };

export const AspectRatioSchema = z.enum(['9:16', '16:9', '4:3', '3:4']);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;
export type AspectSelection = AspectRatio | 'all';

export interface SafeMarginRatio {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface AspectPreset {
  ratio: AspectRatio;
  width: number;
  height: number;
  unit: number;
  isPortrait: boolean;
  fileSuffix: string;
  label: string;
  orientation: 'portrait' | 'landscape';
  safeMargin: SafeMarginRatio;
  charScaleFactor: number;
  groundYRatio: number;
  captionTopRatio: number;
  captionFontScale: number;
  captionMaxWidthRatio: number;
  extraThumbnailSize?: { width: number; height: number };
}

export const ASPECT_PRESETS: Record<AspectRatio, AspectPreset> = {
  '9:16': {
    ratio: '9:16', width: 1080, height: 1920, unit: 1080, isPortrait: true,
    fileSuffix: '9x16', label: '9:16 (1080×1920)', orientation: 'portrait',
    safeMargin: { top: 0.05, bottom: 0.2, left: 0.05, right: 0.12 },
    charScaleFactor: 0.96, groundYRatio: 0.72, captionTopRatio: 0.135,
    captionFontScale: 0.042, captionMaxWidthRatio: 0.86,
  },
  '16:9': {
    ratio: '16:9', width: 1920, height: 1080, unit: 1080, isPortrait: false,
    fileSuffix: '16x9', label: '16:9 (1920×1080)', orientation: 'landscape',
    safeMargin: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
    charScaleFactor: 1.04, groundYRatio: 0.76, captionTopRatio: 0.15,
    captionFontScale: 0.039, captionMaxWidthRatio: 0.58,
    extraThumbnailSize: { width: 1280, height: 720 },
  },
  '4:3': {
    ratio: '4:3', width: 1440, height: 1080, unit: 1080, isPortrait: false,
    fileSuffix: '4x3', label: '4:3 (1440×1080)', orientation: 'landscape',
    safeMargin: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
    charScaleFactor: 1.0, groundYRatio: 0.76, captionTopRatio: 0.15,
    captionFontScale: 0.039, captionMaxWidthRatio: 0.7,
  },
  '3:4': {
    ratio: '3:4', width: 1080, height: 1440, unit: 1080, isPortrait: true,
    fileSuffix: '3x4', label: '3:4 (1080×1440)', orientation: 'portrait',
    safeMargin: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
    charScaleFactor: 0.94, groundYRatio: 0.74, captionTopRatio: 0.145,
    captionFontScale: 0.04, captionMaxWidthRatio: 0.86,
  },
};

export const ALL_ASPECT_RATIOS: AspectRatio[] = ['9:16', '16:9', '4:3', '3:4'];
export const ASPECT_RATIOS: AspectRatio[] = ALL_ASPECT_RATIOS;

export function getAspectPreset(aspect: AspectRatio = '9:16'): AspectPreset {
  return ASPECT_PRESETS[aspect] ?? ASPECT_PRESETS['9:16'];
}

export function parseAspectSelection(raw?: string): AspectSelection {
  if (!raw) return '9:16';
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'all') return 'all';
  const parsed = AspectRatioSchema.safeParse(cleaned);
  if (parsed.success) return parsed.data;
  throw new Error(`Invalid aspect ratio '${raw}'`);
}

export interface SafeAreaBox {
  left: number; right: number; top: number; bottom: number;
  width: number; height: number; centerX: number; centerY: number;
}

export interface BoundingBox {
  id: string;
  kind: 'chapter' | 'caption' | 'bubble' | 'nametag' | 'prop-label' | 'thumbnail-title';
  left: number; top: number; right: number; bottom: number;
}

export interface CharacterLayoutOverride { id: string; x?: number; y?: number; size?: number; }
export interface AspectLayoutOverride { characters?: CharacterLayoutOverride[]; captionY?: number; }
export interface ComputedCharacterPlacement { id: string; x: number; y: number; size: number; nameTagBox: BoundingBox; }
export interface ComputedPropPlacement { id: string; x: number; y: number; scale: number; labelBox?: BoundingBox; }
export interface ComputedBubblePlacement { x: number; y: number; width: number; height: number; fontSize: number; tailDirection: 'left' | 'right'; box: BoundingBox; }

export interface StageLayoutMetrics {
  aspect: AspectRatio; preset: AspectPreset; width: number; height: number; unit: number;
  groundY: number; safeArea: SafeAreaBox;
  chapterBadge: { x: number; y: number; width: number; height: number; fontSize: number; box: BoundingBox };
  captionBand: { centerX: number; topY: number; maxWidth: number; fontSize: number; wordGap: number; lineHeight: number; letterSpacing: number; outlineStroke: number };
  characters: Map<string, ComputedCharacterPlacement>;
  props: Map<string, ComputedPropPlacement>;
}

export function computeSafeArea(aspect: AspectRatio): SafeAreaBox {
  const p = getAspectPreset(aspect);
  const left = Math.round(p.width * p.safeMargin.left);
  const right = Math.round(p.width * (1 - p.safeMargin.right));
  const top = Math.round(p.height * p.safeMargin.top);
  const bottom = Math.round(p.height * (1 - p.safeMargin.bottom));
  return { left, right, top, bottom, width: right - left, height: bottom - top, centerX: Math.round((left + right) / 2), centerY: Math.round((top + bottom) / 2) };
}

export function getCaptionMetrics(aspect: AspectRatio = '9:16') {
  const p = getAspectPreset(aspect);
  const unit = Math.min(p.width, p.height);
  const fontSize = unit * p.captionFontScale;
  const wordGap = 0.28 * fontSize;
  const lineHeight = 1.18 * fontSize;
  const outline = 0.12 * fontSize;
  const maxWidthPx = p.width * p.captionMaxWidthRatio;
  return {
    aspect, unit, fontSize, wordGap, lineHeight, outline, letterSpacing: 0,
    maxWidth: maxWidthPx, maxWidthPx,
    wordGapOverFontSize: Number((wordGap / fontSize).toFixed(4)),
    lineHeightOverFontSize: Number((lineHeight / fontSize).toFixed(4)),
  };
}

export function verifyCaptionRatiosInvariant() {
  const rows = ALL_ASPECT_RATIOS.map((r) => getCaptionMetrics(r));
  const passed = rows.every((r) => r.wordGapOverFontSize === 0.28 && r.lineHeightOverFontSize === 1.18);
  return { passed, rows };
}

export function measureTextWidth(text: string, fontSize: number, letterSpacing = 0, fontFamily?: string): number {
  return measureTextWithBundledFont(text, fontSize, letterSpacing, fontFamily);
}

export function wrapWordsByMeasuredWidth<T extends { word: string }>(words: T[], maxWidthPx: number, fontSize: number, wordPaddingPx: number, gapPx: number, fontFamily?: string): T[][] {
  if (!words.length) return [];
  const lines: T[][] = [];
  let cur: T[] = [], curW = 0;
  for (const item of words) {
    const wPx = measureTextWidth(item.word.toUpperCase(), fontSize, 0, fontFamily) + wordPaddingPx;
    const nextW = cur.length === 0 ? wPx : curW + gapPx + wPx;
    if (cur.length > 0 && nextW > maxWidthPx) { lines.push(cur); cur = [item]; curW = wPx; }
    else { cur.push(item); curW = nextW; }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

export function computeStageLayout(
  aspect: AspectRatio,
  characters: Array<{ id: string; name: string; x: number; y: number; size: number }>,
  props: Array<{ id: string; x: number; y: number; scale: number; label?: string }>,
  override?: AspectLayoutOverride
): StageLayoutMetrics {
  const preset = getAspectPreset(aspect);
  const { width, height, unit } = preset;
  const safeArea = computeSafeArea(aspect);
  const groundY = Math.round(height * preset.groundYRatio);
  const bh = Math.round(unit * 0.068), bw = Math.round(unit * 0.36), bx = safeArea.centerX, by = Math.round(safeArea.top + bh / 2 + unit * 0.01);
  const chapterBadge = { x: bx, y: by, width: bw, height: bh, fontSize: Math.round(unit * 0.034), box: { id: 'chapter-badge', kind: 'chapter' as const, left: bx - bw / 2, top: by - bh / 2, right: bx + bw / 2, bottom: by + bh / 2 } };
  const cm = getCaptionMetrics(aspect);
  const captionTopY = override?.captionY ? Math.round(override.captionY <= 1 ? override.captionY * height : override.captionY) : Math.round(Math.max(chapterBadge.box.bottom + unit * 0.018, height * preset.captionTopRatio));

  const charMap = new Map<string, ComputedCharacterPlacement>();
  const sorted = [...characters].sort((a, b) => a.x - b.x);
  const usableLeft = safeArea.left + unit * 0.14, usableRight = safeArea.right - unit * 0.14, span = Math.max(unit * 0.2, usableRight - usableLeft);
  sorted.forEach((ch, idx) => {
    const size = Number(((ch.size || 1) * preset.charScaleFactor * (unit / 1080)).toFixed(3));
    const cx = sorted.length === 1 ? safeArea.centerX : Math.round(usableLeft + ((idx + 0.5) / sorted.length) * span);
    const cy = Math.min(safeArea.bottom - Math.round(196 * size), Math.round(groundY + unit * 0.12));
    charMap.set(ch.id, { id: ch.id, x: cx, y: cy, size, nameTagBox: { id: `nametag-${ch.id}`, kind: 'nametag', left: cx - 80, top: cy + 150, right: cx + 80, bottom: cy + 190 } });
  });

  const propMap = new Map<string, ComputedPropPlacement>();
  props.forEach((pr, idx) => {
    const px = Math.round(usableLeft + ((idx + 0.5) / Math.max(1, props.length)) * span);
    const py = Math.round(groundY - unit * 0.11);
    propMap.set(pr.id, { id: pr.id, x: px, y: py, scale: pr.scale });
  });

  return { aspect, preset, width, height, unit, groundY, safeArea, chapterBadge, captionBand: { centerX: safeArea.centerX, topY: captionTopY, maxWidth: Math.min(safeArea.width, Math.round(cm.maxWidth)), fontSize: cm.fontSize, wordGap: cm.wordGap, lineHeight: cm.lineHeight, letterSpacing: 0, outlineStroke: cm.outline }, characters: charMap, props: propMap };
}

export function computeBubblePlacement(text: string, charPlacement: ComputedCharacterPlacement, layout: StageLayoutMetrics): ComputedBubblePlacement {
  const { unit, safeArea, captionBand } = layout;
  const fontSize = Math.round(unit * 0.026);
  const bw = Math.max(Math.round(unit * 0.21), Math.min(Math.round(safeArea.width * 0.55), measureTextWidth(text.toUpperCase(), fontSize) + Math.round(unit * 0.055)));
  const bh = Math.round(unit * 0.076);
  const x = Math.max(safeArea.left + bw / 2 + 8, Math.min(safeArea.right - bw / 2 - 8, charPlacement.x));
  const y = Math.max(captionBand.topY + captionBand.lineHeight * 2.2 + bh / 2 + 12, Math.min(safeArea.bottom - bh / 2 - 40, Math.round(charPlacement.y - 235 * charPlacement.size)));
  return { x, y, width: bw, height: bh, fontSize, tailDirection: charPlacement.x < safeArea.centerX ? 'left' : 'right', box: { id: `bubble-${charPlacement.id}`, kind: 'bubble', left: x - bw / 2, top: y - bh / 2, right: x + bw / 2, bottom: y + bh / 2 + Math.round(unit * 0.03) } };
}

export function verifyBoxesInsideSafeArea(boxes: BoundingBox[], safeArea: SafeAreaBox, tol = 2) {
  const violations = boxes.filter((b) => b.left < safeArea.left - tol || b.right > safeArea.right + tol || b.top < safeArea.top - tol || b.bottom > safeArea.bottom + tol).map((b) => b.id);
  return { ok: violations.length === 0, violations };
}
