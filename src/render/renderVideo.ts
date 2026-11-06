import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import {
  ALL_ASPECT_RATIOS,
  AspectRatio,
  getAspectPreset,
} from '../aspect';
import { collectSfxEvents } from '../sfx/events';
import {
  SFX_MAX_PEAK,
  SFX_REGISTRY,
  normalizeSamples,
  synthesizeProceduralBgm,
  synthesizeSfx,
} from '../sfx/synth';
import { Timeline, VideoMeta } from '../timeline/schema';
import { applyAspectToTimeline, buildVideoMeta } from '../timeline/builder';
import { SceneStage } from '../scenes/SceneStage';
import { MockProvider, probeAudioDurationSec } from '../voice/provider';
import { resolveRemotionBrowserExecutable } from './remotionBrowser';

const execFileAsync = promisify(execFile);

let cachedRemotionBundlePromise: Promise<string> | null = null;

export async function getRemotionBundleUrl(): Promise<string> {
  if (!cachedRemotionBundlePromise) {
    const entryPoint = path.resolve(process.cwd(), 'src/render/index.ts');
    cachedRemotionBundlePromise = bundle({
      entryPoint,
    }).catch((err) => {
      cachedRemotionBundlePromise = null;
      throw err;
    });
  }
  return cachedRemotionBundlePromise;
}

export interface RenderOptions {
  outDir: string;
  aspect?: AspectRatio;
  sfx?: boolean;
  sfxVolume?: number;
  music?: string | { path: string; volume?: number };
  musicPath?: string;
  musicVolume?: number;
  videoFilename?: string;
  thumbnailFilename?: string;
  metaFilename?: string;
  timelineFilename?: string;
  maxDurationSec?: number;
  voiceProviderName?: string;
  copyAudioToSubdir?: boolean;
  draft?: boolean;
  quality?: 'final' | 'draft';
  onProgress?: (percent: number, stage: string) => void;
}

export interface RenderOutputResult {
  aspect: AspectRatio;
  videoPath: string;
  thumbnailPath: string;
  extraThumbnailPath?: string;
  metaPath: string;
  timelinePath: string;
  audioDir?: string;
  durationSec: number;
  framesRendered: number;
  totalFrames: number;
  width: number;
  height: number;
  fps: number;
  renderEngine?: 'remotion' | 'draft-svg';
  meta: VideoMeta;
}

/**
 * Verifies ffmpeg is installed on PATH before attempting frame encoding.
 */
export async function ensureFfmpegInstalled(): Promise<void> {
  try {
    await execFileAsync('ffmpeg', ['-version']);
  } catch {
    throw new Error(
      'Missing required dependency "ffmpeg": ffmpeg was not found on your system PATH. ' +
        'Install it via "brew install ffmpeg" (macOS), "sudo apt install ffmpeg librsvg2-bin" (Linux), or "winget install Gyan.FFmpeg" (Windows).'
    );
  }
}

/**
 * Concatenates or pads each scene's WAV audio file so it aligns strictly with
 * `scene.durationSec` (voice + padding) and mixes frame-accurate SFX + optional music.
 * If SFX or music mixing fails for any reason, prints a warning and falls back to voice-only.
 */
