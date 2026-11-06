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
  getCharacterDefinition,
  listCharacterDefinitions,
  validateCharacterTypeId,
} from '../src/characters';
import {
  SFX_NAMES,
  ScriptSchema,
  countSpokenWords,
  estimateScriptDurationSec,
} from '../src/script/schema';
import {
  buildDeterministicScript,
  validateScriptConstraints,
} from '../src/script/generator';
import {
  loadScriptFromFile,
  parseScriptText,
} from '../src/script/parser';
import {
  PALETTE_VARIATIONS,
  selectVariationForIndex,
} from '../src/script/variations';
import {
  applyAspectToTimeline,
  assembleTimelineFromDurations,
  buildTimeline,
  buildVideoMeta,
  computeWordTimings,
  resolveScriptVoicesUsed,
  resolveVariationWithColorPalette,
} from '../src/timeline/builder';
import { parseTimelineStrict } from '../src/timeline/schema';
import {
  MockProvider,
  VoiceStudioProvider,
  probeAudioDurationSec,
  resolveLineVoice,
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

test('1. Change H Guard: zero AI/LLM SDK dependencies or references anywhere in package.json, src/, server.ts, .env.example, or README.md', () => {
  const pkgRaw = fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8');
  const pkg = JSON.parse(pkgRaw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  assert.equal(
    Boolean(pkg.dependencies?.['@anthropic-ai/sdk'] || pkg.devDependencies?.['@anthropic-ai/sdk']),
    false,
    '@anthropic-ai/sdk must be completely removed from package.json'
  );
  assert.equal(
    Boolean(pkg.scripts?.script || pkg.scripts?.ideas),
    false,
    'AI npm scripts (script, ideas) must be removed from package.json'
  );
  assert.equal(
    fs.existsSync(path.resolve(process.cwd(), 'prompts')),
    false,
    'prompts/ folder must be deleted'
  );
  assert.equal(
    fs.existsSync(path.resolve(process.cwd(), 'src/script/ideas.ts')),
    false,
    'src/script/ideas.ts must be deleted'
  );

  // Scan source, config, and docs for forbidden LLM keywords
  const filesToCheck: string[] = [
    path.resolve(process.cwd(), 'package.json'),
    path.resolve(process.cwd(), '.env.example'),
    path.resolve(process.cwd(), 'README.md'),
    path.resolve(process.cwd(), 'server.ts'),
  ];

  const collectSrcFiles = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectSrcFiles(full);
      } else if (/\.(ts|tsx|md|json)$/.test(entry.name)) {
        filesToCheck.push(full);
      }
    }
  };
  collectSrcFiles(path.resolve(process.cwd(), 'src'));

  const forbiddenPattern = /\b(anthropic|claude|openai)\b/i;
  for (const file of filesToCheck) {
    const content = fs.readFileSync(file, 'utf-8');
    const match = content.match(forbiddenPattern);
    assert.equal(
      match,
      null,
      `Forbidden AI keyword "${match?.[0]}" found in ${path.relative(process.cwd(), file)}`
    );
  }
});

