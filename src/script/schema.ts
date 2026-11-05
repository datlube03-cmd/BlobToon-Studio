import { z } from 'zod';
import { AspectRatioSchema } from '../aspect';

export { AspectRatioSchema };
export type { AspectRatio } from '../aspect';

export const EmotionSchema = z.enum([
  'happy',
  'sad',
  'shock',
  'angry',
  'smug',
  'sleepy',
  'laughing',
]);
export type Emotion = z.infer<typeof EmotionSchema>;

export const AccessorySchema = z.enum([
  'none',
  'hoodie',
  'cap',
  'glasses',
  'crown',
  'headphones',
  'bandana',
  'bowtie',
]);
export type Accessory = z.infer<typeof AccessorySchema>;

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

export const PropTypeSchema = z.enum([
  'phone',
  'controller',
  'clock',
  'homework',
  'toothbrush',
  'door',
  'heart',
  'trophy',
]);
export type PropType = z.infer<typeof PropTypeSchema>;

export const BackgroundTypeSchema = z.enum([
  'room',
  'kitchen',
  'school',
  'arcade',
  'street',
  'void',
]);
export type BackgroundType = z.infer<typeof BackgroundTypeSchema>;

export const TransitionTypeSchema = z.enum([
  'wipe',
  'zoom',
  'iris',
  'slide',
  'hard-cut',
  'fade',
]);
export type TransitionType = z.infer<typeof TransitionTypeSchema>;

export const CharacterSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex code'),
  accessory: AccessorySchema.default('none'),
  hoodieColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  size: z.number().min(0.3).max(2.2).default(1.0),
  x: z.number().min(0).max(1920).default(0.32),
  y: z.number().min(0).max(1920).default(0.62),
  emotion: EmotionSchema.default('happy'),
  animation: AnimationTypeSchema.default('idle'),
  speaking: z.boolean().default(false),
  flipX: z.boolean().default(false),
});
export type CharacterSpec = z.infer<typeof CharacterSpecSchema>;

export const PropInstanceSchema = z.object({
  id: z.string().min(1),
  type: PropTypeSchema,
  x: z.number().min(0).max(1920).default(0.5),
  y: z.number().min(0).max(1920).default(0.45),
  scale: z.number().min(0.3).max(2.5).default(1.0),
  rotation: z.number().min(-180).max(180).default(0),
  animation: AnimationTypeSchema.default('idle'),
  label: z.string().optional(),
});
export type PropInstance = z.infer<typeof PropInstanceSchema>;

export const BeatSchema = z.object({
  atProgress: z.number().min(0).max(1),
  targetId: z.string().min(1),
  emotion: EmotionSchema.optional(),
  animation: AnimationTypeSchema.optional(),
  bubbleText: z.string().max(70).optional(),
  propType: PropTypeSchema.optional(),
});
export type Beat = z.infer<typeof BeatSchema>;

export const CharacterLayoutOverrideSchema = z.object({
  id: z.string().min(1),
  x: z.number().min(0).max(1920).optional(),
  y: z.number().min(0).max(1920).optional(),
  size: z.number().min(0.3).max(2.2).optional(),
});

export const AspectLayoutOverrideSchema = z.object({
  characters: z.array(CharacterLayoutOverrideSchema).optional(),
  captionY: z.number().min(0).max(1920).optional(),
});

export const LayoutOverridesMapSchema = z
  .record(z.string(), AspectLayoutOverrideSchema)
  .optional();

export const ScriptSceneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(32),
  narration: z.string().min(5),
  caption: z.string().min(5),
  background: BackgroundTypeSchema,
  transition: TransitionTypeSchema.default('wipe'),
  characters: z.array(CharacterSpecSchema).min(1).max(4),
  props: z.array(PropInstanceSchema).default([]),
  beats: z.array(BeatSchema).default([]),
  layoutOverrides: LayoutOverridesMapSchema,
});
export type ScriptScene = z.infer<typeof ScriptSceneSchema>;

export const ScriptSchema = z.object({
  aspect: AspectRatioSchema.default('9:16'),
  skill: z.string().optional(),
  topic: z.string().min(3),
  title: z.string().min(5).max(100),
  hook: z.string().min(5),
  description: z.string().min(10),
  hashtags: z.array(z.string()).min(3).max(10),
  scenes: z.array(ScriptSceneSchema).min(3).max(8),
});
export type Script = z.infer<typeof ScriptSchema>;

export const PaletteVariationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  skyTop: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  skyBottom: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  floorColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  wallAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  captionHighlight: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  characterPalette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(3),
  defaultAccessories: z.array(AccessorySchema).min(2),
  preferredProps: z.array(PropTypeSchema).min(2),
});
export type PaletteVariation = z.infer<typeof PaletteVariationSchema>;

export function countSpokenWords(script: Script): number {
  return script.scenes.reduce((acc, s) => {
    const words = s.narration
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return acc + words.length;
  }, 0);
}

export function estimateScriptDurationSec(script: Script, wordsPerSecond = 2.45): number {
  const totalWords = countSpokenWords(script);
  const scenePadding = script.scenes.length * 0.45;
  return Number((totalWords / wordsPerSecond + scenePadding).toFixed(2));
}
