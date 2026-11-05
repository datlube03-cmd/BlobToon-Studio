import React from 'react';
import { Emotion } from '../script/schema';

export interface FaceProps {
  emotion: Emotion;
  mouthOpen: number; // 0..1
  frame: number;
}

export const Face: React.FC<FaceProps> = ({ emotion, mouthOpen, frame }) => {
  // Periodic natural blink every ~95 frames
  const isBlinking =
    frame % 95 >= 90 &&
    emotion !== 'shock' &&
    emotion !== 'sleepy' &&
    emotion !== 'laughing' &&
    emotion !== 'excited';

  const renderEyes = () => {
    if (emotion === 'sleepy' || isBlinking) {
      return (
        <g stroke="#0f172a" strokeWidth={8} strokeLinecap="round" fill="none">
          <path d="M -58 -18 Q -38 -4 -18 -18" />
          <path d="M 18 -18 Q 38 -4 58 -18" />
          {emotion === 'sleepy' && (
            <g fill="#38bdf8" stroke="none" fontWeight="800" fontFamily="Fredoka, sans-serif">
              <text x={72} y={-55 - (frame % 30)} fontSize={26} opacity={0.9}>
                Z
              </text>
              <text x={96} y={-82 - (frame % 30)} fontSize={34} opacity={0.75}>
                z
              </text>
            </g>
          )}
        </g>
      );
    }

    if (emotion === 'laughing' || emotion === 'excited') {
      return (
        <g stroke="#0f172a" strokeWidth={9} strokeLinecap="round" fill="none">
          <path d="M -60 -12 Q -38 -36 -16 -12" />
          <path d="M 16 -12 Q 38 -36 60 -12" />
        </g>
      );
    }

    if (emotion === 'shock') {
      return (
        <g>
          <circle cx={-40} cy={-22} r={24} fill="#ffffff" stroke="#0f172a" strokeWidth={7} />
          <circle cx={40} cy={-22} r={24} fill="#ffffff" stroke="#0f172a" strokeWidth={7} />
          <circle cx={-40} cy={-22} r={8} fill="#0f172a" />
          <circle cx={40} cy={-22} r={8} fill="#0f172a" />
          <circle cx={-44} cy={-26} r={3.5} fill="#ffffff" />
          <circle cx={36} cy={-26} r={3.5} fill="#ffffff" />
        </g>
      );
    }

    if (emotion === 'smug') {
      return (
        <g>
          <ellipse cx={-38} cy={-18} rx={18} ry={13} fill="#ffffff" stroke="#0f172a" strokeWidth={6} />
          <ellipse cx={38} cy={-18} rx={18} ry={13} fill="#ffffff" stroke="#0f172a" strokeWidth={6} />
          <circle cx={-32} cy={-18} r={8} fill="#0f172a" />
          <circle cx={44} cy={-18} r={8} fill="#0f172a" />
          {/* Half-lidded smug upper eyelids */}
          <path d="M -57 -22 L -19 -22" stroke="#0f172a" strokeWidth={7} strokeLinecap="round" />
          <path d="M 19 -22 L 57 -22" stroke="#0f172a" strokeWidth={7} strokeLinecap="round" />
        </g>
      );
    }

    return (
      <g>
        <ellipse cx={-38} cy={-20} rx={16} ry={19} fill="#0f172a" />
        <ellipse cx={38} cy={-20} rx={16} ry={19} fill="#0f172a" />
        <circle cx={-43} cy={-26} r={6} fill="#ffffff" />
        <circle cx={33} cy={-26} r={6} fill="#ffffff" />
        <circle cx={-33} cy={-14} r={3} fill="#ffffff" />
        <circle cx={43} cy={-14} r={3} fill="#ffffff" />
        {emotion === 'sad' && (
          <g fill="#38bdf8" opacity={0.9}>
            <path d="M -54 -4 C -60 10, -48 22, -54 26 C -60 22, -62 10, -54 -4 Z" />
            <path d="M 54 -4 C 60 10, 48 22, 54 26 C 60 22, 62 10, 54 -4 Z" />
          </g>
        )}
      </g>
    );
  };

  const renderBrows = () => {
    switch (emotion) {
      case 'angry':
        return (
          <g stroke="#0f172a" strokeWidth={9} strokeLinecap="round">
            <line x1={-62} y1={-52} x2={-18} y2={-36} />
            <line x1={62} y1={-52} x2={18} y2={-36} />
          </g>
        );
      case 'sad':
        return (
          <g stroke="#0f172a" strokeWidth={8} strokeLinecap="round">
            <line x1={-60} y1={-36} x2={-20} y2={-50} />
            <line x1={60} y1={-36} x2={20} y2={-50} />
          </g>
        );
      case 'shock':
        return (
          <g stroke="#0f172a" strokeWidth={8} strokeLinecap="round" fill="none">
            <path d="M -60 -54 Q -40 -68 -20 -54" />
            <path d="M 20 -54 Q 40 -68 60 -54" />
          </g>
        );
      case 'smug':
        return (
          <g stroke="#0f172a" strokeWidth={8} strokeLinecap="round" fill="none">
            <path d="M -60 -38 L -20 -42" />
            <path d="M 20 -44 Q 42 -60 62 -44" />
          </g>
        );
      default:
        return (
          <g stroke="#0f172a" strokeWidth={7} strokeLinecap="round" fill="none">
            <path d="M -56 -46 Q -38 -54 -20 -46" />
            <path d="M 20 -46 Q 38 -54 56 -46" />
          </g>
        );
    }
  };

  const renderMouth = () => {
    // Active narration mouth-flap overrides static closed mouth with dynamic syllable height
    if (mouthOpen > 0.1) {
      const openRy = 8 + mouthOpen * 22;
      const openRx = 18 + mouthOpen * 10;
      return (
        <g transform="translate(0, 26)">
          <ellipse
            cx={0}
            cy={0}
            rx={openRx}
            ry={openRy}
            fill="#7f1d1d"
            stroke="#0f172a"
            strokeWidth={7}
          />
          {/* Tongue */}
          <path
            d={`M ${-openRx * 0.65} ${openRy * 0.25} Q 0 ${-openRy * 0.2} ${openRx * 0.65} ${openRy * 0.25} A ${openRx * 0.65} ${openRy * 0.6} 0 0 1 ${-openRx * 0.65} ${openRy * 0.25} Z`}
            fill="#fb7185"
          />
          {/* Upper teeth bar */}
          <path
            d={`M ${-openRx * 0.7} ${-openRy * 0.68} L ${openRx * 0.7} ${-openRy * 0.68}`}
            stroke="#ffffff"
            strokeWidth={6}
            strokeLinecap="round"
          />
        </g>
      );
    }

    switch (emotion) {
      case 'happy':
        return (
          <path
            d="M -28 18 Q 0 44 28 18"
            fill="none"
            stroke="#0f172a"
            strokeWidth={8}
            strokeLinecap="round"
          />
        );
      case 'laughing':
      case 'excited':
        return (
          <g transform="translate(0, 20)">
            <path
              d="M -34 0 Q 0 46 34 0 Z"
              fill="#7f1d1d"
              stroke="#0f172a"
              strokeWidth={7}
              strokeLinejoin="round"
            />
            <ellipse cx={0} cy={16} rx={16} ry={8} fill="#fb7185" />
          </g>
        );
      case 'sad':
        return (
          <path
            d="M -28 34 Q 0 12 28 34"
            fill="none"
            stroke="#0f172a"
            strokeWidth={8}
            strokeLinecap="round"
          />
        );
      case 'angry':
        return (
          <g transform="translate(0, 26)">
            <path
              d="M -28 6 L -14 -4 L 0 6 L 14 -4 L 28 6"
              fill="none"
              stroke="#0f172a"
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      case 'shock':
        return (
          <ellipse
            cx={0}
            cy={28}
            rx={16}
            ry={22}
            fill="#7f1d1d"
            stroke="#0f172a"
            strokeWidth={7}
          />
        );
      case 'smug':
        return (
          <path
            d="M -20 24 Q 8 28 30 12"
            fill="none"
            stroke="#0f172a"
            strokeWidth={8}
            strokeLinecap="round"
          />
        );
      case 'sleepy':
        return (
          <circle
            cx={4}
            cy={24}
            r={10}
            fill="#7f1d1d"
            stroke="#0f172a"
            strokeWidth={6}
          />
        );
    }
  };

  return (
    <g>
      {/* Rosy cheek blushes */}
      <ellipse cx={-66} cy={4} rx={14} ry={8} fill="#fb7185" opacity={0.45} />
      <ellipse cx={66} cy={4} rx={14} ry={8} fill="#fb7185" opacity={0.45} />
      {renderBrows()}
      {renderEyes()}
      {renderMouth()}
    </g>
  );
};
