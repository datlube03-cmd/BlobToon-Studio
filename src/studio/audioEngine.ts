import { AudioKind, AudioLibraryItem, AudioProjectState, dbToGain, makeUniqueAudioName, resolveAllScheduledClips } from './audioTypes';
import { StudioScript, StudioTimeline } from './schema';
import { base64ToArrayBuffer, readFileAsBase64 } from './storage';

function getAudioContextClass(): typeof AudioContext {
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

export function extractWaveformAndPeak(buffer: AudioBuffer, barCount = 28): { peaks: number[]; peakAmplitude: number; clipping: boolean } {
  const ch0 = buffer.getChannelData(0), ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  let globalPeak = 0;
  for (let i = 0; i < ch0.length; i++) {
    const v = Math.max(Math.abs(ch0[i]), ch1 ? Math.abs(ch1[i]) : 0);
    if (v > globalPeak) globalPeak = v;
  }
  const blockSize = Math.max(1, Math.floor(ch0.length / barCount));
  const peaks: number[] = [];
  for (let b = 0; b < barCount; b++) {
    const start = b * blockSize, end = Math.min(ch0.length, start + blockSize);
    let max = 0;
    for (let i = start; i < end; i++) { const v = Math.abs(ch0[i]); if (v > max) max = v; }
    peaks.push(Math.max(12, Math.min(100, Math.round((max / Math.max(0.05, globalPeak)) * 100))));
  }
  return { peaks, peakAmplitude: Number(globalPeak.toFixed(3)), clipping: globalPeak >= 0.99 };
}

export async function analyzeAndImportAudioFile(file: File, kind: AudioKind, existingNames: string[]): Promise<AudioLibraryItem> {
  const { base64, mimeType } = await readFileAsBase64(file);
  const Ctx = getAudioContextClass();
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(base64ToArrayBuffer(base64).slice(0));
    const { peaks, peakAmplitude, clipping } = extractWaveformAndPeak(decoded);
    return {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: makeUniqueAudioName(file.name, existingNames), kind, audioBase64: base64,
      mimeType: mimeType || 'audio/wav', durationSec: Number(Math.max(0.15, decoded.duration).toFixed(2)),
      peaks, peakAmplitude, clipping,
    };
  } finally {
    void ctx.close().catch(() => {});
  }
}

export function matchVoicesByFilename(
  voiceItems: AudioLibraryItem[], script: StudioScript
): Record<string, { durationSec: number; audioBase64: string; mimeType: string }> {
  const lineKeys: string[] = [];
  script.scenes.forEach((sc, sIdx) => sc.lines.forEach((_, lIdx) => lineKeys.push(`${sIdx}:${lIdx}`)));
  const sorted = [...voiceItems].sort((a, b) => {
    const na = Number(a.name.match(/\d+/)?.[0] ?? 9999), nb = Number(b.name.match(/\d+/)?.[0] ?? 9999);
    return na !== nb ? na - nb : a.name.localeCompare(b.name);
  });
  const result: Record<string, { durationSec: number; audioBase64: string; mimeType: string }> = {};
  sorted.forEach((item, idx) => {
    const pairMatch = item.name.match(/(\d+)[_-](\d+)/);
    if (pairMatch) {
      const key = `${Number(pairMatch[1]) - 1}:${Number(pairMatch[2]) - 1}`;
      if (lineKeys.includes(key)) { result[key] = { durationSec: item.durationSec, audioBase64: item.audioBase64, mimeType: item.mimeType }; return; }
    }
    const singleNum = item.name.match(/\d+/);
    const targetIdx = singleNum ? Math.max(0, Number(singleNum[0]) - 1) : idx;
    const key = lineKeys[targetIdx] ?? lineKeys[idx];
    if (key && !result[key]) result[key] = { durationSec: item.durationSec, audioBase64: item.audioBase64, mimeType: item.mimeType };
  });
  return result;
}

