import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  ALL_ASPECT_RATIOS,
  ASPECT_PRESETS,
  AspectRatio,
  AspectSelection,
  parseAspectSelection,
} from '../aspect';
import { printDoctorReport } from './doctor';
import { buildDeterministicScript } from '../script/generator';
import {
  createStarterScriptTemplate,
  loadScriptFromFile,
} from '../script/parser';
import { Script, ScriptSchema } from '../script/schema';
import {
  PALETTE_VARIATIONS,
  selectVariationForIndex,
  slugifyTopic,
} from '../script/variations';
import { buildSfxDemoTimeline, probeMediaAudioMetrics } from '../sfx/demo';
import { listAvailableSkills, loadSkillByName } from '../skills/loader';
import { SkillDefinition } from '../skills/schema';
import {
  applyAspectToTimeline,
  buildTimeline,
} from '../timeline/builder';
import { parseTimelineStrict } from '../timeline/schema';
import {
  MockProvider,
  TtsProvider,
  VoiceStudioProvider,
  listVoiceStudioVoices,
} from '../voice/provider';
import { createGalleryTimeline } from '../render/gallery';
import { renderTimelineAllAspects, renderTimelineToVideo } from '../render/renderVideo';

dotenv.config();

export interface CliFlags {
  positional: string[];
  mock: boolean;
  mockTts: boolean;
  gallery: boolean;
  draft: boolean;
  quality?: 'final' | 'draft';
  voice?: string;
  speed?: number;
  outDir?: string;
  maxDurationSec?: number;
  aspect?: AspectSelection;
  skill?: string;
  sfx: boolean;
  sfxVolume: number;
  music?: string;
}

export function parseCliArgs(argv: string[]): { command: string; flags: CliFlags } {
  const args = argv.slice(2);
  const command = args[0] || 'help';
  const positional: string[] = [];
  let mock = false;
  let mockTts = false;
  let gallery = false;
  let draft = false;
  let quality: 'final' | 'draft' | undefined;
  let voice: string | undefined;
  let speed: number | undefined;
  let outDir: string | undefined;
  let maxDurationSec: number | undefined;
  let aspect: AspectSelection | undefined;
  let skill: string | undefined;
  let sfx = true;
  let sfxVolume = 0.35;
  let music: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--mock') {
      mock = true;
    } else if (arg === '--mock-tts') {
      mockTts = true;
    } else if (arg === '--gallery') {
      gallery = true;
    } else if (arg === '--draft') {
      draft = true;
      quality = 'draft';
    } else if (arg === '--quality' && args[i + 1]) {
      const q = args[++i].toLowerCase();
      quality = q === 'draft' ? 'draft' : 'final';
      draft = quality === 'draft';
    } else if (arg.startsWith('--quality=')) {
      const q = arg.slice('--quality='.length).toLowerCase();
      quality = q === 'draft' ? 'draft' : 'final';
      draft = quality === 'draft';
    } else if (arg === '--voice' && args[i + 1]) {
      voice = args[++i];
    } else if (arg.startsWith('--voice=')) {
      voice = arg.slice('--voice='.length);
    } else if (arg === '--speed' && args[i + 1]) {
      speed = Number(args[++i]);
    } else if (arg.startsWith('--speed=')) {
      speed = Number(arg.slice('--speed='.length));
    } else if (arg === '--out' && args[i + 1]) {
      outDir = args[++i];
    } else if (arg === '--max-sec' && args[i + 1]) {
      maxDurationSec = Number(args[++i]);
    } else if (arg === '--aspect' && args[i + 1]) {
      aspect = parseAspectSelection(args[++i]);
    } else if (arg.startsWith('--aspect=')) {
      aspect = parseAspectSelection(arg.slice('--aspect='.length));
    } else if (arg === '--skill' && args[i + 1]) {
      skill = args[++i];
    } else if (arg.startsWith('--skill=')) {
      skill = arg.slice('--skill='.length);
    } else if (arg === '--sfx' && args[i + 1] && !args[i + 1].startsWith('--')) {
      const val = args[++i].toLowerCase();
      sfx = val !== 'off' && val !== 'false' && val !== '0';
    } else if (arg === '--sfx') {
      sfx = true;
    } else if (arg.startsWith('--sfx=')) {
      const val = arg.slice('--sfx='.length).toLowerCase();
      sfx = val !== 'off' && val !== 'false' && val !== '0';
    } else if (arg === '--no-sfx') {
      sfx = false;
    } else if (arg === '--sfx-volume' && args[i + 1]) {
      sfxVolume = Math.max(0, Math.min(1, Number(args[++i])));
    } else if (arg.startsWith('--sfx-volume=')) {
      sfxVolume = Math.max(0, Math.min(1, Number(arg.slice('--sfx-volume='.length))));
    } else if (arg === '--music' && args[i + 1] && !args[i + 1].startsWith('--')) {
      music = args[++i];
    } else if (arg === '--music') {
      music = 'quirky';
    } else if (arg.startsWith('--music=')) {
      music = arg.slice('--music='.length);
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  return {
    command,
    flags: {
      positional,
      mock,
      mockTts,
      gallery,
      draft,
      quality,
      voice,
      speed,
      outDir,
      maxDurationSec,
      aspect,
      skill,
      sfx,
      sfxVolume,
      music,
    },
  };
}

