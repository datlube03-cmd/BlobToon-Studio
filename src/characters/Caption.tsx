import React from 'react';
import {
  ALL_ASPECT_RATIOS,
  AspectRatio,
  BUNDLED_FONT_FAMILY,
  BoundingBox,
  StageLayoutMetrics,
  computeStageLayout,
  measureTextWidth,
  resolveBundledFontFamily,
  wrapWordsByMeasuredWidth,
} from '../aspect';
import { CaptionStyle } from '../skills/schema';
import { WordTiming } from '../timeline/schema';

export interface CaptionProps {
  words: WordTiming[];
  sceneFrame: number;
  layout: StageLayoutMetrics;
  highlightColor?: string;
  captionStyle?: CaptionStyle;
  fontFamily?: string;
}

export interface ComputedCaptionLineItem {
  wordTiming: WordTiming;
  globalIdx: number;
  centerX: number;
  centerY: number;
  measuredWordWidth: number;
  boxW: number;
  boxH: number;
  isCurrent: boolean;
  isSpoken: boolean;
  box: BoundingBox;
}

export interface ComputedCaptionLayoutResult {
  backdropBox: BoundingBox;
  items: ComputedCaptionLineItem[];
  fontSize: number;
  wordGap: number;
  lineHeight: number;
  letterSpacing: number;
  outlineStroke: number;
  maxWidth: number;
  captionBoxWidth: number;
  lineCount: number;
  resolvedFontFamily: string;
}

export interface AspectCaptionDiagnostic {
  aspect: AspectRatio;
  fontSize: number;
  wordGap: number;
  wordGapToFontRatio: number;
  lineHeight: number;
  lineHeightToFontRatio: number;
  letterSpacing: number;
  outlineStroke: number;
  outlineStrokeToFontRatio: number;
  measuredWordWidths: Array<{ word: string; widthPx: number }>;
  captionBoxWidth: number;
  maxWidth: number;
  lineCount: number;
  lines: string[];
  resolvedFontFamily: string;
}

