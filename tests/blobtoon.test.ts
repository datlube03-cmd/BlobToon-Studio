import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ALL_ASPECT_RATIOS,
  ASPECT_PRESETS,
  computeStageLayout,
  verifyBoxesInsideSafeArea,
} from '../src/aspect';
import {
  ScriptSchema,
  countSpokenWords,
  estimateScriptDurationSec,
} from '../src/script/schema';
import {
  buildDeterministicScript,
  generateScript,
  validateScriptConstraints,
} from '../src/script/generator';
import {
  PALETTE_VARIATIONS,
  selectVariationForIndex,
} from '../src/script/variations';
import {
  applyAspectToTimeline,
  assembleTimelineFromDurations,
  buildTimeline,
  computeWordTimings,
} from '../src/timeline/builder';
import { parseTimelineStrict } from '../src/timeline/schema';
import {
  MockProvider,
  VoiceStudioProvider,
  probeAudioDurationSec,
} from '../src/voice/provider';
import { collectSceneBoundingBoxes } from '../src/scenes/SceneStage';
import { createGalleryTimeline } from '../src/render/gallery';
import { renderFrameSvgMarkup, renderTimelineToVideo } from '../src/render/renderVideo';
import { createPhase1ThreeSceneScript, resolveAspectSelection } from '../src/cli/index';

test('1. Zod schemas validate valid scripts and reject malformed character colors or emotions', () => {
  const validScript = buildDeterministicScript('What if Mom started playing on your Roblox account');
  const parsed = ScriptSchema.safeParse(validScript);
  assert.equal(parsed.success, true, 'Deterministic script should pass ScriptSchema');

  const broken = JSON.parse(JSON.stringify(validScript));
  broken.scenes[0].characters[0].color = 'not-a-hex';
  broken.scenes[0].characters[0].emotion = 'confused-invalid';
  const failed = ScriptSchema.safeParse(broken);
  assert.equal(failed.success, false, 'Malformed color and emotion must be rejected by Zod');
});

test('2. Timeline math computes contiguous frame ranges, scene padding, and monotonic word timestamps', () => {
  const script = createPhase1ThreeSceneScript();
  const durations = [
    { file: 's1.wav', durationSec: 3.55 },
    { file: 's2.wav', durationSec: 4.05 },
    { file: 's3.wav', durationSec: 5.05 },
  ];

  const timeline = assembleTimelineFromDurations(script, durations, {
    fps: 30,
    scenePaddingSec: 0.45,
  });

  assert.equal(timeline.fps, 30);
  assert.equal(timeline.width, 1080);
  assert.equal(timeline.height, 1920);
  assert.equal(timeline.scenes.length, 3);

  assert.equal(timeline.scenes[0].startFrame, 0);
  assert.equal(timeline.scenes[0].durationInFrames, 120);
  assert.equal(timeline.scenes[0].endFrame, 120);

  assert.equal(timeline.scenes[1].startFrame, 120);
  assert.equal(timeline.scenes[1].durationInFrames, 135);
  assert.equal(timeline.scenes[1].endFrame, 255);

  assert.equal(timeline.scenes[2].startFrame, 255);
  assert.equal(timeline.scenes[2].durationInFrames, 165);
  assert.equal(timeline.scenes[2].endFrame, 420);

  assert.equal(timeline.totalFrames, 420);
  assert.equal(timeline.totalDurationSec, 14);

  const words = computeWordTimings('Every hour you skip chores, Mom plays.', 3.5, 30);
  assert.equal(words.length, 7);
  for (let i = 0; i < words.length; i++) {
    assert.ok(words[i].endFrame > words[i].startFrame);
    if (i > 0) {
      assert.ok(words[i].startSec >= words[i - 1].startSec);
    }
  }
});

test('3. Five different topics produce schema-valid scripts of 40-50s estimated length (90-130 words)', () => {
  const topics = [
    'What if Mom started playing on your Roblox account',
    'What if every uncompleted homework assignment shrank your room by 10%',
    'What if your little sibling got a remote control that paused you in real life',
    'What if every minute past bedtime cost 100 of your in-game coins',
    'What if the school dentist graded your teeth like a boss battle',
  ];

  for (let i = 0; i < topics.length; i++) {
    const variation = selectVariationForIndex(i);
    const script = buildDeterministicScript(topics[i], variation);
    const parsed = ScriptSchema.parse(script);
    const check = validateScriptConstraints(parsed);
    const words = countSpokenWords(parsed);
    const estSec = estimateScriptDurationSec(parsed);

    assert.equal(check.valid, true, `Topic "${topics[i]}" failed validation: ${check.errors.join(', ')}`);
    assert.ok(words >= 90 && words <= 130, `Expected 90-130 words, got ${words} for "${topics[i]}"`);
    assert.ok(estSec >= 38 && estSec <= 52, `Expected ~40-50s duration, got ${estSec}s for "${topics[i]}"`);
  }
});

