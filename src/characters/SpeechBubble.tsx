import React from 'react';
import { spring } from 'remotion';
import { ComputedBubblePlacement } from '../aspect';

export interface SpeechBubbleProps {
  text: string;
  placement: ComputedBubblePlacement;
  frame: number;
  fps: number;
  unit?: number;
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  text,
  placement,
  frame,
  fps,
  unit = 1080,
}) => {
  const pop = spring({
    frame,
    fps,
    config: { damping: 11, stiffness: 180, mass: 0.5 },
  });

  const u = unit / 1080;
  const { x, y, width, height, fontSize, tailDirection } = placement;
  const halfW = width / 2;
  const halfH = height / 2;
  const strokeW = Math.max(4, Math.round(7 * u));
  const rx = Math.round(22 * u);
  const tailOffset = Math.round(Math.min(halfW * 0.45, 32 * u));
  const tailX = tailDirection === 'left' ? -tailOffset : tailOffset;
  const tailW = Math.round(16 * u);
  const tailLen = Math.round(28 * u);

  return (
    <g transform={`translate(${x}, ${y}) scale(${pop})`}>
      {/* Drop Shadow */}
      <rect
        x={-halfW + Math.round(5 * u)}
        y={-halfH + Math.round(6 * u)}
        width={width}
        height={height}
        rx={rx}
        fill="rgba(15, 23, 42, 0.45)"
      />
      {/* Main Bubble Body */}
      <rect
        x={-halfW}
        y={-halfH}
        width={width}
        height={height}
        rx={rx}
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={strokeW}
      />
      {/* Pointer Tail */}
      <polygon
        points={`${tailX - tailW},${halfH - 2} ${tailX + tailW},${halfH - 2} ${tailX},${halfH + tailLen}`}
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={strokeW}
        strokeLinejoin="round"
      />
      {/* Cover seam line */}
      <line
        x1={tailX - tailW + 3}
        y1={halfH - 2}
        x2={tailX + tailW - 3}
        y2={halfH - 2}
        stroke="#ffffff"
        strokeWidth={strokeW + 2}
      />
      {/* Bubble Text */}
      <text
        x={0}
        y={Math.round(fontSize * 0.34)}
        textAnchor="middle"
        fill="#0f172a"
        fontSize={fontSize}
        fontWeight="800"
        fontFamily="Bricolage Grotesque, sans-serif"
      >
        {text.toUpperCase()}
      </text>
    </g>
  );
};
