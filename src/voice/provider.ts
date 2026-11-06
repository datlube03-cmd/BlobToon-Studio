import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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

export function computeTtsCacheKey(
  voice: string,
  text: string,
  speedMultiplier = 1.0
): string {
  const normalized = normalizeSpeechText(text);
  const speedTag = clampTtsSpeed(speedMultiplier).toFixed(2);
  return crypto
    .createHash('sha256')
    .update(`${voice}|speed:${speedTag}|${normalized}`)
    .digest('hex');
}

/**
 * Measures real WAV/MP3 audio duration using `ffprobe`.
 * Falls back to WAV byte-header calculation if ffprobe is unavailable.
 */
export async function probeAudioDurationSec(filePath: string): Promise<number> {
  try {
    const probe = childProcess.spawnSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { encoding: 'utf-8' }
    );

    if (probe.status === 0 && probe.stdout) {
      const parsed = Number.parseFloat(probe.stdout.trim());
      if (!Number.isNaN(parsed) && parsed > 0) {
        return Number(parsed.toFixed(3));
      }
    }
  } catch {
    // Fallback to WAV header inspection below
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 44) {
      const fd = fs.openSync(filePath, 'r');
      const header = Buffer.alloc(44);
      fs.readSync(fd, header, 0, 44, 0);
      fs.closeSync(fd);
      const byteRate = header.readUInt32LE(28);
      if (byteRate > 0) {
        return Number(((stat.size - 44) / byteRate).toFixed(3));
      }
    }
  } catch {
    // Final word-count fallback
  }

  return 3.5;
}

/**
 * Concatenates multiple WAV files (all 24kHz 16-bit mono or via ffmpeg) into a single WAV file.
 */
export async function concatenateWavFiles(
  wavFiles: string[],
  outPath: string
): Promise<number> {
  if (wavFiles.length === 0) {
    const synth = synthesizeMockSpeechWav('', 0.6);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, synth.buffer);
    return synth.durationSec;
  }
  if (wavFiles.length === 1) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.copyFileSync(wavFiles[0], outPath);
    return probeAudioDurationSec(outPath);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  // Concatenate 16-bit PCM payloads directly when headers share the same sample rate, or via ffmpeg
  const listFile = `${outPath}.concat.txt`;
  try {
    const listBody = wavFiles
      .map((f) => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(listFile, listBody, 'utf-8');
    const ff = childProcess.spawnSync(
      'ffmpeg',
      ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-ar', '24000', '-ac', '1', outPath],
      { encoding: 'utf-8' }
    );
    if (ff.status === 0 && fs.existsSync(outPath)) {
      return probeAudioDurationSec(outPath);
    }
  } finally {
    if (fs.existsSync(listFile)) {
      fs.rmSync(listFile, { force: true });
    }
  }

  fs.copyFileSync(wavFiles[0], outPath);
  return probeAudioDurationSec(outPath);
}

/**
 * Generates a clean, pleasant syllabic voice-like 16-bit mono 24kHz WAV buffer
 * so MockProvider produces real playable speech cadence with accurate duration.
 */
