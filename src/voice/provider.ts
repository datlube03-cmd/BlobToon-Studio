import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface TtsSynthesisResult {
  file: string;
  durationSec: number;
  cached?: boolean;
  provider?: 'voicestudio' | 'mock';
  speedAdjusted?: boolean;
}

export interface TtsProvider {
  synthesize(text: string, voice?: string, speedMultiplier?: number): Promise<TtsSynthesisResult>;
}

export function computeTtsCacheKey(
  text: string,
  voice: string,
  namespace = 'vs',
  speedMultiplier = 1.0
): string {
  const normSpeed = Number(Math.max(0.4, Math.min(3.0, speedMultiplier || 1.0)).toFixed(2));
  const speedSuffix = normSpeed !== 1 ? `::spd=${normSpeed}` : '';
  return crypto
    .createHash('sha256')
    .update(`${namespace}::${voice.trim().toLowerCase()}${speedSuffix}::${text.trim()}`)
    .digest('hex')
    .slice(0, 24);
}

/**
 * Measures the real duration in seconds of an audio file using ffprobe,
 * with a fallback to WAV header byte-rate calculation if ffprobe fails.
 */
export async function probeAudioDurationSec(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const parsed = parseFloat(stdout.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Number(parsed.toFixed(3));
    }
  } catch {
    // Fallback to WAV header inspection if ffprobe is unavailable
  }

  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length >= 44 && buf.toString('ascii', 0, 4) === 'RIFF') {
      const byteRate = buf.readUInt32LE(28);
      const dataSize = buf.length - 44;
      if (byteRate > 0) {
        return Number((dataSize / byteRate).toFixed(3));
      }
    }
  } catch {
    // Ignore
  }
  return 3.0;
}

/**
 * Writes a valid 16-bit mono 24kHz PCM WAV file (matches VoiceStudio's 24kHz default).
 * Uses near-silent subtle speech envelope (or pure silence) sized to durationSec.
 */
export function writeWavFile(
  filePath: string,
  durationSec: number,
  silent = true,
  speedMultiplier = 1.0
): void {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.max(1, Math.round(durationSec * sampleRate));
  const dataSize = totalSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF identifier
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // byteRate
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32); // blockAlign
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  if (!silent) {
    const speed = Math.max(0.4, Math.min(3.0, speedMultiplier || 1.0));
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const syllableEnvelope = Math.max(0, Math.sin(t * Math.PI * 6.5 * speed));
      const carrier =
        Math.sin(2 * Math.PI * 190 * t) * 0.6 + Math.sin(2 * Math.PI * 380 * t) * 0.4;
      const sample = Math.round(carrier * syllableEnvelope * 1800);
      buffer.writeInt16LE(sample, 44 + i * 2);
    }
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

export function estimateTextSpeechDurationSec(text: string, speedMultiplier = 1.0): number {
  const speed = Math.max(0.4, Math.min(3.0, speedMultiplier || 1.0));
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const wordCount = words.length;
  if (wordCount === 0) return Number((1.5 / speed).toFixed(2));
  // ~2.55 spoken words per second + punctuation pauses, scaled by speedMultiplier
  const punctuationCount = (text.match(/[,.!?;:—-]/g) || []).length;
  const rawSec = (wordCount / 2.55 + punctuationCount * 0.14) / speed;
  const minSec = 1.8 / speed;
  return Number(Math.max(minSec, rawSec).toFixed(2));
}

export interface MockProviderOptions {
  cacheDir?: string;
  silent?: boolean;
}

export class MockProvider implements TtsProvider {
  private cacheDir: string;
  private silent: boolean;

  constructor(options: MockProviderOptions = {}) {
    this.cacheDir = options.cacheDir ?? path.resolve(process.cwd(), 'cache');
    this.silent = options.silent ?? true;
  }

  async synthesize(
    text: string,
    voice = 'mock-alloy',
    speedMultiplier = 1.0
  ): Promise<TtsSynthesisResult> {
    const speed = Math.max(0.4, Math.min(3.0, speedMultiplier || 1.0));
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const hash = computeTtsCacheKey(text, voice, 'mock', speed);
    const filePath = path.join(this.cacheDir, `tts_mock_${hash}.wav`);

    if (fs.existsSync(filePath)) {
      const durationSec = await probeAudioDurationSec(filePath);
      return {
        file: filePath,
        durationSec,
        cached: true,
        provider: 'mock',
        speedAdjusted: true,
      };
    }

    const targetDuration = estimateTextSpeechDurationSec(text, speed);
    writeWavFile(filePath, targetDuration, this.silent, speed);
    const measuredDuration = await probeAudioDurationSec(filePath);
    return {
      file: filePath,
      durationSec: measuredDuration,
      cached: false,
      provider: 'mock',
      speedAdjusted: true,
    };
  }
}

export interface VoiceStudioProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  defaultVoice?: string;
  model?: string;
  cacheDir?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
  timeoutMs?: number;
  fallbackToMock?: boolean;
  onFallback?: (notice: string) => void;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

export class VoiceStudioProvider implements TtsProvider {
  private baseUrl: string;
  private apiKey: string;
  private defaultVoice: string;
  private model: string;
  private cacheDir: string;
  private maxRetries: number;
  private initialBackoffMs: number;
  private timeoutMs: number;
  private fallbackToMock: boolean;
  private onFallback?: (notice: string) => void;
  private fetchImpl: typeof fetch;
  private sleepImpl: (ms: number) => Promise<void>;
  private mockFallback: MockProvider;
  private warnedOffline = false;
  public lastFallbackNotice: string | null = null;