test('4. Script generator retries with Zod validation error feedback when LLM output is malformed', async () => {
  const validTarget = buildDeterministicScript('What if homework gave you XP');
  let callCount = 0;
  let secondPromptContent = '';

  const result = await generateScript('What if homework gave you XP', {
    maxRetries: 2,
    llmComplete: async (messages) => {
      callCount++;
      if (callCount === 1) {
        return JSON.stringify({ title: 'Broken', scenes: [] });
      }
      secondPromptContent = messages[messages.length - 1].content;
      return JSON.stringify(validTarget);
    },
  });

  assert.equal(callCount, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.source, 'anthropic');
  assert.ok(
    secondPromptContent.includes('Zod Schema Validation Failed'),
    'Validation error must be fed back to the LLM on retry'
  );
});

test('5. VoiceStudioProvider handles 429 Retry-After, 503 backoff, caching, and offline fallback', async () => {
  const tempCache = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-tts-test-'));
  try {
    const mock = new MockProvider({ cacheDir: tempCache });
    const sample = await mock.synthesize('Testing one two three four five.');
    const validWavBytes = fs.readFileSync(sample.file);

    let fetchCalls = 0;
    const sleepLog: number[] = [];

    const vsProvider = new VoiceStudioProvider({
      baseUrl: 'http://127.0.0.1:3900',
      apiKey: 'test-key',
      cacheDir: tempCache,
      fallbackToMock: false,
      sleepImpl: async (ms) => {
        sleepLog.push(ms);
      },
      fetchImpl: async () => {
        fetchCalls++;
        if (fetchCalls === 1) {
          return new Response(JSON.stringify({ detail: 'pool busy' }), {
            status: 429,
            headers: { 'Retry-After': '1', 'X-VoiceStudio-Retryable': 'true' },
          });
        }
        if (fetchCalls === 2) {
          return new Response(JSON.stringify({ detail: 'warming up' }), {
            status: 503,
            headers: { 'X-VoiceStudio-Retryable': 'true' },
          });
        }
        return new Response(validWavBytes, {
          status: 200,
          headers: { 'Content-Type': 'audio/wav' },
        });
      },
    });

    const firstSynth = await vsProvider.synthesize('Hello from VoiceStudio test!', 'alloy');
    assert.equal(fetchCalls, 3, 'Should retry after 429 and 503 then succeed on 3rd attempt');
    assert.equal(sleepLog[0], 1000, 'Should respect Retry-After: 1 header (1000ms)');
    assert.equal(firstSynth.cached, false);
    assert.equal(firstSynth.provider, 'voicestudio');
    assert.ok(firstSynth.durationSec > 1.0);

    const secondSynth = await vsProvider.synthesize('Hello from VoiceStudio test!', 'alloy');
    assert.equal(fetchCalls, 3, 'Cached synthesis must not trigger another HTTP request');
    assert.equal(secondSynth.cached, true);

    const offlineProvider = new VoiceStudioProvider({
      baseUrl: 'http://127.0.0.1:59999',
      cacheDir: tempCache,
      fallbackToMock: true,
    });
    const fallbackRes = await offlineProvider.synthesize('Offline fallback test sentence.');
    assert.equal(fallbackRes.provider, 'mock');
    assert.ok(fs.existsSync(fallbackRes.file));
  } finally {
    fs.rmSync(tempCache, { recursive: true, force: true });
  }
});

