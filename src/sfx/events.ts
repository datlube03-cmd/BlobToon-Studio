import { SfxName } from '../script/schema';
import { Timeline, TimelineScene } from '../timeline/schema';

export interface SfxEvent {
  frame: number;
  type: SfxName;
  volume: number;
  variant: number;
  priority: number;
  durationFrames: number;
  pan?: number;
  sceneId?: string;
  source?: 'auto' | 'manual';
}

const SFX_DURATION_SEC_APPROX: Record<SfxName, number> = {
  pop: 0.09,
  boing: 0.33,
  thud: 0.16,
  whoosh: 0.38,
  tick: 0.05,
  rattle: 0.48,
  ding: 0.42,
  gasp: 0.3,
  sad: 0.72,
  buzz: 0.25,
  swish: 0.18,
};

const SFX_PRIORITY_MAP: Record<SfxName, number> = {
  whoosh: 9,
  gasp: 8,
  sad: 8,
  ding: 8,
  boing: 8,
  buzz: 7,
  pop: 7,
  thud: 6,
  swish: 6,
  rattle: 5,
  tick: 2,
};

function computeCharPan(x: number, width: number, enablePan = false): number | undefined {
  if (!enablePan) return undefined;
  const norm = x <= 1 ? x : x / Math.max(1, width);
  const pan = (norm - 0.5) * 0.8; // -0.4 .. +0.4
  return Number(Math.max(-0.4, Math.min(0.4, pan)).toFixed(2));
}

