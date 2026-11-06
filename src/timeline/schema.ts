import { z } from 'zod';
import { AspectRatioSchema } from '../aspect';
import {
  BackgroundTypeSchema,
  BeatSpecSchema,
  CharacterSpecSchema,
  PaletteVariationSchema,
  PropSpecSchema,
  SceneLayoutOverridesSchema,
  SceneSfxFieldSchema,
  ScriptLineSchema,
  TransitionTypeSchema,
} from '../script/schema';
import { SkillRenderParamsSchema } from '../skills/schema';

export const WordTimingSchema = z.object({
  word: z.string().min(1),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  startFrame: z.number().int().min(0),
  endFrame: z.number().int().min(1),
});
export type WordTiming = z.infer<typeof WordTimingSchema>;

export const TimelineSceneSchema = z.object({
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
  transition: TransitionTypeSchema,
  audioFile: z.string().optional(),
  voiceDurationSec: z.number().positive(),
  paddingSec: z.number().min(0),
  durationSec: z.number().positive(),
  startFrame: z.number().int().min(0),
  durationInFrames: z.number().int().positive(),
  endFrame: z.number().int().positive(),
  words: z.array(WordTimingSchema).min(1),
  characters: z.array(CharacterSpecSchema).min(1).max(4),
  props: z.array(PropSpecSchema).max(4).default([]),
  beats: z.array(BeatSpecSchema).default([]),
  lines: z.array(ScriptLineSchema).optional(),
  sfx: SceneSfxFieldSchema.optional(),
  layoutOverrides: SceneLayoutOverridesSchema.optional(),
});
export type TimelineScene = z.infer<typeof TimelineSceneSchema>;

export const MusicTrackConfigSchema = z.union([
  z.string(),
  z.object({
    path: z.string(),
    volume: z.number().min(0).max(1).optional(),
  }),
]);

export const TimelineAudioConfigSchema = z.object({
  sfx: z.boolean().default(true),
  sfxVolume: z.number().min(0).max(1).default(0.35),
  music: MusicTrackConfigSchema.optional(),
});
export type TimelineAudioConfig = z.infer<typeof TimelineAudioConfigSchema>;

export const TimelineSchema = z.object({
  version: z.literal('1.0').default('1.0'),
  aspect: AspectRatioSchema.default('9:16'),
  voice: z.string().optional(),
  voicesUsed: z.record(z.string(), z.string()).optional(),
  seed: z.number().int().default(1337),
  skill: z.string().optional(),
  renderParams: SkillRenderParamsSchema.optional(),
  audio: TimelineAudioConfigSchema.default({ sfx: true, sfxVolume: 0.35 }),
  topic: z.string().min(3),
  title: z.string().min(3),
  hook: z.string().min(3),
  description: z.string().min(5),
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

export const VideoMetaSchema = z.object({
  title: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
  topic: z.string(),
  aspect: AspectRatioSchema,
  seed: z.number().int(),
  skill: z.string().optional(),
  renderParams: SkillRenderParamsSchema.optional(),
  voicesUsed: z.record(z.string(), z.string()).default({}),
  audio: z
    .object({
      sfx: z.boolean(),
      sfxVolume: z.number(),
      sfxEventCount: z.number().int().min(0),
      music: MusicTrackConfigSchema.optional(),
    })
    .optional(),
  durationSec: z.number(),
  totalFrames: z.number(),
  fps: z.number(),
  resolution: z.string(),
  voiceProvider: z.string(),
  variationId: z.string(),
  generatedAt: z.string(),
});
export type VideoMeta = z.infer<typeof VideoMetaSchema>;

/**
 * Parses a Timeline JSON payload with readable file + field-path error messages.
 */
export function parseTimelineStrict(raw: unknown, fileLabel = 'timeline.json'): Timeline {
  const res = TimelineSchema.safeParse(raw);
  if (!res.success) {
    const details = res.error.issues
      .map((issue) => {
        const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '<root>';
        return `  - ${fileLabel} -> ${fieldPath}: ${issue.message}`;
      })
      .join('\n');
    throw new Error(`Invalid Timeline schema in ${fileLabel}:\n${details}`);
  }
  return res.data;
}
