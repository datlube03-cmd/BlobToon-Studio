import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { AspectRatio, AspectRatioSchema } from '../aspect';
import { generateScript } from '../script/generator';
import { generateTopicIdeas } from '../script/ideas';
import {
  PALETTE_VARIATIONS,
  computeTopicSeed,
  selectVariationBySeed,
  selectVariationForIndex,
} from '../script/variations';
import { createDefaultTtsProvider } from '../voice/provider';
import {
  applyAspectToTimeline,
  assembleTimelineFromDurations,
  buildTimeline,
} from '../timeline/builder';
import { parseTimelineStrict } from '../timeline/schema';
import {
  renderTimelineAllAspects,
  renderTimelineToVideo,
} from '../render/renderVideo';
import { createGalleryScript } from '../render/gallery';
import { Script, ScriptSchema } from '../script/schema';
import { buildSfxDemoTimeline, probeMediaAudioMetrics } from '../sfx/demo';
import {
  SkillDefinition,
  formatSkillsReport,
  listAvailableSkills,
  loadSkillByName,
} from '../skills/loader';
import { formatDoctorReport, runDoctorChecks } from './doctor';

export function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'topic'
  );
}

/**
 * Resolves the effective aspect ratio or `'all'` from a CLI `--aspect` flag vs file `aspect`.
 * The CLI flag always overrides the file's aspect when specified.
 */
export function resolveAspectSelection(
  flagAspect?: string | boolean,
  fileAspect?: AspectRatio
): { mode: 'single'; aspect: AspectRatio } | { mode: 'all'; aspect: AspectRatio } {
  if (typeof flagAspect === 'string') {
    const trimmed = flagAspect.trim().toLowerCase();
    if (trimmed === 'all') {
      return { mode: 'all', aspect: fileAspect ?? '9:16' };
    }
    const parsed = AspectRatioSchema.safeParse(trimmed);
    if (!parsed.success) {
      throw new Error(
        `Invalid --aspect value "${flagAspect}". Supported values: 9:16, 16:9, 4:3, 3:4, or all.`
      );
    }
    return { mode: 'single', aspect: parsed.data };
  }
  return { mode: 'single', aspect: fileAspect ?? '9:16' };
}

/**
 * Hardcoded 3-scene Phase 1 starter script for `npm run render` when no path is given.
 */