export function computeCaptionLayout(
  words: WordTiming[],
  sceneFrame: number,
  layout: StageLayoutMetrics,
  fontFamily?: string
): ComputedCaptionLayoutResult | null {
  if (!words || words.length === 0) return null;

  const resolvedFontFamily = resolveBundledFontFamily(fontFamily);
  const { safeArea, captionBand } = layout;
  const fontSize = captionBand.fontSize;
  const wordGap = captionBand.wordGap; // fontSize * 0.28
  const lineHeight = captionBand.lineHeight; // fontSize * 1.18
  const letterSpacing = captionBand.letterSpacing; // 0
  const outlineStroke = captionBand.outlineStroke; // fontSize * 0.12
  const maxWidth = captionBand.maxWidth;

  const padX = Math.round(fontSize * 0.45);
  const padY = Math.round(fontSize * 0.34);
  const maxLineTextWidth = Math.max(fontSize * 3, maxWidth - padX * 2);

  // Find active word index
  let activeIndex = words.findIndex(
    (w) => sceneFrame >= w.startFrame && sceneFrame <= w.endFrame
  );
  if (activeIndex === -1) {
    const pastWords = words.filter((w) => sceneFrame > w.endFrame);
    activeIndex = pastWords.length > 0 ? pastWords.length - 1 : 0;
  }

  // Index words with their global index, then wrap ALL words into width-measured pages of max 2 lines.
  // Word widths are pure measured text widths (0 extra layout padding per word) so active highlight
  // never causes layout reflow or word jumping across frames.
  const indexedWords = words.map((w, idx) => ({
    word: w.word.toUpperCase(),
    wordTiming: w,
    globalIdx: idx,
  }));

  const allWrappedLines = wrapWordsByMeasuredWidth(
    indexedWords,
    maxLineTextWidth,
    fontSize,
    0,
    wordGap,
    resolvedFontFamily
  );

  // Group lines into 2-line pages and pick the page containing activeIndex
  const pages: Array<typeof allWrappedLines> = [];
  for (let i = 0; i < allWrappedLines.length; i += 2) {
    pages.push(allWrappedLines.slice(i, i + 2));
  }

  const activePage =
    pages.find((page) =>
      page.some((line) => line.some((item) => item.globalIdx === activeIndex))
    ) ?? pages[0];

  const items: ComputedCaptionLineItem[] = [];
  let maxRowWidth = Math.round(fontSize * 3.2);

  const pillExtraW = Math.round(fontSize * 0.2);
  const boxH = Math.round(fontSize * 1.12);
  const totalHeight = Math.round(activePage.length * lineHeight + padY * 2);
  const backdropTop = Math.max(safeArea.top, captionBand.topY);

  activePage.forEach((line, rowIdx) => {
    const textWidths = line.map((item) =>
      measureTextWidth(item.word.toUpperCase(), fontSize, letterSpacing, resolvedFontFamily)
    );

    const rowWidth =
      textWidths.reduce((a, b) => a + b, 0) + Math.max(0, line.length - 1) * wordGap;
    if (rowWidth > maxRowWidth) {
      maxRowWidth = rowWidth;
    }

    // Center each line horizontally around captionBand.centerX with fixed wordGap
    let cursorX = captionBand.centerX - rowWidth / 2;
    const centerY = Math.round(backdropTop + padY + lineHeight * (rowIdx + 0.54));

    line.forEach((item, wIdx) => {
      const isCurrent = item.globalIdx === activeIndex;
      const isSpoken = item.globalIdx < activeIndex;
      const measuredWordWidth = textWidths[wIdx];
      // Highlight pill width adds visual padding without changing cursorX advance
      const boxW = isCurrent ? measuredWordWidth + pillExtraW : measuredWordWidth;
      const centerX = Math.round(cursorX + measuredWordWidth / 2);
      cursorX += measuredWordWidth + wordGap;

      items.push({
        wordTiming: item.wordTiming,
        globalIdx: item.globalIdx,
        centerX,
        centerY,
        measuredWordWidth,
        boxW,
        boxH,
        isCurrent,
        isSpoken,
        box: {
          id: `caption-word-${item.globalIdx}`,
          kind: 'caption',
          left: Math.round(centerX - boxW / 2),
          top: Math.round(centerY - boxH / 2),
          right: Math.round(centerX + boxW / 2),
          bottom: Math.round(centerY + boxH / 2),
        },
      });
    });
  });

  const backdropW = Math.min(maxWidth, Math.round(maxRowWidth + padX * 2));
  const backdropLeft = Math.max(
    safeArea.left,
    Math.min(safeArea.right - backdropW, Math.round(captionBand.centerX - backdropW / 2))
  );

  const backdropBox: BoundingBox = {
    id: 'caption-backdrop',
    kind: 'caption',
    left: backdropLeft,
    top: backdropTop,
    right: backdropLeft + backdropW,
    bottom: backdropTop + totalHeight,
  };

  return {
    backdropBox,
    items,
    fontSize,
    wordGap,
    lineHeight,
    letterSpacing,
    outlineStroke,
    maxWidth,
    captionBoxWidth: backdropW,
    lineCount: activePage.length,
    resolvedFontFamily,
  };
}

/**
 * Diagnostic helper (Change G): computes and returns caption metrics for the same sentence
 * across all four aspect presets (9:16, 16:9, 4:3, 3:4).
 */
export function diagnoseCaptionAcrossAspects(
  sentence: string,
  fontFamily?: string
): AspectCaptionDiagnostic[] {
  const rawWords = sentence.trim().split(/\s+/).filter(Boolean);
  const wordTimings: WordTiming[] = rawWords.map((word, idx) => ({
    word,
    startSec: idx * 0.3,
    endSec: (idx + 1) * 0.3,
    startFrame: idx * 9,
    endFrame: (idx + 1) * 9 - 1,
  }));

  return ALL_ASPECT_RATIOS.map((aspect) => {
    const layout = computeStageLayout(aspect, [], []);
    const computed = computeCaptionLayout(wordTimings, 0, layout, fontFamily)!;
    const indexedWords = wordTimings.map((w, idx) => ({ word: w.word, idx }));
    const padX = Math.round(computed.fontSize * 0.45);
    const wrapped = wrapWordsByMeasuredWidth(
      indexedWords,
      computed.maxWidth - padX * 2,
      computed.fontSize,
      0,
      computed.wordGap,
      computed.resolvedFontFamily
    );

    return {
      aspect,
      fontSize: computed.fontSize,
      wordGap: computed.wordGap,
      wordGapToFontRatio: Number((computed.wordGap / computed.fontSize).toFixed(4)),
      lineHeight: computed.lineHeight,
      lineHeightToFontRatio: Number((computed.lineHeight / computed.fontSize).toFixed(4)),
      letterSpacing: computed.letterSpacing,
      outlineStroke: computed.outlineStroke,
      outlineStrokeToFontRatio: Number((computed.outlineStroke / computed.fontSize).toFixed(4)),
      measuredWordWidths: rawWords.map((w) => ({
        word: w,
        widthPx: measureTextWidth(
          w.toUpperCase(),
          computed.fontSize,
          computed.letterSpacing,
          computed.resolvedFontFamily
        ),
      })),
      captionBoxWidth: computed.captionBoxWidth,
      maxWidth: computed.maxWidth,
      lineCount: computed.lineCount,
      lines: wrapped.slice(0, 2).map((line) => line.map((item) => item.word).join(' ')),
      resolvedFontFamily: computed.resolvedFontFamily,
    };
  });
}

