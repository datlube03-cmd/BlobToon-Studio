# Adding a Custom Character, Animation, or Prop to BlobToon

BlobToon uses a plug-in registry (`defineCharacter`, `defineAnim`, `defineProp`) so you can write your own 2D characters in React/SVG and immediately reference them by `id` in any `.script.txt` or `script.json` file without editing core rendering code.

---

## 1. Adding a Character (`defineCharacter`)

1. Copy `src/characters/_template.tsx` to `src/characters/Cat.tsx` (or any name).
2. Implement your deterministic SVG component and call `defineCharacter`:

```tsx
import React from 'react';
import { AnimationTypeSchema, EmotionSchema } from '../script/schema';
import { computeAnimationTransform, computeMouthOpenness } from './animations';
import { CharacterComponentProps, defineCharacter } from './registry';

export const CatComponent: React.FC<CharacterComponentProps> = ({
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

  return (
    <g
      transform={`translate(${tf.translateX * unitScale}, ${tf.translateY * unitScale}) scale(${
        tf.scaleX * scale * unitScale * dirX
      }, ${tf.scaleY * scale * unitScale}) rotate(${tf.rotation})`}
    >
      {/* Draw your SVG character around (0, 0) */}
      <circle cx={0} cy={0} r={90} fill={color} stroke="#0f172a" strokeWidth={10} />
      <polygon points="-75,-50 -35,-120 -10,-75" fill={color} stroke="#0f172a" strokeWidth={10} />
      <polygon points="75,-50 35,-120 10,-75" fill={color} stroke="#0f172a" strokeWidth={10} />
      <ellipse cx={0} cy={22} rx={16} ry={Math.max(4, mouthOpen * 18)} fill={accentColor} />
    </g>
  );
};

export const CatCharacterDef = defineCharacter({
  id: 'cat',
  name: 'Pixel Cat',
  emotions: EmotionSchema.options,
  anims: AnimationTypeSchema.options,
  defaultVoice: 'shimmer',
  Component: CatComponent,
  anchors: (unit: number, scale = 1) => {
    const s = (unit / 1080) * scale;
    return {
      feet: { x: 0, y: Math.round(105 * s) },
      head: { x: 0, y: Math.round(-120 * s) },
      bubble: { x: 0, y: Math.round(-185 * s) },
    };
  },
});
```

3. Export your new module in `src/characters/index.ts`:
```ts
export * from './Cat';
```

4. Use your character in any `.script.txt` file:
```text
characters:
  whiskers: cat(color=#ff9f1c, voice=Voice B, accessory=crown)
```

---

## 2. How `anchors` Work Across Aspect Ratios (`9:16`, `16:9`, `4:3`, `3:4`)

Every character defines an `anchors(unit, scale)` function returning three offsets relative to the character's `(0, 0)` origin:
- `feet`: where the ground shadow lands
- `head`: top of the character's head/antenna
- `bubble`: where the speech bubble tail points above the character

Because `unit = Math.min(width, height)`, your character and its speech bubbles scale proportionally in every aspect ratio (`9:16`, `16:9`, `4:3`, `3:4`).

---

## 3. Adding a Custom Animation (`defineAnim`)

Register new procedural animations in `src/characters/animations.ts`:

```ts
import { defineAnim } from './animations';

defineAnim({
  id: 'float',
  name: 'Zero-G Float',
  compute: (frame, fps) => {
    const t = frame / fps;
    return {
      translateX: Math.sin(t * 2) * 14,
      translateY: Math.cos(t * 3) * -24,
      scaleX: 1,
      scaleY: 1,
      rotation: Math.sin(t * 1.5) * 8,
    };
  },
});
```

---

## 4. Adding a Custom Prop (`defineProp`)

Register custom props in `src/characters/Prop.tsx`:

```tsx
import { defineProp } from './Prop';

defineProp({
  id: 'pizza',
  name: 'Pizza Slice',
  render: () => (
    <polygon points="0,-60 -50,50 50,50" fill="#facc15" stroke="#b45309" strokeWidth={8} />
  ),
});
```

---

## 5. Previewing in Remotion Studio / Character Gallery

Run:
```bash
npm run preview
```
Or open the **Kho Nhân Vật & Đạo Cụ** tab in the Web UI (`npm run dev`) to inspect every registered character (`blob`, `robot`, etc.) with all emotions and animations.
