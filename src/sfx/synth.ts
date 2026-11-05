import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const SFX_NAMES = [
  'pop',
  'boing',
  'thud',
  'whoosh',
  'tick',
  'rattle',
  'ding',
  'gasp',
  'sad',
  'buzz',
  'swish',
] as const;

export const SfxNameSchema = z.enum(SFX_NAMES);
export type SfxName = z.infer<typeof SfxNameSchema>;

export const SFX_SAMPLE_RATE = 44100;
export const SFX_MAX_PEAK = 0.78; // strictly <= 0.8

export interface SfxDefinition {
  name: SfxName;
  description: string;
  usedFor: string;
  minDurationSec: number;
  maxDurationSec: number;
  priority: number; // Higher priority wins when capping simultaneous SFX
  renderSamples: (variant: number, sampleRate: number) => Float32Array;
}

export interface SynthesizedSfxResult {
  name: SfxName;
  variant: number;
  filePath: string;
  durationSec: number;
  peak: number;
  sampleRate: number;
  sha256: string;
  cached: boolean;
}

/**
 * Deterministic 32-bit PRNG (Mulberry32) so same (name, variant) always yields byte-identical WAV output.
 */
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type OscillatorWave = 'sine' | 'triangle' | 'square' | 'saw';

function oscSample(phase: number, wave: OscillatorWave): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'triangle':
      return 1 - 4 * Math.abs(Math.round(p - 0.25) - (p - 0.25));
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'saw':
      return 2 * p - 1;
  }
}

/**
 * ADSR envelope evaluation for time `t` in [0, durationSec].
 */
function adsr(
  t: number,
  durationSec: number,
  attackSec: number,
  decaySec: number,
  sustainLevel: number,
  releaseSec: number
): number {
  if (t < 0 || t > durationSec) return 0;
  if (t < attackSec) {
    return attackSec > 0 ? t / attackSec : 1;
  }
  const releaseStart = Math.max(attackSec, durationSec - releaseSec);
  if (t < attackSec + decaySec && t < releaseStart) {
    const decayProgress = decaySec > 0 ? (t - attackSec) / decaySec : 1;
    return 1 - (1 - sustainLevel) * decayProgress;
  }
  if (t < releaseStart) {
    return sustainLevel;
  }
  const relProgress = releaseSec > 0 ? (t - releaseStart) / releaseSec : 1;
  return Math.max(0, sustainLevel * (1 - relProgress));
}

/**
 * Simple 1-pole low-pass and high-pass filter helpers.
 */
function applyLowPass(samples: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  const out = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * Math.max(20, cutoffHz));
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < samples.length; i++) {
    prev = prev + alpha * (samples[i] - prev);
    out[i] = prev;
  }
  return out;
}

function applyHighPass(samples: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  const out = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * Math.max(20, cutoffHz));
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  let prevOut = 0;
  let prevIn = 0;
  for (let i = 0; i < samples.length; i++) {
    prevOut = alpha * (prevOut + samples[i] - prevIn);
    prevIn = samples[i];
    out[i] = prevOut;
  }
  return out;
}

/**
 * Normalizes a Float32Array buffer so its maximum absolute peak equals `targetPeak` (<= 0.8)
 * and guarantees no NaN or Infinity values exist.
 */
export function normalizeSamples(
  samples: Float32Array,
  targetPeak = SFX_MAX_PEAK
): { normalized: Float32Array; peak: number } {
  const clampedTarget = Math.min(0.8, Math.max(0.05, targetPeak));
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Number.isFinite(samples[i]) ? samples[i] : 0;
    samples[i] = v;
    const abs = Math.abs(v);
    if (abs > maxAbs) maxAbs = abs;
  }

  const out = new Float32Array(samples.length);
  if (maxAbs <= 1e-6) {
    return { normalized: out, peak: 0 };
  }

  const gain = clampedTarget / maxAbs;
  let finalPeak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-0.8, Math.min(0.8, samples[i] * gain));
    out[i] = v;
    const abs = Math.abs(v);
    if (abs > finalPeak) finalPeak = abs;
  }

  return { normalized: out, peak: Number(finalPeak.toFixed(4)) };
}

