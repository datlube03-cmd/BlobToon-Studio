import { AspectRatio, getAspectPreset } from '../aspect';
import { Script, PaletteVariation } from '../script/schema';
import { PALETTE_VARIATIONS, computeTopicSeed } from '../script/variations';
import { buildDeterministicScript } from '../script/generator';
import { SkillRenderParams } from '../skills/schema';
import { TtsProvider } from '../voice/provider';
import {
  Timeline,
  TimelineSchema,
  TimelineScene,
  WordTiming,
  VideoMeta,
  VideoMetaSchema,
} from './schema';

export interface BuildTimelineOptions {
  aspect?: AspectRatio;
  seed?: number;
  skill?: string;
  renderParams?: SkillRenderParams;
  fps?: number;
  width?: number;
  height?: number;
  scenePaddingSec?: number;
  voice?: string;
  variation?: PaletteVariation;
}

/**
 * Estimates word-by-word timestamps across a scene's voice duration
 * proportional to each word's character weight and punctuation pause.
 */
export function computeWordTimings(
  captionText: string,
  voiceDurationSec: number,
  fps = 30
): WordTiming[] {
  const rawWords = captionText
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (rawWords.length === 0) {
    return [];
  }

  const weights = rawWords.map((w) => {
    const baseLen = Math.max(2, w.replace(/[^a-zA-Z0-9]/g, '').length);
    const hasPunct = /[,.!?;:—-]/.test(w) ? 2.2 : 0;
    return baseLen + hasPunct;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const timings: WordTiming[] = [];
  let cursorSec = 0;

  for (let i = 0; i < rawWords.length; i++) {
    const shareSec = (weights[i] / totalWeight) * voiceDurationSec;
    const startSec = Number(cursorSec.toFixed(3));
    const endSec =
      i === rawWords.length - 1
        ? Number(voiceDurationSec.toFixed(3))
        : Number((cursorSec + shareSec).toFixed(3));

    const startFrame = Math.max(0, Math.round(startSec * fps));
    const endFrame = Math.max(startFrame + 1, Math.round(endSec * fps));

    timings.push({
      word: rawWords[i],
      startSec,
      endSec,
      startFrame,
      endFrame,
    });

    cursorSec += shareSec;
  }

  return timings;
}

/**
 * Applies an aspect ratio override to an existing Timeline (updating aspect, width, and height).
 */
export function applyAspectToTimeline(timeline: Timeline, aspect: AspectRatio): Timeline {
  const preset = getAspectPreset(aspect);
  return TimelineSchema.parse({
    ...timeline,
    aspect,
    width: preset.width,
    height: preset.height,
  });
}

/**
 * Pure synchronous timeline builder given pre-synthesized voice durations per scene.
 * When `options.renderParams` is provided from a Skill file, merges `renderParams` into
 * the Timeline and applies `sceneDurationRange` and `transitionType` overrides.
 */
export function assembleTimelineFromDurations(
  script: Script,
  sceneVoiceResults: Array<{ file?: string; durationSec: number }>,
  options: BuildTimelineOptions = {}
): Timeline {
  const aspect: AspectRatio = options.aspect ?? script.aspect ?? '9:16';
  const preset = getAspectPreset(aspect);
  const fps = options.fps ?? 30;
  const width = options.width ?? preset.width;
  const height = options.height ?? preset.height;
  const defaultPaddingSec = options.scenePaddingSec ?? 0.45;
  const variation = options.variation ?? PALETTE_VARIATIONS[0];
  const seed = options.seed ?? computeTopicSeed(script.topic);
  const skillName = options.skill ?? script.skill;
  const renderParams = options.renderParams;

  let currentFrame = 0;
  const timelineScenes: TimelineScene[] = script.scenes.map((scene, idx) => {
    const voiceRes = sceneVoiceResults[idx] ?? { durationSec: 6.0 };
    const measuredVoiceSec = Number(Math.max(0.8, voiceRes.durationSec).toFixed(3));

    let paddingSec = defaultPaddingSec;
    let rawDurationSec = measuredVoiceSec + paddingSec;

    if (renderParams?.sceneDurationRange) {
      const [minSec, maxSec] = renderParams.sceneDurationRange;
      rawDurationSec = Math.max(minSec, Math.min(maxSec, rawDurationSec));
      paddingSec = Number(Math.min(defaultPaddingSec, rawDurationSec * 0.12).toFixed(3));
    }

    const durationInFrames = Math.max(Math.round(fps * 0.5), Math.round(rawDurationSec * fps));
    const durationSec = Number((durationInFrames / fps).toFixed(3));
    const voiceDurationSec = renderParams?.sceneDurationRange
      ? Number(Math.max(0.4, durationSec - paddingSec).toFixed(3))
      : measuredVoiceSec;

    const startFrame = currentFrame;
    const endFrame = startFrame + durationInFrames;
    currentFrame = endFrame;

    const words = computeWordTimings(scene.caption || scene.narration, voiceDurationSec, fps);
    const effectiveTransition = renderParams?.transitionType ?? scene.transition;

    return {
      id: scene.id,
      label: scene.label,
      narration: scene.narration,
      caption: scene.caption,
      background: scene.background,
      transition: effectiveTransition,
      audioFile: voiceRes.file,
      voiceDurationSec,
      paddingSec,
      durationSec,
      startFrame,
      durationInFrames,
      endFrame,
      words,
      characters: scene.characters,
      props: scene.props,
      beats: scene.beats,
      layoutOverrides: scene.layoutOverrides,
    };
  });

  const totalFrames = Math.max(1, currentFrame);
  const totalDurationSec = Number((totalFrames / fps).toFixed(3));

  const timeline: Timeline = {
    version: '1.0',
    aspect,
    seed,
    ...(skillName ? { skill: skillName } : {}),
    ...(renderParams ? { renderParams } : {}),
    topic: script.topic,
    title: script.title,
    hook: script.hook,
    description: script.description,
    hashtags: script.hashtags,
    fps,
    width,
    height,
    totalDurationSec,
    totalFrames,
    variation,
    scenes: timelineScenes,
  };

  return TimelineSchema.parse(timeline);
}

/**
 * Full async timeline builder: synthesizes narration per scene via TtsProvider,
 * measures real audio durations, and produces a validated Timeline JSON object.
 */
export async function buildTimeline(
  script: Script,
  ttsProvider: TtsProvider,
  options: BuildTimelineOptions = {}
): Promise<{ timeline: Timeline; providerUsed: string }> {
  const voiceResults: Array<{ file?: string; durationSec: number }> = [];
  let providerUsed = 'mock';

  for (const scene of script.scenes) {
    const res = await ttsProvider.synthesize(scene.narration, options.voice);
    if (res.provider) {
      providerUsed = res.provider;
    }
    voiceResults.push({
      file: res.file,
      durationSec: res.durationSec,
    });
  }

  const timeline = assembleTimelineFromDurations(script, voiceResults, options);
  return { timeline, providerUsed };
}

export function buildVideoMeta(timeline: Timeline, voiceProvider = 'mock'): VideoMeta {
  return VideoMetaSchema.parse({
    title: timeline.title,
    description: timeline.description,
    hashtags: timeline.hashtags,
    topic: timeline.topic,
    aspect: timeline.aspect,
    seed: timeline.seed,
    ...(timeline.skill ? { skill: timeline.skill } : {}),
    ...(timeline.renderParams ? { renderParams: timeline.renderParams } : {}),
    durationSec: timeline.totalDurationSec,
    totalFrames: timeline.totalFrames,
    fps: timeline.fps,
    resolution: `${timeline.width}x${timeline.height}`,
    voiceProvider,
    variationId: timeline.variation.id,
    generatedAt: new Date(1793880000000 + (timeline.seed % 86400000)).toISOString(),
  });
}

/**
 * Browser-safe helper to build a live Timeline directly from a Script without server calls.
 */
export function buildBrowserPreviewTimeline(
  script: Script,
  variation: PaletteVariation = PALETTE_VARIATIONS[0],
  aspect: AspectRatio = '9:16'
): Timeline {
  const durations = script.scenes.map((scene) => {
    const words = scene.narration.trim().split(/\s+/).filter(Boolean).length;
    const dur = Math.max(2.5, Number((words / 2.55 + 0.3).toFixed(2)));
    return { durationSec: dur };
  });
  return assembleTimelineFromDurations(script, durations, { variation, aspect });
}

export function createDefaultTimeline(
  topic = 'What if Mom started playing on your Roblox account',
  variation: PaletteVariation = PALETTE_VARIATIONS[0],
  aspect: AspectRatio = '9:16'
): Timeline {
  const script = buildDeterministicScript(topic, variation, aspect);
  return buildBrowserPreviewTimeline(script, variation, aspect);
}
