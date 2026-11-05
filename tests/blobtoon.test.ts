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
  SFX_NAMES,
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
  resolveVariationWithColorPalette,
} from '../src/timeline/builder';
import { parseTimelineStrict } from '../src/timeline/schema';
import {
  MockProvider,
  VoiceStudioProvider,
  probeAudioDurationSec,
} from '../src/voice/provider';
import { collectSceneBoundingBoxes } from '../src/scenes/SceneStage';
import {
  computeCaptionLayout,
  diagnoseCaptionAcrossAspects,
} from '../src/characters/Caption';
import { createGalleryTimeline } from '../src/render/gallery';
import { renderFrameSvgMarkup, renderTimelineToVideo } from '../src/render/renderVideo';
import { createPhase1ThreeSceneScript, resolveAspectSelection } from '../src/cli/index';
import {
  SFX_REGISTRY,
  SFX_SAMPLE_RATE,
  synthesizeSfx,
} from '../src/sfx/synth';
import {
  collectSfxEvents,
  computeMaxSimultaneousSfx,
} from '../src/sfx/events';
import {
  buildSfxDemoTimeline,
  probeMediaAudioMetrics,
} from '../src/sfx/demo';
import {
  BUNDLED_FONT_FAMILY,
  BUNDLED_FONT_FILE_PATH,
  BUNDLED_FONT_LICENSE_PATH,
  resolveBundledFontFamily,
} from '../src/fonts/bundledFont';

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

