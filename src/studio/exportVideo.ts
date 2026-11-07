import { renderMixedAudioBuffer } from './audioEngine';
import { AudioProjectState, dbToGain, DEFAULT_AUDIO_PROJECT, resolveAllScheduledClips } from './audioTypes';
import { ensureFredokaFontLoaded } from './captions';
import { CharacterDrawFn } from './characterCode';
import { drawFrame } from './drawFrame';
import { AppliedSkillInstance } from './editSkills';
import { getLayoutForAspect, StudioTimeline } from './schema';
import { base64ToArrayBuffer } from './storage';
import { exportThumbnailImage } from './thumbnail';

export interface ExportAudioOptions {
  audioProject?: AudioProjectState;
  customCharFns?: Map<string, CharacterDrawFn>;
  appliedSkills?: AppliedSkillInstance[];
  bypassSkills?: boolean;
  showBubbles?: boolean;
}

export function pickSupportedMimeType(): { mimeType: string; ext: 'mp4' | 'webm' } {
  const mp4Candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
  ];
  for (const m of mp4Candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
      return { mimeType: m, ext: 'mp4' };
    }
  }
  const webmCandidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const m of webmCandidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
      return { mimeType: m, ext: 'webm' };
    }
  }
  return { mimeType: '', ext: 'webm' };
}

export async function exportTimelineVideo(
  canvas: HTMLCanvasElement,
  timeline: StudioTimeline,
  onProgress: (percent: number) => void,
  audioOptions: ExportAudioOptions = {}
): Promise<void> {
  await ensureFredokaFontLoaded();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không thể khởi tạo Canvas 2D');

  const layout = getLayoutForAspect(timeline.aspect ?? '9:16');
  canvas.width = layout.width;
  canvas.height = layout.height;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  const dest = audioCtx.createMediaStreamDestination();
  const baseNow = audioCtx.currentTime + 0.05;

  // Keep a silent carrier so silent videos still have a valid audio track
  const osc = audioCtx.createOscillator();
  const silentGain = audioCtx.createGain();
  silentGain.gain.value = 0.00001;
  osc.connect(silentGain).connect(dest);
  osc.start();

  const audioProject = audioOptions.audioProject ?? DEFAULT_AUDIO_PROJECT;
  let mixedSource: AudioBufferSourceNode | null = null;

  try {
    const mixedBuffer = await renderMixedAudioBuffer(timeline, audioProject);
    if (mixedBuffer) {
      mixedSource = audioCtx.createBufferSource();
      mixedSource.buffer = mixedBuffer;
      mixedSource.connect(dest);
      mixedSource.connect(audioCtx.destination);
      mixedSource.start(baseNow);
    }
  } catch {
    // Fallback to real-time Web Audio graph if OfflineAudioContext fails
    const clips = resolveAllScheduledClips(timeline, audioProject);
    const masterGain = Math.max(0, Math.min(2, audioProject.mixer.masterVolume));
    for (const clip of clips) {
      try {
        const buf = await audioCtx.decodeAudioData(base64ToArrayBuffer(clip.audioBase64).slice(0));
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.loop = Boolean(clip.loop);
        const g = audioCtx.createGain();
        g.gain.value = Math.min(0.9, dbToGain(clip.gainDb) * masterGain);
        src.connect(g);
        g.connect(dest);
        g.connect(audioCtx.destination);
        const s = baseNow + clip.startSec;
        const offset = Math.max(0, Math.min(Math.max(0, buf.duration - 0.05), clip.offsetSec));
        if (clip.loop) {
          src.start(s, offset);
          src.stop(s + clip.durationSec);
        } else {
          src.start(s, offset, Math.min(clip.durationSec, Math.max(0.05, buf.duration - offset)));
        }
      } catch { /* ignore invalid clip */ }
    }
  }

  const canvasStream = canvas.captureStream(30);
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const { mimeType, ext } = pickSupportedMimeType();
  const recorder = mimeType
    ? new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 4_500_000 })
    : new MediaRecorder(combined);

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const totalSec = timeline.totalDurationSec;
  const startWall = performance.now();

  await new Promise<void>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Lỗi MediaRecorder khi quay video'));
    recorder.onstop = () => resolve();
    recorder.start(200);

    const step = () => {
      const elapsedSec = (performance.now() - startWall) / 1000;
      const frameOpts = {
        customCharFns: audioOptions.customCharFns,
        appliedSkills: audioOptions.appliedSkills,
        bypassSkills: audioOptions.bypassSkills,
        showBubbles: Boolean(audioOptions.showBubbles),
      };
      if (elapsedSec >= totalSec) {
        drawFrame(ctx, totalSec - 0.01, timeline, layout, frameOpts);
        onProgress(100);
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      drawFrame(ctx, elapsedSec, timeline, layout, frameOpts);
      onProgress(Math.min(99, Math.round((elapsedSec / totalSec) * 100)));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  if (mixedSource) {
    try { mixedSource.stop(); } catch { /* ignore */ }
  }
  osc.stop();
  void audioCtx.close().catch(() => {});

  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${timeline.script.title.slice(0, 32).replace(/\s+/g, '_')}_${layout.aspect.replace(':', 'x')}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export async function downloadHookThumbnailPng(
  timeline: StudioTimeline,
  customCharFns?: Map<string, CharacterDrawFn>
): Promise<void> {
  const aspect = timeline.aspect ?? '9:16';
  await exportThumbnailImage(timeline.script, {
    aspect,
    customCharFns,
    format: 'png',
    fileLabel: aspect.replace(':', 'x'),
  });
}