/**
 * Resolves the effective aspect selection using precedence:
 * `--aspect` CLI flag > `aspect` field in JSON/Script > `'9:16'` default.
 */
export function resolveAspectSelection(
  cliFlag?: AspectSelection,
  fileAspect?: AspectRatio
): { mode: 'single' | 'all'; aspect: AspectRatio } {
  if (cliFlag === 'all') {
    return { mode: 'all', aspect: fileAspect ?? '9:16' };
  }
  if (cliFlag) {
    return { mode: 'single', aspect: cliFlag };
  }
  return { mode: 'single', aspect: fileAspect ?? '9:16' };
}

function createTtsProvider(useMock: boolean, voice?: string): TtsProvider {
  if (useMock) {
    return new MockProvider({ defaultVoice: voice });
  }
  return new VoiceStudioProvider({
    defaultVoice: voice,
    fallbackToMock: true,
  });
}

function resolveOptionalSkill(skillName?: string): SkillDefinition | undefined {
  if (!skillName) {
    return undefined;
  }
  return loadSkillByName(skillName);
}

/**
 * Phase 1 hardcoded 3-scene script used by `--mock` smoke verification.
 */
export function createPhase1ThreeSceneScript(aspect: AspectRatio = '9:16'): Script {
  return ScriptSchema.parse({
    aspect,
    topic: 'What if Mom started playing on your Roblox account',
    title: 'What if Mom Played on Your Gaming Account?',
    hook: 'Every time you skip a chore, Mom plays on your main gaming account for one full hour.',
    description:
      'Phase 1 3-scene vertical cartoon test: THE RULE, DAY 1, and DAY 2 with burned-in captions and procedural 2D blobs.',
    hashtags: ['#whatif', '#shorts', '#blobtoon', '#animation'],
    scenes: [
      {
        id: 'p1_rule',
        label: 'THE RULE',
        narration:
          'Every time you skip a chore, your Mom plays on your main gaming account for one full hour.',
        caption:
          'Every time you skip a chore, your Mom plays on your main gaming account for one full hour.',
        background: 'room',
        transition: 'zoom',
        characters: [
          {
            id: 'you',
            name: 'You',
            type: 'blob',
            color: '#38bdf8',
            accessory: 'headphones',
            hoodieColor: '#6366f1',
            size: 1.0,
            x: 0.32,
            y: 0.62,
            emotion: 'shock',
            animation: 'scale-pop',
            speaking: true,
            flipX: false,
          },
          {
            id: 'mom',
            name: 'Mom',
            type: 'blob',
            color: '#f472b6',
            accessory: 'glasses',
            hoodieColor: '#f59e0b',
            size: 1.06,
            x: 0.68,
            y: 0.62,
            emotion: 'smug',
            animation: 'slide-in',
            speaking: false,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'p1_prop_1',
            type: 'controller',
            x: 0.5,
            y: 0.45,
            scale: 1.15,
            rotation: -10,
            animation: 'bounce',
            label: '1 HR PENALTY',
          },
        ],
        beats: [
          {
            atProgress: 0.2,
            targetId: 'you',
            emotion: 'shock',
            animation: 'jump',
            bubbleText: 'MY ACCOUNT?!',
          },
        ],
      },
      {
        id: 'p1_day1',
        label: 'DAY 1',
        narration:
          'On Day One, she mashes random buttons and somehow defeats the dragon boss you were stuck on.',
        caption:
          'On Day One, she mashes random buttons and somehow defeats the dragon boss you were stuck on.',
        background: 'arcade',
        transition: 'wipe',
        characters: [
          {
            id: 'you',
            name: 'You',
            type: 'blob',
            color: '#38bdf8',
            accessory: 'headphones',
            hoodieColor: '#6366f1',
            size: 1.0,
            x: 0.3,
            y: 0.62,
            emotion: 'happy',
            animation: 'bounce',
            speaking: false,
            flipX: false,
          },
          {
            id: 'mom',
            name: 'Mom',
            type: 'blob',
            color: '#f472b6',
            accessory: 'glasses',
            hoodieColor: '#f59e0b',
            size: 1.08,
            x: 0.7,
            y: 0.62,
            emotion: 'laughing',
            animation: 'squash-and-stretch',
            speaking: true,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'p1_prop_2',
            type: 'trophy',
            x: 0.5,
            y: 0.45,
            scale: 1.1,
            rotation: 8,
            animation: 'spin',
            label: 'BOSS CLEARED!',
          },
        ],
        beats: [
          {
            atProgress: 0.35,
            targetId: 'mom',
            emotion: 'laughing',
            bubbleText: 'TOO EASY!',
          },
        ],
      },
      {
        id: 'p1_day2',
        label: 'DAY 2',
        narration:
          'By Day Two, she trades your legendary sword for a pink gardening hat and locks you out.',
        caption:
          'By Day Two, she trades your legendary sword for a pink gardening hat and locks you out.',
        background: 'kitchen',
        transition: 'slide',
        characters: [
          {
            id: 'you',
            name: 'You',
            type: 'blob',
            color: '#38bdf8',
            accessory: 'hoodie',
            hoodieColor: '#6366f1',
            size: 0.98,
            x: 0.32,
            y: 0.62,
            emotion: 'angry',
            animation: 'shake',
            speaking: true,
            flipX: false,
          },
          {
            id: 'mom',
            name: 'Mom',
            type: 'blob',
            color: '#f472b6',
            accessory: 'crown',
            hoodieColor: '#f59e0b',
            size: 1.1,
            x: 0.68,
            y: 0.62,
            emotion: 'smug',
            animation: 'walk',
            speaking: false,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'p1_prop_3',
            type: 'door',
            x: 0.5,
            y: 0.45,
            scale: 1.05,
            rotation: 0,
            animation: 'scale-pop',
            label: 'LOCKED OUT',
          },
        ],
        beats: [
          {
            atProgress: 0.25,
            targetId: 'you',
            emotion: 'angry',
            bubbleText: 'MY SWORD?!',
          },
        ],
      },
    ],
  });
}

