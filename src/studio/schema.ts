import { z } from 'zod';
import { AspectRatio, computeSafeArea, getAspectPreset } from '../aspect';

export const EmotionEnum = z.enum(['happy', 'sad', 'shock', 'angry', 'smug', 'sleepy', 'laughing']);
export type StudioEmotion = z.infer<typeof EmotionEnum>;

export const AnimEnum = z.enum(['idle', 'bounce', 'walk', 'jump', 'shake', 'pop-in']);
export type StudioAnim = z.infer<typeof AnimEnum>;

export const PropTypeEnum = z.enum(['phone', 'controller', 'clock', 'homework', 'toothbrush', 'door', 'heart']);
export type StudioPropType = z.infer<typeof PropTypeEnum>;

export const StudioCharacterSchema = z.object({
  id: z.string().min(1),
  charType: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  emotion: EmotionEnum,
  anim: AnimEnum,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  voice: z.string().optional(),
});
export type StudioCharacter = z.infer<typeof StudioCharacterSchema>;

export const BubbleFlagSchema = z.preprocess(() => false, z.boolean().default(false));

export const StudioLineSchema = z.object({
  speaker: z.string().min(1),
  text: z
    .string()
    .min(1)
    .refine((val) => val.trim().split(/\s+/).length <= 16, {
      message: 'Each spoken line must be at most 14-16 words',
    }),
  emotion: EmotionEnum,
  bubble: BubbleFlagSchema.optional().default(false),
});
export type StudioLine = z.infer<typeof StudioLineSchema>;

export const PropSurfaceSchema = z
  .string()
  .regex(/^(ground|table|float|hand:[a-zA-Z0-9_-]+)$/)
  .default('ground');
export type PropSurface = string;

export const StudioPropSchema = z.object({
  type: PropTypeEnum,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  surface: PropSurfaceSchema.optional().default('ground'),
});
export type StudioProp = z.infer<typeof StudioPropSchema>;

export const StudioSceneSchema = z.object({
  label: z.string().min(1),
  bg: z.tuple([z.string(), z.string()]),
  caption: z.string().min(1),
  characters: z.array(StudioCharacterSchema).min(1).max(4),
  lines: z.array(StudioLineSchema).min(1).max(6),
  props: z.array(StudioPropSchema).max(5),
});
export type StudioScene = z.infer<typeof StudioSceneSchema>;

export const ThumbnailBgStyleEnum = z.enum(['sunburst', 'halftone', 'diagonal', 'radial']);
export type ThumbnailBgStyle = z.infer<typeof ThumbnailBgStyleEnum>;

export const StudioThumbnailSchema = z.object({
  text: z.string().min(1),
  emotion1: EmotionEnum,
  emotion2: EmotionEnum,
  keyProp: PropTypeEnum,
  bgStyle: ThumbnailBgStyleEnum,
  accentColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  fontScale: z.number().min(0.6).max(1.5).optional(),
  swapCharacters: z.boolean().optional(),
});
export type StudioThumbnail = z.infer<typeof StudioThumbnailSchema>;

export const StudioScriptSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  hashtags: z.array(z.string()).min(1),
  scenes: z.array(StudioSceneSchema).min(3).max(6),
  thumbnail: StudioThumbnailSchema.optional(),
});
export type StudioScript = z.infer<typeof StudioScriptSchema>;

