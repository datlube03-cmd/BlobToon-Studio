import path from 'node:path';
import { AspectRatio, getAspectPreset } from '../aspect';
import { Script, PaletteVariation } from '../script/schema';
import { PALETTE_VARIATIONS, computeTopicSeed } from '../script/variations';
import { buildDeterministicScript } from '../script/generator';
import { collectSfxEvents } from '../sfx/events';
import { SkillRenderParams } from '../skills/schema';
import {
  TtsProvider,
  concatenateWavFiles,
  computeTtsCacheKey,
  resolveLineVoice,
} from '../voice/provider';
import {
  Timeline,
  TimelineAudioConfig,
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
  audio?: Partial<TimelineAudioConfig>;
  fps?: number;
  width?: number;
  height?: number;
  scenePaddingSec?: number;
  voice?: string;
  variation?: PaletteVariation;
}

/**
 * Computes the map of character ID -> resolved voice name across a Script.
 */
export function resolveScriptVoicesUsed(
  script: Script,
  cliVoiceOverride?: string,
  envVoice?: string
): Record<string, string> {
  const voicesUsed: Record<string, string> = {};
  const projectVoice = cliVoiceOverride ?? script.voice;

  for (const scene of script.scenes) {
    for (const char of scene.characters) {
      if (!voicesUsed[char.id]) {
        voicesUsed[char.id] = resolveLineVoice({
          characterVoice: char.voice,
          scriptVoice: projectVoice,
          envVoice,
        });
      }
    }
    if (scene.lines) {
      for (const ln of scene.lines) {
        if (ln.silent) continue;
        const charObj = scene.characters.find((c) => c.id === ln.speakerId);
        voicesUsed[ln.speakerId] = resolveLineVoice({
          lineVoice: ln.voice,
          characterVoice: charObj?.voice,
          scriptVoice: projectVoice,
          envVoice,
        });
      }
    }
  }

  return voicesUsed;
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
 * Resolves a PaletteVariation by overriding background and accent colors when
 * `colorPalette` (an array of hex color strings) is provided via Skill Render Params.
 */
export function resolveVariationWithColorPalette(
  baseVariation: PaletteVariation,
  colorPalette?: string[]
): PaletteVariation {
  if (!colorPalette || colorPalette.length < 2) {
    return baseVariation;
  }
  const skyTop = colorPalette[0];
  const skyBottom = colorPalette[1] ?? colorPalette[0];
  const floorColor = colorPalette[2] ?? colorPalette[0];
  const wallAccent = colorPalette[3] ?? colorPalette[1];
  const captionHighlight = colorPalette[4] ?? colorPalette[3] ?? colorPalette[1];
  const extraPalette =
    colorPalette.length >= 4
      ? colorPalette.slice(3).concat(baseVariation.characterPalette)
      : [colorPalette[1], ...baseVariation.characterPalette];

  return {
    ...baseVariation,
    skyTop,
    skyBottom,
    floorColor,
    wallAccent,
    captionHighlight,
    characterPalette: extraPalette.slice(0, 6),
  };
}

/**
 * Pure synchronous timeline builder given pre-synthesized voice durations per scene.
 */
export function assembleTimelineFromDurations(
  script: Script,
  sceneVoiceResults: Array<{ file?: string; durationSec: number; speedAdjusted?: boolean }>,
  options: BuildTimelineOptions = {}
): Timeline {
  const aspect: AspectRatio = options.aspect ?? script.aspect ?? '9:16';
  const preset = getAspectPreset(aspect);
  const fps = options.fps ?? 30;
  const width = options.width ?? preset.width;
  const height = options.height ?? preset.height;
  const defaultPaddingSec = options.scenePaddingSec ?? 0.45;
  const seed = options.seed ?? computeTopicSeed(script.topic);
  const skillName = options.skill ?? script.skill;
  const renderParams = options.renderParams ?? script.renderParams;
  const baseVariation = options.variation ?? PALETTE_VARIATIONS[0];
  const variation = resolveVariationWithColorPalette(baseVariation, renderParams?.colorPalette);
  const ttsSpeedMultiplier =
    renderParams?.ttsSpeedMultiplier && renderParams.ttsSpeedMultiplier > 0
      ? renderParams.ttsSpeedMultiplier
      : 1.0;

  const voicesUsed = resolveScriptVoicesUsed(script, options.voice);

  let currentFrame = 0;
  const timelineScenes: TimelineScene[] = script.scenes.map((scene, idx) => {
    const voiceRes = sceneVoiceResults[idx] ?? { durationSec: 6.0 };
    const rawVoiceSec = voiceRes.speedAdjusted
      ? voiceRes.durationSec
      : voiceRes.durationSec / ttsSpeedMultiplier;
    const measuredVoiceSec = Number(Math.max(0.5, rawVoiceSec).toFixed(3));

    let paddingSec = Number((defaultPaddingSec / Math.sqrt(ttsSpeedMultiplier)).toFixed(3));
    let rawDurationSec = measuredVoiceSec + paddingSec;

    if (renderParams?.sceneDurationRange) {
      const [minSec, maxSec] = renderParams.sceneDurationRange;
      rawDurationSec = Math.max(minSec, Math.min(maxSec, rawDurationSec));
      paddingSec = Number(Math.min(paddingSec, rawDurationSec * 0.12).toFixed(3));
    }

    const durationInFrames = Math.max(Math.round(fps * 0.5), Math.round(rawDurationSec * fps));
    const durationSec = Number((durationInFrames / fps).toFixed(3));
    const voiceDurationSec = renderParams?.sceneDurationRange
      ? Number(Math.max(0.4, Math.min(measuredVoiceSec, durationSec - paddingSec)).toFixed(3))
      : measuredVoiceSec;

    const startFrame = currentFrame;
    const endFrame = startFrame + durationInFrames;
    currentFrame = endFrame;

    // Recompute word timings against the speed-adjusted voiceDurationSec
    const words = computeWordTimings(scene.caption || scene.narration, voiceDurationSec, fps);
    const effectiveTransition = renderParams?.transitionType ?? scene.transition;

    return {
      id: scene.id,
      label: scene.label,
      narration: scene.narration,
      caption: scene.caption,
      background: scene.background,
      ...(scene.bgColors ? { bgColors: scene.bgColors } : {}),
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
      ...(scene.lines ? { lines: scene.lines } : {}),
      ...(scene.sfx !== undefined ? { sfx: scene.sfx } : {}),
      layoutOverrides: scene.layoutOverrides,
    };
  });

  const totalFrames = Math.max(1, currentFrame);
  const totalDurationSec = Number((totalFrames / fps).toFixed(3));

  const audioConfig: TimelineAudioConfig = {
    sfx: options.audio?.sfx ?? true,
    sfxVolume: options.audio?.sfxVolume ?? 0.35,
    ...(options.audio?.music ? { music: options.audio.music } : {}),
  };

  const timeline: Timeline = {
    version: '1.0',
    aspect,
    ...(options.voice ?? script.voice ? { voice: options.voice ?? script.voice } : {}),
    voicesUsed,
    seed,
    ...(skillName ? { skill: skillName } : {}),
    ...(renderParams ? { renderParams } : {}),
    audio: audioConfig,
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
 * Full async timeline builder: synthesizes narration per scene (or per line when `scene.lines` is present)
 * via TtsProvider, resolving voices with `line.voice > character.voice > script.voice > VOICESTUDIO_VOICE`,
 * skipping `silent` lines, applying `line.speed * renderParams.ttsSpeedMultiplier`, and producing a validated Timeline.
 */
export async function buildTimeline(
  script: Script,
  ttsProvider: TtsProvider,
  options: BuildTimelineOptions = {}
): Promise<{ timeline: Timeline; providerUsed: string }> {
  const voiceResults: Array<{ file?: string; durationSec: number; speedAdjusted?: boolean }> = [];
  let providerUsed = 'mock';
  const effectiveRenderParams = options.renderParams ?? script.renderParams;
  const globalSpeedMultiplier = effectiveRenderParams?.ttsSpeedMultiplier ?? 1.0;
  const projectDefaultVoice = options.voice ?? script.voice;

  for (const scene of script.scenes) {
    const spokenLines = scene.lines?.filter((l) => !l.silent) ?? [];

    if (spokenLines.length > 0) {
      const lineFiles: string[] = [];
      let totalDur = 0;

      for (const ln of spokenLines) {
        const charObj = scene.characters.find((c) => c.id === ln.speakerId);
        const resolvedVoice = resolveLineVoice({
          lineVoice: ln.voice,
          characterVoice: charObj?.voice,
          scriptVoice: projectDefaultVoice,
        });
        const lineSpeed = (ln.speed ?? 1.0) * globalSpeedMultiplier;
        const res = await ttsProvider.synthesize(ln.text, resolvedVoice, lineSpeed);
        if (res.provider) {
          providerUsed = res.provider;
        }
        lineFiles.push(res.file);
        totalDur += res.durationSec;
      }

      if (lineFiles.length === 1) {
        voiceResults.push({
          file: lineFiles[0],
          durationSec: Number(totalDur.toFixed(3)),
          speedAdjusted: true,
        });
      } else {
        const combinedKey = computeTtsCacheKey(
          `scene:${scene.id}`,
          lineFiles.join('|'),
          globalSpeedMultiplier
        );
        const combinedPath = path.join(path.dirname(lineFiles[0]), `scene_${combinedKey}.wav`);
        const concatDur = await concatenateWavFiles(lineFiles, combinedPath);
        voiceResults.push({
          file: combinedPath,
          durationSec: Number(Math.max(0.5, concatDur).toFixed(3)),
          speedAdjusted: true,
        });
      }
    } else if (scene.lines && scene.lines.length > 0 && spokenLines.length === 0) {
      // All lines in this scene are marked `silent`: no spoken audio, estimate reading duration
      const words = scene.caption.trim().split(/\s+/).filter(Boolean).length;
      const silentDur = Number(Math.max(1.8, words / 2.8).toFixed(2));
      voiceResults.push({
        file: undefined,
        durationSec: silentDur,
        speedAdjusted: true,
      });
    } else {
      const firstSpeakingChar =
        scene.characters.find((c) => c.speaking) ?? scene.characters[0];
      const resolvedVoice = resolveLineVoice({
        characterVoice: firstSpeakingChar?.voice,
        scriptVoice: projectDefaultVoice,
      });
      const res = await ttsProvider.synthesize(
        scene.narration,
        resolvedVoice,
        globalSpeedMultiplier
      );
      if (res.provider) {
        providerUsed = res.provider;
      }
      voiceResults.push({
        file: res.file,
        durationSec: res.durationSec,
        speedAdjusted: res.speedAdjusted ?? true,
      });
    }
  }

  const timeline = assembleTimelineFromDurations(script, voiceResults, {
    ...options,
    renderParams: effectiveRenderParams,
  });
  return { timeline, providerUsed };
}

export function buildVideoMeta(timeline: Timeline, voiceProvider = 'mock'): VideoMeta {
  const audioCfg = timeline.audio ?? { sfx: true, sfxVolume: 0.35 };
  const sfxEvents = collectSfxEvents(timeline, timeline.fps);
  return VideoMetaSchema.parse({
    title: timeline.title,
    description: timeline.description,
    hashtags: timeline.hashtags,
    topic: timeline.topic,
    aspect: timeline.aspect,
    seed: timeline.seed,
    ...(timeline.skill ? { skill: timeline.skill } : {}),
    ...(timeline.renderParams ? { renderParams: timeline.renderParams } : {}),
    voicesUsed: timeline.voicesUsed ?? {},
    audio: {
      sfx: audioCfg.sfx,
      sfxVolume: audioCfg.sfxVolume,
      sfxEventCount: sfxEvents.length,
      ...(audioCfg.music ? { music: audioCfg.music } : {}),
    },
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
  aspect: AspectRatio = '9:16',
  renderParams?: SkillRenderParams,
  skill?: string
): Timeline {
  const durations = script.scenes.map((scene) => {
    const words = scene.narration.trim().split(/\s+/).filter(Boolean).length;
    const dur = Math.max(2.5, Number((words / 2.55 + 0.3).toFixed(2)));
    return { durationSec: dur, speedAdjusted: false };
  });
  return assembleTimelineFromDurations(script, durations, {
    variation,
    aspect,
    renderParams: renderParams ?? script.renderParams,
    skill: skill ?? script.skill,
  });
}

export function createDefaultTimeline(
  topic = 'What if Mom started playing on your Roblox account',
  variation: PaletteVariation = PALETTE_VARIATIONS[0],
  aspect: AspectRatio = '9:16',
  renderParams?: SkillRenderParams,
  skill?: string
): Timeline {
  const script = buildDeterministicScript(topic, variation, aspect);
  return buildBrowserPreviewTimeline(script, variation, aspect, renderParams, skill);
}