function logRenderSummary(
  res: Awaited<ReturnType<typeof renderTimelineToVideo>>,
  providerUsed: string
) {
  console.log(`\n[BlobToon] Render Complete (${res.aspect} / ${res.width}x${res.height}):`);
  console.log(`  - Video MP4:     ${res.videoPath}`);
  console.log(`  - Thumbnail PNG: ${res.thumbnailPath}`);
  console.log(`  - Timeline JSON: ${res.timelinePath}`);
  console.log(`  - Meta JSON:     ${res.metaPath}`);
  console.log(
    `  - Specs:         ${res.width}x${res.height} @ ${res.fps}fps (${res.durationSec}s, ${res.totalFrames} frames, Engine: ${res.renderEngine}, TTS: ${providerUsed})\n`
  );
}

/**
 * Resolves a list of script files from a single file path, directory path, or simple glob.
 */
export function resolveScriptFilesInput(targetInput: string): string[] {
  const cwd = process.cwd();
  const directPath = path.resolve(cwd, targetInput);

  if (fs.existsSync(directPath)) {
    const stat = fs.statSync(directPath);
    if (stat.isFile()) {
      return [directPath];
    }
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(directPath, { withFileTypes: true });
      const results: string[] = [];
      for (const e of entries) {
        const full = path.join(directPath, e.name);
        if (e.isFile() && (e.name.endsWith('.script.txt') || e.name.endsWith('.script.json') || e.name === 'script.txt' || e.name === 'script.json')) {
          results.push(full);
        } else if (e.isDirectory()) {
          const nestedTxt = path.join(full, 'script.txt');
          const nestedJson = path.join(full, 'script.json');
          if (fs.existsSync(nestedTxt)) results.push(nestedTxt);
          else if (fs.existsSync(nestedJson)) results.push(nestedJson);
        }
      }
      return results.sort();
    }
  }

  // Simple wildcard glob handling (e.g. `examples/*.script.txt` or `projects/*/script.txt`)
  if (targetInput.includes('*')) {
    const parts = targetInput.split(/[\\/]/);
    const baseDir = parts[0] === '*' ? cwd : path.resolve(cwd, parts[0]);
    if (!fs.existsSync(baseDir)) {
      return [];
    }
    const regexStr =
      '^' +
      targetInput
        .replace(/\\/g, '/')
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*') +
      '$';
    const matcher = new RegExp(regexStr);
    const matched: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(cwd, full).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          walk(full);
        } else if (matcher.test(rel)) {
          matched.push(full);
        }
      }
    };
    walk(baseDir);
    return matched.sort();
  }

  return [];
}