export function createPhase1ThreeSceneScript(aspect: AspectRatio = '9:16'): Script {
  return ScriptSchema.parse({
    aspect,
    topic: 'What if Mom started playing on your Roblox account',
    title: 'What if Mom played on your Roblox account?',
    hook: 'Every time you skip a chore, your Mom takes over your main account for an hour.',
    description: 'Phase 1 three-scene starter Short rendered with Remotion and MockProvider.',
    hashtags: ['#whatif', '#shorts', '#blobtoon'],
    scenes: [
      {
        id: 'scene_hook',
        label: 'THE RULE',
        narration:
          'Every time you ignore a chore, your Mom logs into your main gaming account for one full hour.',
        caption: 'Every time you ignore a chore, your Mom logs into your main account.',
        background: 'room',
        transition: 'zoom',
        characters: [
          {
            id: 'you',
            name: 'You',
            color: '#38bdf8',
            accessory: 'headphones',
            size: 1.0,
            x: 0.31,
            y: 0.62,
            emotion: 'shock',
            animation: 'scale-pop',
            speaking: true,
            flipX: false,
          },
          {
            id: 'mom',
            name: 'Mom',
            color: '#f472b6',
            accessory: 'glasses',
            size: 1.05,
            x: 0.69,
            y: 0.62,
            emotion: 'smug',
            animation: 'slide-in',
            speaking: false,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'prop_ctrl',
            type: 'controller',
            x: 0.5,
            y: 0.45,
            scale: 1.15,
            rotation: -10,
            animation: 'bounce',
            label: 'MOM ONLINE',
          },
        ],
        beats: [
          { atProgress: 0.2, targetId: 'you', emotion: 'shock', bubbleText: 'MY ACCOUNT?!' },
        ],
      },
      {
        id: 'scene_day1',
        label: 'DAY 1',
        narration:
          'On Day One, she mashes random buttons and somehow beats the hardest boss in the game.',
        caption: 'On Day One, she mashes random buttons and beats the hardest boss!',
        background: 'arcade',
        transition: 'wipe',
        characters: [
          {
            id: 'you',
            name: 'You',
            color: '#38bdf8',
            accessory: 'headphones',
            size: 0.98,
            x: 0.31,
            y: 0.62,
            emotion: 'happy',
            animation: 'bounce',
            speaking: false,
            flipX: false,
          },
          {
            id: 'mom',
            name: 'Mom',
            color: '#f472b6',
            accessory: 'crown',
            size: 1.08,
            x: 0.69,
            y: 0.62,
            emotion: 'laughing',
            animation: 'jump',
            speaking: true,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'prop_trophy',
            type: 'trophy',
            x: 0.5,
            y: 0.44,
            scale: 1.15,
            rotation: 6,
            animation: 'spin',
            label: 'BOSS DEFEATED',
          },
        ],
        beats: [
          { atProgress: 0.3, targetId: 'mom', emotion: 'laughing', bubbleText: 'TOO EASY!' },
        ],
      },
      {
        id: 'scene_day3',
        label: 'DAY 3',
        narration:
          'By Day Three, your friends vote her as the new clan leader and kick you out until you vacuum.',
        caption: 'By Day Three, your friends vote her as clan leader and kick you out!',
        background: 'kitchen',
        transition: 'slide',
        characters: [
          {
            id: 'you',
            name: 'You',
            color: '#38bdf8',
            accessory: 'hoodie',
            size: 0.96,
            x: 0.3,
            y: 0.62,
            emotion: 'sad',
            animation: 'shake',
            speaking: false,
            flipX: false,
          },
          {
            id: 'mom',
            name: 'Mom',
            color: '#f472b6',
            accessory: 'crown',
            size: 1.12,
            x: 0.7,
            y: 0.62,
            emotion: 'smug',
            animation: 'bounce',
            speaking: true,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'prop_door',
            type: 'door',
            x: 0.5,
            y: 0.45,
            scale: 1.08,
            rotation: 0,
            animation: 'scale-pop',
            label: 'GO VACUUM!',
          },
        ],
        beats: [
          { atProgress: 0.25, targetId: 'mom', emotion: 'smug', bubbleText: 'CHORES FIRST!' },
        ],
      },
    ],
  });
}