function collectSceneAutoEvents(
  scene: TimelineScene,
  sceneIdx: number,
  timeline: Timeline,
  fps: number,
  baseVolume: number,
  enablePan: boolean
): SfxEvent[] {
  const raw: SfxEvent[] = [];
  const start = scene.startFrame;
  const end = scene.endFrame;
  const effectiveTransition = timeline.renderParams?.transitionType ?? scene.transition;
  const sfxIntensity = timeline.renderParams?.sfxIntensity ?? 'medium';

  const pushEvent = (
    frame: number,
    type: SfxName,
    relVolume: number,
    variant: number,
    pan?: number,
    priorityBoost = 0
  ) => {
    const clampedFrame = Math.max(start, Math.min(end - 1, Math.round(frame)));
    const durationFrames = Math.max(2, Math.ceil(SFX_DURATION_SEC_APPROX[type] * fps));
    const vol = Number(Math.max(0.02, Math.min(0.85, baseVolume * relVolume)).toFixed(3));
    raw.push({
      frame: clampedFrame,
      type,
      volume: vol,
      variant: Math.abs(variant) % 4,
      priority: SFX_PRIORITY_MAP[type] + priorityBoost,
      durationFrames,
      ...(pan !== undefined ? { pan } : {}),
      sceneId: scene.id,
      source: 'auto',
    });
  };

  // 1. Scene transition -> whoosh (skip on scene 0 or hard-cut)
  if (sceneIdx > 0 && effectiveTransition !== 'hard-cut') {
    pushEvent(start, 'whoosh', 0.85, sceneIdx);
  }

  // 2. Character pop-in & initial character animations
  scene.characters.forEach((char, cIdx) => {
    const pan = computeCharPan(char.x, timeline.width, enablePan);
    const popFrame = start + 1 + cIdx * 3;
    pushEvent(popFrame, 'pop', 0.78, cIdx, pan);

    if (char.animation === 'slide-in') {
      pushEvent(start + 2 + cIdx * 2, 'whoosh', 0.72, cIdx + 1, pan);
    } else if (char.animation === 'bounce' || char.animation === 'jump') {
      const takeoffFrame = start + 6 + cIdx * 2;
      pushEvent(takeoffFrame, 'boing', 0.82, cIdx, pan);
      if (takeoffFrame + 9 < end) {
        pushEvent(takeoffFrame + 9, 'thud', 0.55, cIdx, pan);
      }
    } else if (char.animation === 'shake') {
      pushEvent(start + 5 + cIdx * 2, 'rattle', 0.7, cIdx, pan);
    } else if (char.animation === 'walk') {
      const stepStride = sfxIntensity === 'low' ? 16 : 11;
      const walkEnd = Math.min(end - 3, start + Math.round(fps * 1.4));
      for (let f = start + 5, step = 0; f < walkEnd; f += stepStride, step++) {
        pushEvent(f, 'tick', 0.36, step, pan);
      }
    }
  });

  // 3. Props enter -> swish
  scene.props.forEach((prop, pIdx) => {
    const pan = computeCharPan(prop.x, timeline.width, enablePan);
    pushEvent(start + 4 + pIdx * 4, 'swish', 0.68, pIdx, pan);
  });

  // Track each character's current emotion starting from their initial scene emotion.
  // Initial/scene-start emotions NEVER trigger an emotion sound; an emotion SFX is fired
  // ONLY when a character's emotion CHANGES to `shock` (-> gasp), `sad` (-> sad),
  // `angry` (-> buzz), or `laughing`/`excited` (-> ding). `happy` is the default emotion
  // and NEVER triggers a sound.
  const charEmotionState = new Map<string, TimelineScene['characters'][0]['emotion']>();
  scene.characters.forEach((char) => {
    charEmotionState.set(char.id, char.emotion ?? 'happy');
  });

  // 4. Narrative beats (speech bubbles, emotion reactions, beat animations)
  const sortedBeats = [...scene.beats].sort((a, b) => a.atProgress - b.atProgress);
  sortedBeats.forEach((beat, bIdx) => {
    const beatFrame = start + Math.round(beat.atProgress * scene.durationInFrames);
    const targetChar = scene.characters.find((c) => c.id === beat.targetId);
    const pan = targetChar
      ? computeCharPan(targetChar.x, timeline.width, enablePan)
      : undefined;

    // Speech bubble appears -> pop (variant offset +2 so pitch differs from character pop)
    if (beat.bubbleText) {
      pushEvent(beatFrame, 'pop', 0.8, bIdx + 2, pan, 1);
    }

    // Beat animation triggers
    if (beat.animation === 'bounce' || beat.animation === 'jump') {
      pushEvent(beatFrame + 1, 'boing', 0.85, bIdx + 1, pan);
      if (beatFrame + 10 < end) {
        pushEvent(beatFrame + 10, 'thud', 0.55, bIdx + 1, pan);
      }
    } else if (beat.animation === 'shake') {
      pushEvent(beatFrame + 1, 'rattle', 0.75, bIdx, pan);
    } else if (beat.animation === 'slide-in') {
      pushEvent(beatFrame, 'whoosh', 0.75, bIdx, pan);
    } else if (beat.animation === 'walk') {
      const walkEnd = Math.min(end - 2, beatFrame + Math.round(fps * 1.1));
      for (let f = beatFrame + 3, step = 0; f < walkEnd; f += 11, step++) {
        pushEvent(f, 'tick', 0.35, step, pan);
      }
    }

    // Emotion changes ONLY -> shock->gasp, sad->sad, angry->buzz, laughing/excited->ding
    // (`happy` never triggers a sound; unchanged emotion never triggers a sound)
    if (beat.emotion) {
      const prevEmotion = charEmotionState.get(beat.targetId) ?? targetChar?.emotion ?? 'happy';
      if (beat.emotion !== prevEmotion) {
        charEmotionState.set(beat.targetId, beat.emotion);
        const emoFrame = beatFrame + (beat.bubbleText ? 2 : 0);
        if (beat.emotion === 'shock') {
          pushEvent(emoFrame, 'gasp', 0.9, bIdx, pan, 2);
        } else if (beat.emotion === 'sad') {
          pushEvent(emoFrame, 'sad', 0.85, bIdx, pan, 2);
        } else if (beat.emotion === 'angry') {
          pushEvent(emoFrame, 'buzz', 0.82, bIdx, pan, 2);
        } else if (beat.emotion === 'laughing' || beat.emotion === 'excited') {
          pushEvent(emoFrame, 'ding', 0.85, bIdx, pan, 2);
        }
      }
    }

    if (beat.propType) {
      pushEvent(beatFrame + 3, 'swish', 0.7, bIdx + 1, pan);
    }
  });

  return raw;
}

/**
 * Pure function (Change F2): derives frame-accurate SFX events from the same timeline
 * and animation data that drives the visuals, enforcing:
 * - No two events of the same `type` on the exact same `frame`
 * - At most 3 overlapping SFX active on any frame (dropping lowest-priority ones)
 */