async function renderLoadedScript(
  script: Script,
  flags: CliFlags,
  outDir: string
): Promise<void> {
  const skillDef = resolveOptionalSkill(flags.skill ?? script.skill);
  const resolved = resolveAspectSelection(flags.aspect, script.aspect);
  const useMock = flags.mock || flags.mockTts;
  const tts = createTtsProvider(useMock, flags.voice);

  const { timeline, providerUsed } = await buildTimeline(script, tts, {
    aspect: resolved.aspect,
    voice: flags.voice,
    skill: skillDef?.name ?? script.skill,
    renderParams: skillDef?.renderParams ?? script.renderParams,
    audio: {
      sfx: flags.sfx,
      sfxVolume: flags.sfxVolume,
      music: flags.music,
    },
    variation: PALETTE_VARIATIONS[0],
  });

  if (resolved.mode === 'all') {
    const results = await renderTimelineAllAspects(timeline, {
      outDir,
      maxDurationSec: flags.maxDurationSec,
      voiceProviderName: providerUsed,
      sfx: flags.sfx,
      sfxVolume: flags.sfxVolume,
      musicPath: flags.music,
      draft: flags.draft,
      quality: flags.quality,
    });
    for (const r of results) {
      logRenderSummary(r, providerUsed);
    }
  } else {
    const res = await renderTimelineToVideo(timeline, {
      outDir,
      aspect: resolved.aspect,
      maxDurationSec: flags.maxDurationSec,
      voiceProviderName: providerUsed,
      sfx: flags.sfx,
      sfxVolume: flags.sfxVolume,
      musicPath: flags.music,
      draft: flags.draft,
      quality: flags.quality,
    });
    logRenderSummary(res, providerUsed);
  }
}