export const Caption: React.FC<CaptionProps> = ({
  words,
  sceneFrame,
  layout,
  highlightColor = '#fbbf24',
  captionStyle = 'default',
  fontFamily = BUNDLED_FONT_FAMILY,
}) => {
  const computed = computeCaptionLayout(words, sceneFrame, layout, fontFamily);
  if (!computed) return null;

  const { backdropBox, items, fontSize, outlineStroke, resolvedFontFamily } = computed;
  const isBoldPop = captionStyle === 'bold-pop';
  const isNeonGlow = captionStyle === 'neon-glow';
  const isMinimal = captionStyle === 'minimal';

  // Outline stroke is derived strictly from fontSize (fontSize * 0.12), never from stage width
  const strokeW = Math.max(3, Math.round(isBoldPop ? outlineStroke * 1.1 : outlineStroke));
  // Subtle scale-without-reflow on active word so words never jump
  const activeScale = isBoldPop ? 1.05 : 1.03;
  const effectiveHighlight = isBoldPop
    ? '#facc15'
    : isNeonGlow
    ? '#22d3ee'
    : highlightColor;

  const backdropFill = isMinimal
    ? 'rgba(2, 6, 23, 0.58)'
    : isBoldPop
    ? 'rgba(2, 6, 23, 0.94)'
    : 'rgba(2, 6, 23, 0.86)';
  const backdropStroke = isBoldPop
    ? '#facc15'
    : isNeonGlow
    ? '#22d3ee'
    : 'rgba(255, 255, 255, 0.2)';
  const backdropStrokeW = Math.max(2, Math.round(fontSize * (isBoldPop ? 0.1 : 0.07)));

  return (
    <g
      id="shorts-caption-layer"
      data-caption-style={captionStyle}
      data-font-family={resolvedFontFamily}
      data-requested-font-family={fontFamily}
      className="flex flex-wrap justify-center items-center gap-2"
    >
      <rect
        x={backdropBox.left}
        y={backdropBox.top}
        width={backdropBox.right - backdropBox.left}
        height={backdropBox.bottom - backdropBox.top}
        rx={Math.round(fontSize * 0.45)}
        fill={backdropFill}
        stroke={backdropStroke}
        strokeWidth={backdropStrokeW}
      />
      {items.map((item) => (
        <g
          key={`${item.wordTiming.word}-${item.globalIdx}`}
          className="inline-flex items-center justify-center"
          transform={`translate(${item.centerX}, ${item.centerY}) scale(${
            item.isCurrent ? activeScale : 1.0
          })`}
        >
          {item.isCurrent && (
            <rect
              x={-item.boxW / 2}
              y={-item.boxH / 2}
              width={item.boxW}
              height={item.boxH}
              rx={Math.round(fontSize * 0.26)}
              fill={effectiveHighlight}
              stroke={isBoldPop ? '#ef4444' : '#0f172a'}
              strokeWidth={Math.max(2, Math.round(fontSize * 0.09))}
            />
          )}
          <text
            x={0}
            y={Math.round(fontSize * 0.34)}
            textAnchor="middle"
            fontFamily={resolvedFontFamily}
            fontSize={fontSize}
            fontWeight="700"
            fill={item.isCurrent ? '#0f172a' : item.isSpoken ? '#f8fafc' : '#cbd5e1'}
            stroke={item.isCurrent ? 'none' : '#0f172a'}
            strokeWidth={item.isCurrent ? 0 : strokeW}
            paintOrder="stroke fill"
          >
            {item.wordTiming.word.toUpperCase()}
          </text>
        </g>
      ))}
    </g>
  );
};