test('6. Smoke test: renders 1 second of 1080x1920 30fps MP4 + Thumbnail PNG + Meta JSON with MockProvider', async () => {
  const tempOut = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-smoke-out-'));
  try {
    const script = createPhase1ThreeSceneScript();
    const mock = new MockProvider({ cacheDir: tempOut });
    const { timeline } = await buildTimeline(script, mock, {
      variation: PALETTE_VARIATIONS[0],
    });

    const res = await renderTimelineToVideo(timeline, {
      outDir: tempOut,
      maxDurationSec: 1.0,
      voiceProviderName: 'mock',
    });

    assert.ok(fs.existsSync(res.videoPath), 'Rendered MP4 file must exist');
    assert.ok(fs.statSync(res.videoPath).size > 2000, 'Rendered MP4 must be non-empty');
    assert.ok(fs.existsSync(res.thumbnailPath), 'Rendered thumbnail PNG must exist');
    assert.ok(fs.statSync(res.thumbnailPath).size > 2000, 'Thumbnail PNG must be non-empty');
    assert.ok(fs.existsSync(res.metaPath), 'meta.json must exist');
    assert.ok(fs.existsSync(res.timelinePath), 'timeline.json must exist');

    const probedDur = await probeAudioDurationSec(res.videoPath);
    assert.ok(probedDur >= 0.8 && probedDur <= 1.5, `Expected ~1.0s MP4 duration, got ${probedDur}s`);
  } finally {
    fs.rmSync(tempOut, { recursive: true, force: true });
  }
});

test('7. Aspect layout function (computeStageLayout) & --aspect CLI override', () => {
  // Verify --aspect CLI flag overrides file aspect
  assert.deepEqual(resolveAspectSelection('16:9', '9:16'), { mode: 'single', aspect: '16:9' });
  assert.deepEqual(resolveAspectSelection('all', '9:16'), { mode: 'all', aspect: '9:16' });
  assert.deepEqual(resolveAspectSelection(undefined, '4:3'), { mode: 'single', aspect: '4:3' });
  assert.deepEqual(resolveAspectSelection(undefined, undefined), { mode: 'single', aspect: '9:16' });

  // Verify unit = min(width, height) across all 4 aspect ratios
  for (const ratio of ALL_ASPECT_RATIOS) {
    const preset = ASPECT_PRESETS[ratio];
    const layout = computeStageLayout(
      ratio,
      [
        { id: 'c1', name: 'You', x: 0.3, y: 0.62, size: 1.0 },
        { id: 'c2', name: 'Mom', x: 0.7, y: 0.62, size: 1.05 },
      ],
      []
    );
    assert.equal(layout.unit, Math.min(preset.width, preset.height));
    assert.equal(layout.width, preset.width);
    assert.equal(layout.height, preset.height);
    assert.equal(layout.characters.size, 2);

    const c1 = layout.characters.get('c1')!;
    const c2 = layout.characters.get('c2')!;
    assert.ok(c1.x < c2.x);
    assert.ok(c1.x >= layout.safeArea.left && c1.x <= layout.safeArea.right);
    assert.ok(c2.x >= layout.safeArea.left && c2.x <= layout.safeArea.right);
  }

  // Verify per-scene layoutOverrides are honored
  const overridden = computeStageLayout(
    '16:9',
    [{ id: 'hero', name: 'Hero', x: 0.3, y: 0.62, size: 1.0 }],
    [],
    { characters: [{ id: 'hero', x: 0.5, size: 1.2 }] }
  );
  const hero = overridden.characters.get('hero')!;
  assert.equal(hero.x, Math.round(0.5 * 1920));

  // Verify invalid timeline JSON reports exact field path
  assert.throws(
    () => parseTimelineStrict({ aspect: '9:16', scenes: [{ id: 123 }] }, 'broken.json'),
    /scenes\.0\.id/
  );
});

test('8. Renders a 1-second still/clip for every aspect preset (9:16, 16:9, 4:3, 3:4) and verifies zero text boxes leave safe area', async () => {
  const tempOut = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-aspect-stills-'));
  try {
    const galleryTimeline = createGalleryTimeline('9:16');

    for (const ratio of ALL_ASPECT_RATIOS) {
      const adapted = applyAspectToTimeline(galleryTimeline, ratio);
      const preset = ASPECT_PRESETS[ratio];

      // Check every scene's text boxes (badge, caption, speech bubble, character nameplates, prop labels)
      for (const scene of adapted.scenes) {
        const testFrame = Math.floor(scene.durationInFrames * 0.25);
        const { safeArea, boxes } = collectSceneBoundingBoxes(scene, ratio, testFrame);
        assert.ok(boxes.length >= 2, `Expected text boxes in scene ${scene.id} (${ratio})`);
        const check = verifyBoxesInsideSafeArea(boxes, safeArea, 2);
        assert.equal(
          check.ok,
          true,
          `Safe-area violation in ${ratio} (${scene.id}): ${check.violations.join('; ')}`
        );
      }

      // Render a 1-second clip + thumbnail still for this aspect preset and verify dimensions
      const svgMarkup = renderFrameSvgMarkup(adapted, 15, false, ratio);
      assert.ok(
        svgMarkup.includes(`viewBox="0 0 ${preset.width} ${preset.height}"`),
        `SVG viewBox for ${ratio} must match ${preset.width}x${preset.height}`
      );

      const res = await renderTimelineToVideo(adapted, {
        outDir: path.join(tempOut, preset.fileSuffix),
        aspect: ratio,
        maxDurationSec: 1.0,
        voiceProviderName: 'mock',
        copyAudioToSubdir: false,
      });

      assert.equal(res.width, preset.width);
      assert.equal(res.height, preset.height);
      assert.ok(fs.existsSync(res.videoPath), `Video for ${ratio} must exist`);
      assert.ok(fs.existsSync(res.thumbnailPath), `Thumbnail PNG for ${ratio} must exist`);
    }
  } finally {
    fs.rmSync(tempOut, { recursive: true, force: true });
  }
});

