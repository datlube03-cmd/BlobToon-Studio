export interface TtsSynthesisResult {
  file: string;
  durationSec: number;
  cached: boolean;
  provider: 'voicestudio' | 'mock';
  speedAdjusted?: boolean;
  voiceUsed?: string;
}

export interface TtsProvider {
  readonly name: 'voicestudio' | 'mock';
  synthesize(text: string, voice?: string, speedMultiplier?: number): Promise<TtsSynthesisResult>;
  concatenateSceneLines?(
    wavFiles: string[],
    sceneId: string,
    speedMultiplier?: number
  ): Promise<{ file: string; durationSec: number }>;
}

/**
 * Resolves the effective voice for a spoken line using the strict precedence order:
 * `line.voice > character.voice > script.voice (project default) > VOICESTUDIO_VOICE (env) > 'alloy'`
 */
export function resolveLineVoice(options: {
  lineVoice?: string;
  characterVoice?: string;
  scriptVoice?: string;
  envVoice?: string;
}): string {
  const defaultEnvVoice =
    typeof process !== 'undefined' && process.env ? process.env.VOICESTUDIO_VOICE : undefined;
  const candidates = [
    options.lineVoice,
    options.characterVoice,
    options.scriptVoice,
    options.envVoice ?? defaultEnvVoice,
    'alloy',
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim();
    }
  }
  return 'alloy';
}

export function normalizeSpeechText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function clampTtsSpeed(speed?: number): number {
  if (typeof speed !== 'number' || Number.isNaN(speed) || speed <= 0) {
    return 1.0;
  }
  return Number(Math.max(0.5, Math.min(2.5, speed)).toFixed(2));
}
