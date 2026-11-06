import React from 'react';
import {
  Accessory,
  AccessorySchema,
  AnimationType,
  AnimationTypeSchema,
  Emotion,
  EmotionSchema,
} from '../script/schema';
import { computeAnimationTransform, computeMouthOpenness } from './animations';
import { Face } from './Face';
import { CharacterComponentProps, defineCharacter } from './registry';

export interface BlobProps {
  id: string;
  name: string;
  color: string;
  accessory: Accessory;
  hoodieColor?: string;
  x: number;
  y: number;
  size: number;
  emotion: Emotion;
  animation: AnimationType;
  speaking: boolean;
  voiceActive: boolean;
  flipX?: boolean;
  frame: number;
  fps: number;
  seedOffset?: number;
  unit?: number;
}

function renderAccessory(accessory: Accessory, color: string, hoodieColor: string): React.ReactNode {
  switch (accessory) {
    case 'none':
      return null;

    case 'headphones':
      return (
        <g id="acc-headphones">
          <path
            d="M -112 -18 A 114 114 0 0 1 112 -18"
            fill="none"
            stroke="#1e293b"
            strokeWidth={18}
            strokeLinecap="round"
          />
          <path
            d="M -98 -24 A 100 100 0 0 1 98 -24"
            fill="none"
            stroke="#38bdf8"
            strokeWidth={6}
            strokeLinecap="round"
          />
          <rect
            x={-130}
            y={-36}
            width={34}
            height={66}
            rx={16}
            fill="#0f172a"
            stroke="#38bdf8"
            strokeWidth={6}
          />
          <rect
            x={96}
            y={-36}
            width={34}
            height={66}
            rx={16}
            fill="#0f172a"
            stroke="#38bdf8"
            strokeWidth={6}
          />
        </g>
      );

    case 'glasses':
      return (
        <g id="acc-glasses" transform="translate(0, -16)">
          <rect
            x={-72}
            y={-22}
            width={58}
            height={40}
            rx={10}
            fill="rgba(56, 189, 248, 0.22)"
            stroke="#0f172a"
            strokeWidth={8}
          />
          <rect
            x={14}
            y={-22}
            width={58}
            height={40}
            rx={10}
            fill="rgba(56, 189, 248, 0.22)"
            stroke="#0f172a"
            strokeWidth={8}
          />
          <line x1={-14} y1={-4} x2={14} y2={-4} stroke="#0f172a" strokeWidth={8} />
          <line x1={-72} y1={-6} x2={-102} y2={-14} stroke="#0f172a" strokeWidth={7} />
          <line x1={72} y1={-6} x2={102} y2={-14} stroke="#0f172a" strokeWidth={7} />
        </g>
      );

    case 'crown':
      return (
        <g id="acc-crown" transform="translate(0, -124)">
          <polygon
            points="-56,18 -44,-34 -18,-6 0,-44 18,-6 44,-34 56,18"
            fill="#facc15"
            stroke="#0f172a"
            strokeWidth={8}
            strokeLinejoin="round"
          />
          <circle cx={0} cy={-16} r={7} fill="#ef4444" />
          <circle cx={-30} cy={-4} r={6} fill="#38bdf8" />
          <circle cx={30} cy={-4} r={6} fill="#38bdf8" />
        </g>
      );

    case 'cap':
      return (
        <g id="acc-cap" transform="translate(0, -102)">
          <path
            d="M -78 12 A 78 55 0 0 1 78 12 Z"
            fill={hoodieColor}
            stroke="#0f172a"
            strokeWidth={8}
            strokeLinejoin="round"
          />
          <path
            d="M 10 4 Q 95 2 116 18 Q 70 28 6 16 Z"
            fill="#0f172a"
            stroke="#0f172a"
            strokeWidth={6}
          />
          <circle cx={0} cy={-42} r={9} fill="#0f172a" />
        </g>
      );

    case 'hoodie':
      return (
        <g id="acc-hoodie">
          <path
            d="M -98 34 Q 0 66 98 34 L 106 96 Q 0 118 -106 96 Z"
            fill={hoodieColor}
            stroke="#0f172a"
            strokeWidth={8}
            strokeLinejoin="round"
          />
          <line
            x1={-18}
            y1={48}
            x2={-22}
            y2={84}
            stroke="#ffffff"
            strokeWidth={6}
            strokeLinecap="round"
          />
          <line
            x1={18}
            y1={48}
            x2={22}
            y2={84}
            stroke="#ffffff"
            strokeWidth={6}
            strokeLinecap="round"
          />
        </g>
      );

    case 'bowtie':
      return (
        <g id="acc-bowtie" transform="translate(0, 74)">
          <polygon
            points="-44,-18 0,0 -44,18"
            fill="#ef4444"
            stroke="#0f172a"
            strokeWidth={7}
            strokeLinejoin="round"
          />
          <polygon
            points="44,-18 0,0 44,18"
            fill="#ef4444"
            stroke="#0f172a"
            strokeWidth={7}
            strokeLinejoin="round"
          />
          <circle cx={0} cy={0} r={11} fill="#fbbf24" stroke="#0f172a" strokeWidth={6} />
        </g>
      );

    case 'bandana':
      return (
        <g id="acc-bandana" transform="translate(0, -76)">
          <path
            d="M -95 -4 Q 0 18 95 -4 L 90 18 Q 0 38 -90 18 Z"
            fill="#ef4444"
            stroke="#0f172a"
            strokeWidth={8}
          />
          <path
            d="M 88 4 L 126 -12 L 114 22 Z"
            fill="#ef4444"
            stroke="#0f172a"
            strokeWidth={7}
          />
        </g>
      );
  }
}

