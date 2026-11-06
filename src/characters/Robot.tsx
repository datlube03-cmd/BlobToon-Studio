import React from 'react';
import { AnimationTypeSchema, Emotion, EmotionSchema } from '../script/schema';
import { computeAnimationTransform, computeMouthOpenness } from './animations';
import { CharacterComponentProps, defineCharacter } from './registry';

function renderRobotEyesAndMouth(emotion: Emotion, mouthOpen: number, frame: number): React.ReactNode {
  const blink = frame % 85 >= 82;
  const eyeColor =
    emotion === 'angry'
      ? '#f43f5e'
      : emotion === 'sad' || emotion === 'scared'
      ? '#38bdf8'
      : emotion === 'shock'
      ? '#facc15'
      : '#34d399';

  const barCount = 5;
  const eqHeight = Math.max(6, Math.round(mouthOpen * 26));

  return (
    <g id={`robot-face-${emotion}`}>
      {/* Left & Right LED Eyes */}
      {blink ? (
        <>
          <rect x={-52} y={-24} width={34} height={6} rx={3} fill={eyeColor} />
          <rect x={18} y={-24} width={34} height={6} rx={3} fill={eyeColor} />
        </>
      ) : emotion === 'angry' ? (
        <>
          <polygon points="-54,-34 -16,-20 -16,-12 -54,-22" fill={eyeColor} />
          <polygon points="54,-34 16,-20 16,-12 54,-22" fill={eyeColor} />
        </>
      ) : emotion === 'shock' ? (
        <>
          <circle cx={-35} cy={-24} r={16} fill="none" stroke={eyeColor} strokeWidth={6} />
          <circle cx={-35} cy={-24} r={5} fill="#ffffff" />
          <circle cx={35} cy={-24} r={16} fill="none" stroke={eyeColor} strokeWidth={6} />
          <circle cx={35} cy={-24} r={5} fill="#ffffff" />
        </>
      ) : emotion === 'sad' ? (
        <>
          <rect x={-52} y={-26} width={34} height={14} rx={5} fill={eyeColor} transform="rotate(-12 -35 -19)" />
          <rect x={18} y={-26} width={34} height={14} rx={5} fill={eyeColor} transform="rotate(12 35 -19)" />
        </>
      ) : (
        <>
          <rect x={-52} y={-34} width={34} height={22} rx={6} fill={eyeColor} />
          <rect x={18} y={-34} width={34} height={22} rx={6} fill={eyeColor} />
          <circle cx={-42} cy={-27} r={4} fill="#ffffff" />
          <circle cx={28} cy={-27} r={4} fill="#ffffff" />
        </>
      )}

      {/* Digital LED Equalizer Mouth */}
      <g transform="translate(0, 22)">
        {Array.from({ length: barCount }).map((_, idx) => {
          const offset = (idx - 2) * 16;
          const phase = Math.abs(Math.sin(frame * 0.35 + idx * 0.9));
          const h = mouthOpen > 0.05 ? Math.max(6, Math.round(eqHeight * (0.45 + phase * 0.55))) : 8;
          return (
            <rect
              key={idx}
              x={offset - 5}
              y={-h / 2}
              width={10}
              height={h}
              rx={3}
              fill={eyeColor}
            />
          );
        })}
      </g>
    </g>
  );
}

/**
 * Original 2D Square Robot character ('robot') registered via `defineCharacter`.
 * Proves the plug-in character registry works across all 4 aspect ratios without touching core code.
 */
export const RobotCharacterComponent: React.FC<CharacterComponentProps> = ({
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
  seed = 0,
  voiceActive = true,
}) => {
  const tf = computeAnimationTransform(frame, fps, anim, seed);
  const mouthOpen = computeMouthOpenness(frame, fps, speaking, voiceActive);
  const unitScale = unit / 1080;
  const dirX = facing === 'left' ? -1 : 1;
  const antennaBob = Math.sin((frame / fps) * Math.PI * 5) * 6;
  const shadowScale = Math.max(0.45, 1 + tf.translateY / 180) * scale * unitScale;

  return (
    <g>
      {/* Ground Shadow */}
      <ellipse
        cx={tf.translateX * unitScale}
        cy={118 * scale * unitScale}
        rx={84 * shadowScale}
        ry={20 * shadowScale}
        fill="rgba(2, 6, 23, 0.42)"
      />

      <g
        transform={`translate(${tf.translateX * unitScale}, ${tf.translateY * unitScale}) scale(${
          tf.scaleX * scale * unitScale * dirX
        }, ${tf.scaleY * scale * unitScale}) rotate(${tf.rotation})`}
      >
        {/* Antenna */}
        <line
          x1={0}
          y1={-104}
          x2={antennaBob}
          y2={-144}
          stroke="#0f172a"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <circle
          cx={antennaBob}
          cy={-150}
          r={14}
          fill={emotion === 'shock' || emotion === 'angry' ? '#f43f5e' : accentColor || '#facc15'}
          stroke="#0f172a"
          strokeWidth={7}
        />

        {/* Side Ear Bolts */}
        <rect
          x={-118}
          y={-32}
          width={20}
          height={44}
          rx={6}
          fill={accentColor || '#94a3b8'}
          stroke="#0f172a"
          strokeWidth={8}
        />
        <rect
          x={98}
          y={-32}
          width={20}
          height={44}
          rx={6}
          fill={accentColor || '#94a3b8'}
          stroke="#0f172a"
          strokeWidth={8}
        />

        {/* Mechanical Legs / Treads */}
        <rect
          x={-62}
          y={84}
          width={40}
          height={32}
          rx={10}
          fill="#1e293b"
          stroke="#0f172a"
          strokeWidth={8}
        />
        <rect
          x={22}
          y={84}
          width={40}
          height={32}
          rx={10}
          fill="#1e293b"
          stroke="#0f172a"
          strokeWidth={8}
        />

        {/* Square Metallic Chassis */}
        <rect
          x={-98}
          y={-102}
          width={196}
          height={192}
          rx={30}
          fill={color}
          stroke="#0f172a"
          strokeWidth={10}
        />

        {/* Inner Dark LED Visor Screen */}
        <rect
          x={-76}
          y={-68}
          width={152}
          height={116}
          rx={18}
          fill="#090d16"
          stroke="#0f172a"
          strokeWidth={8}
        />

        {/* Chest Status Badge */}
        <rect
          x={-48}
          y={58}
          width={96}
          height={16}
          rx={8}
          fill={accentColor || '#38bdf8'}
          stroke="#0f172a"
          strokeWidth={5}
        />

        {/* Robot Visor Face */}
        {renderRobotEyesAndMouth(emotion, mouthOpen, frame)}
      </g>
    </g>
  );
};

export const RobotCharacterDef = defineCharacter({
  id: 'robot',
  name: 'BoxBot 3000 (Square Robot)',
  emotions: EmotionSchema.options,
  anims: AnimationTypeSchema.options,
  defaultVoice: 'echo',
  Component: RobotCharacterComponent,
  anchors: (unit: number, scale = 1) => {
    const s = (unit / 1080) * scale;
    return {
      feet: { x: 0, y: Math.round(118 * s) },
      head: { x: 0, y: Math.round(-150 * s) },
      bubble: { x: 0, y: Math.round(-205 * s) },
    };
  },
});