async function runCli() {
  const [command = 'help', ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);

  const baseOutDir =
    typeof flags.out === 'string' ? path.resolve(flags.out) : path.resolve(process.cwd(), 'out');
  const voice =
    typeof flags.voice === 'string' ? flags.voice : process.env.VOICESTUDIO_VOICE || 'alloy';
  const maxDurationSec =
    typeof flags.duration === 'string' ? parseFloat(flags.duration) : undefined;

  const sfxFlag: boolean | undefined = (() => {
    if (flags.sfx === undefined) return undefined;
    if (typeof flags.sfx === 'boolean') return flags.sfx;
    const val = String(flags.sfx).trim().toLowerCase();
    if (val === 'on' || val === 'true' || val === '1') return true;
    if (val === 'off' || val === 'false' || val === '0') return false;
    throw new Error(`Invalid --sfx value "${flags.sfx}". Expected --sfx on or --sfx off.`);
  })();

  const sfxVolumeFlag: number | undefined = (() => {
    const raw = flags['sfx-volume'];
    if (raw === undefined) return undefined;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0 || num > 1) {
      throw new Error(`Invalid --sfx-volume value "${raw}". Expected a number between 0 and 1.`);
    }
    return num;
  })();

  const musicPathFlag: string | undefined =
    typeof flags.music === 'string' && flags.music.trim()
      ? path.resolve(flags.music.trim())
      : undefined;

  const musicVolumeFlag: number | undefined = (() => {
    const raw = flags['music-volume'];
    if (raw === undefined) return undefined;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0 || num > 1) {
      throw new Error(`Invalid --music-volume value "${raw}". Expected a number between 0 and 1.`);
    }
    return num;
  })();

  const cliAudioOverrides = {
    ...(sfxFlag !== undefined ? { sfx: sfxFlag } : {}),
    ...(sfxVolumeFlag !== undefined ? { sfxVolume: sfxVolumeFlag } : {}),
    ...(musicPathFlag
      ? { music: { path: musicPathFlag, volume: musicVolumeFlag ?? 0.15 } }
      : {}),
  };

  const activeSkill: SkillDefinition | undefined = (() => {
    if (flags.skill === undefined) return undefined;
    if (typeof flags.skill !== 'string' || !flags.skill.trim()) {
      throw new Error(
        'Missing skill name after --skill flag. Example: npm run make -- "topic" --skill example-fastcut'
      );
    }
    return loadSkillByName(flags.skill);
  })();

  if (command === 'sfx:demo') {
    const aspectSel = resolveAspectSelection(flags.aspect, '9:16');
    const demoOutDir =
      typeof flags.out === 'string'
        ? path.resolve(flags.out)
        : path.join(baseOutDir, 'sfx-demo');
    fs.mkdirSync(demoOutDir, { recursive: true });
    console.log(
      `[BlobToon SFX Demo] Building 11-scene procedural SFX showcase (${aspectSel.aspect}) into ${demoOutDir}...`
    );
    const demoTimeline = buildSfxDemoTimeline(aspectSel.aspect);
    const res = await renderTimelineToVideo(demoTimeline, {
      outDir: demoOutDir,
      aspect: aspectSel.aspect,
      sfx: true,
      sfxVolume: sfxVolumeFlag ?? 0.65,
      musicPath: musicPathFlag,
      musicVolume: musicVolumeFlag,
      onProgress: (pct, stage) => console.log(`[BlobToon SFX Demo] ${pct}% - ${stage}`),
    });
    const probe = await probeMediaAudioMetrics(res.videoPath);
    console.log(`[BlobToon SFX Demo] Complete!`);
    console.log(`  MP4 Video    : ${res.videoPath} (${res.width}x${res.height}, ${res.durationSec}s)`);
    console.log(`  Thumbnail    : ${res.thumbnailPath}`);
    console.log(`  Audio Stream : ${probe.audioCodec} (RMS=${probe.rms}, peak=${probe.peak}, diff=${probe.durationDiffMs}ms)`);
    return;
  }

  if (command === 'skills') {
    const entries = listAvailableSkills();
    console.log(formatSkillsReport(entries));
    if (entries.some((e) => !e.valid)) {
      process.exit(1);
    }
    return;
  }

  if (command === 'doctor') {
    const { healthy, checks } = await runDoctorChecks();
    console.log(formatDoctorReport(checks, healthy));
    if (!healthy) process.exit(1);
    return;
  }

  if (command === 'ideas') {
    const niche = positional[0] || 'gaming & school rules';
    const count = typeof flags.count === 'string' ? parseInt(flags.count, 10) : 10;
    console.log(`[BlobToon Ideas] Generating ${count} ranked topic ideas for niche: "${niche}"...`);
    const { ideas, source } = await generateTopicIdeas(niche, count);
    fs.mkdirSync(baseOutDir, { recursive: true });
    const ideasPath = path.join(baseOutDir, 'ideas.json');
    fs.writeFileSync(ideasPath, JSON.stringify(ideas, null, 2), 'utf-8');

    console.log(`\nTop ${ideas.length} Topic Ideas (source=${source}):`);
    for (const item of ideas) {
      console.log(
        `  #${String(item.rank).padStart(2, '0')} [Hook ${item.hookScore}/100] ${item.topic}`
      );
      console.log(`      Why it hooks: ${item.reason}`);
    }
    console.log(`\nSaved ideas JSON to ${ideasPath}`);
    return;
  }

  if (command === 'script') {
    const topic = positional[0] || 'What if Mom started playing on your Roblox account';
    const aspectSel = resolveAspectSelection(flags.aspect, '9:16');
    console.log(
      `[BlobToon CLI] Generating script for topic: "${topic}" (aspect=${aspectSel.aspect}${
        activeSkill ? `, skill=${activeSkill.name}` : ''
      })...`
    );
    const { script, source, attempts } = await generateScript(topic, {
      aspect: aspectSel.aspect,
      skill: activeSkill,
    });
    const slugDir = path.join(baseOutDir, slugify(topic));
    fs.mkdirSync(slugDir, { recursive: true });
    const slugScriptPath = path.join(slugDir, 'script.json');
    const rootScriptPath = path.join(baseOutDir, 'script.json');
    fs.writeFileSync(slugScriptPath, JSON.stringify(script, null, 2), 'utf-8');
    fs.writeFileSync(rootScriptPath, JSON.stringify(script, null, 2), 'utf-8');
    console.log(
      `[BlobToon CLI] Script saved to ${slugScriptPath} (source=${source}, attempts=${attempts})`
    );
    return;
  }

  if (command === 'render') {
    const isGallery = Boolean(flags.gallery);
    const inputPath = positional[0];
    const tts = createDefaultTtsProvider();

    let timeline;
    let providerUsed = 'mock';

    if (isGallery) {
      console.log(
        '[BlobToon CLI] Building Phase 2 Gallery Timeline (all emotions, props, backgrounds)...'
      );
      const galleryScript = createGalleryScript('9:16');
      const built = await buildTimeline(galleryScript, tts, {
        voice,
        variation: PALETTE_VARIATIONS[0],
      });
      timeline = built.timeline;
      providerUsed = built.providerUsed;
    } else if (inputPath) {
      const resolved = path.resolve(inputPath);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Timeline file not found at path: ${resolved}`);
      }
      console.log(`[BlobToon CLI] Loading timeline from ${resolved}...`);
      const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
      timeline = parseTimelineStrict(raw);
    } else {
      console.log(
        '[BlobToon CLI] No timeline path provided; building default 3-scene starter timeline...'
      );
      const starterScript = createPhase1ThreeSceneScript('9:16');
      const built = await buildTimeline(starterScript, tts, {
        voice,
        variation: PALETTE_VARIATIONS[0],
      });
      timeline = built.timeline;
      providerUsed = built.providerUsed;
    }

    const aspectSel = resolveAspectSelection(flags.aspect, timeline.aspect);

    if (aspectSel.mode === 'all') {
      console.log(
        `[BlobToon Render] Rendering all 4 aspect ratios (9:16, 16:9, 4:3, 3:4) into ${baseOutDir}...`
      );
      const results = await renderTimelineAllAspects(timeline, {
        outDir: baseOutDir,
        sfx: sfxFlag,
        sfxVolume: sfxVolumeFlag,
        musicPath: musicPathFlag,
        musicVolume: musicVolumeFlag,
        maxDurationSec,
        voiceProviderName: providerUsed,
        onProgress: (pct, stage) => console.log(`[BlobToon Render] ${pct}% - ${stage}`),
      });
      console.log(`[BlobToon CLI] Rendered all ${results.length} aspect ratios:`);
      for (const r of results) {
        console.log(
          `  [${r.aspect}] ${r.videoPath} (${r.width}x${r.height}) | Thumbnail: ${r.thumbnailPath}`
        );
      }
      return;
    }

    timeline = applyAspectToTimeline(timeline, aspectSel.aspect);
    const result = await renderTimelineToVideo(timeline, {
      outDir: baseOutDir,
      aspect: aspectSel.aspect,
      sfx: sfxFlag,
      sfxVolume: sfxVolumeFlag,
      musicPath: musicPathFlag,
      musicVolume: musicVolumeFlag,
      maxDurationSec,
      voiceProviderName: providerUsed,
      onProgress: (pct, stage) => console.log(`[BlobToon Render] ${pct}% - ${stage}`),
    });

    console.log(`[BlobToon CLI] Render complete (${result.aspect})!`);
    console.log(
      `  MP4 Video : ${result.videoPath} (${result.width}x${result.height}, ${result.fps}fps, ${result.durationSec}s)`
    );
    console.log(`  Thumbnail : ${result.thumbnailPath}`);
    console.log(`  Metadata  : ${result.metaPath}`);
    console.log(`  Timeline  : ${result.timelinePath}`);
    return;
  }

  if (command === 'make') {
    const topic = positional[0] || 'What if Mom started playing on your Roblox account';
    const aspectSel = resolveAspectSelection(flags.aspect, '9:16');
    const slug = slugify(topic);
    const slugOutDir = path.join(baseOutDir, slug);
    fs.mkdirSync(slugOutDir, { recursive: true });

    const seed =
      typeof flags.seed === 'string' ? parseInt(flags.seed, 10) : computeTopicSeed(topic);
    const variation =
      typeof flags.variation === 'string'
        ? selectVariationForIndex(parseInt(flags.variation, 10))
        : selectVariationBySeed(seed);

    console.log(
      `[BlobToon Make] Starting pipeline for: "${topic}" (aspect=${
        aspectSel.mode === 'all' ? 'all' : aspectSel.aspect
      }, seed=${seed}${activeSkill ? `, skill=${activeSkill.name}` : ''})`
    );
    if (activeSkill) {
      console.log(
        `[BlobToon Skill] Loaded "${activeSkill.name}" from ${activeSkill.fileName} — Render Params: ${JSON.stringify(
          activeSkill.renderParams ?? {}
        )}`
      );
    }

    // Resumability: if script.json already exists in out/<slug>/ with matching skill and --force is not set, reuse it!
    const savedScriptPath = path.join(slugOutDir, 'script.json');
    let script: Script;
    let source = 'cached-script';

    let reusedCached = false;
    if (fs.existsSync(savedScriptPath) && !flags.force) {
      try {
        const cachedRaw = JSON.parse(fs.readFileSync(savedScriptPath, 'utf-8'));
        const parsedCached = ScriptSchema.parse(cachedRaw);
        if ((parsedCached.skill ?? undefined) === (activeSkill?.name ?? undefined)) {
          script = parsedCached;
          reusedCached = true;
          console.log(
            `[BlobToon Make] 1/4 Reusing existing script from ${savedScriptPath} (resumable run)`
          );
        } else {
          const gen = await generateScript(topic, {
            variation,
            aspect: aspectSel.aspect,
            skill: activeSkill,
          });
          script = gen.script;
          source = gen.source;
        }
      } catch {
        const gen = await generateScript(topic, {
          variation,
          aspect: aspectSel.aspect,
          skill: activeSkill,
        });
        script = gen.script;
        source = gen.source;
      }
    } else {
      const gen = await generateScript(topic, {
        variation,
        aspect: aspectSel.aspect,
        skill: activeSkill,
      });
      script = gen.script;
      source = gen.source;
    }

    if (!reusedCached) {
      fs.writeFileSync(savedScriptPath, JSON.stringify(script!, null, 2), 'utf-8');
    }
    fs.writeFileSync(path.join(baseOutDir, 'script.json'), JSON.stringify(script!, null, 2), 'utf-8');
    console.log(
      `[BlobToon Make] 1/4 Script ready (${source}, ${script!.scenes.length} scenes${
        activeSkill ? `, skill=${activeSkill.name}` : ''
      })`
    );

    const tts = createDefaultTtsProvider();
    const { timeline, providerUsed } = await buildTimeline(script!, tts, {
      aspect: aspectSel.aspect,
      seed,
      skill: activeSkill?.name,
      renderParams: activeSkill?.renderParams,
      audio: cliAudioOverrides,
      voice,
      variation,
    });
    console.log(
      `[BlobToon Make] 2/4 Voice & Timeline built (${providerUsed}, ${timeline.totalDurationSec}s, ${timeline.totalFrames} frames)`
    );

    if (aspectSel.mode === 'all') {
      const results = await renderTimelineAllAspects(timeline, {
        outDir: slugOutDir,
        sfx: sfxFlag,
        sfxVolume: sfxVolumeFlag,
        musicPath: musicPathFlag,
        musicVolume: musicVolumeFlag,
        maxDurationSec,
        voiceProviderName: providerUsed,
        onProgress: (pct, stage) => console.log(`[BlobToon Make] 3/4 ${pct}% - ${stage}`),
      });
      // Mirror primary outputs to baseOutDir as well
      for (const r of results) {
        fs.copyFileSync(r.videoPath, path.join(baseOutDir, path.basename(r.videoPath)));
      }
      fs.copyFileSync(results[0].videoPath, path.join(baseOutDir, 'video.mp4'));
      fs.copyFileSync(results[0].thumbnailPath, path.join(baseOutDir, 'thumbnail.png'));
      fs.copyFileSync(results[0].metaPath, path.join(baseOutDir, 'meta.json'));
      fs.copyFileSync(results[0].timelinePath, path.join(baseOutDir, 'timeline.json'));
      console.log(`[BlobToon Make] 4/4 Pipeline complete (all 4 aspect ratios) in ${slugOutDir}`);
      return;
    }

    const result = await renderTimelineToVideo(timeline, {
      outDir: slugOutDir,
      aspect: aspectSel.aspect,
      sfx: sfxFlag,
      sfxVolume: sfxVolumeFlag,
      musicPath: musicPathFlag,
      musicVolume: musicVolumeFlag,
      maxDurationSec,
      voiceProviderName: providerUsed,
      onProgress: (pct, stage) => console.log(`[BlobToon Make] 3/4 ${pct}% - ${stage}`),
    });

    // Also mirror to baseOutDir root so both `out/<slug>/*` and `out/video.mp4` exist
    if (path.resolve(slugOutDir) !== path.resolve(baseOutDir)) {
      fs.copyFileSync(result.videoPath, path.join(baseOutDir, 'video.mp4'));
      fs.copyFileSync(result.thumbnailPath, path.join(baseOutDir, 'thumbnail.png'));
      fs.copyFileSync(result.metaPath, path.join(baseOutDir, 'meta.json'));
      fs.copyFileSync(result.timelinePath, path.join(baseOutDir, 'timeline.json'));
    }

    console.log(`[BlobToon Make] 4/4 Pipeline complete!`);
    console.log(`  Folder    : ${slugOutDir}`);
    console.log(`  MP4 Video : ${result.videoPath} (${result.width}x${result.height})`);
    console.log(`  Thumbnail : ${result.thumbnailPath}`);
    console.log(`  Audio Dir : ${result.audioDir}`);
    console.log(`  Metadata  : ${result.metaPath}`);
    return;
  }

  if (command === 'batch') {
    const topicsFile = positional[0] || 'topics.txt';
    const resolvedTopicsPath = path.resolve(topicsFile);
    if (!fs.existsSync(resolvedTopicsPath)) {
      throw new Error(`Topics file not found: ${resolvedTopicsPath}`);
    }

    const lines = fs
      .readFileSync(resolvedTopicsPath, 'utf-8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    const aspectSel = resolveAspectSelection(flags.aspect, '9:16');
    console.log(
      `[BlobToon Batch] Processing ${lines.length} topics from ${resolvedTopicsPath} (aspect=${
        aspectSel.mode === 'all' ? 'all' : aspectSel.aspect
      })...`
    );
    const tts = createDefaultTtsProvider();
    const batchSummary: Array<{
      index: number;
      topic: string;
      aspect: string;
      seed: number;
      variation: string;
      outDir: string;
      videoPath: string;
      thumbnailPath: string;
      durationSec: number;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const topic = lines[i];
      const seed = computeTopicSeed(topic, i);
      const variation = selectVariationForIndex(i);
      const itemOutDir = path.join(baseOutDir, slugify(topic));
      fs.mkdirSync(itemOutDir, { recursive: true });

      console.log(
        `\n[BlobToon Batch] (${i + 1}/${lines.length}) Topic: "${topic}" | Palette: ${variation.name} | Seed: ${seed}`
      );

      const savedScriptPath = path.join(itemOutDir, 'script.json');
      let script: Script;
      if (fs.existsSync(savedScriptPath) && !flags.force) {
        script = ScriptSchema.parse(JSON.parse(fs.readFileSync(savedScriptPath, 'utf-8')));
      } else {
        const gen = await generateScript(topic, { variation, aspect: aspectSel.aspect });
        script = gen.script;
        fs.writeFileSync(savedScriptPath, JSON.stringify(script, null, 2), 'utf-8');
      }

      const { timeline, providerUsed } = await buildTimeline(script, tts, {
        aspect: aspectSel.aspect,
        seed,
        skill: activeSkill?.name,
        renderParams: activeSkill?.renderParams,
        audio: cliAudioOverrides,
        voice,
        variation,
      });

      if (aspectSel.mode === 'all') {
        const allRes = await renderTimelineAllAspects(timeline, {
          outDir: itemOutDir,
          sfx: sfxFlag,
          sfxVolume: sfxVolumeFlag,
          musicPath: musicPathFlag,
          musicVolume: musicVolumeFlag,
          maxDurationSec,
          voiceProviderName: providerUsed,
        });
        batchSummary.push({
          index: i + 1,
          topic,
          aspect: 'all',
          seed,
          variation: variation.name,
          outDir: itemOutDir,
          videoPath: allRes[0].videoPath,
          thumbnailPath: allRes[0].thumbnailPath,
          durationSec: allRes[0].durationSec,
        });
      } else {
        const res = await renderTimelineToVideo(timeline, {
          outDir: itemOutDir,
          aspect: aspectSel.aspect,
          sfx: sfxFlag,
          sfxVolume: sfxVolumeFlag,
          musicPath: musicPathFlag,
          musicVolume: musicVolumeFlag,
          maxDurationSec,
          voiceProviderName: providerUsed,
        });
        batchSummary.push({
          index: i + 1,
          topic,
          aspect: aspectSel.aspect,
          seed,
          variation: variation.name,
          outDir: itemOutDir,
          videoPath: res.videoPath,
          thumbnailPath: res.thumbnailPath,
          durationSec: res.durationSec,
        });
      }
    }

    fs.mkdirSync(baseOutDir, { recursive: true });
    const summaryPath = path.join(baseOutDir, 'batch-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(batchSummary, null, 2), 'utf-8');
    console.log(
      `\n[BlobToon Batch] Completed ${batchSummary.length} videos! Summary saved to ${summaryPath}`
    );
    return;
  }

  console.log(`BlobToon CLI
Usage:
  npm run make -- "topic" [--skill <name>] [--aspect 9:16|16:9|4:3|3:4|all] [--sfx on|off] [--sfx-volume 0.35] [--music <file>] [--music-volume 0.15]
  npm run skills
  npm run sfx:demo
  npm run script -- "topic" [--skill <name>] [--aspect 9:16|16:9|4:3|3:4] [--out out/]
  npm run render -- [path/to/timeline.json] [--gallery] [--aspect 9:16|16:9|4:3|3:4|all] [--sfx on|off] [--sfx-volume 0.35] [--music <file>]
  npm run batch -- topics.txt [--skill <name>] [--aspect 9:16|16:9|4:3|3:4|all] [--sfx on|off] [--sfx-volume 0.35]
  npm run ideas -- "niche" [--count 10]
  npm run doctor
  npm run preview`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err) => {
    console.error('[BlobToon CLI Error]', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

export { assembleTimelineFromDurations };