export function synthesizeMockSpeechWav(
  text: string,
  speedMultiplier = 1.0,
  voiceName = 'alloy'
): {
  buffer: Buffer;
  durationSec: number;
} {
  const words = normalizeSpeechText(text)
    .split(' ')
    .filter(Boolean);
  const wordCount = Math.max(1, words.length);
  const clampedSpeed = clampTtsSpeed(speedMultiplier);
  // ~2.65 words per second at 1.0x speed, scaled by speedMultiplier
  const baseDurationSec = Math.max(0.8, wordCount / 2.65 + 0.15);
  const durationSec = Number(Math.max(0.5, baseDurationSec / clampedSpeed).toFixed(2));
  const sampleRate = 24000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF WAVE Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  buffer.writeUInt16LE(1, 22); // NumChannels = 1
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let voiceSeed = 0;
  for (let i = 0; i < voiceName.length; i++) {
    voiceSeed = (voiceSeed * 31 + voiceName.charCodeAt(i)) % 97;
  }
  const pitchOffset = (voiceSeed - 48) * 0.85;

  const syllableRateHz = 3.8 * clampedSpeed;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sylPhase = (t * syllableRateHz) % 1;
    const sylEnvelope = sylPhase < 0.78 ? Math.sin((sylPhase / 0.78) * Math.PI) : 0;
    const f0 = 165 + pitchOffset + 25 * Math.sin(2 * Math.PI * 1.4 * t);
    const carrier =
      0.65 * Math.sin(2 * Math.PI * f0 * t) +
      0.25 * Math.sin(2 * Math.PI * f0 * 2 * t) +
      0.1 * Math.sin(2 * Math.PI * f0 * 3 * t);

    const fade =
      t < 0.04 ? t / 0.04 : t > durationSec - 0.06 ? Math.max(0, (durationSec - t) / 0.06) : 1;
    const sample = Math.max(-1, Math.min(1, carrier * sylEnvelope * fade * 0.28));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  return { buffer, durationSec };
}

export class MockProvider implements TtsProvider {
  public readonly name = 'mock' as const;
  private readonly cacheDir: string;
  private readonly defaultVoice: string;

  constructor(options?: { cacheDir?: string; defaultVoice?: string }) {
    this.cacheDir = options?.cacheDir ?? path.resolve(process.cwd(), 'cache/tts');
    this.defaultVoice = options?.defaultVoice ?? process.env.VOICESTUDIO_VOICE ?? 'alloy';
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  async synthesize(
    text: string,
    voice?: string,
    speedMultiplier = 1.0
  ): Promise<TtsSynthesisResult> {
    const chosenVoice = voice || this.defaultVoice;
    const clampedSpeed = clampTtsSpeed(speedMultiplier);
    const key = computeTtsCacheKey(`mock:${chosenVoice}`, text, clampedSpeed);
    const wavPath = path.join(this.cacheDir, `${key}.wav`);

    if (fs.existsSync(wavPath) && fs.statSync(wavPath).size > 44) {
      const durationSec = await probeAudioDurationSec(wavPath);
      return {
        file: wavPath,
        durationSec,
        cached: true,
        provider: 'mock',
        speedAdjusted: true,
        voiceUsed: chosenVoice,
      };
    }

    const { buffer } = synthesizeMockSpeechWav(text, clampedSpeed, chosenVoice);
    fs.writeFileSync(wavPath, buffer);
    const durationSec = await probeAudioDurationSec(wavPath);

    return {
      file: wavPath,
      durationSec,
      cached: false,
      provider: 'mock',
      speedAdjusted: true,
      voiceUsed: chosenVoice,
    };
  }
}

export interface VoiceStudioProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  defaultVoice?: string;
  defaultSpeed?: number;
  cacheDir?: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  fallbackToMock?: boolean;
}

export class VoiceStudioProvider implements TtsProvider {
  public readonly name = 'voicestudio' as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultVoice: string;
  private readonly defaultSpeed: number;
  private readonly cacheDir: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly fallbackToMock: boolean;
  private readonly mockFallback: MockProvider;
  private static warnedOfflineForUrl = new Set<string>();

