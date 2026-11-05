import React from 'react';
import { BackgroundType, PaletteVariation } from '../script/schema';
import { CameraShakeLevel } from '../skills/schema';

export interface BackgroundProps {
  type: BackgroundType;
  variation: PaletteVariation;
  frame: number;
  width?: number;
  height?: number;
  unit?: number;
  groundY?: number;
  cameraShake?: CameraShakeLevel;
  zoomPunchActive?: boolean;
}

export const Background: React.FC<BackgroundProps> = ({
  type,
  variation,
  frame,
  width = 1080,
  height = 1920,
  unit = 1080,
  groundY = 1080,
  cameraShake = 'none',
  zoomPunchActive = false,
}) => {
  const gradId = `bg-grad-${type}-${variation.id}-${width}x${height}`;
  const u = unit / 1080;
  const strokeW = Math.max(4, Math.round(10 * u));

  const shakeAmp =
    cameraShake === 'high'
      ? 10 * u
      : cameraShake === 'medium'
      ? 5.5 * u
      : cameraShake === 'low'
      ? 2.5 * u
      : 0;
  const parallaxDx = shakeAmp ? Number((Math.sin(frame * 1.45) * shakeAmp).toFixed(2)) : 0;
  const parallaxDy = shakeAmp ? Number((Math.cos(frame * 1.9) * shakeAmp * 0.7).toFixed(2)) : 0;

  const renderEnvironmentProps = () => {
    switch (type) {
      case 'room': {
        const winW = Math.round(240 * u);
        const winH = Math.round(250 * u);
        const winX = Math.round(width * 0.14);
        const winY = Math.max(Math.round(height * 0.16), groundY - winH - Math.round(110 * u));

        const monW = Math.round(230 * u);
        const monH = Math.round(140 * u);
        const deskW = Math.round(320 * u);
        const deskH = Math.round(24 * u);
        const deskX = Math.round(width * 0.68 - deskW / 2);
        const deskY = groundY - Math.round(160 * u);
        const monX = deskX + Math.round((deskW - monW) / 2);
        const monY = deskY - monH - Math.round(36 * u);

        return (
          <g>
            {/* Bedroom Window with night sky & stars */}
            <rect
              x={winX}
              y={winY}
              width={winW}
              height={winH}
              rx={Math.round(16 * u)}
              fill="#090d16"
              stroke="#0f172a"
              strokeWidth={strokeW}
            />
            <circle
              cx={winX + Math.round(winW * 0.32)}
              cy={winY + Math.round(winH * 0.32)}
              r={Math.round(28 * u)}
              fill="#fef08a"
              opacity={0.9}
            />
            <circle cx={winX + Math.round(winW * 0.72)} cy={winY + Math.round(winH * 0.44)} r={Math.round(4 * u)} fill="#ffffff" />
            <circle cx={winX + Math.round(winW * 0.6)} cy={winY + Math.round(winH * 0.22)} r={Math.round(3 * u)} fill="#ffffff" />
            <line
              x1={winX + winW / 2}
              y1={winY}
              x2={winX + winW / 2}
              y2={winY + winH}
              stroke="#0f172a"
              strokeWidth={strokeW}
            />
            <line
              x1={winX}
              y1={winY + winH / 2}
              x2={winX + winW}
              y2={winY + winH / 2}
              stroke="#0f172a"
              strokeWidth={strokeW}
            />

            {/* Gaming Desk & Monitor */}
            <rect
              x={monX}
              y={monY}
              width={monW}
              height={monH}
              rx={Math.round(12 * u)}
              fill="#1e293b"
              stroke="#0f172a"
              strokeWidth={strokeW}
            />
            <rect
              x={monX + Math.round(16 * u)}
              y={monY + Math.round(16 * u)}
              width={monW - Math.round(32 * u)}
              height={monH - Math.round(32 * u)}
              rx={Math.round(6 * u)}
              fill={variation.wallAccent}
              opacity={0.85}
            />
            <rect
              x={deskX + Math.round(deskW / 2 - 24 * u)}
              y={monY + monH}
              width={Math.round(48 * u)}
              height={Math.round(36 * u)}
              fill="#334155"
              stroke="#0f172a"
              strokeWidth={Math.round(7 * u)}
            />
            <rect
              x={deskX}
              y={deskY}
              width={deskW}
              height={deskH}
              rx={Math.round(8 * u)}
              fill="#475569"
              stroke="#0f172a"
              strokeWidth={Math.round(7 * u)}
            />
          </g>
        );
      }

      case 'kitchen': {
        const fridgeW = Math.round(220 * u);
        const fridgeH = Math.round(390 * u);
        const fridgeX = Math.round(width * 0.12);
        const fridgeY = groundY - fridgeH;

        const counterW = Math.round(width * 0.44);
        const counterH = Math.round(210 * u);
        const counterX = Math.round(width * 0.44);
        const counterY = groundY - counterH;

        return (
          <g>
            {/* Backsplash */}
            <rect
              x={Math.round(width * 0.08)}
              y={groundY - Math.round(340 * u)}
              width={Math.round(width * 0.84)}
              height={Math.round(150 * u)}
              rx={Math.round(12 * u)}
              fill="rgba(255,255,255,0.06)"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={Math.round(4 * u)}
            />
            {/* Refrigerator */}
            <rect
              x={fridgeX}
              y={fridgeY}
              width={fridgeW}
              height={fridgeH}
              rx={Math.round(20 * u)}
              fill="#e2e8f0"
              stroke="#0f172a"
              strokeWidth={strokeW}
            />
            <line
              x1={fridgeX}
              y1={fridgeY + Math.round(fridgeH * 0.38)}
              x2={fridgeX + fridgeW}
              y2={fridgeY + Math.round(fridgeH * 0.38)}
              stroke="#0f172a"
              strokeWidth={strokeW}
            />
            {/* Counter */}
            <rect
              x={counterX}
              y={counterY}
              width={counterW}
              height={counterH}
              rx={Math.round(10 * u)}
              fill="#334155"
              stroke="#0f172a"
              strokeWidth={strokeW}
            />
            <rect
              x={counterX - Math.round(12 * u)}
              y={counterY - Math.round(22 * u)}
              width={counterW + Math.round(24 * u)}
              height={Math.round(28 * u)}
              rx={Math.round(8 * u)}
              fill="#f8fafc"
              stroke="#0f172a"
              strokeWidth={Math.round(8 * u)}
            />
          </g>
        );
      }

      case 'school': {
        const boardW = Math.round(Math.min(width * 0.76, 860 * u));
        const boardH = Math.round(280 * u);
        const boardX = Math.round((width - boardW) / 2);
        const boardY = groundY - boardH - Math.round(70 * u);

        return (
          <g>
            <rect
              x={boardX}
              y={boardY}
              width={boardW}
              height={boardH}
              rx={Math.round(16 * u)}
              fill="#064e3b"
              stroke="#78350f"
              strokeWidth={Math.round(15 * u)}
            />
            <text
              x={width / 2}
              y={boardY + Math.round(boardH * 0.42)}
              textAnchor="middle"
              fill="rgba(255,255,255,0.75)"
              fontSize={Math.round(36 * u)}
              fontWeight="700"
              fontFamily="JetBrains Mono, monospace"
            >
              POP QUIZ: NO EXCUSES!
            </text>
            <line
              x1={boardX + Math.round(boardW * 0.15)}
              y1={boardY + Math.round(boardH * 0.65)}
              x2={boardX + Math.round(boardW * 0.85)}
              y2={boardY + Math.round(boardH * 0.65)}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={Math.round(5 * u)}
              strokeDasharray="16 12"
            />
          </g>
        );
      }

      case 'arcade': {
        const cabW = Math.round(210 * u);
        const cabH = Math.round(380 * u);
        const leftCabX = Math.round(width * 0.14);
        const rightCabX = Math.round(width * 0.86 - cabW);
        const cabY = groundY - cabH;

        return (
          <g>
            <rect
              x={leftCabX}
              y={cabY}
              width={cabW}
              height={cabH}
              rx={Math.round(18 * u)}
              fill="#1e1b4b"
              stroke={variation.wallAccent}
              strokeWidth={Math.round(7 * u)}
            />
            <rect
              x={leftCabX + Math.round(24 * u)}
              y={cabY + Math.round(42 * u)}
              width={cabW - Math.round(48 * u)}
              height={Math.round(110 * u)}
              rx={Math.round(8 * u)}
              fill="#38bdf8"
              opacity={0.8}
            />
            <rect
              x={rightCabX}
              y={cabY}
              width={cabW}
              height={cabH}
              rx={Math.round(18 * u)}
              fill="#1e1b4b"
              stroke="#f472b6"
              strokeWidth={Math.round(7 * u)}
            />
            <rect
              x={rightCabX + Math.round(24 * u)}
              y={cabY + Math.round(42 * u)}
              width={cabW - Math.round(48 * u)}
              height={Math.round(110 * u)}
              rx={Math.round(8 * u)}
              fill="#f43f5e"
              opacity={0.8}
            />
          </g>
        );
      }

      case 'street': {
        return (
          <g>
            <rect
              x={Math.round(width * 0.08)}
              y={groundY - Math.round(360 * u)}
              width={Math.round(width * 0.16)}
              height={Math.round(360 * u)}
              fill="rgba(15, 23, 42, 0.55)"
            />
            <rect
              x={Math.round(width * 0.27)}
              y={groundY - Math.round(420 * u)}
              width={Math.round(width * 0.2)}
              height={Math.round(420 * u)}
              fill="rgba(15, 23, 42, 0.65)"
            />
            <rect
              x={Math.round(width * 0.52)}
              y={groundY - Math.round(330 * u)}
              width={Math.round(width * 0.18)}
              height={Math.round(330 * u)}
              fill="rgba(15, 23, 42, 0.5)"
            />
            <rect
              x={Math.round(width * 0.73)}
              y={groundY - Math.round(390 * u)}
              width={Math.round(width * 0.18)}
              height={Math.round(390 * u)}
              fill="rgba(15, 23, 42, 0.65)"
            />
            <line
              x1={Math.round(width * 0.84)}
              y1={groundY - Math.round(440 * u)}
              x2={Math.round(width * 0.84)}
              y2={groundY}
              stroke="#0f172a"
              strokeWidth={Math.round(14 * u)}
            />
            <circle
              cx={Math.round(width * 0.81)}
              cy={groundY - Math.round(440 * u)}
              r={Math.round(30 * u)}
              fill="#fef08a"
              opacity={0.85}
            />
          </g>
        );
      }

      case 'void': {
        const pulse = Math.sin(frame * 0.08) * 20 * u;
        return (
          <g>
            <circle
              cx={width / 2}
              cy={groundY * 0.68}
              r={Math.round(210 * u + pulse)}
              fill="none"
              stroke={variation.wallAccent}
              strokeWidth={Math.round(5 * u)}
              opacity={0.35}
            />
            <circle
              cx={width / 2}
              cy={groundY * 0.68}
              r={Math.round(330 * u - pulse)}
              fill="none"
              stroke={variation.captionHighlight}
              strokeWidth={Math.round(4 * u)}
              opacity={0.25}
            />
          </g>
        );
      }
    }
  };

  return (
    <g id={`background-${type}`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={variation.skyTop} />
          <stop offset="68%" stopColor={variation.skyBottom} />
          <stop offset="100%" stopColor={variation.floorColor} />
        </linearGradient>
      </defs>

      {/* Full stage backdrop */}
      <rect x={0} y={0} width={width} height={height} fill={`url(#${gradId})`} />

      {/* Subtle ambient light glow */}
      {/* Ambient Soft Spotlight */}
      <circle
        cx={width / 2}
        cy={groundY * 0.55}
        r={Math.round((zoomPunchActive ? 430 : 380) * u)}
        fill={variation.wallAccent}
        opacity={zoomPunchActive ? 0.16 : 0.09}
      />

      {/* Scene-specific architectural props with parallax camera shake */}
      <g
        transform={
          parallaxDx !== 0 || parallaxDy !== 0
            ? `translate(${parallaxDx}, ${parallaxDy})`
            : undefined
        }
      >
        {renderEnvironmentProps()}
      </g>

      {/* Ground Floor Stage Platform */}
      <rect
        x={0}
        y={groundY}
        width={width}
        height={Math.max(1, height - groundY)}
        fill={variation.floorColor}
      />
      <line
        x1={0}
        y1={groundY}
        x2={width}
        y2={groundY}
        stroke="#0f172a"
        strokeWidth={Math.round(12 * u)}
      />
      {/* Floor perspective grid stripes */}
      <line
        x1={Math.round(width * 0.2)}
        y1={groundY}
        x2={Math.round(width * 0.05)}
        y2={height}
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={Math.round(5 * u)}
      />
      <line
        x1={Math.round(width * 0.5)}
        y1={groundY}
        x2={Math.round(width * 0.5)}
        y2={height}
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={Math.round(5 * u)}
      />
      <line
        x1={Math.round(width * 0.8)}
        y1={groundY}
        x2={Math.round(width * 0.95)}
        y2={height}
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={Math.round(5 * u)}
      />
    </g>
  );
};
