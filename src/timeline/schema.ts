import { z } from 'zod';
import { AspectRatioSchema } from '../aspect';
import { SkillRenderParamsSchema } from '../skills/schema';
import {
  BackgroundTypeSchema,
  BeatSchema,
  CharacterSpecSchema,
  LayoutOverridesMapSchema,
  ManualSfxEventSchema,
  PaletteVariationSchema,
  PropInstanceSchema,
  SceneSfxFieldSchema,
  SFX_NAMES,
  SfxNameSchema,
  TransitionTypeSchema,
} from '../script/schema';

export {
  SkillRenderParamsSchema,
  SFX_NAMES,
  SfxNameSchema,
  ManualSfxEventSchema,
  SceneSfxFieldSchema,
};
export type { SkillRenderParams } from '../skills/schema';
export type { SfxName, ManualSfxEvent, SceneSfxField } from '../script/schema';

export const TimelineMusicConfigSchema = z.object({
  path: z.string().min(1),
  volume: z.number().min(0).max(1).default(0.15),
});
export type TimelineMusicConfig = z.infer<typeof TimelineMusicConfigSchema>;

export const TimelineAudioConfigSchema = z.object({
  sfx: z.boolean().default(true),
  sfxVolume: z.number().min(0).max(1).default(0.35),
  music: TimelineMusicConfigSchema.optional(),
});
export type TimelineAudioConfig = z.infer<typeof TimelineAudioConfigSchema>;

export const WordTimingSchema = z.object({
  word: z.string().min(1),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  startFrame: z.number().int().min(0),
  endFrame: z.number().int().min(0),
});
export type WordTiming = z.infer<typeof WordTimingSchema>;

export const TimelineSceneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  narration: z.string().min(1),
  caption: z.string().min(1),
  background: BackgroundTypeSchema,
  transition: TransitionTypeSchema.default('wipe'),
  audioFile: z.string().optional(),
  voiceDurationSec: z.number().positive(),
  paddingSec: z.number().min(0).default(0.45),
  durationSec: z.number().positive(),
  startFrame: z.number().int().min(0),
  durationInFrames: z.number().int().positive(),
  endFrame: z.number().int().positive(),
  words: z.array(WordTimingSchema),
  characters: z.array(CharacterSpecSchema).min(1),
  props: z.array(PropInstanceSchema).default([]),
  beats: z.array(BeatSchema).default([]),
  sfx: SceneSfxFieldSchema,
  layoutOverrides: LayoutOverridesMapSchema,
});
export type TimelineScene = z.infer<typeof TimelineSceneSchema>;

export const TimelineSchema = z.object({
  version: z.literal('1.0').default('1.0'),
  aspect: AspectRatioSchema.default('9:16'),
  seed: z.number().int().default(42),
  skill: z.string().optional(),
  renderParams: SkillRenderParamsSchema.optional(),
  audio: TimelineAudioConfigSchema.default({ sfx: true, sfxVolume: 0.35 }),
  topic: z.string().min(1),
  title: z.string().min(1),
  hook: z.string().min(1),
  description: z.string().min(1),
  hashtags: z.array(z.string()).min(1),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  totalDurationSec: z.number().positive(),
  totalFrames: z.number().int().positive(),
  variation: PaletteVariationSchema,
  scenes: z.array(TimelineSceneSchema).min(1),
});
export type Timeline = z.infer<typeof TimelineSchema>;

export const VideoMetaAudioSchema = z.object({
  sfx: z.boolean(),
  sfxVolume: z.number(),
  sfxEventCount: z.number().int().min(0).optional(),
  music: TimelineMusicConfigSchema.optional(),
});

export const VideoMetaSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  hashtags: z.array(z.string()),
  topic: z.string().min(1),
  aspect: AspectRatioSchema.default('9:16'),
  seed: z.number().int().default(42),
  skill: z.string().optional(),
  renderParams: SkillRenderParamsSchema.optional(),
  audio: VideoMetaAudioSchema.optional(),
  durationSec: z.number().positive(),
  totalFrames: z.number().int().positive(),
  fps: z.number().int().positive(),
  resolution: z.string().default('1080x1920'),
  voiceProvider: z.string().default('mock'),
  variationId: z.string(),
  generatedAt: z.string(),
});
export type VideoMeta = z.infer<typeof VideoMetaSchema>;

export function formatTimelineValidationError(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => {
      const pathStr = issue.path.length > 0 ? issue.path.join('.') : '<root>';
      return `Field "${pathStr}": ${issue.message}`;
    })
    .join('; ');
  return `Invalid Timeline JSON — ${details}`;
}

export function parseTimelineStrict(raw: unknown, sourceLabel?: string): Timeline {
  const parsed = TimelineSchema.safeParse(raw);
  if (!parsed.success) {
    const prefix = sourceLabel ? `[${sourceLabel}] ` : '';
    throw new Error(`${prefix}${formatTimelineValidationError(parsed.error)}`);
  }
  return parsed.data;
}
