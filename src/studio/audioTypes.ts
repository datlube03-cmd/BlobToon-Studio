import { StudioTimeline } from './schema';

export type AudioKind = 'voice' | 'sfx' | 'music';

export interface AudioLibraryItem {
  id: string; name: string; kind: AudioKind; audioBase64: string; mimeType: string;
  durationSec: number; peaks: number[]; peakAmplitude: number; clipping: boolean;
}

export interface AudioPlacement {
  id: string; audioId: string; kind: AudioKind; startSec: number; durationSec: number;
  offsetSec: number; gainDb: number; fadeInSec: number; fadeOutSec: number; muted: boolean; loop: boolean;
}

export type AudioEventType = 'scene_start' | 'scene_end' | 'char_appear' | 'line_start' | 'emotion_change';

export interface AudioEventBinding {
  id: string; event: AudioEventType; filter: string; audioId: string; gainDb: number;
}

export interface MusicTrackConfig {
  audioId: string | null; startSceneIdx: number; endSceneIdx: number;
  loop: boolean; gainDb: number; fadeInSec: number; fadeOutSec: number; duckingDb: number;
}

export interface AudioMixerConfig {
  masterVolume: number; mute: Record<AudioKind, boolean>; solo: Record<AudioKind, boolean>;
}

export interface AudioProjectState {
  library: AudioLibraryItem[]; placements: AudioPlacement[]; eventBindings: AudioEventBinding[];
  musicConfig: MusicTrackConfig; mixer: AudioMixerConfig;
}

export const DEFAULT_AUDIO_PROJECT: AudioProjectState = {
  library: [], placements: [], eventBindings: [],
  musicConfig: { audioId: null, startSceneIdx: 0, endSceneIdx: 99, loop: true, gainDb: -6, fadeInSec: 0.3, fadeOutSec: 0.5, duckingDb: 0 },
  mixer: { masterVolume: 1, mute: { voice: false, sfx: false, music: false }, solo: { voice: false, sfx: false, music: false } },
};

export interface ScheduledAudioClip {
  id: string; audioId: string; kind: AudioKind; name: string; audioBase64: string; mimeType: string;
  startSec: number; durationSec: number; offsetSec: number; gainDb: number;
  fadeInSec: number; fadeOutSec: number; loop: boolean; duckingDb: number;
  source: 'line' | 'placement' | 'event' | 'music';
}

export function dbToGain(db: number): number {
  return Math.pow(10, Math.max(-48, Math.min(18, db)) / 20);
}

export function makeUniqueAudioName(rawName: string, existingNames: string[]): string {
  const clean = rawName.trim() || 'audio.wav';
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!taken.has(clean.toLowerCase())) return clean;
  const dotIdx = clean.lastIndexOf('.');
  const base = dotIdx > 0 ? clean.slice(0, dotIdx) : clean;
  const ext = dotIdx > 0 ? clean.slice(dotIdx) : '';
  let idx = 2;
  while (taken.has(`${base} (${idx})${ext}`.toLowerCase())) idx++;
  return `${base} (${idx})${ext}`;
}

export function snapTimeSec(sec: number, timeline: StudioTimeline, thresholdSec = 0.16): number {
  const clamped = Math.max(0, Math.min(timeline.totalDurationSec, sec));
  const snapPoints: number[] = [0, timeline.totalDurationSec];
  for (const sc of timeline.scenes) {
    snapPoints.push(sc.startSec, sc.endSec);
    for (const ln of sc.lineTimings) snapPoints.push(ln.startSec);
  }
  let best = clamped, minDiff = thresholdSec;
  for (const pt of snapPoints) {
    const d = Math.abs(clamped - pt);
    if (d <= minDiff) { minDiff = d; best = pt; }
  }
  return Number(best.toFixed(2));
}

export function isKindAudible(kind: AudioKind, mixer: AudioMixerConfig): boolean {
  const anySolo = mixer.solo.voice || mixer.solo.sfx || mixer.solo.music;
  if (anySolo) return Boolean(mixer.solo[kind]) && !mixer.mute[kind];
  return !mixer.mute[kind];
}