export function deriveDefaultThumbnail(script: Pick<StudioScript, 'title' | 'scenes' | 'thumbnail'>): StudioThumbnail {
  const sc0 = script.scenes[0];
  const rawWords = (script.thumbnail?.text || script.title || 'CHUYỆN GÌ ĐÂY?!')
    .replace(/^what\s+if\s*/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  const text = (rawWords.length >= 2 ? rawWords.join(' ') : `${rawWords[0] || 'BẤT'} NGỜ?!`).toUpperCase();
  const c1 = sc0?.characters[0];
  const c2 = sc0?.characters[1] ?? c1;
  return {
    text,
    emotion1: script.thumbnail?.emotion1 ?? (c1?.emotion === 'idle' as unknown ? 'shock' : c1?.emotion || 'shock'),
    emotion2: script.thumbnail?.emotion2 ?? (c2?.emotion || 'smug'),
    keyProp: script.thumbnail?.keyProp ?? sc0?.props[0]?.type ?? 'controller',
    bgStyle: script.thumbnail?.bgStyle ?? 'sunburst',
    accentColor: script.thumbnail?.accentColor ?? '#facc15',
    fontScale: script.thumbnail?.fontScale ?? 1,
    swapCharacters: Boolean(script.thumbnail?.swapCharacters),
  };
}

export function sanitizeAndValidateScript(raw: unknown): { script: StudioScript; warnings: string[] } {
  const obj = (raw && typeof raw === 'object' ? structuredClone(raw) : {}) as Record<string, unknown>;
  if (Array.isArray(obj.scenes)) {
    for (const sc of obj.scenes as Array<Record<string, unknown>>) {
      const label = typeof sc.label === 'string' ? sc.label : 'SCENE';
      const caption = typeof sc.caption === 'string' && sc.caption.trim() ? sc.caption.trim() : label;
      const rawLines = Array.isArray(sc.lines) ? (sc.lines as Array<Record<string, unknown>>) : [];
      const validLines: Array<Record<string, unknown>> = [];
      for (const ln of rawLines) {
        const txt = typeof ln?.text === 'string' ? ln.text.trim() : '';
        if (!txt) continue;
        const speaker = typeof ln.speaker === 'string' && ln.speaker.trim() ? ln.speaker.trim() : 'narrator';
        validLines.push({ ...ln, speaker, text: txt, emotion: typeof ln.emotion === 'string' ? ln.emotion : 'happy', bubble: false });
      }
      if (validLines.length === 0) {
        validLines.push({ speaker: 'narrator', text: caption, emotion: 'happy', bubble: false });
      }
      sc.lines = validLines;
    }
  }
  const parsed = StudioScriptSchema.parse(obj);
  parsed.thumbnail = deriveDefaultThumbnail(parsed);
  return { script: parsed, warnings: [] };
}

export interface LineTiming {
  speaker: string; text: string; emotion: StudioEmotion; bubble: boolean;
  startSec: number; endSec: number; durationSec: number;
  audioKey?: string; audioBase64?: string; mimeType?: string;
}

export interface TimelineScene extends StudioScene {
  index: number; startSec: number; endSec: number; durationSec: number;
  bgKind: 'room' | 'kitchen' | 'school'; transition: 'wipe' | 'zoom';
  lineTimings: LineTiming[]; sceneAudioBase64?: string; sceneAudioMime?: string;
}

export interface StudioTimeline {
  topic: string; script: StudioScript; voice: string; aspect?: AspectRatio;
  totalDurationSec: number; fps: number; width: number; height: number; scenes: TimelineScene[];
}

export interface StageLayout {
  aspect: AspectRatio; width: number; height: number; unit: number; groundY: number;
}

export function getLayoutForAspect(aspect: AspectRatio = '9:16'): StageLayout {
  const p = getAspectPreset(aspect);
  const safe = computeSafeArea(aspect);
  const groundY = p.isPortrait
    ? Math.min(Math.round(p.height * 0.72), Math.round(safe.bottom - p.unit * 0.14))
    : Math.round(p.height * 0.74);
  return { aspect, width: p.width, height: p.height, unit: p.unit, groundY };
}

export const DEFAULT_LAYOUT: StageLayout = getLayoutForAspect('9:16');

export function estimateLineDurationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.8, Math.min(4.8, Number((words * 0.36 + 0.55).toFixed(2))));
}

export function buildTimelineFromScript(
  topic: string,
  script: StudioScript,
  voice: string,
  lineAudioMap: Record<string, { durationSec: number; audioBase64?: string; mimeType?: string }> = {},
  sceneAudioMap: Record<number, { durationSec: number; audioBase64: string; mimeType: string }> = {},
  aspect: AspectRatio = '9:16'
): StudioTimeline {
  const layout = getLayoutForAspect(aspect);
  const bgKinds: Array<'room' | 'kitchen' | 'school'> = ['room', 'kitchen', 'school'];
  let cursor = 0;

  const scenes: TimelineScene[] = script.scenes.map((sc, sIdx) => {
    let lineCursor = 0;
    const lineTimings: LineTiming[] = sc.lines.map((ln, lIdx) => {
      const key = `${sIdx}:${lIdx}`;
      const info = lineAudioMap[key];
      const dur = info?.durationSec ?? estimateLineDurationSec(ln.text);
      const start = Number((cursor + lineCursor).toFixed(3));
      const end = Number((start + dur).toFixed(3));
      lineCursor += dur + 0.32;
      return { ...ln, startSec: start, endSec: end, durationSec: dur, audioKey: key, audioBase64: info?.audioBase64, mimeType: info?.mimeType };
    });

    const sceneOverride = sceneAudioMap[sIdx];
    const durationSec = Number(Math.max(2.6, sceneOverride?.durationSec ?? lineCursor + 0.35).toFixed(2));
    const startSec = Number(cursor.toFixed(2));
    const endSec = Number((startSec + durationSec).toFixed(2));
    cursor = endSec;

    return {
      ...sc, index: sIdx, startSec, endSec, durationSec,
      bgKind: bgKinds[sIdx % bgKinds.length], transition: sIdx % 2 === 0 ? 'wipe' : 'zoom',
      lineTimings, sceneAudioBase64: sceneOverride?.audioBase64, sceneAudioMime: sceneOverride?.mimeType,
    };
  });

  return {
    topic, script, voice, aspect,
    totalDurationSec: Number(Math.max(1, cursor).toFixed(2)),
    fps: 30, width: layout.width, height: layout.height, scenes,
  };
}