  constructor(options: VoiceStudioProviderOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.VOICESTUDIO_URL ??
      'http://127.0.0.1:3900'
    ).replace(/\/$/, '');
    this.apiKey = options.apiKey ?? process.env.VOICESTUDIO_API_KEY ?? '';
    this.defaultVoice = options.defaultVoice ?? process.env.VOICESTUDIO_VOICE ?? 'alloy';
    this.defaultSpeed =
      options.defaultSpeed ??
      (process.env.VOICESTUDIO_SPEED ? Number(process.env.VOICESTUDIO_SPEED) : 1.0);
    this.cacheDir = options.cacheDir ?? path.resolve(process.cwd(), 'cache/tts');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleepImpl =
      options.sleepImpl ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.fallbackToMock = options.fallbackToMock ?? true;
    this.mockFallback = new MockProvider({
      cacheDir: this.cacheDir,
      defaultVoice: this.defaultVoice,
    });
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      headers['X-API-Key'] = this.apiKey;
    }
    return headers;
  }

  async synthesize(
    text: string,
    voice?: string,
    speedMultiplier = 1.0
  ): Promise<TtsSynthesisResult> {
    const chosenVoice = voice || this.defaultVoice;
    const effectiveSpeed = clampTtsSpeed(this.defaultSpeed * speedMultiplier);
    const key = computeTtsCacheKey(chosenVoice, text, effectiveSpeed);
    const wavPath = path.join(this.cacheDir, `${key}.wav`);

    if (fs.existsSync(wavPath) && fs.statSync(wavPath).size > 44) {
      const durationSec = await probeAudioDurationSec(wavPath);
      return {
        file: wavPath,
        durationSec,
        cached: true,
        provider: 'voicestudio',
        speedAdjusted: true,
        voiceUsed: chosenVoice,
      };
    }

    const endpoint = `${this.baseUrl}/v1/audio/speech`;
    const body = JSON.stringify({
      model: 'tts-1',
      input: normalizeSpeechText(text),
      voice: chosenVoice,
      response_format: 'wav',
      speed: effectiveSpeed,
    });

    const backoffsMs = [1000, 2000, 4000];
    let lastError = '';

    for (let attempt = 0; attempt <= backoffsMs.length; attempt++) {
      try {
        const res = await this.fetchImpl(endpoint, {
          method: 'POST',
          headers: this.buildHeaders(),
          body,
        });

        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          if (buf.length <= 44) {
            throw new Error('VoiceStudio returned an empty or truncated WAV response');
          }
          fs.writeFileSync(wavPath, buf);
          const durationSec = await probeAudioDurationSec(wavPath);
          return {
            file: wavPath,
            durationSec,
            cached: false,
            provider: 'voicestudio',
            speedAdjusted: true,
            voiceUsed: chosenVoice,
          };
        }

        const retryableHeader = res.headers.get('X-VoiceStudio-Retryable');
        const retryAfterHeader = res.headers.get('Retry-After');
        let detail = `HTTP ${res.status}`;
        try {
          const errJson = (await res.json()) as { detail?: string; error?: string };
          if (errJson.detail) detail = errJson.detail;
          else if (errJson.error) detail = errJson.error;
        } catch {
          // non-json error body
        }

        lastError = `VoiceStudio error (${res.status}): ${detail}`;
        const isRetryable =
          res.status === 429 || res.status === 503 || retryableHeader === 'true';

        if (isRetryable && attempt < backoffsMs.length) {
          let waitMs = backoffsMs[attempt];
          if (res.status === 429 && retryAfterHeader) {
            const parsedSec = Number.parseFloat(retryAfterHeader);
            if (!Number.isNaN(parsedSec) && parsedSec > 0) {
              waitMs = Math.round(parsedSec * 1000);
            }
          }
          await this.sleepImpl(waitMs);
          continue;
        }

        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        break;
      }
    }

    if (this.fallbackToMock) {
      if (!VoiceStudioProvider.warnedOfflineForUrl.has(this.baseUrl)) {
        VoiceStudioProvider.warnedOfflineForUrl.add(this.baseUrl);
        console.info(
          `[BlobToon Voice] VoiceStudio at ${this.baseUrl} is offline (${lastError}) — using built-in procedural MockProvider.`
        );
      }
      return this.mockFallback.synthesize(text, chosenVoice, speedMultiplier);
    }

    throw new Error(
      `VoiceStudio TTS failed at ${endpoint} (${lastError}). Start VoiceStudio on ${this.baseUrl} or pass --mock-tts.`
    );
  }
}