export function resolveAllScheduledClips(timeline: StudioTimeline, audioProject: AudioProjectState): ScheduledAudioClip[] {
  const libMap = new Map(audioProject.library.map((it) => [it.id, it]));
  const clips: ScheduledAudioClip[] = [];

  if (isKindAudible('voice', audioProject.mixer)) {
    for (const sc of timeline.scenes) {
      if (sc.sceneAudioBase64) {
        clips.push({
          id: `scene-voice-${sc.index}`, audioId: `scene-${sc.index}`, kind: 'voice', name: `${sc.label} (Voice)`,
          audioBase64: sc.sceneAudioBase64, mimeType: sc.sceneAudioMime || 'audio/wav',
          startSec: sc.startSec, durationSec: sc.durationSec, offsetSec: 0, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, loop: false, duckingDb: 0, source: 'line',
        });
        continue;
      }
      for (const ln of sc.lineTimings) {
        if (!ln.audioBase64) continue;
        clips.push({
          id: `line-voice-${ln.audioKey}`, audioId: `line-${ln.audioKey}`, kind: 'voice', name: `${ln.speaker}: ${ln.text.slice(0, 18)}`,
          audioBase64: ln.audioBase64, mimeType: ln.mimeType || 'audio/wav',
          startSec: ln.startSec, durationSec: ln.durationSec, offsetSec: 0, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, loop: false, duckingDb: 0, source: 'line',
        });
      }
    }
  }

  for (const pl of audioProject.placements) {
    if (pl.muted || !isKindAudible(pl.kind, audioProject.mixer)) continue;
    const item = libMap.get(pl.audioId);
    if (!item) continue;
    clips.push({
      id: pl.id, audioId: item.id, kind: pl.kind, name: item.name, audioBase64: item.audioBase64, mimeType: item.mimeType,
      startSec: pl.startSec, durationSec: pl.durationSec, offsetSec: pl.offsetSec, gainDb: pl.gainDb,
      fadeInSec: pl.fadeInSec, fadeOutSec: pl.fadeOutSec, loop: pl.kind === 'music' ? pl.loop : false,
      duckingDb: pl.kind === 'music' ? audioProject.musicConfig.duckingDb : 0, source: 'placement',
    });
  }

  if (isKindAudible('sfx', audioProject.mixer)) {
    for (const b of audioProject.eventBindings) {
      const item = libMap.get(b.audioId);
      if (!item) continue;
      const flt = b.filter.trim().toLowerCase();
      const triggerTimes: number[] = [];

      timeline.scenes.forEach((sc, sIdx) => {
        const matchScene = !flt || sc.label.toLowerCase() === flt || String(sIdx + 1) === flt;
        if (b.event === 'scene_start' && matchScene) triggerTimes.push(sc.startSec);
        if (b.event === 'scene_end' && matchScene) triggerTimes.push(Math.max(sc.startSec, sc.endSec - Math.min(0.6, item.durationSec)));
        if (b.event === 'char_appear') {
          for (const ch of sc.characters) if (!flt || ch.id.toLowerCase() === flt) triggerTimes.push(sc.startSec);
        }
        if (b.event === 'line_start') {
          for (const ln of sc.lineTimings) if (!flt || ln.speaker.toLowerCase() === flt || sc.label.toLowerCase() === flt) triggerTimes.push(ln.startSec);
        }
        if (b.event === 'emotion_change') {
          let prevEm = sc.characters[0]?.emotion || '';
          for (const ln of sc.lineTimings) {
            if ((!flt || ln.emotion.toLowerCase() === flt) && ln.emotion !== prevEm) triggerTimes.push(ln.startSec);
            prevEm = ln.emotion;
          }
        }
      });

      triggerTimes.forEach((tSec, idx) => {
        clips.push({
          id: `ev-${b.id}-${idx}`, audioId: item.id, kind: 'sfx', name: `${item.name} (${b.event})`,
          audioBase64: item.audioBase64, mimeType: item.mimeType,
          startSec: Number(tSec.toFixed(2)), durationSec: item.durationSec, offsetSec: 0, gainDb: b.gainDb,
          fadeInSec: 0, fadeOutSec: 0, loop: false, duckingDb: 0, source: 'event',
        });
      });
    }
  }

  const mc = audioProject.musicConfig;
  if (mc.audioId && isKindAudible('music', audioProject.mixer)) {
    const item = libMap.get(mc.audioId);
    if (item && timeline.scenes.length > 0) {
      const s0 = timeline.scenes[Math.max(0, Math.min(timeline.scenes.length - 1, mc.startSceneIdx))];
      const s1 = timeline.scenes[Math.max(0, Math.min(timeline.scenes.length - 1, mc.endSceneIdx))];
      const startSec = Math.min(s0.startSec, s1.startSec), endSec = Math.max(s0.endSec, s1.endSec);
      clips.push({
        id: 'music-track-config', audioId: item.id, kind: 'music', name: item.name,
        audioBase64: item.audioBase64, mimeType: item.mimeType,
        startSec, durationSec: Math.max(0.2, endSec - startSec), offsetSec: 0,
        gainDb: mc.gainDb, fadeInSec: mc.fadeInSec, fadeOutSec: mc.fadeOutSec, loop: mc.loop, duckingDb: mc.duckingDb, source: 'music',
      });
    }
  }

  return clips;
}