test('2. Change I: .script.txt parser & JSON equivalence (examples/demo.script.txt and examples/demo.script.json produce identical Timeline, and invalid scripts report exact line numbers)', async () => {
  const txtScript = loadScriptFromFile('examples/demo.script.txt');
  const jsonScript = loadScriptFromFile('examples/demo.script.json');
  assert.deepEqual(
    txtScript,
    jsonScript,
    'examples/demo.script.txt and examples/demo.script.json must parse to identical Script objects'
  );

  // Verify schema/script.schema.json exists and is valid JSON Schema
  const schemaPath = path.resolve(process.cwd(), 'schema/script.schema.json');
  assert.ok(fs.existsSync(schemaPath), 'schema/script.schema.json must exist');
  const jsonSchemaObj = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  assert.equal(jsonSchemaObj.type, 'object');

  const tempCache = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-demo-eq-'));
  try {
    const mock = new MockProvider({ cacheDir: tempCache });
    const { timeline: tFromTxt } = await buildTimeline(txtScript, mock);
    const { timeline: tFromJson } = await buildTimeline(jsonScript, mock);
    assert.deepEqual(
      tFromTxt,
      tFromJson,
      'Timelines built from demo.script.txt and demo.script.json must be identical'
    );
  } finally {
    fs.rmSync(tempCache, { recursive: true, force: true });
  }

  // Line-number error tests:
  // 1) Unknown character on line 8
  const unknownCharTxt = [
    'title: Test Unknown Char',
    'aspect: 9:16',
    'characters:',
    '  kid: blob(color=#4cc9f0)',
    '  mom: blob(color=#f72585)',
    '',
    '--- DAY 1',
    'mom2 [happy]: Who am I?',
  ].join('\n');
  assert.throws(
    () => parseScriptText(unknownCharTxt, 'bad-char.script.txt'),
    /line 8: unknown character 'mom2'\. Known: kid, mom/
  );

  // 2) Unknown emotion/modifier on line 7
  const unknownEmotionTxt = [
    'title: Test Unknown Emotion',
    'characters:',
    '  kid: blob(color=#4cc9f0)',
    '',
    '--- DAY 1',
    'kid [hyper-confused]: Wait what?!',
  ].join('\n');
  assert.throws(
    () => parseScriptText(unknownEmotionTxt, 'bad-emo.script.txt'),
    /line 6: unknown modifier 'hyper-confused'/
  );

  // 3) Bad hex color on line 3
  const badColorTxt = [
    'title: Test Bad Color',
    'characters:',
    '  kid: blob(color=not-a-hex)',
    '--- DAY 1',
    'kid: Hello!',
  ].join('\n');
  assert.throws(
    () => parseScriptText(badColorTxt, 'bad-color.script.txt'),
    /line 3: invalid hex color 'not-a-hex'/
  );

  // 4) Missing scene header (dialogue before ---)
  const missingSceneTxt = [
    'title: Missing Scene Header',
    'characters:',
    '  kid: blob(color=#4cc9f0)',
    'kid [happy]: I forgot the scene header!',
  ].join('\n');
  assert.throws(
    () => parseScriptText(missingSceneTxt, 'no-scene.script.txt'),
    /line 4:/
  );
});

test('3. Change J: Character registry (defineCharacter) registers blob & robot, rejects unknown character types, and renders both across all 4 aspect ratios', () => {
  const defs = listCharacterDefinitions();
  const ids = defs.map((d) => d.id);
  assert.ok(ids.includes('blob'), 'Registry must include built-in "blob" character');
  assert.ok(ids.includes('robot'), 'Registry must include "robot" character');

  const blobDef = getCharacterDefinition('blob')!;
  const robotDef = getCharacterDefinition('robot')!;
  assert.ok(blobDef.anchors(1080).bubble.y < 0);
  assert.ok(robotDef.anchors(1080).bubble.y < 0);

  const invalidCheck = validateCharacterTypeId('dragon');
  assert.equal(invalidCheck.valid, false);
  assert.ok(invalidCheck.knownIds.includes('blob') && invalidCheck.knownIds.includes('robot'));

  // Unknown character type in .script.txt must fail with line number and list known character types
  const unknownTypeScript = [
    'title: Unknown Type Test',
    'characters:',
    '  drake: dragon(color=#4cc9f0)',
    '--- DAY 1',
    'drake: Roar!',
  ].join('\n');
  assert.throws(
    () => parseScriptText(unknownTypeScript, 'dragon.script.txt'),
    /line 3: unknown character type 'dragon'.*Known character types:.*blob.*robot/
  );

  // Verify Robot + Blob script renders valid SVG across all 4 aspect ratios
  const robotAndBlobScript = parseScriptText(
    [
      'title: Blob and Robot Test',
      'characters:',
      '  kid: blob(color=#4cc9f0, voice=Voice A)',
      '  bot: robot(color=#fbbf24, accentColor=#f43f5e, voice=Echo)',
      '--- DAY 1 | bg=arcade',
      'kid [happy, bounce, x=0.3]: Hello BoxBot!',
      'bot [shock, jump, x=0.7]: Beep boop!',
    ].join('\n'),
    'robot-test.script.txt'
  );
  const timeline = assembleTimelineFromDurations(robotAndBlobScript, [{ durationSec: 3.0 }]);

  for (const ratio of ALL_ASPECT_RATIOS) {
    const adapted = applyAspectToTimeline(timeline, ratio);
    const svg = renderFrameSvgMarkup(adapted, 10, false, ratio);
    assert.ok(svg.includes('data-char-type="blob"'), `Missing blob in ${ratio} SVG`);
    assert.ok(svg.includes('data-char-type="robot"'), `Missing robot in ${ratio} SVG`);
  }
});

