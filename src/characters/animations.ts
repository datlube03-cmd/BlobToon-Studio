import { interpolate, spring } from 'remotion';
import { AnimationType } from '../script/schema';

export interface TransformState {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

/**
 * Pure function of (frame, fps, animation) using Remotion's spring & interpolate.
 */
export function computeAnimationTransform(
  frame: number,
  fps: number,
  animation: AnimationType,
  seedOffset = 0
): TransformState {
  const f = Math.max(0, frame + seedOffset);
  const t = f / fps;

  switch (animation) {
    case 'idle': {
      const breath = Math.sin(t * Math.PI * 2.2);
      return {
        translateX: 0,
        translateY: breath * 5,
        scaleX: 1 - breath * 0.025,
        scaleY: 1 + breath * 0.025,
        rotation: Math.sin(t * Math.PI * 1.1) * 1.5,
      };
    }

    case 'bounce': {
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
    }

    case 'walk': {
      const step = Math.sin(t * Math.PI * 5);
      const bob = Math.abs(Math.cos(t * Math.PI * 5));
      return {
        translateX: step * 28,
        translateY: -bob * 18,
        scaleX: 1 + bob * 0.03,
        scaleY: 1 - bob * 0.03,
        rotation: step * 6,
      };
    }

    case 'jump': {
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
    }

    case 'shake': {
      const jitterX = Math.sin(f * 1.9) * 14 + Math.cos(f * 3.1) * 6;
      const jitterY = Math.abs(Math.sin(f * 2.4)) * -8;
      return {
        translateX: jitterX,
        translateY: jitterY,
        scaleX: 1.03,
        scaleY: 0.97,
        rotation: Math.sin(f * 1.8) * 7,
      };
    }

    case 'spin': {
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
    }

    case 'slide-in': {
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
    }

    case 'squash-and-stretch': {
      const wave = Math.sin(t * Math.PI * 4.5);
      return {
        translateX: 0,
        translateY: wave < 0 ? wave * -14 : -wave * 18,
        scaleX: 1 - wave * 0.18,
        scaleY: 1 + wave * 0.18,
        rotation: 0,
      };
    }

    case 'scale-pop': {
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
    }
  }
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
