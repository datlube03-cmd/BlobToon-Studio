import { interpolate, spring } from 'remotion';
import { AnimationType } from '../script/schema';

export interface TransformState {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export type AnimationHandler = (
  frame: number,
  fps: number,
  seedOffset?: number
) => TransformState;

export interface CustomAnimDefinition {
  id: string;
  name?: string;
  compute: AnimationHandler;
}

const ANIM_REGISTRY = new Map<string, CustomAnimDefinition>();

/**
 * Registers a reusable procedural animation by id.
 * Can be used by custom characters or in scripts.
 */
export function defineAnim(def: CustomAnimDefinition): CustomAnimDefinition {
  ANIM_REGISTRY.set(def.id, def);
  return def;
}

export function getRegisteredAnimations(): CustomAnimDefinition[] {
  return Array.from(ANIM_REGISTRY.values());
}

// Register all built-in animations via defineAnim
defineAnim({
  id: 'idle',
  name: 'Idle Breathing',
  compute: (frame, fps, seedOffset = 0) => {
    const f = Math.max(0, frame + seedOffset);
    const t = f / fps;
    const breath = Math.sin(t * Math.PI * 2.2);
    return {
      translateX: 0,
      translateY: breath * 5,
      scaleX: 1 - breath * 0.025,
      scaleY: 1 + breath * 0.025,
      rotation: Math.sin(t * Math.PI * 1.1) * 1.5,
    };
  },
});

defineAnim({
  id: 'bounce',
  name: 'Arcade Bounce',
  compute: (frame, _fps, seedOffset = 0) => {
    const f = Math.max(0, frame + seedOffset);
    const cycle = (f % 20) / 20;
    const arc = Math.abs(Math.sin(cycle * Math.PI));
    const contactSquash = cycle < 0.15 ? interpolate(cycle, [0, 0.15], [0.14, 0]) : 0;
    return {
      translateX: 0,
      translateY: -arc * 42,
      scaleX: 1 + contactSquash - arc * 0.05,
      scaleY: 1 - contactSquash + arc * 0.06,
      rotation: 0,
    };
  },
});

defineAnim({
  id: 'walk',
  name: 'Walk Cycle',
  compute: (frame, fps, seedOffset = 0) => {
    const f = Math.max(0, frame + seedOffset);
    const t = f / fps;
    const step = Math.sin(t * Math.PI * 5);
    const bob = Math.abs(Math.cos(t * Math.PI * 5));
    return {
      translateX: step * 28,
      translateY: -bob * 18,
      scaleX: 1 + bob * 0.03,
      scaleY: 1 - bob * 0.03,
      rotation: step * 6,
    };
  },
});

defineAnim({
  id: 'jump',
  name: 'Big Jump',
  compute: (frame, _fps, seedOffset = 0) => {
    const f = Math.max(0, frame + seedOffset);
    const cycle = (f % 30) / 30;
    const jumpHeight = Math.sin(cycle * Math.PI);
    const isLaunch = cycle < 0.18;
    const isPeak = cycle >= 0.18 && cycle <= 0.82;
    return {
      translateX: 0,
      translateY: -jumpHeight * 95,
      scaleX: isLaunch ? 1.16 : isPeak ? 0.9 : 1.12,
      scaleY: isLaunch ? 0.84 : isPeak ? 1.12 : 0.88,
      rotation: Math.sin(cycle * Math.PI * 2) * 4,
    };
  },
});

defineAnim({
  id: 'shake',
  name: 'Panic Shake',
  compute: (frame, _fps, seedOffset = 0) => {
    const f = Math.max(0, frame + seedOffset);
    const jitterX = Math.sin(f * 1.9) * 14 + Math.cos(f * 3.1) * 6;
    const jitterY = Math.abs(Math.sin(f * 2.4)) * -8;
    return {
      translateX: jitterX,
      translateY: jitterY,
      scaleX: 1.03,
      scaleY: 0.97,
      rotation: Math.sin(f * 1.8) * 7,
    };
  },
});

defineAnim({
  id: 'spin',
  name: '360 Spin',
  compute: (frame, fps, seedOffset = 0) => {
    const f = Math.max(0, frame + seedOffset);
    const spinProgress = spring({
      frame: f % 45,
      fps,
      config: { damping: 14, stiffness: 120, mass: 0.8 },
    });
    const angle = interpolate(spinProgress, [0, 1], [0, 360]);
    return {
      translateX: 0,
      translateY: -Math.sin(spinProgress * Math.PI) * 30,
      scaleX: 1,
      scaleY: 1,
      rotation: angle,
    };
  },
});

defineAnim({
  id: 'slide-in',
  name: 'Slide In',
  compute: (frame, fps, seedOffset = 0) => {
    const f = Math.max(0, frame + seedOffset);
    const t = f / fps;
    const slideSpring = spring({
      frame,
      fps,
      config: { damping: 12, stiffness: 110, mass: 0.7 },
    });
    const tx = interpolate(slideSpring, [0, 1], [220, 0]);
    const skewScale = interpolate(slideSpring, [0, 0.7, 1], [0.85, 1.06, 1]);
    return {
      translateX: tx,
      translateY: Math.sin(t * Math.PI * 2.5) * 4,
      scaleX: skewScale,
      scaleY: 2 - skewScale,
      rotation: interpolate(slideSpring, [0, 1], [14, 0]),
    };
  },
});

defineAnim({
  id: 'squash-and-stretch',
  name: 'Squash & Stretch',
  compute: (frame, fps, seedOffset = 0) => {
    const f = Math.max(0, frame + seedOffset);
    const t = f / fps;
    const wave = Math.sin(t * Math.PI * 4.5);
    return {
      translateX: 0,
      translateY: wave < 0 ? wave * -14 : -wave * 18,
      scaleX: 1 - wave * 0.18,
      scaleY: 1 + wave * 0.18,
      rotation: 0,
    };
  },
});

defineAnim({
  id: 'scale-pop',
  name: 'Scale Pop',
  compute: (frame, fps, seedOffset = 0) => {
    const f = Math.max(0, frame + seedOffset);
    const t = f / fps;
    const pop = spring({
      frame,
      fps,
      config: { damping: 9, stiffness: 160, mass: 0.6 },
    });
    const idleWave = Math.sin(t * Math.PI * 3) * 0.03;
    return {
      translateX: 0,
      translateY: interpolate(pop, [0, 1], [40, 0]),
      scaleX: pop + idleWave,
      scaleY: pop - idleWave,
      rotation: 0,
    };
  },
});

/**
 * Pure function of (frame, fps, animation) using Remotion's spring & interpolate
 * or custom animations registered via `defineAnim`.
 */
export function computeAnimationTransform(
  frame: number,
  fps: number,
  animation: AnimationType | string,
  seedOffset = 0
): TransformState {
  const registered = ANIM_REGISTRY.get(animation) ?? ANIM_REGISTRY.get('idle')!;
  return registered.compute(frame, fps, seedOffset);
}

/**
 * Computes mouth openness (0..1) while character is narrating during active voice span.
 */
export function computeMouthOpenness(
  frame: number,
  fps: number,
  isSpeaking: boolean,
  isVoiceActive: boolean
): number {
  if (!isSpeaking || !isVoiceActive) {
    return 0;
  }
  const t = frame / fps;
  // Multi-harmonic syllable envelope so mouth movement looks organic like real speech
  const syllable = Math.sin(t * Math.PI * 6.8) * 0.55 + Math.sin(t * Math.PI * 11.3) * 0.45;
  const pauseGate = Math.sin(t * Math.PI * 1.7) > -0.65 ? 1 : 0.15;
  return Math.max(0, Math.min(1, Math.abs(syllable) * pauseGate));
}
