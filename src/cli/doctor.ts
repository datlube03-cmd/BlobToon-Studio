import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface DoctorCheckItem {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export async function runDoctorChecks(): Promise<{
  healthy: boolean;
  checks: DoctorCheckItem[];
}> {
  const checks: DoctorCheckItem[] = [];

  // 1. Node.js version check (>= 22)
  const nodeVer = process.versions.node;
  const major = parseInt(nodeVer.split('.')[0], 10);
  checks.push({
    name: 'Node.js Runtime (>= 22)',
    status: major >= 22 ? 'ok' : 'warn',
    detail: `v${nodeVer}`,
  });

  // 2. ffmpeg check
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version']);
    const firstLine = stdout.split('\n')[0] || 'ffmpeg available';
    const hasRsvg = stdout.includes('enable-librsvg');
    checks.push({
      name: 'ffmpeg Binary & SVG Rasterizer',
      status: 'ok',
      detail: `${firstLine.slice(0, 62)}${hasRsvg ? ' (librsvg enabled)' : ''}`,
    });
  } catch {
    checks.push({
      name: 'ffmpeg Binary & SVG Rasterizer',
      status: 'fail',
      detail: 'ffmpeg not found on PATH. Install ffmpeg before rendering MP4s.',
    });
  }

  // 3. ffprobe check
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-version']);
    const firstLine = stdout.split('\n')[0] || 'ffprobe available';
    checks.push({
      name: 'ffprobe Audio Prober',
      status: 'ok',
      detail: firstLine.slice(0, 62),
    });
  } catch {
    checks.push({
      name: 'ffprobe Audio Prober',
      status: 'fail',
      detail: 'ffprobe not found on PATH.',
    });
  }

  // 4. Environment & Anthropic API Key check
  const envExists = fs.existsSync(path.resolve(process.cwd(), '.env'));
  const envExampleExists = fs.existsSync(path.resolve(process.cwd(), '.env.example'));
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  const hasRealAnthropicKey =
    Boolean(anthropicKey) &&
    anthropicKey !== 'your_anthropic_api_key_here' &&
    anthropicKey !== 'MY_ANTHROPIC_API_KEY';

  checks.push({
    name: 'Anthropic Script LLM Config',
    status: hasRealAnthropicKey ? 'ok' : 'warn',
    detail: hasRealAnthropicKey
      ? `ANTHROPIC_API_KEY set (model: ${anthropicModel})`
      : `ANTHROPIC_API_KEY unset/placeholder — using deterministic script fallback (model: ${anthropicModel}, .env=${envExists ? 'present' : 'missing'}, .env.example=${envExampleExists ? 'present' : 'missing'})`,
  });

  // 5. Editable Prompts check
  const promptFiles = ['prompts/script_system.md', 'prompts/script_user.md', 'prompts/ideas.md'];
  const missingPrompts = promptFiles.filter(
    (p) => !fs.existsSync(path.resolve(process.cwd(), p))
  );
  checks.push({
    name: 'Editable Markdown Prompts',
    status: missingPrompts.length === 0 ? 'ok' : 'fail',
    detail:
      missingPrompts.length === 0
        ? `All ${promptFiles.length} prompt files found in prompts/`
        : `Missing: ${missingPrompts.join(', ')}`,
  });

  // 6. VoiceStudio Local TTS Server check (warn, never fail)
  const vsUrl = (process.env.VOICESTUDIO_URL || 'http://127.0.0.1:3900').replace(/\/+$/, '');
  const vsVoice = process.env.VOICESTUDIO_VOICE || 'alloy';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${vsUrl}/.well-known/voicestudio-speech`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      checks.push({
        name: 'VoiceStudio Local TTS Server',
        status: 'ok',
        detail: `Reachable at ${vsUrl} (default voice: ${vsVoice})`,
      });
    } else {
      checks.push({
        name: 'VoiceStudio Local TTS Server',
        status: 'warn',
        detail: `Responded with HTTP ${res.status} at ${vsUrl} — will fall back to MockProvider if synthesis fails`,
      });
    }
  } catch {
    checks.push({
      name: 'VoiceStudio Local TTS Server',
      status: 'warn',
      detail: `Not running at ${vsUrl} — using MockProvider silent/envelope WAV fallback (voice: ${vsVoice})`,
    });
  }

  const healthy = !checks.some((c) => c.status === 'fail');
  return { healthy, checks };
}

export function formatDoctorReport(checks: DoctorCheckItem[], healthy: boolean): string {
  const lines = [
    '==========================================================',
    ' BlobToon Environment Doctor Checklist',
    '==========================================================',
  ];
  for (const c of checks) {
    const icon = c.status === 'ok' ? '[PASS]' : c.status === 'warn' ? '[WARN]' : '[FAIL]';
    lines.push(`${icon} ${c.name.padEnd(30)} : ${c.detail}`);
  }
  lines.push('----------------------------------------------------------');
  lines.push(
    healthy
      ? 'Result: READY (all required dependencies verified; warnings use safe fallbacks).'
      : 'Result: ACTION REQUIRED (one or more required dependencies failed).'
  );
  return lines.join('\n');
}
