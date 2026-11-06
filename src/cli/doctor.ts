import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveRemotionBrowserExecutable } from '../render/remotionBrowser';
import { checkVoiceStudioHealth } from '../voice/provider';

export interface DoctorCheckResult {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

function checkBinary(bin: string): { ok: boolean; version: string } {
  const res = spawnSync(bin, ['-version'], { encoding: 'utf-8' });
  if (res.status === 0 && res.stdout) {
    const firstLine = res.stdout.split('\n')[0]?.trim() || 'installed';
    return { ok: true, version: firstLine };
  }
  return { ok: false, version: 'not found in PATH' };
}

export async function runDoctorChecks(): Promise<{
  allRequiredOk: boolean;
  checks: DoctorCheckResult[];
}> {
  const checks: DoctorCheckResult[] = [];

  // 1. Node version
  const nodeVer = process.versions.node;
  const major = Number(nodeVer.split('.')[0]);
  checks.push({
    name: 'Node.js runtime (>=20)',
    ok: major >= 20,
    detail: `v${nodeVer}`,
    required: true,
  });

  // 2. Chromium for Remotion (@remotion/renderer)
  const browserExec = resolveRemotionBrowserExecutable();
  checks.push({
    name: 'Chromium for Remotion (@remotion/renderer)',
    ok: Boolean(browserExec),
    detail: browserExec
      ? `Found (${browserExec})`
      : 'No local Chromium/chrome-headless-shell found (set REMOTION_CHROME_EXECUTABLE or run npx remotion browser ensure)',
    required: true,
  });

  // 3. Standard ffmpeg (H.264 + AAC muxing; no librsvg needed)
  const ffmpeg = checkBinary('ffmpeg');
  checks.push({
    name: 'Standard ffmpeg binary (H.264 + AAC; no librsvg required)',
    ok: ffmpeg.ok,
    detail: ffmpeg.version,
    required: true,
  });

  // 4. ffprobe
  const ffprobe = checkBinary('ffprobe');
  checks.push({
    name: 'ffprobe binary',
    ok: ffprobe.ok,
    detail: ffprobe.version,
    required: true,
  });

  // 5. Bundled OFL Font
  const fontOk = fs.existsSync(path.resolve(process.cwd(), 'assets/fonts/Fredoka-Bold.ttf'));
  checks.push({
    name: 'Bundled OFL font (assets/fonts/Fredoka-Bold.ttf)',
    ok: fontOk,
    detail: fontOk ? 'Present' : 'Missing',
    required: true,
  });

  // 6. Optional Local VoiceStudio /health
  const vsUrl = process.env.VOICESTUDIO_URL || 'http://127.0.0.1:3900';
  const vsHealth = await checkVoiceStudioHealth(vsUrl);
  checks.push({
    name: `VoiceStudio TTS (${vsUrl}/health — optional)`,
    ok: vsHealth.ok,
    detail: vsHealth.ok
      ? `Online (${vsHealth.detail})`
      : `Offline — using built-in procedural MockProvider seamlessly`,
    required: false,
  });

  const allRequiredOk = checks.filter((c) => c.required).every((c) => c.ok);
  return { allRequiredOk, checks };
}

export async function printDoctorReport(): Promise<boolean> {
  const { allRequiredOk, checks } = await runDoctorChecks();
  console.log('\n=== BlobToon Studio Environment Doctor ===\n');
  for (const c of checks) {
    const badge = c.ok ? '[PASS]' : c.required ? '[FAIL]' : '[INFO]';
    console.log(`${badge} ${c.name}: ${c.detail}`);
  }
  console.log(
    `\nOverall Status: ${allRequiredOk ? 'READY (Remotion + standard ffmpeg verified)' : 'ISSUES FOUND'}\n`
  );
  return allRequiredOk;
}