/**
 * Local-space Blob character component registered via `defineCharacter`.
 * Draws around (0, 0) scaled by `unit / 1080 * scale`.
 */
export const BlobCharacterComponent: React.FC<CharacterComponentProps> = ({
  frame,
  fps,
  unit,
  emotion,
  anim,
  speaking,
  facing,
  color,
  accentColor,
  scale,
  accessory = 'none',
  seed = 0,
  voiceActive = true,
}) => {
  const tf = computeAnimationTransform(frame, fps, anim, seed);
  const mouthOpen = computeMouthOpenness(frame, fps, speaking, voiceActive);
  const unitScale = unit / 1080;
  const dirX = facing === 'left' ? -1 : 1;

  const armSwing =
    anim === 'walk' || anim === 'jump' || anim === 'bounce'
      ? Math.sin((frame / fps) * Math.PI * 6) * 18
      : speaking && voiceActive
      ? Math.sin((frame / fps) * Math.PI * 5) * 12
      : Math.sin((frame / fps) * Math.PI * 2) * 5;

  const shadowScale = Math.max(0.45, 1 + tf.translateY / 180) * scale * unitScale;

  return (
    <g>
      {/* Ground Contact Shadow at feet anchor */}
      <ellipse
        cx={tf.translateX * unitScale}
        cy={115 * scale * unitScale}
        rx={88 * shadowScale}
        ry={22 * shadowScale}
        fill="rgba(2, 6, 23, 0.42)"
      />

      {/* Animated Blob Body */}
      <g
        transform={`translate(${tf.translateX * unitScale}, ${tf.translateY * unitScale}) scale(${
          tf.scaleX * scale * unitScale * dirX
        }, ${tf.scaleY * scale * unitScale}) rotate(${tf.rotation})`}
      >
        {/* Left & Right Stubby Arms */}
        <path
          d={`M -94 12 Q -132 ${22 + armSwing} -118 ${52 + armSwing}`}
          fill="none"
          stroke={color}
          strokeWidth={28}
          strokeLinecap="round"
        />
        <path
          d={`M -94 12 Q -132 ${22 + armSwing} -118 ${52 + armSwing}`}
          fill="none"
          stroke="#0f172a"
          strokeWidth={38}
          strokeLinecap="round"
          opacity={0.95}
          style={{ mixBlendMode: 'multiply' }}
        />

        <path
          d={`M 94 12 Q 132 ${22 - armSwing} 118 ${52 - armSwing}`}
          fill="none"
          stroke="#0f172a"
          strokeWidth={36}
          strokeLinecap="round"
        />
        <path
          d={`M 94 12 Q 132 ${22 - armSwing} 118 ${52 - armSwing}`}
          fill="none"
          stroke={color}
          strokeWidth={22}
          strokeLinecap="round"
        />

        {/* Stubby Feet */}
        <ellipse
          cx={-42}
          cy={102}
          rx={28}
          ry={18}
          fill="#0f172a"
          transform={`rotate(${armSwing * 0.4} -42 102)`}
        />
        <ellipse
          cx={42}
          cy={102}
          rx={28}
          ry={18}
          fill="#0f172a"
          transform={`rotate(${-armSwing * 0.4} 42 102)`}
        />

        {/* Main Squishy Pear/Bean Blob Torso */}
        <path
          d="M 0 -112 C 68 -112, 108 -62, 108 14 C 108 76, 78 106, 0 106 C -78 106, -108 76, -108 14 C -108 -62, -68 -112, 0 -112 Z"
          fill={color}
          stroke="#0f172a"
          strokeWidth={10}
          strokeLinejoin="round"
        />

        {/* Glossy 2D Cartoon Specular Highlight */}
        <ellipse
          cx={-42}
          cy={-66}
          rx={26}
          ry={14}
          fill="rgba(255, 255, 255, 0.42)"
          transform="rotate(-28 -42 -66)"
        />
        <circle cx={-64} cy={-42} r={7} fill="rgba(255, 255, 255, 0.38)" />

        {/* Hoodie / Body Accessory */}
        {accessory === 'hoodie' || accessory === 'bowtie'
          ? renderAccessory(accessory, color, accentColor)
          : null}

        {/* Expressive Eyes, Brows & Lip-Synced Mouth */}
        <Face emotion={emotion} mouthOpen={mouthOpen} frame={frame} />

        {/* Head / Eye Accessories */}
        {accessory !== 'hoodie' && accessory !== 'bowtie'
          ? renderAccessory(accessory, color, accentColor)
          : null}
      </g>
    </g>
  );
};