export async function runCli(argv = process.argv): Promise<void> {
  const { command, flags } = parseCliArgs(argv);

  switch (command) {
    case 'doctor': {
      const ok = await printDoctorReport();
      if (!ok) process.exitCode = 1;
      return;
    }

    case 'skills': {
      const skills = listAvailableSkills();
      console.log(`\n=== Available BlobToon Skills (skills/*.md) ===\n`);
      if (skills.length === 0) {
        console.log('  (No skill files found in skills/ directory)\n');
        return;
      }
      for (const s of skills) {
        if (s.valid && s.skill) {
          console.log(`  - ${s.skill.name.padEnd(20)} ${s.skill.description} (${s.fileName})`);
        } else {
          console.log(`  - [INVALID] ${s.fileName}: ${s.error}`);
        }
      }
      console.log(`\nUsage: npm run make -- examples/demo.script.txt --skill <name>\n`);
      return;
    }

    case 'voices': {
      const report = await listVoiceStudioVoices();
      console.log('\n=== BlobToon VoiceStudio Voices ===\n');
      console.log(`${report.message}\n`);
      if (report.voices.length > 0) {
        console.log('Voice ID             Name                 Notes');
        console.log('-------------------- -------------------- ----------------------------------------');
        for (const v of report.voices) {
          console.log(
            `${v.id.padEnd(20)} ${v.name.padEnd(20)} ${v.description ?? ''}`
          );
        }
        console.log('');
      }
      return;
    }

    case 'say': {
      const text = flags.positional.join(' ').trim();
      if (!text) {
        console.error(
          'Usage: npm run say -- "some text" --voice "Voice A" [--speed 1.0] [--mock-tts]'
        );
        process.exitCode = 1;
        return;
      }
      const voiceName = flags.voice || process.env.VOICESTUDIO_VOICE || 'alloy';
      const speedVal = flags.speed ?? 1.0;
      const tts = createTtsProvider(flags.mock || flags.mockTts, voiceName);
      const res = await tts.synthesize(text, voiceName, speedVal);
      const outDir = path.resolve(process.cwd(), flags.outDir || 'out');
      fs.mkdirSync(outDir, { recursive: true });
      const safeVoice = voiceName.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
      const auditionPath = path.join(outDir, `say_${safeVoice}.wav`);
      fs.copyFileSync(res.file, auditionPath);

      console.log(`\n[BlobToon Say] Synthesized voice audition:`);
      console.log(`  - Voice:    ${voiceName}`);
      console.log(`  - Speed:    ${speedVal}x`);
      console.log(`  - Provider: ${res.provider} (cached: ${res.cached})`);
      console.log(`  - Duration: ${res.durationSec}s`);
      console.log(`  - WAV File: ${auditionPath}\n`);
      return;
    }

    case 'new': {
      const rawTitle = flags.positional.join(' ').trim();
      if (!rawTitle) {
        console.error('Usage: npm run new -- "<title>"');
        process.exitCode = 1;
        return;
      }
      const slug = slugifyTopic(rawTitle);
      const projectDir = path.resolve(process.cwd(), 'projects', slug);
      fs.mkdirSync(projectDir, { recursive: true });
      const scriptFile = path.join(projectDir, 'script.txt');
      const resolvedAspect =
        flags.aspect && flags.aspect !== 'all' ? flags.aspect : '9:16';
      const content = createStarterScriptTemplate(rawTitle, resolvedAspect);
      fs.writeFileSync(scriptFile, content, 'utf-8');
      console.log(`\n[BlobToon] Scaffolded new project script:`);
      console.log(`  - Path:     ${scriptFile}`);
      console.log(`  - Validate: npm run validate -- ${path.relative(process.cwd(), scriptFile)}`);
      console.log(`  - Render:   npm run make -- ${path.relative(process.cwd(), scriptFile)} --mock-tts\n`);
      return;
    }

    case 'validate': {
      const targetFile = flags.positional[0];
      if (!targetFile) {
        console.error('Usage: npm run validate -- <script.txt|script.json|timeline.json>');
        process.exitCode = 1;
        return;
      }
      try {
        const resolvedPath = path.resolve(process.cwd(), targetFile);
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`File not found: ${targetFile}`);
        }
        if (targetFile.endsWith('.txt')) {
          const script = loadScriptFromFile(targetFile);
          console.log(
            `[VALID] ${targetFile}: "${script.title}" (${script.scenes.length} scenes, aspect ${script.aspect})`
          );
          return;
        }
        const rawJson = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8')) as Record<
          string,
          unknown
        >;
        if (
          Array.isArray(rawJson.scenes) &&
          rawJson.scenes.length > 0 &&
          typeof (rawJson.scenes[0] as Record<string, unknown>).durationInFrames === 'number'
        ) {
          const timeline = parseTimelineStrict(rawJson, path.basename(resolvedPath));
          console.log(
            `[VALID] ${targetFile}: Timeline "${timeline.title}" (${timeline.scenes.length} scenes, ${timeline.totalDurationSec}s, aspect ${timeline.aspect})`
          );
        } else {
          const script = loadScriptFromFile(targetFile);
          console.log(
            `[VALID] ${targetFile}: Script "${script.title}" (${script.scenes.length} scenes, aspect ${script.aspect})`
          );
        }
      } catch (err) {
        console.error(
          `[INVALID] ${targetFile}: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exitCode = 1;
      }
      return;
    }

    case 'sfx:demo': {
      const outDir = path.resolve(process.cwd(), flags.outDir || 'out');
      fs.mkdirSync(outDir, { recursive: true });
      console.log(`[BlobToon] Rendering 11s SFX Demo Showcase to ${outDir}/sfx_demo.mp4 ...`);
      const demoTimeline = buildSfxDemoTimeline('9:16');
      const res = await renderTimelineToVideo(demoTimeline, {
        outDir,
        sfx: true,
        sfxVolume: 0.65,
        copyAudioToSubdir: false,
      });
      const sfxDemoPath = path.join(outDir, 'sfx_demo.mp4');
      fs.copyFileSync(res.videoPath, sfxDemoPath);
      const metrics = await probeMediaAudioMetrics(sfxDemoPath);
      console.log(`\n[BlobToon] SFX Demo Complete:`);
      console.log(`  - Video MP4:     ${sfxDemoPath}`);
      console.log(`  - Duration:      ${res.durationSec}s`);
      console.log(
        `  - Audio Stream:  codec=${metrics.audioCodec}, rms=${metrics.rms}, peak=${metrics.peak}, A/V diff=${metrics.durationDiffMs}ms\n`
      );
      return;
    }

    case 'preview': {
      const targetScript = flags.positional[0];
      if (targetScript) {
        const script = loadScriptFromFile(targetScript);
        console.log(
          `[BlobToon Preview] Validated ${targetScript} ("${script.title}", ${script.scenes.length} scenes). Launching Remotion Studio...`
        );
      }
      const res = spawnSync('npx', ['remotion', 'studio', 'src/render/index.ts'], {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      if (res.status !== 0) {
        process.exitCode = res.status ?? 1;
      }
      return;
    }

    case 'render': {
      const outDir = path.resolve(process.cwd(), flags.outDir || 'out');
      fs.mkdirSync(outDir, { recursive: true });

      if (flags.gallery) {
        const resolved = resolveAspectSelection(flags.aspect, '9:16');
        const baseTimeline = createGalleryTimeline(resolved.aspect);
        const timelineWithAudio = {
          ...baseTimeline,
          audio: {
            sfx: flags.sfx,
            sfxVolume: flags.sfxVolume,
            ...(flags.music ? { music: flags.music } : {}),
          },
        };
        if (resolved.mode === 'all') {
          console.log('[BlobToon] Rendering Gallery Showcase across ALL 4 aspect ratios...');
          const results = await renderTimelineAllAspects(timelineWithAudio, {
            outDir,
            maxDurationSec: flags.maxDurationSec,
            voiceProviderName: 'mock',
            sfx: flags.sfx,
            sfxVolume: flags.sfxVolume,
            musicPath: flags.music,
            draft: flags.draft,
            quality: flags.quality,
          });
          for (const r of results) {
            logRenderSummary(r, 'mock');
          }
        } else {
          console.log(
            `[BlobToon] Rendering Gallery Showcase (${resolved.aspect}: ${ASPECT_PRESETS[resolved.aspect].width}x${ASPECT_PRESETS[resolved.aspect].height})...`
          );
          const res = await renderTimelineToVideo(timelineWithAudio, {
            outDir,
            aspect: resolved.aspect,
            maxDurationSec: flags.maxDurationSec,
            voiceProviderName: 'mock',
            sfx: flags.sfx,
            sfxVolume: flags.sfxVolume,
            musicPath: flags.music,
            draft: flags.draft,
            quality: flags.quality,
          });
          logRenderSummary(res, 'mock');
        }
        return;
      }

      const inputFile = flags.positional[0] || path.join(outDir, 'timeline.json');
      const resolvedInput = path.resolve(process.cwd(), inputFile);
      if (!fs.existsSync(resolvedInput)) {
        throw new Error(`Input file not found: ${resolvedInput}`);
      }

      // Support `.script.txt` or `.script.json` directly in `npm run render`
      if (resolvedInput.endsWith('.txt') || resolvedInput.endsWith('.script.json')) {
        const script = loadScriptFromFile(resolvedInput);
        await renderLoadedScript(script, flags, outDir);
        return;
      }

      const rawJson = JSON.parse(fs.readFileSync(resolvedInput, 'utf-8')) as Record<
        string,
        unknown
      >;
      const isTimelineJson =
        Array.isArray(rawJson.scenes) &&
        rawJson.scenes.length > 0 &&
        typeof (rawJson.scenes[0] as Record<string, unknown>).durationInFrames === 'number';

      if (!isTimelineJson) {
        const script = loadScriptFromFile(resolvedInput);
        await renderLoadedScript(script, flags, outDir);
        return;
      }

      const parsedTimeline = parseTimelineStrict(rawJson, path.basename(resolvedInput));
      const resolved = resolveAspectSelection(flags.aspect, parsedTimeline.aspect);

      if (resolved.mode === 'all') {
        console.log(
          `[BlobToon] Rendering ${resolvedInput} across ALL 4 aspect ratios (${ALL_ASPECT_RATIOS.join(', ')})...`
        );
        const results = await renderTimelineAllAspects(parsedTimeline, {
          outDir,
          maxDurationSec: flags.maxDurationSec,
          sfx: flags.sfx,
          sfxVolume: flags.sfxVolume,
          musicPath: flags.music,
          draft: flags.draft,
          quality: flags.quality,
        });
        for (const r of results) {
          logRenderSummary(r, 'cached');
        }
      } else {
        const adapted = applyAspectToTimeline(parsedTimeline, resolved.aspect);
        console.log(
          `[BlobToon] Rendering ${resolvedInput} at ${resolved.aspect} (${adapted.width}x${adapted.height})...`
        );
        const res = await renderTimelineToVideo(adapted, {
          outDir,
          aspect: resolved.aspect,
          maxDurationSec: flags.maxDurationSec,
          sfx: flags.sfx,
          sfxVolume: flags.sfxVolume,
          musicPath: flags.music,
          draft: flags.draft,
          quality: flags.quality,
        });
        logRenderSummary(res, 'cached');
      }
      return;
    }

    case 'make': {
      const targetArg = flags.positional[0] || 'examples/demo.script.txt';
      const outDir = path.resolve(process.cwd(), flags.outDir || 'out');
      fs.mkdirSync(outDir, { recursive: true });

      const candidatePath = path.resolve(process.cwd(), targetArg);
      let script: Script;
      if (fs.existsSync(candidatePath)) {
        script = loadScriptFromFile(candidatePath);
      } else if (flags.mock) {
        const resolved = resolveAspectSelection(flags.aspect, '9:16');
        script = createPhase1ThreeSceneScript(resolved.aspect);
      } else {
        throw new Error(
          `Script file not found: '${targetArg}'. Pass a .script.txt or .script.json file (e.g. npm run make -- examples/demo.script.txt --mock-tts).`
        );
      }

      fs.writeFileSync(path.join(outDir, 'script.json'), JSON.stringify(script, null, 2));
      await renderLoadedScript(script, flags, outDir);
      return;
    }

    case 'batch': {
      const inputTarget = flags.positional[0] || 'examples';
      const scriptFiles = resolveScriptFilesInput(inputTarget);
      if (scriptFiles.length === 0) {
        throw new Error(
          `No script files (.script.txt or .script.json) found matching '${inputTarget}'.`
        );
      }

      const skillDef = resolveOptionalSkill(flags.skill);
      console.log(
        `[BlobToon Batch] Processing ${scriptFiles.length} script file(s) from ${inputTarget}${
          skillDef ? ` (skill: ${skillDef.name})` : ''
        }...`
      );

      for (let i = 0; i < scriptFiles.length; i++) {
        const file = scriptFiles[i];
        const variation = selectVariationForIndex(i);
        const script = loadScriptFromFile(file);
        const slug = `${String(i + 1).padStart(2, '0')}-${slugifyTopic(script.title)}`;
        const subDir = path.resolve(process.cwd(), flags.outDir || 'out', slug);
        fs.mkdirSync(subDir, { recursive: true });

        console.log(
          `\n[${i + 1}/${scriptFiles.length}] "${script.title}" (${path.relative(
            process.cwd(),
            file
          )}, Palette: ${variation.name})`
        );

        fs.writeFileSync(path.join(subDir, 'script.json'), JSON.stringify(script, null, 2));
        await renderLoadedScript(script, flags, subDir);
      }
      return;
    }

    default: {
      console.log(`
BlobToon CLI — Manual 2D Cartoon Renderer (Script In -> Video Out)

Commands:
  npm run new -- "<title>"                                             Scaffold projects/<slug>/script.txt from template
  npm run validate -- <script.txt|script.json>                         Parse & validate script (reports exact line numbers)
  npm run make -- <script.txt|script.json> [--aspect 9:16|16:9|4:3|3:4|all] [--voice X] [--mock-tts]
  npm run render -- <timeline.json|script.txt|script.json> [--mock-tts] [--aspect ...]
  npm run render -- --gallery [--aspect 9:16|16:9|4:3|3:4|all]         Render character & prop registry showcase
  npm run batch -- <folder or glob of scripts> [--mock-tts]            Batch render all scripts in folder/glob
  npm run voices                                                       List VoiceStudio voices or setup instructions
  npm run say -- "some text" --voice "Voice A" [--speed 1.0]           Synthesize & save a single line for auditioning
  npm run skills                                                       List all skills in skills/*.md
  npm run sfx:demo                                                     Render 10s showcase of all 11 procedural SFX
  npm run preview -- [script file]                                     Open Remotion Studio preview
  npm run doctor                                                       Verify Node, ffmpeg, ffprobe, VoiceStudio & fonts
      `);
    }
  }
}

export { buildDeterministicScript };

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  (process.argv[1].endsWith('src/cli/index.ts') || process.argv[1].endsWith('src\\cli\\index.ts'));

if (isDirectExecution) {
  runCli(process.argv).catch((err) => {
    console.error('[BlobToon CLI Error]:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