async function buildMasterTimelineAudioWav(
  timeline: Timeline,
  tempDir: string,
  maxFrames: number,
  audioExportDir?: string
): Promise<string> {
  const sampleRate = 24000;
  const bytesPerSample = 2; // 16-bit mono
  const totalDurationSec = maxFrames / timeline.fps;
  const totalSamples = Math.max(1, Math.round(totalDurationSec * sampleRate));
  const masterDataSize = totalSamples * bytesPerSample;
  const voiceBuffer = Buffer.alloc(44 + masterDataSize);

  // Write WAV header for voice/master track
  voiceBuffer.write('RIFF', 0);
  voiceBuffer.writeUInt32LE(36 + masterDataSize, 4);
  voiceBuffer.write('WAVE', 8);
  voiceBuffer.write('fmt ', 12);
  voiceBuffer.writeUInt32LE(16, 16);
  voiceBuffer.writeUInt16LE(1, 20);
  voiceBuffer.writeUInt16LE(1, 22);
  voiceBuffer.writeUInt32LE(sampleRate, 24);
  voiceBuffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  voiceBuffer.writeUInt16LE(bytesPerSample, 32);
  voiceBuffer.writeUInt16LE(16, 34);
  voiceBuffer.write('data', 36);
  voiceBuffer.writeUInt32LE(masterDataSize, 40);

  const mock = new MockProvider();
  if (audioExportDir) {
    fs.mkdirSync(audioExportDir, { recursive: true });
  }

  const voiceActiveSpans: Array<{ startSample: number; endSample: number }> = [];

  for (let idx = 0; idx < timeline.scenes.length; idx++) {
    const scene = timeline.scenes[idx];
    if (scene.startFrame >= maxFrames) break;

    let audioPath = scene.audioFile;
    if (!audioPath || !fs.existsSync(audioPath)) {
      const synth = await mock.synthesize(
        scene.narration,
        undefined,
        timeline.renderParams?.ttsSpeedMultiplier ?? 1.0
      );
      audioPath = synth.file;
      scene.audioFile = audioPath;
    }

    if (audioExportDir && audioPath && fs.existsSync(audioPath)) {
      const destFile = path.join(
        audioExportDir,
        `${String(idx + 1).padStart(2, '0')}_${scene.id}.wav`
      );
      if (path.resolve(audioPath) !== path.resolve(destFile)) {
        fs.copyFileSync(audioPath, destFile);
      }
    }

    const startSample = Math.round((scene.startFrame / timeline.fps) * sampleRate);
    const voiceEndSample = Math.min(
      totalSamples,
      startSample + Math.round(scene.voiceDurationSec * sampleRate)
    );
    voiceActiveSpans.push({ startSample, endSample: voiceEndSample });

    const normWav = path.join(tempDir, `norm_${scene.id}.wav`);
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        audioPath,
        '-ar',
        String(sampleRate),
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        normWav,
      ]);
      const sceneBuf = fs.readFileSync(normWav);
      let dataOffset = 44;
      const dataIdx = sceneBuf.indexOf('data');
      if (dataIdx !== -1 && dataIdx + 8 <= sceneBuf.length) {
        dataOffset = dataIdx + 8;
      }
      const pcmBytes = sceneBuf.subarray(dataOffset);
      const targetByteOffset = 44 + startSample * bytesPerSample;
      const availableSpace = voiceBuffer.length - targetByteOffset;
      if (availableSpace > 0) {
        pcmBytes.copy(
          voiceBuffer,
          targetByteOffset,
          0,
          Math.min(pcmBytes.length, availableSpace)
        );
      }
    } catch {
      // Leave silent span if individual scene audio conversion fails
    }
  }

  const voiceOnlyWavPath = path.join(tempDir, 'voice_only.wav');
  fs.writeFileSync(voiceOnlyWavPath, voiceBuffer);

  // Mix SFX + optional music into masterBuffer; fall back to voiceOnlyWavPath on any error (Change F6)
  try {
    const masterBuffer = Buffer.from(voiceBuffer);
    const mixFloat = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      mixFloat[i] = masterBuffer.readInt16LE(44 + i * 2) / 32768;
    }

    // 1. Mix frame-accurate SFX events (Change F3: base ~ -18 dB relative to voice, never louder than voice)
    const sfxEnabled = timeline.audio?.sfx ?? true;
    if (sfxEnabled) {
      const events = collectSfxEvents(timeline, timeline.fps);
      const baseDbLinear = 0.1259; // -18 dB
      for (const ev of events) {
        if (ev.frame >= maxFrames) continue;
        // Ensure cached WAV exists in cache/sfx/<name>_<variant>.wav
        synthesizeSfx(ev.type, ev.variant);
        const def = SFX_REGISTRY[ev.type];
        if (!def) continue;
        const { normalized } = normalizeSamples(
          def.renderSamples(ev.variant, sampleRate),
          SFX_MAX_PEAK
        );
        const startSample = Math.round((ev.frame / timeline.fps) * sampleRate);
        // Scale by event volume relative to default 0.35 so base sits around -18 dB
        const gain = Math.min(0.45, baseDbLinear * (ev.volume / 0.35) * 2.2);
        for (let s = 0; s < normalized.length && startSample + s < totalSamples; s++) {
          mixFloat[startSample + s] += normalized[s] * gain;
        }
      }
    }

    // 2. Mix optional background music (from --music path or skill renderParams.bgmGenre)
    const rawMusic = timeline.audio?.music;
    let musicSourcePath = typeof rawMusic === 'string' ? rawMusic : rawMusic?.path;
    const musicVol =
      typeof rawMusic === 'object' && rawMusic?.volume !== undefined ? rawMusic.volume : 0.15;
    if (!musicSourcePath && timeline.renderParams?.bgmGenre) {
      musicSourcePath = synthesizeProceduralBgm(
        timeline.renderParams.bgmGenre,
        totalDurationSec
      );
    }

    if (musicSourcePath && fs.existsSync(musicSourcePath) && musicVol > 0) {
      const musicNormWav = path.join(tempDir, 'norm_music.wav');
      await execFileAsync('ffmpeg', [
        '-y',
        '-stream_loop',
        '-1',
        '-i',
        musicSourcePath,
        '-t',
        String(totalDurationSec),
        '-ar',
        String(sampleRate),
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        musicNormWav,
      ]);
      const musicBuf = fs.readFileSync(musicNormWav);
      let mOffset = 44;
      const mIdx = musicBuf.indexOf('data');
      if (mIdx !== -1 && mIdx + 8 <= musicBuf.length) {
        mOffset = mIdx + 8;
      }
      const mSamples = Math.floor((musicBuf.length - mOffset) / 2);
      const fadeSamples = Math.min(Math.round(sampleRate * 0.4), Math.floor(totalSamples / 4));
      const duckLinear = 0.35; // ~ -9 dB duck under voiceover

      for (let i = 0; i < Math.min(totalSamples, mSamples); i++) {
        const mVal = musicBuf.readInt16LE(mOffset + i * 2) / 32768;
        let fade = 1.0;
        if (fadeSamples > 0 && i < fadeSamples) {
          fade = i / fadeSamples;
        } else if (fadeSamples > 0 && i > totalSamples - fadeSamples) {
          fade = Math.max(0, (totalSamples - i) / fadeSamples);
        }
        const isVoiceActive = voiceActiveSpans.some(
          (sp) => i >= sp.startSample && i <= sp.endSample
        );
        const duck = isVoiceActive ? duckLinear : 1.0;
        mixFloat[i] += mVal * musicVol * fade * duck;
      }
    }

    for (let i = 0; i < totalSamples; i++) {
      const clamped = Math.max(-0.95, Math.min(0.95, mixFloat[i]));
      masterBuffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
    }

    const masterWavPath = path.join(tempDir, 'master_audio.wav');
    fs.writeFileSync(masterWavPath, masterBuffer);
    return masterWavPath;
  } catch (mixErr) {
    console.warn(
      `[BlobToon Audio] Warning: SFX/music mixing encountered an error (${
        mixErr instanceof Error ? mixErr.message : String(mixErr)
      }). Falling back to voice-only audio track.`
    );
    return voiceOnlyWavPath;
  }
}