test('9. Skills mechanism loads skills/example-fastcut.md, appends Style Rules at runtime, merges Render Params into timeline, and validates malformed skills', async () => {
  const {
    loadSkillByName,
    parseSkillMarkdown,
    listAvailableSkills,
  } = await import('../src/skills/loader');
  const { getScriptSystemPrompt } = await import('../src/script/generator');

  const entries = listAvailableSkills();
  assert.ok(entries.length >= 1, 'Should discover at least example-fastcut.md in skills/');
  const fastcut = loadSkillByName('example-fastcut');
  assert.equal(fastcut.name, 'example-fastcut');
  assert.deepEqual(fastcut.renderParams, {
    sceneDurationRange: [1.5, 2.5],
    cameraShake: 'medium',
    zoomPunchOnPunchline: true,
    captionStyle: 'bold-pop',
    transitionType: 'hard-cut',
  });

  // Verify Style Rules are appended at runtime without modifying prompts/script_system.md on disk
  const basePromptOnDisk = fs.readFileSync(
    path.resolve(process.cwd(), 'prompts/script_system.md'),
    'utf-8'
  );
  const runtimePromptWithSkill = getScriptSystemPrompt(fastcut);
  assert.ok(
    runtimePromptWithSkill.includes(fastcut.styleRules),
    'Runtime system prompt must include skill Style Rules'
  );
  assert.equal(
    fs.readFileSync(path.resolve(process.cwd(), 'prompts/script_system.md'), 'utf-8'),
    basePromptOnDisk,
    'prompts/script_system.md on disk must not be modified'
  );

  // Verify Render Params merge into timeline.json and override scene durations & transitions
  const scriptWithSkill = buildDeterministicScript(
    'What if Mom started playing on your Roblox account',
    PALETTE_VARIATIONS[0],
    '16:9',
    fastcut
  );
  const timelineWithSkill = assembleTimelineFromDurations(
    scriptWithSkill,
    scriptWithSkill.scenes.map(() => ({ durationSec: 8.5 })),
    {
      aspect: '16:9',
      skill: fastcut.name,
      renderParams: fastcut.renderParams,
    }
  );

  assert.equal(timelineWithSkill.skill, 'example-fastcut');
  assert.deepEqual(timelineWithSkill.renderParams, fastcut.renderParams);
  for (const scene of timelineWithSkill.scenes) {
    assert.ok(
      scene.durationSec >= 1.5 && scene.durationSec <= 2.5,
      `Expected scene duration in [1.5, 2.5]s, got ${scene.durationSec}s`
    );
    assert.equal(scene.transition, 'hard-cut');
  }

  // Verify SVG stage markup applies data-transition="hard-cut", data-camera-shake="medium", data-caption-style="bold-pop"
  const svgMarkup = renderFrameSvgMarkup(timelineWithSkill, 10, false, '16:9');
  assert.ok(svgMarkup.includes('data-transition="hard-cut"'));
  assert.ok(svgMarkup.includes('data-camera-shake="medium"'));
  assert.ok(svgMarkup.includes('data-caption-style="bold-pop"'));

  // Verify clear validation error with file name when required fields are missing or JSON is malformed
  assert.throws(
    () => parseSkillMarkdown('## name: broken\nNo description or style rules', 'broken-missing.md'),
    /broken-missing\.md.*Missing required field "description:"/
  );
  assert.throws(
    () =>
      parseSkillMarkdown(
        '## name: bad-json\ndescription: test\n## Style Rules\nFast\n## Render Params\n```json\n{ "cameraShake": "medium", INVALID }\n```',
        'bad-json.md'
      ),
    /bad-json\.md.*Syntax error in "Render Params" JSON/
  );
});