test('4. Change K: Voice resolution order (line.voice > character.voice > script.voice > env), silent lines, and voicesUsed in meta.json', async () => {
  // 1. Unit test resolveLineVoice precedence
  assert.equal(
    resolveLineVoice({
      lineVoice: 'LineOverride',
      characterVoice: 'CharDefault',
      scriptVoice: 'ProjectDefault',
      envVoice: 'EnvDefault',
    }),
    'LineOverride'
  );
  assert.equal(
    resolveLineVoice({
      lineVoice: undefined,
      characterVoice: 'CharDefault',
      scriptVoice: 'ProjectDefault',
      envVoice: 'EnvDefault',
    }),
    'CharDefault'
  );
  assert.equal(
    resolveLineVoice({
      lineVoice: undefined,
      characterVoice: undefined,
      scriptVoice: 'ProjectDefault',
      envVoice: 'EnvDefault',
    }),
    'ProjectDefault'
  );
  assert.equal(
    resolveLineVoice({
      lineVoice: undefined,
      characterVoice: undefined,
      scriptVoice: undefined,
      envVoice: 'EnvDefault',
    }),
    'EnvDefault'
  );

  // 2. Verify buildTimeline synthesizes with per-line voice & speed and skips `silent` lines
  const voiceScript = parseScriptText(
    [
      'title: Voice Precedence & Silent Line Test',
      'voice: ScriptDefaultVoice',
      'characters:',
      '  kid: blob(color=#4cc9f0, voice=KidVoice)',
      '  mom: blob(color=#f72585)',
      '--- DAY 1',
      'kid [happy]: Uses character voice KidVoice.',
      'mom [angry, voice=MomLineVoice, speed=1.2]: Uses explicit line voice.',
      'kid [shock, silent]: Silent bubble only, no TTS call!',
      'narrator: Uses ScriptDefaultVoice.',
    ].join('\n'),
    'voice-test.script.txt'
  );

  const synthCalls: Array<{ text: string; voice?: string; speed?: number }> = [];
  const tempCache = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-voice-order-'));
  try {
    const baseMock = new MockProvider({ cacheDir: tempCache });
    const spyProvider = {
      name: 'mock' as const,
      async synthesize(text: string, voice?: string, speedMultiplier?: number) {
        synthCalls.push({ text, voice, speed: speedMultiplier });
        return baseMock.synthesize(text, voice, speedMultiplier);
      },
    };

    const { timeline } = await buildTimeline(voiceScript, spyProvider);
    assert.equal(
      synthCalls.length,
      3,
      'Should synthesize 3 spoken lines and skip the 1 silent line'
    );
    assert.equal(synthCalls[0].voice, 'KidVoice');
    assert.equal(synthCalls[1].voice, 'MomLineVoice');
    assert.equal(synthCalls[1].speed, 1.2);
    assert.equal(synthCalls[2].voice, 'ScriptDefaultVoice');

    const voicesUsed = resolveScriptVoicesUsed(voiceScript);
    assert.equal(voicesUsed.kid, 'KidVoice');
    assert.equal(voicesUsed.mom, 'MomLineVoice');
    assert.equal(voicesUsed.narrator, 'ScriptDefaultVoice');

    const meta = buildVideoMeta(timeline, 'mock');
    assert.deepEqual(meta.voicesUsed, voicesUsed);
  } finally {
    fs.rmSync(tempCache, { recursive: true, force: true });
  }
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

test('6. Smoke test: renders examples/demo.script.txt with MockProvider in both 9:16 and 16:9 (no API key, no network)', async () => {
  const tempOut = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-smoke-out-'));
  try {
    const script = loadScriptFromFile('examples/demo.script.txt');
    const mock = new MockProvider({ cacheDir: tempOut });
    const { timeline } = await buildTimeline(script, mock, {
      variation: PALETTE_VARIATIONS[0],
    });

    for (const ratio of ['9:16', '16:9'] as const) {
      const ratioDir = path.join(tempOut, ASPECT_PRESETS[ratio].fileSuffix);
      const res = await renderTimelineToVideo(timeline, {
        outDir: ratioDir,
        aspect: ratio,
        maxDurationSec: 1.0,
        voiceProviderName: 'mock',
      });

      assert.equal(res.width, ASPECT_PRESETS[ratio].width);
      assert.equal(res.height, ASPECT_PRESETS[ratio].height);
      assert.ok(fs.existsSync(res.videoPath), `Rendered ${ratio} MP4 file must exist`);
      assert.ok(fs.statSync(res.videoPath).size > 2000, `Rendered ${ratio} MP4 must be non-empty`);
      assert.ok(fs.existsSync(res.thumbnailPath), `Rendered ${ratio} thumbnail PNG must exist`);
      assert.ok(fs.existsSync(res.metaPath), `${ratio} meta.json must exist`);
      assert.ok(fs.existsSync(res.timelinePath), `${ratio} timeline.json must exist`);

      const probedDur = await probeAudioDurationSec(res.videoPath);
      assert.ok(
        probedDur >= 0.8 && probedDur <= 1.5,
        `Expected ~1.0s MP4 duration for ${ratio}, got ${probedDur}s`
      );
    }
  } finally {
    fs.rmSync(tempOut, { recursive: true, force: true });
  }
});

test('7. Aspect layout function (computeStageLayout), timeline math, & --aspect CLI override', () => {
  assert.deepEqual(resolveAspectSelection('16:9', '9:16'), { mode: 'single', aspect: '16:9' });
  assert.deepEqual(resolveAspectSelection('all', '9:16'), { mode: 'all', aspect: '9:16' });
  assert.deepEqual(resolveAspectSelection(undefined, '4:3'), { mode: 'single', aspect: '4:3' });
  assert.deepEqual(resolveAspectSelection(undefined, undefined), { mode: 'single', aspect: '9:16' });

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
  assert.equal(timeline.totalFrames, 420);
  assert.equal(timeline.totalDurationSec, 14);

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
  }

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
    }
  } finally {
    fs.rmSync(tempOut, { recursive: true, force: true });
  }
});

