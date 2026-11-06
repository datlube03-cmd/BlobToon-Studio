import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AspectRatio, getAspectPreset } from '../aspect';
import { SFX_NAMES, SfxName } from '../script/schema';
import { PALETTE_VARIATIONS } from '../script/variations';
import { computeWordTimings } from '../timeline/builder';
import { Timeline, TimelineScene, TimelineSchema } from '../timeline/schema';

const execFileAsync = promisify(execFile);

export interface ProbedMediaAudioMetrics {
  hasAudioStream: boolean;
  audioCodec: string;
  videoDurationSec: number;
  audioDurationSec: number;
  durationDiffMs: number;
  rms: number;
  peak: number;
}

/**
 * Probes an MP4 file using ffprobe + ffmpeg to verify:
 * - AAC audio stream exists
 * - Audio and video stream durations match within 50ms
 * - Audio RMS and peak levels (to verify non-silent SFX vs muted `--sfx off`)
 */
export async function probeMediaAudioMetrics(mp4Path: string): Promise<ProbedMediaAudioMetrics> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,codec_name,duration',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    mp4Path,
  ]);

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; codec_name?: string; duration?: string }>;
    format?: { duration?: string };
  };

  const formatDur = Number(parsed.format?.duration ?? 0);
  const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
  const audioStream = parsed.streams?.find((s) => s.codec_type === 'audio');

  const videoDurationSec = Number(videoStream?.duration ?? formatDur);
  const audioDurationSec = Number(audioStream?.duration ?? formatDur);
  const durationDiffMs = Math.round(Math.abs(videoDurationSec - audioDurationSec) * 1000);

  // Extract raw 16-bit PCM to compute exact RMS and peak
  const tempWav = path.join(os.tmpdir(), `probe_rms_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  let rms = 0;
  let peak = 0;

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      mp4Path,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '24000',
      '-c:a',
      'pcm_s16le',
      tempWav,
    ]);
    const buf = fs.readFileSync(tempWav);
    let offset = 44;
    const dataIdx = buf.indexOf('data');
    if (dataIdx !== -1 && dataIdx + 8 <= buf.length) {
      offset = dataIdx + 8;
    }
    const sampleCount = Math.floor((buf.length - offset) / 2);
    if (sampleCount > 0) {
      let sumSq = 0;
      for (let i = 0; i < sampleCount; i++) {
        const s = buf.readInt16LE(offset + i * 2) / 32768;
        const abs = Math.abs(s);
        if (abs > peak) peak = abs;
        sumSq += s * s;
      }
      rms = Math.sqrt(sumSq / sampleCount);
    }
  } finally {
    try {
      if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
    } catch {
      // ignore
    }
  }

  return {
    hasAudioStream: Boolean(audioStream),
    audioCodec: audioStream?.codec_name ?? 'none',
    videoDurationSec: Number(videoDurationSec.toFixed(3)),
    audioDurationSec: Number(audioDurationSec.toFixed(3)),
    durationDiffMs,
    rms: Number(rms.toFixed(5)),
    peak: Number(peak.toFixed(4)),
  };
}

/**
 * Builds the 11-scene SFX gallery timeline for `npm run sfx:demo` (Change F5),
 * where each of the 11 procedural sounds (`pop`, `boing`, `thud`, `whoosh`, `tick`,
 * `rattle`, `ding`, `gasp`, `sad`, `buzz`, `swish`) plays next to its visual trigger
 * with the sound name shown as the on-screen scene label and caption.
 */
export function buildSfxDemoTimeline(aspect: AspectRatio = '9:16'): Timeline {
  const preset = getAspectPreset(aspect);
  const fps = 30;
  const variation = PALETTE_VARIATIONS[0];
  const sceneDurationSec = 1.0;
  const durationInFrames = Math.round(sceneDurationSec * fps); // 30 frames per sound (11s total)

  const demoSpecs: Array<{
    name: SfxName;
    caption: string;
    emotion: TimelineScene['characters'][0]['emotion'];
    animation: TimelineScene['characters'][0]['animation'];
    bubbleText: string;
    propType?: TimelineScene['props'][0]['type'];
  }> = [
    {
      name: 'pop',
      caption: 'SFX: POP — Character & bubble appear!',
      emotion: 'happy',
      animation: 'scale-pop',
      bubbleText: 'POP!',
    },
    {
      name: 'boing',
      caption: 'SFX: BOING — Bounce & jump takeoff!',
      emotion: 'laughing',
      animation: 'bounce',
      bubbleText: 'BOING!',
    },
    {
      name: 'thud',
      caption: 'SFX: THUD — Heavy landing & door slam!',
      emotion: 'shock',
      animation: 'jump',
      bubbleText: 'THUD!',
      propType: 'door',
    },
    {
      name: 'whoosh',
      caption: 'SFX: WHOOSH — Fast slide-in transition!',
      emotion: 'smug',
      animation: 'slide-in',
      bubbleText: 'WHOOSH!',
    },
    {
      name: 'tick',
      caption: 'SFX: TICK — Walking footsteps cycle!',
      emotion: 'happy',
      animation: 'walk',
      bubbleText: 'TICK TICK!',
    },
    {
      name: 'rattle',
      caption: 'SFX: RATTLE — Rapid shake vibration!',
      emotion: 'shock',
      animation: 'shake',
      bubbleText: 'RATTLE!',
    },
    {
      name: 'ding',
      caption: 'SFX: DING — Bright two-note idea bell!',
      emotion: 'laughing',
      animation: 'bounce',
      bubbleText: 'IDEA DING!',
      propType: 'trophy',
    },
    {
      name: 'gasp',
      caption: 'SFX: GASP — Sudden shock reaction!',
      emotion: 'shock',
      animation: 'squash-and-stretch',
      bubbleText: 'GASP?!',
    },
    {
      name: 'sad',
      caption: 'SFX: SAD — Descending wah-wah-wah!',
      emotion: 'sad',
      animation: 'idle',
      bubbleText: 'WAH WAH...',
    },
    {
      name: 'buzz',
      caption: 'SFX: BUZZ — Wrong answer / angry buzzer!',
      emotion: 'angry',
      animation: 'shake',
      bubbleText: 'BUZZER!',
    },
    {
      name: 'swish',
      caption: 'SFX: SWISH — Prop enters the stage!',
      emotion: 'smug',
      animation: 'idle',
      bubbleText: 'SWISH!',
      propType: 'controller',
    },
  ];

  let currentFrame = 0;
  const scenes: TimelineScene[] = demoSpecs.map((spec, idx) => {
    const startFrame = currentFrame;
    const endFrame = startFrame + durationInFrames;
    currentFrame = endFrame;
    const voiceDurationSec = 0.75;

    return {
      id: `sfx_demo_${spec.name}`,
      label: `SFX: ${spec.name.toUpperCase()}`,
      narration: spec.caption,
      caption: spec.caption,
      background: idx % 2 === 0 ? 'arcade' : 'room',
      transition: spec.name === 'whoosh' ? 'slide' : 'hard-cut',
      voiceDurationSec,
      paddingSec: 0.25,
      durationSec: sceneDurationSec,
      startFrame,
      durationInFrames,
      endFrame,
      words: computeWordTimings(spec.caption, voiceDurationSec, fps),
      characters: [
        {
          id: 'demo_blob',
          name: spec.name.toUpperCase(),
          type: 'blob',
          color: variation.characterPalette[idx % variation.characterPalette.length],
          accessory: idx % 2 === 0 ? 'headphones' : 'crown',
          hoodieColor: variation.wallAccent,
          size: 1.05,
          x: 0.5,
          y: 0.62,
          emotion: 'happy',
          animation: spec.animation,
          speaking: true,
          flipX: false,
        },
      ],
      props: spec.propType
        ? [
            {
              id: `prop_${spec.name}`,
              type: spec.propType,
              x: 0.72,
              y: 0.44,
              scale: 1.0,
              rotation: 0,
              animation: 'bounce',
              label: spec.name.toUpperCase(),
            },
          ]
        : [],
      beats: [
        {
          atProgress: 0.1,
          targetId: 'demo_blob',
          emotion: spec.emotion,
          animation: spec.animation,
          bubbleText: spec.bubbleText,
        },
      ],
      // Pin manual SFX trigger at 0.08s so each scene highlights its exact featured sound
      sfx: [{ type: spec.name, atSec: 0.08, volume: 0.75 }],
    };
  });

  return TimelineSchema.parse({
    version: '1.0',
    aspect,
    seed: 202611,
    audio: {
      sfx: true,
      sfxVolume: 0.65,
    },
    topic: `SFX Demo Gallery (${SFX_NAMES.join(', ')})`,
    title: 'BlobToon Procedural SFX Gallery Demo',
    hook: 'All 11 procedural cartoon sound effects synthesized in pure TypeScript!',
    description: 'Demonstration gallery of all 11 procedural sound effects in BlobToon.',
    hashtags: ['#BlobToon', '#SFX', '#ProceduralAudio'],
    fps,
    width: preset.width,
    height: preset.height,
    totalDurationSec: Number((currentFrame / fps).toFixed(2)),
    totalFrames: currentFrame,
    variation,
    scenes,
  });
}
