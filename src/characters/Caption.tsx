import React from 'react';
import {
  BoundingBox,
  StageLayoutMetrics,
  measureTextWidth,
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
}

export interface ComputedCaptionLineItem {
  wordTiming: WordTiming;
  globalIdx: number;
  centerX: number;
  centerY: number;
  boxW: number;
  boxH: number;
  isCurrent: boolean;
  isSpoken: boolean;
  box: BoundingBox;
}

export function computeCaptionLayout(
  words: WordTiming[],
  sceneFrame: number,
  layout: StageLayoutMetrics
): {
  backdropBox: BoundingBox;
  items: ComputedCaptionLineItem[];
} | null {
  if (!words || words.length === 0) return null;

  const { unit, safeArea, captionBand } = layout;
  const u = unit / 1080;
  const fontSize = captionBand.fontSize;
  const lineHeight = captionBand.lineHeight;
  const wordPadX = Math.round(28 * u);
  const gapX = Math.round(14 * u);

  // Find active word index
  let activeIndex = words.findIndex(
    (w) => sceneFrame >= w.startFrame && sceneFrame <= w.endFrame
  );
  if (activeIndex === -1) {
    const pastWords = words.filter((w) => sceneFrame > w.endFrame);
    activeIndex = pastWords.length > 0 ? pastWords.length - 1 : 0;
  }

  // Index words with their global index, then wrap ALL words into width-measured pages of max 2 lines
  const indexedWords = words.map((w, idx) => ({
    word: w.word,
    wordTiming: w,
    globalIdx: idx,
  }));

  const maxLineTextWidth = Math.round(captionBand.maxWidth - 48 * u);
  const allWrappedLines = wrapWordsByMeasuredWidth(
    indexedWords,
    maxLineTextWidth,
    fontSize,
    wordPadX,
    gapX
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
  let maxRowWidth = Math.round(unit * 0.35);

  const boxH = Math.round(fontSize * 1.32);
  const padTopBottom = Math.round(18 * u);
  const totalHeight = activePage.length * lineHeight + padTopBottom * 2;
  const backdropTop = Math.max(safeArea.top, captionBand.topY);

  activePage.forEach((line, rowIdx) => {
    const widths = line.map((item) =>
      Math.max(
        Math.round(fontSize * 1.3),
        measureTextWidth(item.word.toUpperCase(), fontSize) + wordPadX
      )
    );
    const rowWidth =
      widths.reduce((a, b) => a + b, 0) + Math.max(0, line.length - 1) * gapX;
    if (rowWidth > maxRowWidth) {
      maxRowWidth = rowWidth;
    }

    let cursorX = captionBand.centerX - rowWidth / 2;
    const centerY = Math.round(backdropTop + padTopBottom + lineHeight * (rowIdx + 0.55));

    line.forEach((item, wIdx) => {
      const boxW = widths[wIdx];
      const centerX = Math.round(cursorX + boxW / 2);
      cursorX += boxW + gapX;

      const isCurrent = item.globalIdx === activeIndex;
      const isSpoken = item.globalIdx < activeIndex;

      items.push({
        wordTiming: item.wordTiming,
        globalIdx: item.globalIdx,
        centerX,
        centerY,
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

  const backdropW = Math.min(
    safeArea.width,
    Math.max(maxRowWidth + Math.round(48 * u), Math.round(unit * 0.42))
  );
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

  return { backdropBox, items };
}

export const Caption: React.FC<CaptionProps> = ({
  words,
  sceneFrame,
  layout,
  highlightColor = '#fbbf24',
  captionStyle = 'default',
}) => {
  const computed = computeCaptionLayout(words, sceneFrame, layout);
  if (!computed) return null;

  const { backdropBox, items } = computed;
  const u = layout.unit / 1080;
  const fontSize = layout.captionBand.fontSize;
  const isBoldPop = captionStyle === 'bold-pop';
  const isNeonGlow = captionStyle === 'neon-glow';
  const isMinimal = captionStyle === 'minimal';

  const strokeW = Math.max(4, Math.round((isBoldPop ? 11 : 9) * u));
  const activeScale = isBoldPop ? 1.18 : 1.08;
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
  const backdropStrokeW = Math.max(2, Math.round((isBoldPop ? 5 : 3) * u));

  return (
    <g id="shorts-caption-layer" data-caption-style={captionStyle}>
      <rect
        x={backdropBox.left}
        y={backdropBox.top}
        width={backdropBox.right - backdropBox.left}
        height={backdropBox.bottom - backdropBox.top}
        rx={Math.round(22 * u)}
        fill={backdropFill}
        stroke={backdropStroke}
        strokeWidth={backdropStrokeW}
      />
      {items.map((item) => (
        <g
          key={`${item.wordTiming.word}-${item.globalIdx}`}
          transform={`translate(${item.centerX}, ${item.centerY}) scale(${
            item.isCurrent ? activeScale : 1.0
          })`}
        >
          {item.isCurrent && (
            <rect
              x={-item.boxW / 2}
              y={-item.boxH / 2 - Math.round((isBoldPop ? 6 : 4) * u)}
              width={item.boxW}
              height={item.boxH + Math.round((isBoldPop ? 12 : 8) * u)}
              rx={Math.round((isBoldPop ? 16 : 14) * u)}
              fill={effectiveHighlight}
              stroke={isBoldPop ? '#ef4444' : '#0f172a'}
              strokeWidth={Math.max(3, Math.round((isBoldPop ? 6 : 5) * u))}
            />
          )}
          <text
            x={0}
            y={Math.round(fontSize * 0.34)}
            textAnchor="middle"
            fontFamily="Bricolage Grotesque, sans-serif"
            fontSize={isBoldPop && item.isCurrent ? Math.round(fontSize * 1.04) : fontSize}
            fontWeight="800"
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