/**
 * Encodes normalized Float32Array samples into a 16-bit mono PCM WAV Buffer.
 */
export function encodeMonoWavBuffer(
  samples: Float32Array,
  sampleRate = SFX_SAMPLE_RATE
): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0));
    const pcm16 = Math.round(clamped * 32767);
    buffer.writeInt16LE(pcm16, 44 + i * 2);
  }

  return buffer;
}

/**
 * Registry of all 11 procedural cartoon sound effects (Change F1).
 */
export const SFX_REGISTRY: Record<SfxName, SfxDefinition> = {
  pop: {
    name: 'pop',
    usedFor: 'character appears, speech bubble appears',
    description: 'Short sine burst with fast pitch drop (60-120 ms)',
    minDurationSec: 0.06,
    maxDurationSec: 0.12,
    priority: 7,
    renderSamples: (variant, sr) => {
      const v = Math.abs(variant) % 4;
      const dur = 0.08 + v * 0.01; // 80ms - 110ms
      const len = Math.round(dur * sr);
      const buf = new Float32Array(len);
      const startFreq = 720 + v * 65;
      const endFreq = 220 + v * 20;
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / dur;
        const freq = startFreq * Math.pow(endFreq / startFreq, p);
        phase += freq / sr;
        const env = adsr(t, dur, 0.004, 0.03, 0.4, dur * 0.5);
        buf[i] = oscSample(phase, 'sine') * env;
      }
      return buf;
    },
  },

  boing: {
    name: 'boing',
    usedFor: 'bounce / jump takeoff',
    description: 'Sine with wobbling pitch glide up then down (250-400 ms)',
    minDurationSec: 0.25,
    maxDurationSec: 0.4,
    priority: 8,
    renderSamples: (variant, sr) => {
      const v = Math.abs(variant) % 4;
      const dur = 0.3 + v * 0.025; // 300ms - 375ms
      const len = Math.round(dur * sr);
      const buf = new Float32Array(len);
      const baseStart = 180 + v * 15;
      const basePeak = 520 + v * 30;
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / dur;
        const arch = p < 0.35 ? p / 0.35 : 1 - ((p - 0.35) / 0.65) * 0.6;
        const wobble = Math.sin(2 * Math.PI * (14 + v) * t) * 45 * (1 - p * 0.5);
        const freq = baseStart + (basePeak - baseStart) * arch + wobble;
        phase += freq / sr;
        const env = adsr(t, dur, 0.01, 0.08, 0.65, 0.16);
        buf[i] = (oscSample(phase, 'sine') * 0.78 + oscSample(phase * 2, 'triangle') * 0.22) * env;
      }
      return buf;
    },
  },

  thud: {
    name: 'thud',
    usedFor: 'landing, door slam',
    description: 'Low sine/noise burst with quick decay (120-220 ms)',
    minDurationSec: 0.12,
    maxDurationSec: 0.22,
    priority: 6,
    renderSamples: (variant, sr) => {
      const v = Math.abs(variant) % 4;
      const dur = 0.15 + v * 0.015; // 150ms - 195ms
      const len = Math.round(dur * sr);
      const rng = createSeededRng(1001 + v * 73);
      const raw = new Float32Array(len);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / dur;
        const freq = (135 + v * 8) * Math.exp(-p * 2.2) + 42;
        phase += freq / sr;
        const env = Math.exp(-p * 5.2);
        const noise = (rng() * 2 - 1) * Math.exp(-p * 9.0);
        raw[i] = (oscSample(phase, 'sine') * 0.8 + noise * 0.35) * env;
      }
      return applyLowPass(raw, 360, sr);
    },
  },

  whoosh: {
    name: 'whoosh',
    usedFor: 'scene transition, slide-in, fast walk',
    description: 'Band-passed noise with rising then falling filter sweep (300-500 ms)',
    minDurationSec: 0.3,
    maxDurationSec: 0.5,
    priority: 9,
    renderSamples: (variant, sr) => {
      const v = Math.abs(variant) % 4;
      const dur = 0.35 + v * 0.035; // 350ms - 455ms
      const len = Math.round(dur * sr);
      const rng = createSeededRng(2002 + v * 97);
      const buf = new Float32Array(len);
      let lpState = 0;
      let hpState = 0;
      let prevIn = 0;
      let tonePhase = 0;

      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / dur;
        const sweep = Math.sin(Math.PI * p);
        const cutoff = 280 + sweep * (1450 + v * 120);
        const rc = 1 / (2 * Math.PI * cutoff);
        const dt = 1 / sr;
        const alphaLp = dt / (rc + dt);
        const alphaHp = rc / (rc + dt);

        const white = rng() * 2 - 1;
        lpState = lpState + alphaLp * (white - lpState);
        hpState = alphaHp * (hpState + lpState - prevIn);
        prevIn = lpState;

        tonePhase += (190 + sweep * 240) / sr;
        const env = Math.sin(Math.PI * p) * adsr(t, dur, 0.04, 0.08, 0.8, 0.1);
        buf[i] = (hpState * 0.75 + oscSample(tonePhase, 'sine') * 0.25) * env;
      }
      return buf;
    },
  },

  tick: {
    name: 'tick',
    usedFor: 'footsteps while walking',
    description: 'Very short high-passed noise click, soft (30-70 ms)',
    minDurationSec: 0.03,
    maxDurationSec: 0.07,
    priority: 2,
    renderSamples: (variant, sr) => {
      const v = Math.abs(variant) % 4;
      const dur = 0.042 + v * 0.005; // 42ms - 57ms
      const len = Math.round(dur * sr);
      const rng = createSeededRng(3003 + v * 53);
      const raw = new Float32Array(len);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / dur;
        phase += (900 + v * 70) / sr;
        const env = Math.exp(-p * 9.5);
        raw[i] = ((rng() * 2 - 1) * 0.7 + oscSample(phase, 'triangle') * 0.3) * env;
      }
      return applyHighPass(raw, 1100, sr);
    },
  },

  rattle: {
    name: 'rattle',
    usedFor: 'shake animation',
    description: 'Rapid short noise/triangle pulses (400-600 ms)',
    minDurationSec: 0.4,
    maxDurationSec: 0.6,
    priority: 5,
    renderSamples: (variant, sr) => {
      const v = Math.abs(variant) % 4;
      const dur = 0.44 + v * 0.035; // 440ms - 545ms
      const len = Math.round(dur * sr);
      const rng = createSeededRng(4004 + v * 41);
      const buf = new Float32Array(len);
      let phase = 0;
      const pulseHz = 18 + v * 2;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const pulse = Math.pow(Math.max(0, Math.sin(2 * Math.PI * pulseHz * t)), 2);
        const freq = 340 + (i % 5) * 35;
        phase += freq / sr;
        const env = adsr(t, dur, 0.02, 0.06, 0.75, 0.09);
        const sig = oscSample(phase, 'triangle') * 0.65 + (rng() * 2 - 1) * 0.35;
        buf[i] = sig * pulse * env;
      }
      return buf;
    },
  },

  ding: {
    name: 'ding',
    usedFor: 'idea / success / happy emphasis',
    description: 'Two-note sine bell with decay (300-550 ms)',
    minDurationSec: 0.3,
    maxDurationSec: 0.55,
    priority: 8,
    renderSamples: (variant, sr) => {
      const v = Math.abs(variant) % 4;
      const dur = 0.38 + v * 0.03; // 380ms - 470ms
      const len = Math.round(dur * sr);
      const buf = new Float32Array(len);
      const note1 = 659.25 + v * 20; // E5
      const note2 = note1 * 1.25; // G#5 / major third bell
      let p1 = 0;
      let p2 = 0;
      const switchSec = dur * 0.28;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const freq = t < switchSec ? note1 : note2;
        p1 += freq / sr;
        p2 += (freq * 2.0) / sr;
        const localT = t < switchSec ? t : t - switchSec;
        const decay = Math.exp(-localT * 6.5);
        const env = adsr(t, dur, 0.005, 0.05, 0.7, 0.14);
        buf[i] = (oscSample(p1, 'sine') * 0.78 + oscSample(p2, 'sine') * 0.22) * decay * env;
      }
      return buf;
    },
  },

  gasp: {
    name: 'gasp',
    usedFor: 'shock emotion',
    description: 'Short rising filtered-noise swell + high blip (220-380 ms)',
    minDurationSec: 0.22,
    maxDurationSec: 0.38,
    priority: 8,
    renderSamples: (variant, sr) => {
      const v = Math.abs(variant) % 4;
      const dur = 0.27 + v * 0.025; // 270ms - 345ms
      const len = Math.round(dur * sr);
      const rng = createSeededRng(5005 + v * 67);
      const raw = new Float32Array(len);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / dur;
        const freq = 320 + Math.pow(p, 1.4) * (620 + v * 40);
        phase += freq / sr;
        const swell = Math.sin(Math.PI * Math.pow(p, 0.75));
        const noise = (rng() * 2 - 1) * 0.55;
        const blip = oscSample(phase, 'sine') * (p > 0.45 ? 0.65 : 0.35);
        raw[i] = (noise + blip) * swell;
      }
      return applyLowPass(raw, 1800, sr);
    },
  },

  sad: {
    name: 'sad',
    usedFor: 'sad emotion / bad news',
    description: '3-note descending triangle wobble ("wah wah wah", 600-900 ms)',
    minDurationSec: 0.6,
    maxDurationSec: 0.9,
    priority: 8,
    renderSamples: (variant, sr) => {
      const v = Math.abs(variant) % 4;
      const dur = 0.68 + v * 0.04; // 680ms - 800ms
      const len = Math.round(dur * sr);
      const buf = new Float32Array(len);
      const notes = [392.0, 369.99, 329.63].map((n) => n - v * 8); // G4 -> F#4 -> E4
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / dur;
        const seg = Math.min(2, Math.floor(p * 3));
        const segP = p * 3 - seg;
        const vibrato = Math.sin(2 * Math.PI * 6.5 * t) * 7;
        const bend = seg === 2 ? -segP * 28 : -segP * 8;
        const freq = notes[seg] + vibrato + bend;
        phase += freq / sr;
        const noteEnv = Math.sin(Math.PI * Math.min(1, segP * 1.05));
        buf[i] =
          (oscSample(phase, 'triangle') * 0.75 + oscSample(phase * 0.5, 'sine') * 0.25) * noteEnv;
      }
      return buf;
    },
  },

  buzz: {
    name: 'buzz',
    usedFor: 'wrong / error / angry',
    description: 'Low square wave burst with slight detune (200-300 ms)',
    minDurationSec: 0.2,
    maxDurationSec: 0.3,
    priority: 7,
    renderSamples: (variant, sr) => {
      const v = Math.abs(variant) % 4;
      const dur = 0.23 + v * 0.015; // 230ms - 275ms
      const len = Math.round(dur * sr);
      const raw = new Float32Array(len);
      const f1 = 118 + v * 6;
      const f2 = f1 * 1.035; // slight detune
      let p1 = 0;
      let p2 = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        p1 += f1 / sr;
        p2 += f2 / sr;
        const env = adsr(t, dur, 0.01, 0.04, 0.75, 0.06);
        raw[i] = (oscSample(p1, 'square') * 0.5 + oscSample(p2, 'saw') * 0.5) * env;
      }
      return applyLowPass(raw, 950, sr);
    },
  },

  swish: {
    name: 'swish',
    usedFor: 'prop appears (phone, controller...)',
    description: 'Short high noise sweep (140-240 ms)',
    minDurationSec: 0.14,
    maxDurationSec: 0.24,
    priority: 6,
    renderSamples: (variant, sr) => {
      const v = Math.abs(variant) % 4;
      const dur = 0.17 + v * 0.015; // 170ms - 215ms
      const len = Math.round(dur * sr);
      const rng = createSeededRng(6006 + v * 83);
      const raw = new Float32Array(len);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const p = t / dur;
        const freq = 520 + p * (980 + v * 60);
        phase += freq / sr;
        const env = Math.sin(Math.PI * p);
        raw[i] = ((rng() * 2 - 1) * 0.65 + oscSample(phase, 'sine') * 0.35) * env;
      }
      return applyHighPass(raw, 700, sr);
    },
  },
};

