import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  ALL_ASPECT_RATIOS,
  AspectRatio,
  getAspectPreset,
} from '../aspect';
import { Timeline, VideoMeta } from '../timeline/schema';
import { applyAspectToTimeline, buildVideoMeta } from '../timeline/builder';
import { SceneStage } from '../scenes/SceneStage';
import { MockProvider, probeAudioDurationSec } from '../voice/provider';

const execFileAsync = promisify(execFile);

export interface RenderOptions {
  outDir: string;
  aspect?: AspectRatio;
  videoFilename?: string;
  thumbnailFilename?: string;
  metaFilename?: string;
  timelineFilename?: string;
  maxDurationSec?: number;
  voiceProviderName?: string;
  copyAudioToSubdir?: boolean;
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
  width: number;
  height: number;
  fps: number;
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
 * `scene.durationSec` (voice + padding) and produces a single master WAV file.
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
  const masterBuffer = Buffer.alloc(44 + masterDataSize);

  // Write WAV header for master track
  masterBuffer.write('RIFF', 0);
  masterBuffer.writeUInt32LE(36 + masterDataSize, 4);
  masterBuffer.write('WAVE', 8);
  masterBuffer.write('fmt ', 12);
  masterBuffer.writeUInt32LE(16, 16);
  masterBuffer.writeUInt16LE(1, 20);
  masterBuffer.writeUInt16LE(1, 22);
  masterBuffer.writeUInt32LE(sampleRate, 24);
  masterBuffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  masterBuffer.writeUInt16LE(bytesPerSample, 32);
  masterBuffer.writeUInt16LE(16, 34);
  masterBuffer.write('data', 36);
  masterBuffer.writeUInt32LE(masterDataSize, 40);

  const mock = new MockProvider();
  if (audioExportDir) {
    fs.mkdirSync(audioExportDir, { recursive: true });
  }

  for (let idx = 0; idx < timeline.scenes.length; idx++) {
    const scene = timeline.scenes[idx];
    if (scene.startFrame >= maxFrames) break;

    let audioPath = scene.audioFile;
    if (!audioPath || !fs.existsSync(audioPath)) {
      const synth = await mock.synthesize(scene.narration);
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
      const startSample = Math.round((scene.startFrame / timeline.fps) * sampleRate);
      const targetByteOffset = 44 + startSample * bytesPerSample;
      const availableSpace = masterBuffer.length - targetByteOffset;
      if (availableSpace > 0) {
        pcmBytes.copy(
          masterBuffer,
          targetByteOffset,
          0,
          Math.min(pcmBytes.length, availableSpace)
        );
      }
    } catch {
      // Leave silent span if individual scene audio conversion fails
    }
  }

  const masterWavPath = path.join(tempDir, 'master_audio.wav');
  fs.writeFileSync(masterWavPath, masterBuffer);
  return masterWavPath;
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
 * - MP4 video at the chosen aspect ratio (9:16, 16:9, 4:3, or 3:4) with muxed voiceover audio
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
  const timeline = applyAspectToTimeline(inputTimeline, targetAspect);

  const outDir = path.resolve(options.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const videoPath = path.join(outDir, options.videoFilename ?? 'video.mp4');
  const thumbnailPath = path.join(outDir, options.thumbnailFilename ?? 'thumbnail.png');
  const metaPath = path.join(outDir, options.metaFilename ?? 'meta.json');
  const timelinePath = path.join(outDir, options.timelineFilename ?? 'timeline.json');
  const audioDir =
    options.copyAudioToSubdir !== false ? path.join(outDir, 'audio') : undefined;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-render-'));

  try {
    options.onProgress?.(5, `Generating thumbnail PNG (${targetAspect})`);
    const thumbSvgPath = path.join(tempDir, 'thumbnail.svg');
    fs.writeFileSync(thumbSvgPath, renderFrameSvgMarkup(timeline, 0, true, targetAspect), 'utf-8');

    // For 16:9, export a 1280x720 thumbnail.png (plus full 1920x1080 thumbnail_16x9.png if custom)
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

    let extraThumbnailPath: string | undefined;
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

    const totalFrames = options.maxDurationSec
      ? Math.min(timeline.totalFrames, Math.max(1, Math.round(options.maxDurationSec * timeline.fps)))
      : timeline.totalFrames;

    const stride = totalFrames > 150 ? 3 : 1;

    options.onProgress?.(
      15,
      `Rendering ${totalFrames} SVG frames (${timeline.width}x${timeline.height}, ${targetAspect})`
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
      width: timeline.width,
      height: timeline.height,
      fps: timeline.fps,
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
