import { z } from 'zod';
import { AspectRatioSchema } from '../aspect';
import { SkillRenderParamsSchema } from '../skills/schema';

export const EmotionSchema = z.enum([
  'happy',
  'shock',
  'sad',
  'angry',
  'smug',
  'scared',
  'sleepy',
  'laughing',
  'excited',
]);
export type Emotion = z.infer<typeof EmotionSchema>;

export const AnimationTypeSchema = z.enum([
  'idle',
  'bounce',
  'walk',
  'jump',
  'shake',
  'spin',
  'slide-in',
  'squash-and-stretch',
  'scale-pop',
]);
export type AnimationType = z.infer<typeof AnimationTypeSchema>;

export const AccessorySchema = z.enum([
  'none',
  'headphones',
  'glasses',
  'crown',
  'cap',
  'hoodie',
  'bowtie',
  'bandana',
]);
export type Accessory = z.infer<typeof AccessorySchema>;

export const BackgroundTypeSchema = z.enum([
  'room',
  'kitchen',
  'school',
  'arcade',
  'street',
  'void',
]);
export type BackgroundType = z.infer<typeof BackgroundTypeSchema>;

export const PropTypeSchema = z.enum([
  'phone',
  'controller',
  'trophy',
  'clock',
  'homework',
  'door',
  'heart',
  'toothbrush',
]);
export type PropType = z.infer<typeof PropTypeSchema>;

export const TransitionTypeSchema = z.enum([
  'hard-cut',
  'zoom',
  'wipe',
  'slide',
  'iris',
  'fade',
]);
export type TransitionType = z.infer<typeof TransitionTypeSchema>;

export const SFX_NAMES = [
  'pop',
  'boing',
  'thud',
  'whoosh',
  'tick',
  'rattle',
  'ding',
  'gasp',
  'sad',
  'buzz',
  'swish',
] as const;

export const SfxTypeSchema = z.enum(SFX_NAMES);
export type SfxType = z.infer<typeof SfxTypeSchema>;
export type SfxName = SfxType;

export const SceneManualSfxSchema = z.object({
  type: SfxTypeSchema,
  atSec: z.number().min(0),
  volume: z.number().min(0).max(1).optional(),
  variant: z.number().int().min(0).max(2).optional(),
  pan: z.number().min(-1).max(1).optional(),
});
export type SceneManualSfx = z.infer<typeof SceneManualSfxSchema>;

export const SceneSfxFieldSchema = z.union([z.literal(false), z.array(SceneManualSfxSchema)]);
export type SceneSfxField = z.infer<typeof SceneSfxFieldSchema>;

export const CharacterSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1).default('blob'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex code'),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Accent color must be a 6-digit hex code')
    .optional(),
  voice: z.string().optional(),
  accessory: AccessorySchema.default('none'),
  hoodieColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  size: z.number().min(0.6).max(1.5).default(1),
  x: z.number().min(0.08).max(0.92).default(0.5),
  y: z.number().min(0.3).max(0.88).default(0.62),
  emotion: EmotionSchema.default('happy'),
  animation: AnimationTypeSchema.default('idle'),
  speaking: z.boolean().default(false),
  flipX: z.boolean().default(false),
});
export type CharacterSpec = z.infer<typeof CharacterSpecSchema>;

export const PropSpecSchema = z.object({
  id: z.string().min(1),
  type: PropTypeSchema,
  x: z.number().min(0.08).max(0.92),
  y: z.number().min(0.18).max(0.85),
  scale: z.number().min(0.4).max(2.0).default(1),
  rotation: z.number().min(-180).max(180).default(0),
  animation: AnimationTypeSchema.default('idle'),
  label: z.string().max(26).optional(),
});
export type PropSpec = z.infer<typeof PropSpecSchema>;

export const BeatSpecSchema = z.object({
  atProgress: z.number().min(0).max(0.95),
  targetId: z.string().min(1),
  emotion: EmotionSchema.optional(),
  animation: AnimationTypeSchema.optional(),
  bubbleText: z.string().max(48).optional(),
  propType: PropTypeSchema.optional(),
  x: z.number().min(0.08).max(0.92).optional(),
  y: z.number().min(0.3).max(0.88).optional(),
});
export type BeatSpec = z.infer<typeof BeatSpecSchema>;