test('9. Skills mechanism loads example-fastcut.md and example-darkmode.md, applies Audio/TTS & Visual renderParams, and validates malformed skills', async () => {
  const {
    loadSkillByName,
    parseSkillMarkdown,
    listAvailableSkills,
  } = await import('../src/skills/loader');

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
  const check = validateScriptConstraints(scriptWithSkill, fastcut);
  assert.equal(check.valid, true);
  assert.ok(countSpokenWords(scriptWithSkill) > 10);
  assert.ok(estimateScriptDurationSec(scriptWithSkill) > 5);

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
  for (const scene of timelineWithSkill.scenes) {
    assert.ok(
      scene.durationSec >= 1.5 && scene.durationSec <= 2.5,
      `Expected scene duration in [1.5, 2.5]s, got ${scene.durationSec}s`
    );
    assert.equal(scene.transition, 'hard-cut');
  }

  assert.throws(
    () => parseSkillMarkdown('## name: broken\nNo description or style rules', 'broken-missing.md'),
    /broken-missing\.md.*Missing required field "description:"/
  );
});

test('10. Change G: Bundled OFL font (Fredoka-Bold.ttf + opentype.js), fontFamily fallback, and caption spacing across all 4 aspect ratios', () => {
  assert.ok(
    fs.existsSync(path.resolve(process.cwd(), BUNDLED_FONT_FILE_PATH)),
    'Bundled OFL font file assets/fonts/Fredoka-Bold.ttf must exist'
  );
  assert.ok(
    fs.existsSync(path.resolve(process.cwd(), BUNDLED_FONT_LICENSE_PATH)),
    'Bundled OFL license assets/fonts/OFL.txt must exist'
  );

  assert.equal(resolveBundledFontFamily(undefined), BUNDLED_FONT_FAMILY);
  assert.equal(resolveBundledFontFamily("'Space Grotesk', sans-serif"), BUNDLED_FONT_FAMILY);
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

    assert.ok(
      Math.abs(wordGapRatio - baseWordGapRatio) / baseWordGapRatio <= 0.02,
      `wordGap/fontSize mismatch in ${diag.aspect}`
    );
    assert.ok(
      Math.abs(lineHeightRatio - baseLineHeightRatio) / baseLineHeightRatio <= 0.02,
      `lineHeight/fontSize mismatch in ${diag.aspect}`
    );
    assert.ok(diag.captionBoxWidth <= diag.maxWidth);
    assert.ok(diag.lineCount <= 2);

    const words = computeWordTimings(testSentence, 3.6, 30);
    const stageLayout = computeStageLayout(diag.aspect, [], []);
    const layoutAtFrame5 = computeCaptionLayout(words, 5, stageLayout)!;
    const layoutAtFrame12 = computeCaptionLayout(words, 12, stageLayout)!;
    for (let i = 0; i < layoutAtFrame5.items.length; i++) {
      assert.equal(layoutAtFrame5.items[i].centerX, layoutAtFrame12.items[i].centerX);
      assert.equal(layoutAtFrame5.items[i].centerY, layoutAtFrame12.items[i].centerY);
    }
  }
});