function encodeAudioSliceToWavBase64(channelData: Float32Array, sampleRate: number): string {
  const numSamples = channelData.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + numSamples * 2, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, numSamples * 2, true);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function splitLongVoiceBySilence(
  item: AudioLibraryItem, script: StudioScript
): Promise<Record<string, { durationSec: number; audioBase64: string; mimeType: string }>> {
  const lineKeys: string[] = [];
  script.scenes.forEach((sc, sIdx) => sc.lines.forEach((_, lIdx) => lineKeys.push(`${sIdx}:${lIdx}`)));
  if (lineKeys.length === 0) return {};

  const Ctx = getAudioContextClass();
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(base64ToArrayBuffer(item.audioBase64).slice(0));
    const data = decoded.getChannelData(0), sr = decoded.sampleRate, winSamples = Math.max(1, Math.floor(sr * 0.04));
    const segments: Array<{ start: number; end: number }> = [];
    let inSpeech = false, segStart = 0, silenceCount = 0;

    for (let i = 0; i < data.length; i += winSamples) {
      let sum = 0;
      const end = Math.min(data.length, i + winSamples);
      for (let j = i; j < end; j++) sum += Math.abs(data[j]);
      if (sum / Math.max(1, end - i) > 0.018) {
        if (!inSpeech) { inSpeech = true; segStart = Math.max(0, i - winSamples); }
        silenceCount = 0;
      } else if (inSpeech && ++silenceCount >= 7) {
        if (i - segStart > sr * 0.35) segments.push({ start: segStart, end: Math.min(data.length, i) });
        inSpeech = false; silenceCount = 0;
      }
    }
    if (inSpeech && data.length - segStart > sr * 0.3) segments.push({ start: segStart, end: data.length });

    const finalRanges = segments.length >= lineKeys.length
      ? segments.slice(0, lineKeys.length)
      : lineKeys.map((_, idx) => ({ start: Math.floor((idx / lineKeys.length) * data.length), end: Math.floor(((idx + 1) / lineKeys.length) * data.length) }));

    const out: Record<string, { durationSec: number; audioBase64: string; mimeType: string }> = {};
    finalRanges.forEach((rg, idx) => {
      const slice = data.subarray(rg.start, rg.end);
      out[lineKeys[idx]] = { durationSec: Number(Math.max(0.6, slice.length / sr).toFixed(2)), audioBase64: encodeAudioSliceToWavBase64(slice, sr), mimeType: 'audio/wav' };
    });
    return out;
  } finally {
    void ctx.close().catch(() => {});
  }
}

export async function renderMixedAudioBuffer(timeline: StudioTimeline, audioProject: AudioProjectState): Promise<AudioBuffer | null> {
  const clips = resolveAllScheduledClips(timeline, audioProject);
  const sampleRate = 44100;
  const totalFrames = Math.max(sampleRate, Math.ceil(timeline.totalDurationSec * sampleRate));
  const offline = new OfflineAudioContext(2, totalFrames, sampleRate);
  const voiceWindows = clips.filter((c) => c.kind === 'voice').map((c) => ({ startSec: c.startSec, endSec: c.startSec + c.durationSec }));

  const decodedCache = new Map<string, AudioBuffer>();
  for (const clip of clips) {
    if (decodedCache.has(clip.audioId)) continue;
    try { decodedCache.set(clip.audioId, await offline.decodeAudioData(base64ToArrayBuffer(clip.audioBase64).slice(0))); } catch { /* ignore */ }
  }

  const masterGain = Math.max(0, Math.min(2, audioProject.mixer.masterVolume));
  for (const clip of clips) {
    const buf = decodedCache.get(clip.audioId);
    if (!buf) continue;
    const src = offline.createBufferSource();
    src.buffer = buf; src.loop = Boolean(clip.loop);

    const gainNode = offline.createGain();
    const baseGain = dbToGain(clip.gainDb) * masterGain;
    const s = Math.max(0, clip.startSec), dur = Math.max(0.05, Math.min(clip.durationSec, timeline.totalDurationSec - s)), e = s + dur;

    if (clip.fadeInSec > 0.01) {
      gainNode.gain.setValueAtTime(0.0001, s);
      gainNode.gain.linearRampToValueAtTime(baseGain, Math.min(e, s + clip.fadeInSec));
    } else gainNode.gain.setValueAtTime(baseGain, s);

    if (clip.kind === 'music' && clip.duckingDb > 0 && voiceWindows.length > 0) {
      const duckGain = baseGain * dbToGain(-clip.duckingDb);
      for (const vw of voiceWindows) {
        if (vw.endSec <= s || vw.startSec >= e) continue;
        const ds = Math.max(s, vw.startSec), de = Math.min(e, vw.endSec);
        gainNode.gain.setValueAtTime(baseGain, Math.max(s, ds - 0.06));
        gainNode.gain.linearRampToValueAtTime(duckGain, Math.min(e, ds + 0.05));
        gainNode.gain.setValueAtTime(duckGain, Math.max(ds + 0.05, de - 0.05));
        gainNode.gain.linearRampToValueAtTime(baseGain, Math.min(e, de + 0.1));
      }
    }

    if (clip.fadeOutSec > 0.01) {
      gainNode.gain.setValueAtTime(baseGain, Math.max(s, e - clip.fadeOutSec));
      gainNode.gain.linearRampToValueAtTime(0.0001, e);
    }

    src.connect(gainNode).connect(offline.destination);
    const offset = Math.max(0, Math.min(Math.max(0, buf.duration - 0.05), clip.offsetSec));
    if (clip.loop) { src.start(s, offset); src.stop(e); }
    else src.start(s, offset, Math.min(dur, Math.max(0.05, buf.duration - offset)));
  }

  const rendered = await offline.startRendering();
  let peak = 0;
  for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
    const data = rendered.getChannelData(ch);
    for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
  }
  if (peak > 0.9) {
    const scale = 0.9 / peak;
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const data = rendered.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
    }
  }
  return rendered;
}