export const BlobCharacterDef = defineCharacter({
  id: 'blob',
  name: 'Classic Squishy Blob',
  emotions: EmotionSchema.options,
  anims: AnimationTypeSchema.options,
  defaultVoice: 'alloy',
  Component: BlobCharacterComponent,
  anchors: (unit: number, scale = 1) => {
    const s = (unit / 1080) * scale;
    return {
      feet: { x: 0, y: Math.round(115 * s) },
      head: { x: 0, y: Math.round(-115 * s) },
      bubble: { x: 0, y: Math.round(-190 * s) },
    };
  },
});

export { AccessorySchema };

/**
 * Positioned stage wrapper around `BlobCharacterComponent` for direct SVG stage use.
 */
export const Blob: React.FC<BlobProps> = ({
  id,
  color,
  accessory,
  hoodieColor = '#6366f1',
  x,
  y,
  size,
  emotion,
  animation,
  speaking,
  voiceActive,
  flipX = false,
  frame,
  fps,
  seedOffset = 0,
  unit = 1080,
}) => {
  return (
    <g id={`blob-${id}`} transform={`translate(${x}, ${y})`}>
      <BlobCharacterComponent
        frame={frame}
        fps={fps}
        unit={unit}
        emotion={emotion}
        anim={animation}
        speaking={speaking}
        facing={flipX ? 'left' : 'right'}
        color={color}
        accentColor={hoodieColor}
        scale={size}
        accessory={accessory}
        seed={seedOffset}
        voiceActive={voiceActive}
      />
    </g>
  );
};