test('11. Change F1 (src/sfx/synth.ts): all 11 sounds in SFX_REGISTRY synthesize valid 44.1kHz 16-bit mono WAVs', () => {
  const tempCache = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-sfx-synth-'));
  try {
    assert.equal(SFX_NAMES.length, 11);
    for (const name of SFX_NAMES) {
      const def = SFX_REGISTRY[name];
      assert.ok(def, `Missing definition in SFX_REGISTRY for ${name}`);
      const res1 = synthesizeSfx(name, 2, tempCache);
      const res2 = synthesizeSfx(name, 2, tempCache);
      assert.equal(res1.sha256, res2.sha256);
      assert.equal(res2.cached, true);
      assert.ok(res1.peak > 0.05 && res1.peak <= 0.8001);
      const buf1 = fs.readFileSync(res1.filePath);
      assert.equal(buf1.readUInt32LE(24), SFX_SAMPLE_RATE);
    }
  } finally {
    fs.rmSync(tempCache, { recursive: true, force: true });
  }
});

test('12. Change F2 (src/sfx/events.ts): collectSfxEvents derives sorted events, enforces emotion-change-only rules, and caps polyphony <= 3', () => {
  const demoTimeline = buildSfxDemoTimeline();
  const events = collectSfxEvents(demoTimeline, demoTimeline.fps);
  assert.ok(events.length >= 12);
  const maxPoly = computeMaxSimultaneousSfx(events);
  assert.ok(maxPoly <= 3);

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
          emotion: 'shock',
          animation: 'idle',
        },
      ],
      beats: [
        { atProgress: 0.1, targetId: 'hero', emotion: 'shock' },
        { atProgress: 0.2, targetId: 'hero', emotion: 'happy' },
        { atProgress: 0.35, targetId: 'hero', emotion: 'shock' },
        { atProgress: 0.5, targetId: 'hero', emotion: 'sad' },
        { atProgress: 0.65, targetId: 'hero', emotion: 'angry' },
        { atProgress: 0.8, targetId: 'hero', emotion: 'excited' },
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
    ]
  );
});

test('13. Change F3-F5: 2s smoke render with SFX events produces valid AAC audio stream verified by ffprobe (--sfx on vs --sfx off)', async () => {
  const tempOut = fs.mkdtempSync(path.join(os.tmpdir(), 'blobtoon-sfx-smoke-'));
  try {
    const demoTimeline = buildSfxDemoTimeline();
    const resOn = await renderTimelineToVideo(demoTimeline, {
      outDir: path.join(tempOut, 'sfx-on'),
      maxDurationSec: 2.0,
      sfx: true,
      sfxVolume: 0.5,
      copyAudioToSubdir: false,
    });
    const metricsOn = await probeMediaAudioMetrics(resOn.videoPath);
    assert.equal(metricsOn.hasAudioStream, true);
    assert.equal(metricsOn.audioCodec, 'aac');
    assert.ok(metricsOn.durationDiffMs <= 80);

    const resOff = await renderTimelineToVideo(demoTimeline, {
      outDir: path.join(tempOut, 'sfx-off'),
      maxDurationSec: 2.0,
      sfx: false,
      copyAudioToSubdir: false,
    });
    const metricsOff = await probeMediaAudioMetrics(resOff.videoPath);
    assert.ok(metricsOn.rms > metricsOff.rms + 0.01);
  } finally {
    fs.rmSync(tempOut, { recursive: true, force: true });
  }
});