export function renderFrameSvgMarkup(
  timeline: Timeline,
  frame: number,
  thumbnailMode = false,
  overrideAspect?: AspectRatio
): string {
  const fps = timeline.fps;
  const aspect: AspectRatio = overrideAspect ?? timeline.aspect ?? '9:16';

  if (thumbnailMode) {
    const hookScene = timeline.scenes[0];
    const peakFrame = Math.min(hookScene.durationInFrames - 1, Math.round(fps * 0.8));
    const el = React.createElement(SceneStage, {
      scene: hookScene,
      variation: timeline.variation,
      sceneFrame: peakFrame,
      fps,
      aspect,
      renderParams: timeline.renderParams,
      showSafeZones: false,
      thumbnailBannerTitle: timeline.title,
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n${ReactDOMServer.renderToStaticMarkup(el)}`;
  }

  const activeScene =
    timeline.scenes.find((s) => frame >= s.startFrame && frame < s.endFrame) ??
    timeline.scenes[timeline.scenes.length - 1];
  const sceneFrame = Math.max(0, frame - activeScene.startFrame);

  const el = React.createElement(SceneStage, {
    scene: activeScene,
    variation: timeline.variation,
    sceneFrame,
    fps,
    aspect,
    renderParams: timeline.renderParams,
    showSafeZones: false,
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${ReactDOMServer.renderToStaticMarkup(el)}`;
}

/**
 * Renders a validated Timeline JSON into:
 * - MP4 video at the chosen aspect ratio (9:16, 16:9, 4:3, or 3:4) with muxed voiceover + SFX + music
 * - Thumbnail PNG matching the chosen aspect (and for 16:9, a 1280x720 thumbnail.png)
 * - meta.json & timeline.json
 */
export async function renderTimelineToVideo(
  inputTimeline: Timeline,
  options: RenderOptions
): Promise<RenderOutputResult> {
  await ensureFfmpegInstalled();

  const targetAspect: AspectRatio = options.aspect ?? inputTimeline.aspect ?? '9:16';
  const preset = getAspectPreset(targetAspect);
  const baseTimeline = applyAspectToTimeline(inputTimeline, targetAspect);

  const existingMusic = baseTimeline.audio?.music;
  const existingMusicPath =
    typeof existingMusic === 'string' ? existingMusic : existingMusic?.path;
  const existingMusicVol =
    typeof existingMusic === 'object' && existingMusic?.volume !== undefined
      ? existingMusic.volume
      : 0.15;

  const resolvedOptionMusicPath =
    options.musicPath ??
    (typeof options.music === 'string' ? options.music : options.music?.path);

  // Apply CLI/option overrides for SFX and background music (Change F4)
  const timeline: Timeline = {
    ...baseTimeline,
    audio: {
      sfx: options.sfx ?? baseTimeline.audio?.sfx ?? true,
      sfxVolume: options.sfxVolume ?? baseTimeline.audio?.sfxVolume ?? 0.35,
      ...(resolvedOptionMusicPath
        ? {
            music: {
              path: path.resolve(resolvedOptionMusicPath),
              volume: options.musicVolume ?? existingMusicVol,
            },
          }
        : existingMusicPath
        ? {
            music: {
              path: existingMusicPath,
              volume: options.musicVolume ?? existingMusicVol,
            },
          }
        : {}),
    },
  };

  const outDir = path.resolve(options.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const videoPath = path.join(outDir, options.videoFilename ?? 'video.mp4');
  const thumbnailPath = path.join(outDir, options.thumbnailFilename ?? 'thumbnail.png');
  const metaPath = path.join(outDir, options.metaFilename ?? 'meta.json');
  const timelinePath = path.join(outDir, options.timelineFilename ?? 'timeline.json');
  const audioDir =
    options.copyAudioToSubdir !== false ? path.join(outDir, 'audio') : undefined;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-render-'));
  const isDraftMode = options.draft === true || options.quality === 'draft';

  try {
    const totalFrames = options.maxDurationSec
      ? Math.min(timeline.totalFrames, Math.max(1, Math.round(options.maxDurationSec * timeline.fps)))
      : timeline.totalFrames;
    const targetDurSec = Number((totalFrames / timeline.fps).toFixed(4));

    const renderTimeline: Timeline = {
      ...timeline,
      totalFrames,
      totalDurationSec: Number((totalFrames / timeline.fps).toFixed(3)),
    };

    let extraThumbnailPath: string | undefined;

    if (!isDraftMode) {
      // PRIMARY FINAL RENDERER: Remotion (@remotion/bundler + @remotion/renderer renderStill & renderMedia)
      // Uses local Chromium/chrome-headless-shell and standard ffmpeg (no librsvg required).
      const browserExecutable = resolveRemotionBrowserExecutable() ?? undefined;
      options.onProgress?.(5, `Bundling Remotion composition (${targetAspect})`);
      const serveUrl = await getRemotionBundleUrl();

      const thumbInputProps = {
        aspect: targetAspect,
        timeline: renderTimeline,
        sfx: renderTimeline.audio?.sfx ?? true,
        sfxVolume: renderTimeline.audio?.sfxVolume ?? 0.35,
        showSafeZones: false,
        thumbnailMode: true,
      };

      const thumbComp = await selectComposition({
        serveUrl,
        id: 'BlobToonShort',
        inputProps: thumbInputProps,
        browserExecutable,
      });

      options.onProgress?.(15, `Rendering thumbnail PNG via Remotion (${targetAspect})`);
      const fullThumbPng = path.join(tempDir, 'remotion_thumb_full.png');
      await renderStill({
        composition: thumbComp,
        serveUrl,
        output: fullThumbPng,
        frame: 0,
        inputProps: thumbInputProps,
        browserExecutable,
      });

      if (preset.extraThumbnailSize) {
        extraThumbnailPath = path.join(outDir, 'thumbnail_1920x1080.png');
        fs.copyFileSync(fullThumbPng, extraThumbnailPath);
        await execFileAsync('ffmpeg', [
          '-y',
          '-i',
          fullThumbPng,
          '-vf',
          `scale=${preset.extraThumbnailSize.width}:${preset.extraThumbnailSize.height}`,
          '-frames:v',
          '1',
          thumbnailPath,
        ]);
      } else {
        fs.copyFileSync(fullThumbPng, thumbnailPath);
      }

      const videoInputProps = {
        aspect: targetAspect,
        timeline: renderTimeline,
        sfx: renderTimeline.audio?.sfx ?? true,
        sfxVolume: renderTimeline.audio?.sfxVolume ?? 0.35,
        showSafeZones: false,
        thumbnailMode: false,
      };

      const videoComp = await selectComposition({
        serveUrl,
        id: 'BlobToonShort',
        inputProps: videoInputProps,
        browserExecutable,
      });

      options.onProgress?.(
        30,
        `Rendering ${totalFrames} frames via Remotion renderMedia (${timeline.width}x${timeline.height}, ${targetAspect})`
      );
      const remotionRawMp4 = path.join(tempDir, 'remotion_video_raw.mp4');
      await renderMedia({
        composition: {
          ...videoComp,
          durationInFrames: totalFrames,
          width: timeline.width,
          height: timeline.height,
          fps: timeline.fps,
        },
        serveUrl,
        codec: 'h264',
        outputLocation: remotionRawMp4,
        inputProps: videoInputProps,
        browserExecutable,
      });

      options.onProgress?.(75, 'Building master voiceover + SFX audio track');
      const masterWavPath = await buildMasterTimelineAudioWav(
        timeline,
        tempDir,
        totalFrames,
        audioDir
      );

      options.onProgress?.(90, 'Muxing Remotion H.264 video with master audio via standard ffmpeg');
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        remotionRawMp4,
        '-i',
        masterWavPath,
        '-af',
        `apad,atrim=0:${targetDurSec}`,
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-shortest',
        '-movflags',
        '+faststart',
        videoPath,
      ]);
    } else {
      // OPTIONAL FAST DRAFT MODE (--draft / --quality draft): SVG frames + ffmpeg
      options.onProgress?.(5, `Generating draft thumbnail PNG (${targetAspect})`);
      const thumbSvgPath = path.join(tempDir, 'thumbnail.svg');
      fs.writeFileSync(thumbSvgPath, renderFrameSvgMarkup(timeline, 0, true, targetAspect), 'utf-8');

      const thumbW = preset.extraThumbnailSize ? preset.extraThumbnailSize.width : timeline.width;
      const thumbH = preset.extraThumbnailSize ? preset.extraThumbnailSize.height : timeline.height;

      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        thumbSvgPath,
        '-vf',
        `scale=${thumbW}:${thumbH}`,
        '-frames:v',
        '1',
        thumbnailPath,
      ]);

      if (preset.extraThumbnailSize) {
        extraThumbnailPath = path.join(outDir, 'thumbnail_1920x1080.png');
        await execFileAsync('ffmpeg', [
          '-y',
          '-i',
          thumbSvgPath,
          '-vf',
          `scale=${timeline.width}:${timeline.height}`,
          '-frames:v',
          '1',
          extraThumbnailPath,
        ]);
      }

      const stride = totalFrames > 150 ? 3 : 1;
      options.onProgress?.(
        15,
        `Rendering ${totalFrames} draft SVG frames (${timeline.width}x${timeline.height}, ${targetAspect})`
      );

      for (let f = 0; f < totalFrames; f += stride) {
        const svgMarkup = renderFrameSvgMarkup(timeline, f, false, targetAspect);
        const primaryFrameFile = path.join(tempDir, `frame_${String(f).padStart(5, '0')}.svg`);
        fs.writeFileSync(primaryFrameFile, svgMarkup, 'utf-8');

        for (let dup = 1; dup < stride && f + dup < totalFrames; dup++) {
          const dupFile = path.join(tempDir, `frame_${String(f + dup).padStart(5, '0')}.svg`);
          fs.linkSync(primaryFrameFile, dupFile);
        }
      }

      options.onProgress?.(55, 'Building master voiceover audio track');
      const masterWavPath = await buildMasterTimelineAudioWav(
        timeline,
        tempDir,
        totalFrames,
        audioDir
      );

      options.onProgress?.(
        70,
        `Encoding ${timeline.width}x${timeline.height} 30fps H.264 MP4 with ffmpeg`
      );
      await execFileAsync('ffmpeg', [
        '-y',
        '-framerate',
        String(timeline.fps),
        '-i',
        path.join(tempDir, 'frame_%05d.svg'),
        '-i',
        masterWavPath,
        '-vf',
        `scale=${timeline.width}:${timeline.height}:flags=lanczos,format=yuv420p`,
        '-af',
        `apad,atrim=0:${targetDurSec}`,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '21',
        '-r',
        String(timeline.fps),
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-shortest',
        '-movflags',
        '+faststart',
        videoPath,
      ]);
    }

    const actualDurationSec = await probeAudioDurationSec(videoPath);
    const meta = buildVideoMeta(
      {
        ...timeline,
        totalFrames,
        totalDurationSec: Number((totalFrames / timeline.fps).toFixed(2)),
      },
      options.voiceProviderName ?? 'mock'
    );

    fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2), 'utf-8');
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

    options.onProgress?.(100, `Render complete (${targetAspect})`);

    return {
      aspect: targetAspect,
      videoPath,
      thumbnailPath,
      extraThumbnailPath,
      metaPath,
      timelinePath,
      audioDir,
      durationSec: actualDurationSec,
      framesRendered: totalFrames,
      totalFrames,
      width: timeline.width,
      height: timeline.height,
      fps: timeline.fps,
      renderEngine: isDraftMode ? 'draft-svg' : 'remotion',
      meta,
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Renders the same timeline across all 4 aspect ratios (`--aspect all`) into:
 * `out_9x16.mp4`, `out_16x9.mp4`, `out_4x3.mp4`, `out_3x4.mp4`
 * plus per-ratio thumbnails (`thumbnail_9x16.png`, etc.).
 */
export async function renderTimelineAllAspects(
  timeline: Timeline,
  options: Omit<RenderOptions, 'aspect' | 'videoFilename' | 'thumbnailFilename'>
): Promise<RenderOutputResult[]> {
  const results: RenderOutputResult[] = [];
  for (const ratio of ALL_ASPECT_RATIOS) {
    const preset = getAspectPreset(ratio);
    const videoFilename = `out_${preset.fileSuffix}.mp4`;
    const thumbnailFilename =
      ratio === '16:9' ? 'thumbnail.png' : `thumbnail_${preset.fileSuffix}.png`;
    const res = await renderTimelineToVideo(timeline, {
      ...options,
      aspect: ratio,
      videoFilename,
      thumbnailFilename,
      metaFilename: `meta_${preset.fileSuffix}.json`,
      timelineFilename: `timeline_${preset.fileSuffix}.json`,
    });
    results.push(res);
  }
  // Also copy out_9x16.mp4 to video.mp4 and meta_9x16.json to meta.json for default consumers
  const first = results[0];
  if (first) {
    const defaultVideo = path.join(path.resolve(options.outDir), 'video.mp4');
    const defaultMeta = path.join(path.resolve(options.outDir), 'meta.json');
    const defaultTimeline = path.join(path.resolve(options.outDir), 'timeline.json');
    if (!fs.existsSync(defaultVideo)) fs.copyFileSync(first.videoPath, defaultVideo);
    if (!fs.existsSync(defaultMeta)) fs.copyFileSync(first.metaPath, defaultMeta);
    if (!fs.existsSync(defaultTimeline)) fs.copyFileSync(first.timelinePath, defaultTimeline);
  }
  return results;
}

/**
 * Extracts a PNG frame at a specific timestamp (in seconds) from a rendered MP4
 * so we can visually inspect actual video output frames.
 */
export async function extractVideoFramePng(
  mp4Path: string,
  timeSec: number,
  outPngPath: string
): Promise<string> {
  fs.mkdirSync(path.dirname(outPngPath), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss',
    String(Math.max(0, timeSec)),
    '-i',
    mp4Path,
    '-frames:v',
    '1',
    outPngPath,
  ]);
  return outPngPath;
}