export const ScriptLineSchema = z.object({
  speakerId: z.string().min(1),
  text: z.string().min(1),
  emotion: EmotionSchema.optional(),
  animation: AnimationTypeSchema.optional(),
  x: z.number().min(0.08).max(0.92).optional(),
  walkToX: z.number().min(0.08).max(0.92).optional(),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2.5).optional(),
  silent: z.boolean().default(false),
});
export type ScriptLine = z.infer<typeof ScriptLineSchema>;

export const AspectLayoutOverrideSchema = z.object({
  characters: z
    .array(
      z.object({
        id: z.string().min(1),
        x: z.number().min(0.08).max(0.92).optional(),
        y: z.number().min(0.3).max(0.88).optional(),
        size: z.number().min(0.6).max(1.5).optional(),
      })
    )
    .optional(),
  props: z
    .array(
      z.object({
        id: z.string().min(1),
        x: z.number().min(0.08).max(0.92).optional(),
        y: z.number().min(0.18).max(0.85).optional(),
        scale: z.number().min(0.4).max(2.0).optional(),
      })
    )
    .optional(),
});
export type AspectLayoutOverride = z.infer<typeof AspectLayoutOverrideSchema>;

export const SceneLayoutOverridesSchema = z.object({
  '9:16': AspectLayoutOverrideSchema.optional(),
  '16:9': AspectLayoutOverrideSchema.optional(),
  '4:3': AspectLayoutOverrideSchema.optional(),
  '3:4': AspectLayoutOverrideSchema.optional(),
});
export type SceneLayoutOverrides = z.infer<typeof SceneLayoutOverridesSchema>;

export const SceneSpecSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  narration: z.string().min(1),
  caption: z.string().min(1),
  background: BackgroundTypeSchema,
  bgColors: z
    .tuple([
      z.string().regex(/^#[0-9a-fA-F]{6}$/),
      z.string().regex(/^#[0-9a-fA-F]{6}$/),
    ])
    .optional(),
  transition: TransitionTypeSchema.default('zoom'),
  characters: z.array(CharacterSpecSchema).min(1).max(4),
  props: z.array(PropSpecSchema).max(4).default([]),
  beats: z.array(BeatSpecSchema).default([]),
  lines: z.array(ScriptLineSchema).optional(),
  sfx: SceneSfxFieldSchema.optional(),
  layoutOverrides: SceneLayoutOverridesSchema.optional(),
});
export type SceneSpec = z.infer<typeof SceneSpecSchema>;

export const ScriptSchema = z.object({
  aspect: AspectRatioSchema.default('9:16'),
  voice: z.string().optional(),
  skill: z.string().optional(),
  renderParams: SkillRenderParamsSchema.optional(),
  topic: z.string().min(3),
  title: z.string().min(3).max(95),
  hook: z.string().min(3),
  description: z.string().min(5),
  hashtags: z.array(z.string().min(2)).min(1).max(10),
  scenes: z.array(SceneSpecSchema).min(1).max(12),
});
export type Script = z.infer<typeof ScriptSchema>;

export const PaletteVariationSchema = z.object({
  id: z.string(),
  name: z.string(),
  skyTop: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  skyBottom: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  floorColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  wallAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  characterPalette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2),
  captionHighlight: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  defaultAccessories: z.array(AccessorySchema).default(['headphones', 'glasses', 'hoodie']),
  preferredProps: z.array(PropTypeSchema).default(['controller', 'phone', 'trophy', 'heart']),
});
export type PaletteVariation = z.infer<typeof PaletteVariationSchema>;

export function countSpokenWords(script: Script): number {
  return script.scenes.reduce((acc, scene) => {
    const words = scene.narration
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return acc + words.length;
  }, 0);
}

export function estimateScriptDurationSec(script: Script): number {
  const words = countSpokenWords(script);
  const voiceSec = words / 2.6;
  const paddingSec = script.scenes.length * 0.45;
  return Number((voiceSec + paddingSec).toFixed(2));
}