export function collectSfxEvents(
  timeline: Timeline,
  fps = timeline.fps,
  options: { enablePan?: boolean } = {}
): SfxEvent[] {
  const audioConfig = timeline.audio ?? { sfx: true, sfxVolume: 0.35 };
  if (audioConfig.sfx === false) {
    return [];
  }

  const sfxIntensity = timeline.renderParams?.sfxIntensity ?? 'medium';
  const intensityMultiplier =
    sfxIntensity === 'high' ? 1.22 : sfxIntensity === 'low' ? 0.68 : 1.0;
  const baseVolume = Math.max(
    0,
    Math.min(0.85, (audioConfig.sfxVolume ?? 0.35) * intensityMultiplier)
  );
  if (baseVolume <= 0.001) {
    return [];
  }

  const enablePan = options.enablePan ?? false;
  const candidates: SfxEvent[] = [];

  timeline.scenes.forEach((scene, sceneIdx) => {
    // `sfx: false` on a scene disables auto events there
    if (scene.sfx === false) {
      return;
    }

    const autoEvents = collectSceneAutoEvents(
      scene,
      sceneIdx,
      timeline,
      fps,
      baseVolume,
      enablePan
    );
    candidates.push(...autoEvents);

    // Manual scene `sfx: [{ type: "ding", atSec: 1.2, volume: 0.8 }]`
    if (Array.isArray(scene.sfx)) {
      scene.sfx.forEach((manual, mIdx) => {
        const frame = Math.max(
          scene.startFrame,
          Math.min(scene.endFrame - 1, scene.startFrame + Math.round(manual.atSec * fps))
        );
        const durationFrames = Math.max(
          2,
          Math.ceil(SFX_DURATION_SEC_APPROX[manual.type] * fps)
        );
        candidates.push({
          frame,
          type: manual.type,
          volume: Number(
            Math.max(0.02, Math.min(0.9, manual.volume ?? baseVolume)).toFixed(3)
          ),
          variant: mIdx % 4,
          priority: SFX_PRIORITY_MAP[manual.type] + 10, // Manual overrides always win priority
          durationFrames,
          ...(manual.pan !== undefined ? { pan: manual.pan } : {}),
          sceneId: scene.id,
          source: 'manual',
        });
      });
    }
  });

  // Rule 1: Deduplicate same-type events on the exact same frame (keep highest priority/volume)
  const byFrameAndType = new Map<string, SfxEvent>();
  for (const ev of candidates) {
    const key = `${ev.frame}::${ev.type}`;
    const existing = byFrameAndType.get(key);
    if (
      !existing ||
      ev.priority > existing.priority ||
      (ev.priority === existing.priority && ev.volume > existing.volume)
    ) {
      byFrameAndType.set(key, ev);
    }
  }

  const deduplicated = Array.from(byFrameAndType.values()).sort((a, b) => {
    if (a.frame !== b.frame) return a.frame - b.frame;
    return b.priority - a.priority;
  });

  // Rule 2: Cap simultaneous overlapping SFX at <= 3 on any frame (drop lowest-priority ones)
  const accepted: SfxEvent[] = [];
  for (const candidate of deduplicated) {
    const candidateEnd = candidate.frame + candidate.durationFrames;
    let canFit = true;
    const toRemoveIndices = new Set<number>();

    for (let f = candidate.frame; f < candidateEnd; f++) {
      const overlappingIndices: number[] = [];
      for (let i = 0; i < accepted.length; i++) {
        if (toRemoveIndices.has(i)) continue;
        const a = accepted[i];
        if (a.frame <= f && a.frame + a.durationFrames > f) {
          overlappingIndices.push(i);
        }
      }

      if (overlappingIndices.length >= 3) {
        // Find lowest-priority overlapping event
        let lowestIdx = overlappingIndices[0];
        for (const idx of overlappingIndices) {
          if (accepted[idx].priority < accepted[lowestIdx].priority) {
            lowestIdx = idx;
          }
        }
        if (candidate.priority > accepted[lowestIdx].priority) {
          toRemoveIndices.add(lowestIdx);
        } else {
          canFit = false;
          break;
        }
      }
    }

    if (canFit) {
      if (toRemoveIndices.size > 0) {
        const sortedRemove = Array.from(toRemoveIndices).sort((a, b) => b - a);
        for (const rIdx of sortedRemove) {
          accepted.splice(rIdx, 1);
        }
      }
      accepted.push(candidate);
    }
  }

  return accepted.sort((a, b) => a.frame - b.frame || b.priority - a.priority);
}

/**
 * Computes the maximum number of simultaneous overlapping SFX across all frames.
 */
export function computeMaxSimultaneousSfx(events: SfxEvent[]): number {
  if (events.length === 0) return 0;
  let maxEnd = 0;
  for (const e of events) {
    const end = e.frame + e.durationFrames;
    if (end > maxEnd) maxEnd = end;
  }
  let maxSim = 0;
  for (let f = 0; f <= maxEnd; f++) {
    let count = 0;
    for (const e of events) {
      if (e.frame <= f && e.frame + e.durationFrames > f) {
        count++;
      }
    }
    if (count > maxSim) maxSim = count;
  }
  return maxSim;
}