/**
 * Synthesizes (or loads from `cache/sfx/<name>_<variant>.wav`) a named procedural SFX.
 */
export function synthesizeSfx(
  name: SfxName,
  variant = 0,
  cacheDir = path.resolve(process.cwd(), 'cache', 'sfx')
): SynthesizedSfxResult {
  const def = SFX_REGISTRY[name];
  if (!def) {
    throw new Error(`Unknown SFX name "${name}". Valid SFX: ${SFX_NAMES.join(', ')}`);
  }

  const normVariant = Math.abs(Math.round(variant)) % 4;
  fs.mkdirSync(cacheDir, { recursive: true });
  const filePath = path.join(cacheDir, `${name}_${normVariant}.wav`);

  const rawSamples = def.renderSamples(normVariant, SFX_SAMPLE_RATE);
  const { normalized, peak } = normalizeSamples(rawSamples, SFX_MAX_PEAK);
  const durationSec = Number((normalized.length / SFX_SAMPLE_RATE).toFixed(4));

  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 44) {
    const existing = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(existing).digest('hex');
    return {
      name,
      variant: normVariant,
      filePath,
      durationSec,
      peak,
      sampleRate: SFX_SAMPLE_RATE,
      sha256,
      cached: true,
    };
  }

  const wavBuf = encodeMonoWavBuffer(normalized, SFX_SAMPLE_RATE);
  fs.writeFileSync(filePath, wavBuf);
  const sha256 = crypto.createHash('sha256').update(wavBuf).digest('hex');

  return {
    name,
    variant: normVariant,
    filePath,
    durationSec,
    peak,
    sampleRate: SFX_SAMPLE_RATE,
    sha256,
    cached: false,
  };
}

