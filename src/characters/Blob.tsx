import React from 'react';
import { Accessory, AnimationType, Emotion } from '../script/schema';
import { computeAnimationTransform, computeMouthOpenness } from './animations';
import { Face } from './Face';

export interface BlobProps {
  id?: string;
  name?: string;
  color: string;
  accessory?: Accessory;
  hoodieColor?: string;
  size?: number;
  x: number;
  y: number;
  emotion: Emotion;
  animation?: AnimationType;
  speaking?: boolean;
  isVoiceActive?: boolean;
  flipX?: boolean;
  frame: number;
  fps: number;
}

export const Blob: React.FC<BlobProps> = ({
  name,
  color,
  accessory = 'none',
  hoodieColor = '#f59e0b',
  size = 1.0,
  x,
  y,
  emotion,
  animation = 'idle',
  speaking = false,
  isVoiceActive = true,
  flipX = false,
  frame,
  fps,
}) => {
  const tf = computeAnimationTransform(frame, fps, animation);
  const mouthOpen = computeMouthOpenness(frame, fps, speaking, isVoiceActive);
  const dirX = flipX ? -1 : 1;

  const renderAccessory = () => {
    switch (accessory) {
      case 'hoodie':
        return (
          <g>
            {/* Hoodie lower torso wrap */}
            <path
              d="M -126 35 C -132 95, -124 135, -110 142 C -65 162, 65 162, 110 142 C 124 135, 132 95, 126 35 Q 0 58 -126 35 Z"
              fill={hoodieColor}
              stroke="#0f172a"
              strokeWidth={10}
              strokeLinejoin="round"
            />
            {/* Front pocket & drawstrings */}
            <path
              d="M -52 85 L 52 85 L 64 132 L -64 132 Z"
              fill="rgba(15, 23, 42, 0.18)"
              stroke="#0f172a"
              strokeWidth={6}
              strokeLinejoin="round"
            />
            <line x1={-22} y1={46} x2={-22} y2={88} stroke="#ffffff" strokeWidth={6} strokeLinecap="round" />
            <line x1={22} y1={46} x2={22} y2={88} stroke="#ffffff" strokeWidth={6} strokeLinecap="round" />
          </g>
        );
      case 'cap':
        return (
          <g transform="translate(0, -122)">
            <path
              d="M -85 12 C -85 -48, 85 -48, 85 12 Z"
              fill="#ef4444"
              stroke="#0f172a"
              strokeWidth={9}
              strokeLinejoin="round"
            />
            <path
              d="M 10 12 L 125 18 C 125 4, 95 -4, 55 0 Z"
              fill="#dc2626"
              stroke="#0f172a"
              strokeWidth={9}
              strokeLinejoin="round"
            />
          </g>
        );
      case 'glasses':
        return (
          <g transform="translate(0, -20)">
            <rect
              x={-72}
              y={-22}
              width={56}
              height={40}
              rx={10}
              fill="rgba(255,255,255,0.22)"
              stroke="#0f172a"
              strokeWidth={8}
            />
            <rect
              x={16}
              y={-22}
              width={56}
              height={40}
              rx={10}
              fill="rgba(255,255,255,0.22)"
              stroke="#0f172a"
              strokeWidth={8}
            />
            <line x1={-16} y1={-4} x2={16} y2={-4} stroke="#0f172a" strokeWidth={8} />
          </g>
        );
      case 'crown':
        return (
          <g transform="translate(0, -135)">
            <polygon
              points="-68,16 -52,-38 -20,-8 0,-48 20,-8 52,-38 68,16"
              fill="#facc15"
              stroke="#0f172a"
              strokeWidth={9}
              strokeLinejoin="round"
            />
            <circle cx={0} cy={-12} r={8} fill="#ef4444" />
            <circle cx={-34} cy={-4} r={6} fill="#38bdf8" />
            <circle cx={34} cy={-4} r={6} fill="#38bdf8" />
          </g>
        );
      case 'headphones':
        return (
          <g>
            <path
              d="M -132 -10 C -138 -175, 138 -175, 132 -10"
              fill="none"
              stroke="#1e293b"
              strokeWidth={18}
              strokeLinecap="round"
            />
            <rect
              x={-152}
              y={-42}
              width={34}
              height={68}
              rx={16}
              fill="#f43f5e"
              stroke="#0f172a"
              strokeWidth={8}
            />
            <rect
              x={118}
              y={-42}
              width={34}
              height={68}
              rx={16}
              fill="#f43f5e"
              stroke="#0f172a"
              strokeWidth={8}
            />
          </g>
        );
      case 'bandana':
        return (
          <g transform="translate(0, -86)">
            <path
              d="M -112 0 Q 0 22 112 0 L 106 -24 Q 0 -4 -106 -24 Z"
              fill="#ef4444"
              stroke="#0f172a"
              strokeWidth={8}
              strokeLinejoin="round"
            />
            <path
              d="M 105 -12 L 148 -28 L 138 4 Z"
              fill="#ef4444"
              stroke="#0f172a"
              strokeWidth={7}
              strokeLinejoin="round"
            />
          </g>
        );
      case 'bowtie':
        return (
          <g transform="translate(0, 72)">
            <polygon
              points="-42,-20 0,0 -42,20"
              fill="#f43f5e"
              stroke="#0f172a"
              strokeWidth={7}
              strokeLinejoin="round"
            />
            <polygon
              points="42,-20 0,0 42,20"
              fill="#f43f5e"
              stroke="#0f172a"
              strokeWidth={7}
              strokeLinejoin="round"
            />
            <circle cx={0} cy={0} r={10} fill="#fb7185" stroke="#0f172a" strokeWidth={6} />
          </g>
        );
      default:
        return null;
    }
  };

  const handSwing = Math.sin((frame / fps) * Math.PI * 3.5) * 12;

  return (
    <g transform={`translate(${x}, ${y}) scale(${size})`}>
      {/* Ground contact shadow (stays anchored near y=155 while body jumps) */}
      <ellipse
        cx={tf.translateX}
        cy={158}
        rx={Math.max(45, 108 + tf.translateY * 0.35)}
        ry={22}
        fill="rgba(2, 6, 23, 0.42)"
      />

      {/* Animated Blob Body Group */}
      <g
        transform={`translate(${tf.translateX}, ${tf.translateY}) rotate(${tf.rotation}) scale(${dirX * tf.scaleX}, ${tf.scaleY})`}
      >
        {/* Stubby Feet */}
        <ellipse
          cx={-52}
          cy={146}
          rx={32}
          ry={18}
          fill={color}
          stroke="#0f172a"
          strokeWidth={10}
        />
        <ellipse
          cx={52}
          cy={146}
          rx={32}
          ry={18}
          fill={color}
          stroke="#0f172a"
          strokeWidth={10}
        />

        {/* Signature Organic Squishable Blob Body */}
        <path
          d="M -115 135 C -144 45, -124 -128, 0 -128 C 124 -128, 144 45, 115 135 C 76 162, -76 162, -115 135 Z"
          fill={color}
          stroke="#0f172a"
          strokeWidth={11}
          strokeLinejoin="round"
        />

        {/* Top-left glossy cartoon highlight */}
        <path
          d="M -78 -72 C -62 -102, -26 -110, -8 -104"
          fill="none"
          stroke="rgba(255, 255, 255, 0.55)"
          strokeWidth={12}
          strokeLinecap="round"
        />

        {/* Hoodie (if worn under face/hands) */}
        {accessory === 'hoodie' && renderAccessory()}

        {/* Expressive Face */}
        <Face emotion={emotion} mouthOpen={mouthOpen} frame={frame} />

        {/* Other Accessories */}
        {accessory !== 'hoodie' && renderAccessory()}

        {/* Expressive Floating Blob Hands */}
        <circle
          cx={-136}
          cy={20 + handSwing}
          r={22}
          fill={color}
          stroke="#0f172a"
          strokeWidth={9}
        />
        <circle
          cx={136}
          cy={20 - handSwing}
          r={22}
          fill={color}
          stroke="#0f172a"
          strokeWidth={9}
        />
      </g>

      {/* Character Name Tag */}
      {name && (
        <g transform="translate(0, 176)">
          <rect
            x={-80}
            y={-20}
            width={160}
            height={36}
            rx={10}
            fill="#0f172a"
            stroke="rgba(255, 255, 255, 0.28)"
            strokeWidth={2}
          />
          <text
            x={0}
            y={5}
            textAnchor="middle"
            fill="#f8fafc"
            fontSize={22}
            fontWeight="700"
            fontFamily="Plus Jakarta Sans, sans-serif"
          >
            {name}
          </text>
        </g>
      )}
    </g>
  );
};