test('2. Timeline math computes contiguous frame ranges, scene padding, TTS speed multiplier, and monotonic word timestamps', () => {
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

  // Verify ttsSpeedMultiplier scales voice duration and recomputes word timings
  const fasterTimeline = assembleTimelineFromDurations(script, durations, {
    fps: 30,
    scenePaddingSec: 0.45,
    renderParams: { ttsSpeedMultiplier: 1.25 },
  });
  assert.ok(
    fasterTimeline.scenes[0].voiceDurationSec < timeline.scenes[0].voiceDurationSec,
    'ttsSpeedMultiplier > 1 must shorten scene voiceDurationSec'
  );

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
  assert.deepEqual(resolveAspectSelection('16:9', '9:16'), { mode: 'single', aspect: '16:9' });
  assert.deepEqual(resolveAspectSelection('all', '9:16'), { mode: 'all', aspect: '9:16' });
  assert.deepEqual(resolveAspectSelection(undefined, '4:3'), { mode: 'single', aspect: '4:3' });
  assert.deepEqual(resolveAspectSelection(undefined, undefined), { mode: 'single', aspect: '9:16' });

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

  const overridden = computeStageLayout(
    '16:9',
    [{ id: 'hero', name: 'Hero', x: 0.3, y: 0.62, size: 1.0 }],
    [],
    { characters: [{ id: 'hero', x: 0.5, size: 1.2 }] }
  );
  const hero = overridden.characters.get('hero')!;
  assert.equal(hero.x, Math.round(0.5 * 1920));

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

test('9. Skills mechanism loads example-fastcut.md and example-darkmode.md, applies Audio/TTS & Visual params, and validates malformed skills', async () => {
  const {
    loadSkillByName,
    parseSkillMarkdown,
    listAvailableSkills,
  } = await import('../src/skills/loader');
  const { getScriptSystemPrompt } = await import('../src/script/generator');

  const entries = listAvailableSkills();
  assert.ok(entries.length >= 2, 'Should discover example-fastcut.md and example-darkmode.md in skills/');
  const fastcut = loadSkillByName('example-fastcut');
  assert.equal(fastcut.name, 'example-fastcut');
  assert.deepEqual(fastcut.renderParams, {
    sceneDurationRange: [1.5, 2.5],
    cameraShake: 'medium',
    zoomPunchOnPunchline: true,
    captionStyle: 'bold-pop',
    transitionType: 'hard-cut',
    bgmGenre: 'arcade-rush',
    sfxIntensity: 'high',
    ttsSpeedMultiplier: 1.25,
  });

  const darkmode = loadSkillByName('example-darkmode');
  assert.equal(darkmode.name, 'example-darkmode');
  assert.equal(darkmode.renderParams?.captionStyle, 'neon-glow');
  assert.equal(darkmode.renderParams?.bgmGenre, 'cyber-synth');
  assert.ok(Array.isArray(darkmode.renderParams?.colorPalette));
  assert.ok((darkmode.renderParams?.colorPalette?.length ?? 0) >= 5);
  assert.ok(darkmode.renderParams?.fontFamily?.includes('Space Grotesk'));

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

  // Verify Render Params merge into timeline.json and override scene durations, transitions, colorPalette, and fontFamily
  const darkVariation = resolveVariationWithColorPalette(
    PALETTE_VARIATIONS[0],
    darkmode.renderParams?.colorPalette
  );
  assert.equal(darkVariation.skyTop, '#060714');

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

  const svgMarkup = renderFrameSvgMarkup(timelineWithSkill, 10, false, '16:9');
  assert.ok(svgMarkup.includes('data-transition="hard-cut"'));
  assert.ok(svgMarkup.includes('data-camera-shake="medium"'));
  assert.ok(svgMarkup.includes('data-caption-style="bold-pop"'));

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

test('10. Change G: Bundled OFL font (Fredoka-Bold.ttf + opentype.js), fontFamily fallback, and caption spacing across all 4 aspect ratios', () => {
  // Verify bundled OFL font file and OFL.txt license exist in repo, and CHAR_WIDTH_FACTORS is removed
  assert.ok(
    fs.existsSync(path.resolve(process.cwd(), BUNDLED_FONT_FILE_PATH)),
    'Bundled OFL font file assets/fonts/Fredoka-Bold.ttf must exist'
  );
  assert.ok(
    fs.existsSync(path.resolve(process.cwd(), BUNDLED_FONT_LICENSE_PATH)),
    'Bundled OFL license assets/fonts/OFL.txt must exist'
  );
  const aspectSource = fs.readFileSync(path.resolve(process.cwd(), 'src/aspect.ts'), 'utf-8');
  assert.equal(
    aspectSource.includes('CHAR_WIDTH_FACTORS'),
    false,
    'CHAR_WIDTH_FACTORS must be removed from src/aspect.ts'
  );

  // Verify fontFamily skill param falls back to bundled font ('Fredoka') when not bundled
  assert.equal(resolveBundledFontFamily(undefined), BUNDLED_FONT_FAMILY);
  assert.equal(resolveBundledFontFamily("'Space Grotesk', sans-serif"), BUNDLED_FONT_FAMILY);
  assert.equal(resolveBundledFontFamily('UnbundledCustomFont'), BUNDLED_FONT_FAMILY);
  assert.equal(resolveBundledFontFamily('Fredoka'), BUNDLED_FONT_FAMILY);

  const testSentence =
    'What if Mom started playing on your Roblox account every time you skipped chores?';
  const diagnostics = diagnoseCaptionAcrossAspects(testSentence, "'Space Grotesk', sans-serif");

  assert.equal(diagnostics.length, 4);
  const baseWordGapRatio = diagnostics[0].wordGap / diagnostics[0].fontSize;
  const baseLineHeightRatio = diagnostics[0].lineHeight / diagnostics[0].fontSize;

  for (const diag of diagnostics) {
    assert.equal(diag.resolvedFontFamily, BUNDLED_FONT_FAMILY);
    const wordGapRatio = diag.wordGap / diag.fontSize;
    const lineHeightRatio = diag.lineHeight / diag.fontSize;

    // 1. wordGap / fontSize and lineHeight / fontSize match across all 4 ratios within 2% tolerance
    assert.ok(
      Math.abs(wordGapRatio - baseWordGapRatio) / baseWordGapRatio <= 0.02,
      `wordGap/fontSize mismatch in ${diag.aspect}: ${wordGapRatio} vs ${baseWordGapRatio}`
    );
    assert.ok(
      Math.abs(lineHeightRatio - baseLineHeightRatio) / baseLineHeightRatio <= 0.02,
      `lineHeight/fontSize mismatch in ${diag.aspect}: ${lineHeightRatio} vs ${baseLineHeightRatio}`
    );
    assert.ok(
      Math.abs(wordGapRatio - 0.28) <= 0.01,
      `Expected wordGap/fontSize ~0.28 in ${diag.aspect}, got ${wordGapRatio}`
    );
    assert.ok(
      Math.abs(lineHeightRatio - 1.18) <= 0.01,
      `Expected lineHeight/fontSize ~1.18 in ${diag.aspect}, got ${lineHeightRatio}`
    );
    assert.equal(diag.letterSpacing, 0);

    // 2. captionBoxWidth <= maxWidth for every ratio
    assert.ok(
      diag.captionBoxWidth <= diag.maxWidth,
      `captionBoxWidth (${diag.captionBoxWidth}) exceeded maxWidth (${diag.maxWidth}) in ${diag.aspect}`
    );

    // 3. lineCount <= 2 for a 10-word sentence in every ratio
    assert.ok(
      diag.lineCount <= 2,
      `Expected <= 2 visible lines in ${diag.aspect}, got ${diag.lineCount}`
    );

    // 4. Verify highlighting different active words never alters word centerX/centerY/measuredWordWidth positions (zero reflow)
    const words = computeWordTimings(testSentence, 3.6, 30);
    const stageLayout = computeStageLayout(diag.aspect, [], []);
    const layoutAtFrame5 = computeCaptionLayout(words, 5, stageLayout)!;
    const layoutAtFrame12 = computeCaptionLayout(words, 12, stageLayout)!;

    assert.ok(layoutAtFrame5 && layoutAtFrame12);
    assert.equal(layoutAtFrame5.items.length, layoutAtFrame12.items.length);
    for (let i = 0; i < layoutAtFrame5.items.length; i++) {
      const w5 = layoutAtFrame5.items[i];
      const w12 = layoutAtFrame12.items[i];
      assert.equal(
        w5.centerX,
        w12.centerX,
        `Word "${w5.wordTiming.word}" centerX jumped on highlight in ${diag.aspect}`
      );
      assert.equal(
        w5.centerY,
        w12.centerY,
        `Word "${w5.wordTiming.word}" centerY jumped on highlight in ${diag.aspect}`
      );
      assert.equal(
        w5.measuredWordWidth,
        w12.measuredWordWidth,
        `Word "${w5.wordTiming.word}" measuredWordWidth changed on highlight in ${diag.aspect}`
      );
    }

    // 5. Verify QA snapshot PNG exists in tests/__snapshots__/
    const preset = ASPECT_PRESETS[diag.aspect];
    const snapshotPath = path.resolve(
      process.cwd(),
      'tests/__snapshots__',
      `caption_${preset.fileSuffix}.png`
    );
    assert.ok(fs.existsSync(snapshotPath), `Snapshot ${snapshotPath} must exist`);
  }
});

test('11. Change F1 (src/sfx/synth.ts): all 11 sounds in SFX_REGISTRY synthesize valid 44.1kHz 16-bit mono WAVs with expected duration, peak <= 0.8, no NaN, and deterministic output', () => {
  const tempCache = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-sfx-synth-'));
  try {
    assert.equal(SFX_NAMES.length, 11);
    for (const name of SFX_NAMES) {
      const def = SFX_REGISTRY[name];
      assert.ok(def, `Missing definition in SFX_REGISTRY for ${name}`);

      const res1 = synthesizeSfx(name, 2, tempCache);
      const buf1 = fs.readFileSync(res1.filePath);
      const res2 = synthesizeSfx(name, 2, tempCache);
      const buf2 = fs.readFileSync(res2.filePath);

      // Determinism
      assert.equal(Buffer.compare(buf1, buf2), 0, `${name} WAV buffer must be deterministic`);
      assert.equal(res1.sha256, res2.sha256, `${name} sha256 must be identical`);
      assert.equal(res2.cached, true, 'Second call should hit cache/sfx/<name>_<variant>.wav');

      // Duration within 10% of [minDurationSec, maxDurationSec]
      const minAllowed = def.minDurationSec * 0.9;
      const maxAllowed = def.maxDurationSec * 1.1;
      assert.ok(
        res1.durationSec >= minAllowed && res1.durationSec <= maxAllowed,
        `${name} duration ${res1.durationSec}s outside [${minAllowed.toFixed(3)}, ${maxAllowed.toFixed(3)}]s`
      );

      // Peak <= 0.8 and > 0.05, no NaN in rendered samples
      assert.ok(res1.peak > 0.05 && res1.peak <= 0.8001, `${name} peak ${res1.peak} must be in (0.05, 0.8]`);
      const rawSamples = def.renderSamples(2, SFX_SAMPLE_RATE);
      for (let i = 0; i < rawSamples.length; i++) {
        assert.equal(Number.isNaN(rawSamples[i]), false, `${name} sample[${i}] is NaN`);
      }

      // Valid WAV header check (RIFF, WAVE, fmt , data, 44100 Hz, 16-bit mono)
      assert.equal(buf1.toString('ascii', 0, 4), 'RIFF');
      assert.equal(buf1.toString('ascii', 8, 12), 'WAVE');
      assert.equal(buf1.toString('ascii', 12, 16), 'fmt ');
      assert.equal(buf1.readUInt16LE(20), 1, 'PCM format = 1');
      assert.equal(buf1.readUInt16LE(22), 1, 'Channels = 1 (mono)');
      assert.equal(buf1.readUInt32LE(24), SFX_SAMPLE_RATE, 'Sample rate = 44100');
      assert.equal(buf1.readUInt16LE(34), 16, 'Bits per sample = 16');
      assert.equal(buf1.toString('ascii', 36, 40), 'data');
    }
  } finally {
    fs.rmSync(tempCache, { recursive: true, force: true });
  }
});

test('12. Change F2 (src/sfx/events.ts): collectSfxEvents derives sorted events, enforces emotion-change-only rules (no happy sound, no scene-start emotion sound), prevents same-frame duplicate types, caps polyphony <= 3, and honors scene.sfx overrides', () => {
  const demoTimeline = buildSfxDemoTimeline();
  const events = collectSfxEvents(demoTimeline, demoTimeline.fps);

  assert.ok(events.length >= 12, `Expected >= 12 SFX events in demo timeline, got ${events.length}`);

  // Sorted timestamps (by frame)
  for (let i = 1; i < events.length; i++) {
    assert.ok(
      events[i].frame >= events[i - 1].frame,
      `SFX events must be sorted by frame (${events[i - 1].frame} -> ${events[i].frame})`
    );
  }

  // Every 11 SFX types are exercised in the demo timeline
  const presentTypes = new Set(events.map((e) => e.type));
  for (const name of SFX_NAMES) {
    assert.ok(presentTypes.has(name), `Demo timeline should trigger SFX type "${name}"`);
  }

  // No two events of the same type on the same frame
  const typeFrameSet = new Set<string>();
  for (const ev of events) {
    const key = `${ev.type}@${ev.frame}`;
    assert.equal(typeFrameSet.has(key), false, `Duplicate same-type event on same frame: ${key}`);
    typeFrameSet.add(key);
  }

  // Max simultaneous overlapping SFX <= 3
  const maxPoly = computeMaxSimultaneousSfx(events);
  assert.ok(maxPoly <= 3, `Expected max simultaneous SFX <= 3, got ${maxPoly}`);

  // Verify scene.sfx = false mutes automatic events for that scene, and manual scene.sfx adds custom events
  const customTimeline = JSON.parse(JSON.stringify(demoTimeline));
  customTimeline.scenes[0].sfx = false;
  customTimeline.scenes[1].sfx = [{ type: 'ding', atSec: 0.25, volume: 0.9 }];
  const customEvents = collectSfxEvents(customTimeline, customTimeline.fps);

  const scene0Events = customEvents.filter((e) => e.sceneId === customTimeline.scenes[0].id);
  assert.equal(scene0Events.length, 0, 'scene.sfx: false must mute all events in that scene');

  const manualDing = customEvents.find(
    (e) => e.sceneId === customTimeline.scenes[1].id && e.source === 'manual' && e.type === 'ding'
  );
  assert.ok(manualDing, 'Manual scene.sfx entry must be included');

  // Verify emotion SFX rules:
  // 1) Initial emotion at scene start (even 'shock') does NOT trigger an emotion sound.
  // 2) Unchanged emotion in a beat ('shock' -> 'shock') does NOT trigger an emotion sound.
  // 3) Changing to 'happy' NEVER triggers a sound.
  // 4) Changing to 'shock'->'gasp', 'sad'->'sad', 'angry'->'buzz', 'laughing'/'excited'->'ding'.
  const emotionTestTimeline = JSON.parse(JSON.stringify(demoTimeline));
  emotionTestTimeline.scenes = [
    {
      ...emotionTestTimeline.scenes[0],
      id: 'emo_rule_scene',
      startFrame: 0,
      durationInFrames: 150,
      endFrame: 150,
      sfx: undefined,
      props: [],
      characters: [
        {
          ...emotionTestTimeline.scenes[0].characters[0],
          id: 'hero',
          emotion: 'shock', // Initial emotion is 'shock' -> must NOT fire 'gasp' at scene start!
          animation: 'idle',
        },
      ],
      beats: [
        // Beat 1 (at 0.1 -> frame 15): still 'shock' (no change) -> must NOT fire 'gasp'
        { atProgress: 0.1, targetId: 'hero', emotion: 'shock' },
        // Beat 2 (at 0.2 -> frame 30): changes to 'happy' -> must NOT fire any emotion sound
        { atProgress: 0.2, targetId: 'hero', emotion: 'happy' },
        // Beat 3 (at 0.35 -> frame 52): changes from 'happy' to 'shock' -> MUST fire 'gasp'
        { atProgress: 0.35, targetId: 'hero', emotion: 'shock' },
        // Beat 4 (at 0.5 -> frame 75): changes from 'shock' to 'sad' -> MUST fire 'sad'
        { atProgress: 0.5, targetId: 'hero', emotion: 'sad' },
        // Beat 5 (at 0.65 -> frame 98): changes from 'sad' to 'angry' -> MUST fire 'buzz'
        { atProgress: 0.65, targetId: 'hero', emotion: 'angry' },
        // Beat 6 (at 0.8 -> frame 120): changes from 'angry' to 'excited' -> MUST fire 'ding'
        { atProgress: 0.8, targetId: 'hero', emotion: 'excited' },
        // Beat 7 (at 0.9 -> frame 135): changes from 'excited' to 'happy' -> must NOT fire 'ding'
        { atProgress: 0.9, targetId: 'hero', emotion: 'happy' },
      ],
    },
  ];
  const emoEvents = collectSfxEvents(emotionTestTimeline, 30).filter((e) => e.type !== 'pop');
  assert.deepEqual(
    emoEvents.map((e) => ({ type: e.type, frame: e.frame })),
    [
      { type: 'gasp', frame: 53 },
      { type: 'sad', frame: 75 },
      { type: 'buzz', frame: 98 },
      { type: 'ding', frame: 120 },
    ],
    'Only actual emotion changes to shock/sad/angry/laughing/excited should trigger gasp/sad/buzz/ding'
  );
});

test('13. Change F3-F5: 2s smoke render with SFX events produces valid AAC audio stream verified by ffprobe (--sfx on vs --sfx off)', async () => {
  const tempOut = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-sfx-smoke-'));
  try {
    const demoTimeline = buildSfxDemoTimeline();

    // Render 2s clip with --sfx on
    const resOn = await renderTimelineToVideo(demoTimeline, {
      outDir: path.join(tempOut, 'sfx-on'),
      maxDurationSec: 2.0,
      sfx: true,
      sfxVolume: 0.5,
      copyAudioToSubdir: false,
    });

    const metricsOn = await probeMediaAudioMetrics(resOn.videoPath);
    assert.equal(metricsOn.hasAudioStream, true, 'Rendered MP4 must contain an audio stream');
    assert.equal(metricsOn.audioCodec, 'aac', 'Audio codec must be AAC');
    assert.ok(
      metricsOn.durationDiffMs <= 80,
      `Audio duration (${metricsOn.audioDurationSec}s) and video duration (${metricsOn.videoDurationSec}s) must match within 80ms`
    );
    assert.ok(
      metricsOn.rms > 0.01 && metricsOn.peak <= 1.0,
      `Expected audible non-clipping RMS > 0.01 with SFX on, got rms=${metricsOn.rms}, peak=${metricsOn.peak}`
    );

    // Render 2s clip with --sfx off (silent voice track in demo -> near-silent output)
    const resOff = await renderTimelineToVideo(demoTimeline, {
      outDir: path.join(tempOut, 'sfx-off'),
      maxDurationSec: 2.0,
      sfx: false,
      copyAudioToSubdir: false,
    });
    const metricsOff = await probeMediaAudioMetrics(resOff.videoPath);
    assert.equal(metricsOff.hasAudioStream, true);
    assert.ok(
      metricsOn.rms > metricsOff.rms + 0.01,
      `Expected --sfx on (rms=${metricsOn.rms}) to be louder than --sfx off (rms=${metricsOff.rms})`
    );
  } finally {
    fs.rmSync(tempOut, { recursive: true, force: true });
  }
});
