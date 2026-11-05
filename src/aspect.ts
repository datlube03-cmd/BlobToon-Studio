import { z } from 'zod';
import {
  BUNDLED_FONT_FAMILY,
  measureTextWithBundledFont,
  resolveBundledFontFamily,
} from './fonts/bundledFont';

export { BUNDLED_FONT_FAMILY, resolveBundledFontFamily };

export const AspectRatioSchema = z.enum(['9:16', '16:9', '4:3', '3:4']);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

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
    ratio: '9:16',
    width: 1080,
    height: 1920,
    fileSuffix: '9x16',
    label: 'Shorts / TikTok / Reels (9:16)',
    orientation: 'portrait',
    safeMargin: { top: 0.05, bottom: 0.2, left: 0.05, right: 0.13 },
    charScaleFactor: 0.92,
    groundYRatio: 0.58,
    captionTopRatio: 0.135,
    captionFontScale: 0.042,
    captionMaxWidthRatio: 0.86,
  },
  '16:9': {
    ratio: '16:9',
    width: 1920,
    height: 1080,
    fileSuffix: '16x9',
    label: 'YouTube Landscape (16:9)',
    orientation: 'landscape',
    safeMargin: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
    charScaleFactor: 0.76,
    groundYRatio: 0.64,
    captionTopRatio: 0.165,
    captionFontScale: 0.039,
    captionMaxWidthRatio: 0.58,
    extraThumbnailSize: { width: 1280, height: 720 },
  },
  '4:3': {
    ratio: '4:3',
    width: 1440,
    height: 1080,
    fileSuffix: '4x3',
    label: 'Classic / Facebook (4:3)',
    orientation: 'landscape',
    safeMargin: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
    charScaleFactor: 0.78,
    groundYRatio: 0.64,
    captionTopRatio: 0.165,
    captionFontScale: 0.039,
    captionMaxWidthRatio: 0.7,
  },
  '3:4': {
    ratio: '3:4',
    width: 1080,
    height: 1440,
    fileSuffix: '3x4',
    label: 'Portrait Feed (3:4)',
    orientation: 'portrait',
    safeMargin: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
    charScaleFactor: 0.86,
    groundYRatio: 0.6,
    captionTopRatio: 0.145,
    captionFontScale: 0.04,
    captionMaxWidthRatio: 0.86,
  },
};

export const ALL_ASPECT_RATIOS: AspectRatio[] = Object.keys(ASPECT_PRESETS) as AspectRatio[];
export const ASPECT_RATIOS: AspectRatio[] = ALL_ASPECT_RATIOS;
export type AspectSelection = AspectRatio | 'all';

export function getAspectPreset(aspect: AspectRatio = '9:16'): AspectPreset {
  return ASPECT_PRESETS[aspect] ?? ASPECT_PRESETS['9:16'];
}

export interface SafeAreaBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface BoundingBox {
  id: string;
  kind: 'chapter' | 'caption' | 'bubble' | 'nametag' | 'prop-label' | 'thumbnail-title';
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CharacterLayoutOverride {
  id: string;
  /** Normalized 0..1 (or pixel coordinate > 1) */
  x?: number;
  /** Normalized 0..1 (or pixel coordinate > 1) */
  y?: number;
  size?: number;
}

export interface AspectLayoutOverride {
  characters?: CharacterLayoutOverride[];
  captionY?: number;
}

export interface ComputedCharacterPlacement {
  id: string;
  x: number;
  y: number;
  size: number;
  nameTagBox: BoundingBox;
}

export interface ComputedPropPlacement {
  id: string;
  x: number;
  y: number;
  scale: number;
  labelBox?: BoundingBox;
}

export interface ComputedBubblePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  tailDirection: 'left' | 'right';
  box: BoundingBox;
}

export interface StageLayoutMetrics {
  aspect: AspectRatio;
  preset: AspectPreset;
  width: number;
  height: number;
  unit: number;
  groundY: number;
  safeArea: SafeAreaBox;
  chapterBadge: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    box: BoundingBox;
  };
  captionBand: {
    centerX: number;
    topY: number;
    maxWidth: number;
    fontSize: number;
    wordGap: number;
    lineHeight: number;
    letterSpacing: number;
    outlineStroke: number;
  };
  characters: Map<string, ComputedCharacterPlacement>;
  props: Map<string, ComputedPropPlacement>;
}

/**
 * Exact glyph advance-width measurement (in pixels) using `opentype.js` against the
 * bundled OFL font (`assets/fonts/Fredoka-Bold.ttf`). Never uses a system font or hardcoded lookup table.
 */