  constructor(options: VoiceStudioProviderOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.VOICESTUDIO_URL ??
      'http://127.0.0.1:3900'
    ).replace(/\/+$/, '');
    this.apiKey = options.apiKey ?? process.env.VOICESTUDIO_API_KEY ?? '';
    this.defaultVoice = options.defaultVoice ?? process.env.VOICESTUDIO_VOICE ?? 'alloy';
    this.model = options.model ?? process.env.VOICESTUDIO_MODEL ?? 'tts-1';
    this.cacheDir = options.cacheDir ?? path.resolve(process.cwd(), 'cache');
    this.maxRetries = options.maxRetries ?? 3;
    this.initialBackoffMs = options.initialBackoffMs ?? 500;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fallbackToMock = options.fallbackToMock ?? true;
    this.onFallback = options.onFallback;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleepImpl =
      options.sleepImpl ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.mockFallback = new MockProvider({ cacheDir: this.cacheDir });
  }

  private parseRetryAfterMs(headerVal: string | null, attempt: number): number {
    if (headerVal) {
      const seconds = Number(headerVal.trim());
      if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.round(seconds * 1000);
      }
    }
    return this.initialBackoffMs * Math.pow(2, attempt);
  }

  async synthesize(
    text: string,
    voice?: string,
    speedMultiplier = 1.0
  ): Promise<TtsSynthesisResult> {
    const selectedVoice = (voice || this.defaultVoice || 'alloy').trim();
    const effectiveSpeed = Number(
      Math.max(0.4, Math.min(3.0, speedMultiplier || 1.0)).toFixed(2)
    );
    fs.mkdirSync(this.cacheDir, { recursive: true });

    const hash = computeTtsCacheKey(text, selectedVoice, 'voicestudio', effectiveSpeed);
    const cacheFile = path.join(this.cacheDir, `tts_vs_${hash}.wav`);

    if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 44) {
      const durationSec = await probeAudioDurationSec(cacheFile);
      return {
        file: cacheFile,
        durationSec,
        cached: true,
        provider: 'voicestudio',
        speedAdjusted: true,
      };
    }

    const endpoint = this.baseUrl.endsWith('/v1')
      ? `${this.baseUrl}/audio/speech`
      : `${this.baseUrl}/v1/audio/speech`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'audio/wav',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const payload = JSON.stringify({
      model: this.model,
      input: text,
      voice: selectedVoice,
      response_format: 'wav',
      speed: effectiveSpeed,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImpl(endpoint, {
          method: 'POST',
          headers,
          body: payload,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = Buffer.from(arrayBuffer);
          if (audioBuffer.length <= 44) {
            throw new Error('VoiceStudio returned an empty or truncated WAV payload');
          }
          fs.writeFileSync(cacheFile, audioBuffer);
          const durationSec = await probeAudioDurationSec(cacheFile);
          return {
            file: cacheFile,
            durationSec,
            cached: false,
            provider: 'voicestudio',
            speedAdjusted: true,
          };
        }

        // Documented VoiceStudio HTTP error handling:
        // 429: worker pool backed up before job started (Retry-After header)
        // 503: job hit bound or engine warming (Retry-After / exponential backoff)
        if (response.status === 429 || response.status === 503) {
          const retryAfterHeader = response.headers.get('retry-after');
          const waitMs = this.parseRetryAfterMs(retryAfterHeader, attempt);
          lastError = new Error(
            `VoiceStudio returned HTTP ${response.status} (Retry-After: ${retryAfterHeader ?? 'backoff'})`
          );
          if (attempt < this.maxRetries) {
            await this.sleepImpl(waitMs);
            continue;
          }
          break;
        }

        // Other HTTP errors (e.g. 400 invalid engine/params, 401 unauthorized, 409 ambiguous_voice)
        let errDetail = `HTTP ${response.status}`;
        try {
          const errJson = (await response.json()) as {
            error?: { message?: string; code?: string };
            detail?: string;
          };
          errDetail =
            errJson?.error?.message ||
            errJson?.detail ||
            `HTTP ${response.status}`;
        } catch {
          // ignore JSON parse failure
        }
        lastError = new Error(`VoiceStudio (${response.status}): ${errDetail}`);
        break;
      } catch (err) {
        clearTimeout(timer);
        lastError = err instanceof Error ? err : new Error(String(err));
        // Network error / ECONNREFUSED: if fallbackToMock is enabled, break early to avoid stalling
        const isConnRefused =
          lastError.message.includes('ECONNREFUSED') ||
          lastError.message.includes('fetch failed') ||
          lastError.name === 'AbortError';
        if (isConnRefused && this.fallbackToMock) {
          break;
        }
        if (attempt < this.maxRetries) {
          const waitMs = this.initialBackoffMs * Math.pow(2, attempt);
          await this.sleepImpl(waitMs);
        }
      }
    }

    if (this.fallbackToMock) {
      if (!this.warnedOffline) {
        this.lastFallbackNotice = `[BlobToon Voice] Local VoiceStudio server not detected at ${this.baseUrl}; using built-in MockProvider audio synthesis.`;
        this.onFallback?.(this.lastFallbackNotice);
        this.warnedOffline = true;
      }
      return this.mockFallback.synthesize(text, selectedVoice, effectiveSpeed);
    }

    throw new Error(
      `VoiceStudio TTS server at ${this.baseUrl} is offline (${lastError?.message ?? 'no response'}). Start VoiceStudio locally or enable MockProvider fallback.`
    );
  }
}

export function createDefaultTtsProvider(options?: VoiceStudioProviderOptions): TtsProvider {
  if (process.env.BLOBTOON_FORCE_MOCK_TTS === '1') {
    return new MockProvider({ cacheDir: options?.cacheDir });
  }
  return new VoiceStudioProvider({
    fallbackToMock: true,
    ...options,
  });
}