/**
 * Synthesizes a subtle procedural background music (BGM) loop WAV when `bgmGenre` is specified
 * in Skill Render Params and no external `--music` file path was passed.
 */
export function synthesizeProceduralBgm(
  bgmGenre: string,
  durationSec: number,
  cacheDir = path.resolve(process.cwd(), 'cache', 'sfx')
): string {
  const safeGenre = bgmGenre.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const clampedDur = Math.max(1, Math.min(90, Number(durationSec.toFixed(2))));
  fs.mkdirSync(cacheDir, { recursive: true });
  const filePath = path.join(cacheDir, `bgm_${safeGenre}_${Math.round(clampedDur * 10)}ds.wav`);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 44) {
    return filePath;
  }

  const sr = 24000;
  const totalSamples = Math.max(1, Math.round(clampedDur * sr));
  const raw = new Float32Array(totalSamples);

  const isDark = safeGenre.includes('dark') || safeGenre.includes('synth') || safeGenre.includes('neon');
  const isFast = safeGenre.includes('fast') || safeGenre.includes('arcade') || safeGenre.includes('hyper');
  const scaleNotes = isDark
    ? [110.0, 130.81, 146.83, 164.81] // A2 minor synthwave bassline
    : isFast
    ? [220.0, 261.63, 329.63, 392.0] // Upbeat arcade arpeggio
    : [196.0, 246.94, 293.66, 349.23]; // Warm lofi chords

  const stepHz = isFast ? 4.0 : 2.0;
  let phase = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sr;
    const stepIdx = Math.floor(t * stepHz) % scaleNotes.length;
    const freq = scaleNotes[stepIdx];
    phase += freq / sr;
    const stepPos = (t * stepHz) % 1;
    const env = Math.exp(-stepPos * 3.2);
    raw[i] = oscSample(phase, isDark ? 'triangle' : 'sine') * env * 0.25;
  }

  const { normalized } = normalizeSamples(raw, 0.35);
  const wavBuf = encodeMonoWavBuffer(normalized, sr);
  fs.writeFileSync(filePath, wavBuf);
  return filePath;
}