export function measureTextWidth(
  text: string,
  fontSize: number,
  letterSpacing = 0,
  fontFamily?: string
): number {
  return measureTextWithBundledFont(text, fontSize, letterSpacing, fontFamily);
}

/**
 * Wraps words into lines based on measured pixel width rather than fixed word/character counts.
 */
export function wrapWordsByMeasuredWidth<T extends { word: string }>(
  words: T[],
  maxWidthPx: number,
  fontSize: number,
  wordPaddingPx: number,
  gapPx: number,
  fontFamily?: string
): T[][] {
  if (words.length === 0) return [];
  const lines: T[][] = [];
  let currentLine: T[] = [];
  let currentWidth = 0;

  for (const item of words) {
    const wPx = measureTextWidth(item.word.toUpperCase(), fontSize, 0, fontFamily) + wordPaddingPx;
    const addedWidth = currentLine.length === 0 ? wPx : currentWidth + gapPx + wPx;
    if (currentLine.length > 0 && addedWidth > maxWidthPx) {
      lines.push(currentLine);
      currentLine = [item];
      currentWidth = wPx;
    } else {
      currentLine.push(item);
      currentWidth = addedWidth;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  return lines;
}

function normalizeCoord(val: number, referenceMax: number): number {
  if (val >= 0 && val <= 1) return val;
  return Math.max(0.08, Math.min(0.92, val / referenceMax));
}

export function computeSafeArea(aspect: AspectRatio): SafeAreaBox {
  const preset = getAspectPreset(aspect);
  const left = Math.round(preset.width * preset.safeMargin.left);
  const right = Math.round(preset.width * (1 - preset.safeMargin.right));
  const top = Math.round(preset.height * preset.safeMargin.top);
  const bottom = Math.round(preset.height * (1 - preset.safeMargin.bottom));
  const width = right - left;
  const height = bottom - top;
  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    centerX: Math.round(left + width / 2),
    centerY: Math.round(top + height / 2),
  };
}

/**
 * Computes adaptive stage layout for any aspect preset from `unit = min(width, height)`.
 */
export function computeStageLayout(
  aspect: AspectRatio,
  characters: Array<{ id: string; name: string; x: number; y: number; size: number }>,
  props: Array<{ id: string; x: number; y: number; scale: number; label?: string }>,
  override?: AspectLayoutOverride
): StageLayoutMetrics {
  const preset = getAspectPreset(aspect);
  const { width, height } = preset;
  const unit = Math.min(width, height);
  const safeArea = computeSafeArea(aspect);
  const groundY = Math.round(height * preset.groundYRatio);

  // 1. Chapter Badge in top safe band
  const badgeHeight = Math.round(unit * 0.068);
  const badgeWidth = Math.round(unit * 0.36);
  const badgeX = safeArea.centerX;
  const badgeY = Math.round(safeArea.top + badgeHeight / 2 + unit * 0.01);
  const badgeFontSize = Math.round(unit * 0.034);
  const chapterBadge = {
    x: badgeX,
    y: badgeY,
    width: badgeWidth,
    height: badgeHeight,
    fontSize: badgeFontSize,
    box: {
      id: 'chapter-badge',
      kind: 'chapter' as const,
      left: Math.round(badgeX - badgeWidth / 2),
      top: Math.round(badgeY - badgeHeight / 2),
      right: Math.round(badgeX + badgeWidth / 2),
      bottom: Math.round(badgeY + badgeHeight / 2),
    },
  };

  // 2. Top Caption Band (below chapter badge, inside safe area)
  // Single source of truth for caption typography & spacing (Change G):
  // fontSize = unit * k per aspect; wordGap = fontSize * 0.28; lineHeight = fontSize * 1.18;
  // letterSpacing = 0; outlineStroke = fontSize * 0.12; maxWidth = width * captionMaxWidthRatio
  const captionTopY = override?.captionY
    ? Math.round(override.captionY <= 1 ? override.captionY * height : override.captionY)
    : Math.round(Math.max(chapterBadge.box.bottom + unit * 0.018, height * preset.captionTopRatio));
  const captionFontSize = Math.round(unit * preset.captionFontScale);
  const captionWordGap = Number((captionFontSize * 0.28).toFixed(2));
  const captionLineHeight = Number((captionFontSize * 1.18).toFixed(2));
  const captionLetterSpacing = 0;
  const captionOutlineStroke = Number((captionFontSize * 0.12).toFixed(2));
  const captionMaxWidth = Math.min(
    safeArea.width,
    Math.round(width * preset.captionMaxWidthRatio)
  );

  // 3. Adaptive Character Placements in lower half
  const sortedChars = [...characters].sort((a, b) => a.x - b.x);
  const charMap = new Map<string, ComputedCharacterPlacement>();
  const count = sortedChars.length;

  const usableLeft = safeArea.left + unit * 0.14;
  const usableRight = safeArea.right - unit * 0.14;
  const usableSpan = Math.max(unit * 0.2, usableRight - usableLeft);

  sortedChars.forEach((ch, idx) => {
    const charOverride = override?.characters?.find((o) => o.id === ch.id);
    const baseSize = (charOverride?.size ?? ch.size) * preset.charScaleFactor * (unit / 1080);
    // Crowd dampener when 3+ characters share stage
    const crowdScale = count >= 4 ? 0.82 : count === 3 ? 0.9 : 1.0;
    const finalSize = Number((baseSize * crowdScale).toFixed(3));

    let charX: number;
    if (charOverride?.x !== undefined) {
      const normX = normalizeCoord(charOverride.x, 1080);
      charX = Math.round(safeArea.left + normX * safeArea.width);
    } else if (count === 1) {
      charX = safeArea.centerX;
    } else {
      // Spread characters evenly across horizontal span in both landscape and portrait
      const fraction = (idx + 0.5) / count;
      const spreadPad = preset.orientation === 'landscape' ? usableSpan * 0.06 : 0;
      charX = Math.round(usableLeft + spreadPad + fraction * (usableSpan - spreadPad * 2));
    }

    // Clamp X so blob hands and nameplates never leave safeArea
    const halfCharExtent = Math.round(145 * finalSize);
    charX = Math.max(
      safeArea.left + halfCharExtent,
      Math.min(safeArea.right - halfCharExtent, charX)
    );

    const defaultCharY = Math.round(groundY + unit * (preset.orientation === 'landscape' ? 0.11 : 0.14));
    let charY = charOverride?.y !== undefined
      ? Math.round(
          charOverride.y <= 1
            ? charOverride.y * height
            : normalizeCoord(charOverride.y, 1920) * height
        )
      : defaultCharY;

    // Ensure nameplate at (charY + 176 * finalSize) stays strictly above safeArea.bottom
    const nameTagOffset = Math.round(176 * finalSize);
    const nameTagHalfH = Math.round(20 * finalSize);
    const maxCharY = safeArea.bottom - nameTagOffset - nameTagHalfH - 6;
    charY = Math.min(charY, maxCharY);

    const nameTagHalfW = Math.max(
      Math.round(80 * finalSize),
      Math.round(measureTextWidth(ch.name, Math.round(22 * finalSize)) / 2 + 16)
    );

    charMap.set(ch.id, {
      id: ch.id,
      x: charX,
      y: charY,
      size: finalSize,
      nameTagBox: {
        id: `nametag-${ch.id}`,
        kind: 'nametag',
        left: charX - nameTagHalfW,
        top: charY + nameTagOffset - nameTagHalfH,
        right: charX + nameTagHalfW,
        bottom: charY + nameTagOffset + nameTagHalfH,
      },
    });
  });

  // 4. Adaptive Prop Placements
  const propMap = new Map<string, ComputedPropPlacement>();
  const propCount = props.length;
  props.forEach((pr, pIdx) => {
    const finalScale = Number(
      (pr.scale * preset.charScaleFactor * (unit / 1080) * ( preset.orientation === 'landscape' ? 0.92 : 1.0 )).toFixed(3)
    );
    const normX = normalizeCoord(pr.x, 1080);
    let propX =
      propCount > 1
        ? Math.round(usableLeft + ((pIdx + 0.5) / propCount) * usableSpan)
        : Math.round(safeArea.left + normX * safeArea.width);

    const labelFontSize = Math.round(22 * finalScale);
    const labelHalfW = pr.label
      ? Math.max(Math.round(110 * finalScale), Math.round(measureTextWidth(pr.label, labelFontSize) / 2 + 18))
      : Math.round(80 * finalScale);

    propX = Math.max(safeArea.left + labelHalfW + 8, Math.min(safeArea.right - labelHalfW - 8, propX));

    // Position props in the mid-band between captionBand and groundY
    const minPropY = Math.round(captionTopY + captionLineHeight * 2.4 + unit * 0.08);
    const maxPropY = Math.round(groundY - unit * 0.06);
    const propY = Math.round(Math.max(minPropY, Math.min(maxPropY, groundY - unit * 0.11)));

    const labelBox: BoundingBox | undefined = pr.label
      ? {
          id: `prop-label-${pr.id}`,
          kind: 'prop-label',
          left: Math.round(propX - labelHalfW),
          top: Math.round(propY + 86 * finalScale),
          right: Math.round(propX + labelHalfW),
          bottom: Math.round(propY + 128 * finalScale),
        }
      : undefined;

    propMap.set(pr.id, {
      id: pr.id,
      x: propX,
      y: propY,
      scale: finalScale,
      labelBox,
    });
  });

  return {
    aspect,
    preset,
    width,
    height,
    unit,
    groundY,
    safeArea,
    chapterBadge,
    captionBand: {
      centerX: safeArea.centerX,
      topY: captionTopY,
      maxWidth: captionMaxWidth,
      fontSize: captionFontSize,
      wordGap: captionWordGap,
      lineHeight: captionLineHeight,
      letterSpacing: captionLetterSpacing,
      outlineStroke: captionOutlineStroke,
    },
    characters: charMap,
    props: propMap,
  };
}

/**
 * Computes safe speech bubble position and tail orientation so bubbles never leave safeArea.
 */
export function computeBubblePlacement(
  text: string,
  charPlacement: ComputedCharacterPlacement,
  layout: StageLayoutMetrics
): ComputedBubblePlacement {
  const { unit, safeArea, captionBand } = layout;
  const fontSize = Math.round(unit * 0.026);
  const measuredTextW = measureTextWidth(text.toUpperCase(), fontSize);
  const bubbleWidth = Math.max(
    Math.round(unit * 0.21),
    Math.min(Math.round(safeArea.width * 0.55), measuredTextW + Math.round(unit * 0.055))
  );
  const bubbleHeight = Math.round(unit * 0.076);
  const halfW = Math.round(bubbleWidth / 2);
  const halfH = Math.round(bubbleHeight / 2);

  // Desired bubble position above character head
  const desiredX = charPlacement.x;
  const desiredY = Math.round(charPlacement.y - 235 * charPlacement.size);

  const clampedX = Math.max(
    safeArea.left + halfW + 8,
    Math.min(safeArea.right - halfW - 8, desiredX)
  );

  const minBubbleTop = captionBand.topY + captionBand.lineHeight * 2.2 + 12;
  const clampedY = Math.max(
    minBubbleTop + halfH,
    Math.min(safeArea.bottom - halfH - 40, desiredY)
  );

  // Flip tail direction if character is to the right of bubble center or near right edge
  let tailDirection: 'left' | 'right' =
    charPlacement.x < safeArea.centerX ? 'left' : 'right';
  if (clampedX < charPlacement.x - 20) {
    tailDirection = 'right';
  } else if (clampedX > charPlacement.x + 20) {
    tailDirection = 'left';
  }

  return {
    x: clampedX,
    y: clampedY,
    width: bubbleWidth,
    height: bubbleHeight,
    fontSize,
    tailDirection,
    box: {
      id: `bubble-${charPlacement.id}`,
      kind: 'bubble',
      left: clampedX - halfW,
      top: clampedY - halfH,
      right: clampedX + halfW,
      bottom: clampedY + halfH + Math.round(unit * 0.03),
    },
  };
}

/**
 * Verifies whether all computed text/UI bounding boxes stay inside the aspect's safeArea.
 */
export function verifyBoxesInsideSafeArea(
  boxes: BoundingBox[],
  safeArea: SafeAreaBox,
  tolerancePx = 2
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const b of boxes) {
    if (b.left < safeArea.left - tolerancePx) {
      violations.push(`${b.id} (${b.kind}) left=${b.left} < safeArea.left=${safeArea.left}`);
    }
    if (b.right > safeArea.right + tolerancePx) {
      violations.push(`${b.id} (${b.kind}) right=${b.right} > safeArea.right=${safeArea.right}`);
    }
    if (b.top < safeArea.top - tolerancePx) {
      violations.push(`${b.id} (${b.kind}) top=${b.top} < safeArea.top=${safeArea.top}`);
    }
    if (b.bottom > safeArea.bottom + tolerancePx) {
      violations.push(`${b.id} (${b.kind}) bottom=${b.bottom} > safeArea.bottom=${safeArea.bottom}`);
    }
  }
  return { ok: violations.length === 0, violations };
}