export async function checkVoiceStudioHealth(
  baseUrl = process.env.VOICESTUDIO_URL || 'http://127.0.0.1:3900',
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<{ ok: boolean; status: number; detail: string }> {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    const res = await fetchImpl(`${cleanUrl}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      return { ok: true, status: res.status, detail: `Healthy (${cleanUrl}/health)` };
    }
    return { ok: false, status: res.status, detail: `HTTP ${res.status} from ${cleanUrl}/health` };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      detail: err instanceof Error ? err.message : 'Unreachable',
    };
  }
}

export interface VoiceInfo {
  id: string;
  name: string;
  description?: string;
}

/**
 * Queries VoiceStudio for available voices if an endpoint is exposed, or returns
 * helpful guidance for selecting/creating voices in VoiceStudio UI.
 */
export async function listVoiceStudioVoices(
  baseUrl = process.env.VOICESTUDIO_URL || 'http://127.0.0.1:3900',
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<{
  online: boolean;
  endpointUsed?: string;
  voices: VoiceInfo[];
  message: string;
}> {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const candidateEndpoints = ['/v1/audio/voices', '/v1/voices', '/voices', '/speakers'];

  for (const route of candidateEndpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const res = await fetchImpl(`${cleanUrl}${route}`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as unknown;
        const rawList = Array.isArray(data)
          ? data
          : data && typeof data === 'object' && 'voices' in data && Array.isArray((data as { voices: unknown[] }).voices)
          ? (data as { voices: unknown[] }).voices
          : data && typeof data === 'object' && 'data' in data && Array.isArray((data as { data: unknown[] }).data)
          ? (data as { data: unknown[] }).data
          : [];
        if (rawList.length > 0) {
          const voices: VoiceInfo[] = rawList.map((item, idx) => {
            if (typeof item === 'string') {
              return { id: item, name: item };
            }
            if (item && typeof item === 'object') {
              const obj = item as Record<string, unknown>;
              const id = String(obj.id ?? obj.voice_id ?? obj.name ?? `voice_${idx + 1}`);
              const name = String(obj.name ?? obj.id ?? id);
              const description = typeof obj.description === 'string' ? obj.description : undefined;
              return { id, name, ...(description ? { description } : {}) };
            }
            return { id: `voice_${idx + 1}`, name: `Voice ${idx + 1}` };
          });
          return {
            online: true,
            endpointUsed: `${cleanUrl}${route}`,
            voices,
            message: `Loaded ${voices.length} voice(s) from ${cleanUrl}${route}.`,
          };
        }
      }
    } catch {
      // Try next endpoint
    }
  }

  const health = await checkVoiceStudioHealth(cleanUrl, fetchImpl);
  const builtinSuggestions: VoiceInfo[] = [
    { id: 'alloy', name: 'alloy', description: 'Balanced neutral narrator / default voice' },
    { id: 'echo', name: 'echo', description: 'Crisp energetic character / robot voice' },
    { id: 'fable', name: 'fable', description: 'Expressive storytelling voice' },
    { id: 'onyx', name: 'onyx', description: 'Deep dramatic voice' },
    { id: 'nova', name: 'nova', description: 'Bright upbeat character voice' },
    { id: 'shimmer', name: 'shimmer', description: 'Warm clear character voice' },
  ];

  const guide = health.ok
    ? `VoiceStudio is online at ${cleanUrl}, but does not expose a voice-listing endpoint. Open the VoiceStudio UI at ${cleanUrl} to view or create custom voices, then paste any voice name/ID into your .script.txt header (voice: <Name>) or character definition (voice=<Name>).`
    : `VoiceStudio is not currently reachable at ${cleanUrl} (${health.detail}). When VoiceStudio is running, open ${cleanUrl} in your browser to create or pick a voice and paste its name/ID into your script (e.g. "kid: blob(color=#4cc9f0, voice=Voice A)"). You can also audition built-in/mock voices right now with: npm run say -- "Hello!" --voice "Voice A"`;

  return {
    online: health.ok,
    voices: builtinSuggestions,
    message: guide,
  };
}
