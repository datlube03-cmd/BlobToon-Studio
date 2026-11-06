import React from 'react';
import { AnimationTypeSchema, EmotionSchema } from '../script/schema';
import { computeAnimationTransform, computeMouthOpenness } from './animations';
import { CharacterComponentProps, defineCharacter } from './registry';

/**
 * ============================================================================
 * BLOBTOON CHARACTER PLUGIN TEMPLATE (`src/characters/_template.tsx`)
 * ============================================================================
 *
 * How to create a new character in 3 steps:
 * 1. Copy this file to `src/characters/MyCharacter.tsx`.
 * 2. Customize the SVG artwork inside `TemplateCharacterComponent` below.
 *    - Draw in local coordinates around `(0, 0)`, scaled by `(unit / 1080) * scale`.
 *    - Must be a pure deterministic function of `frame` and `fps` (no `Math.random()`).
 * 3. Call `defineCharacter({ id: 'mychar', ... })` at the bottom and import your file
 *    in `src/characters/index.ts` (or let the Node loader auto-discover it).
 *
 * Once registered, you can immediately use it in any `.script.txt` file:
 *   hero: mychar(color=#4cc9f0, voice=Voice A, accessory=crown)
 */
export const TemplateCharacterComponent: React.FC<CharacterComponentProps> = ({
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
  // 1. Compute animation transform (idle, bounce, walk, jump, shake, spin, etc.)
  const tf = computeAnimationTransform(frame, fps, anim, seed);

  // 2. Compute mouth openness (0..1) when character is speaking
  const mouthOpen = computeMouthOpenness(frame, fps, speaking, voiceActive);

  // 3. Scale factor from `unit = min(width, height)` so character looks identical in 9:16, 16:9, 4:3, 3:4
  const unitScale = unit / 1080;
  const dirX = facing === 'left' ? -1 : 1;

  return (
    <g>
      {/* Ground shadow centered under feet anchor */}
      <ellipse
        cx={tf.translateX * unitScale}
        cy={110 * scale * unitScale}
        rx={75 * scale * unitScale}
        ry={18 * scale * unitScale}
        fill="rgba(2, 6, 23, 0.4)"
      />

      {/* Main animated character group */}
      <g
        transform={`translate(${tf.translateX * unitScale}, ${tf.translateY * unitScale}) scale(${
          tf.scaleX * scale * unitScale * dirX
        }, ${tf.scaleY * scale * unitScale}) rotate(${tf.rotation})`}
      >
        {/* Example body shape (replace with your own SVG paths!) */}
        <circle
          cx={0}
          cy={0}
          r={95}
          fill={color}
          stroke="#0f172a"
          strokeWidth={10}
        />

        {/* Example eyes based on `emotion` */}
        <circle cx={-32} cy={-18} r={emotion === 'shock' ? 14 : 10} fill="#0f172a" />
        <circle cx={32} cy={-18} r={emotion === 'shock' ? 14 : 10} fill="#0f172a" />

        {/* Example lip-synced mouth */}
        <ellipse
          cx={0}
          cy={24}
          rx={20}
          ry={Math.max(5, Math.round(mouthOpen * 22))}
          fill={accentColor || '#0f172a'}
        />
      </g>
    </g>
  );
};

/**
 * Uncomment the block below in your copied character file to register it:
 */
export function registerTemplateExample() {
  return defineCharacter({
    id: 'template',
    name: 'Template Character',
    emotions: EmotionSchema.options,
    anims: AnimationTypeSchema.options,
    defaultVoice: 'alloy',
    Component: TemplateCharacterComponent,
    anchors: (unit: number, scale = 1) => {
      const s = (unit / 1080) * scale;
      return {
        feet: { x: 0, y: Math.round(110 * s) },
        head: { x: 0, y: Math.round(-100 * s) },
        bubble: { x: 0, y: Math.round(-175 * s) },
      };
    },
  });
}
