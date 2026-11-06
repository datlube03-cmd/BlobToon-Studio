import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  AspectRatio,
  AspectSelection,
  parseAspectSelection,
} from './src/aspect';
import { listCharacterDefinitions } from './src/characters';
import {
  createStarterScriptTemplate,
  loadScriptFromFile,
  parseScriptText,
  validateScriptCharactersRegistered,
} from './src/script/parser';
import { Script, ScriptSchema } from './src/script/schema';
import {
  PALETTE_VARIATIONS,
  selectVariationForIndex,
  slugifyTopic,
} from './src/script/variations';
import { listAvailableSkills, loadSkillByName } from './src/skills/loader';
import {
  applyAspectToTimeline,
  buildTimeline,
} from './src/timeline/builder';
import { Timeline, TimelineSchema } from './src/timeline/schema';
import {
  MockProvider,
  VoiceStudioProvider,
  checkVoiceStudioHealth,
  listVoiceStudioVoices,
} from './src/voice/provider';
import { createGalleryTimeline } from './src/render/gallery';
import {
  renderTimelineAllAspects,
  renderTimelineToVideo,
} from './src/render/renderVideo';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;
  const outDir = path.resolve(process.cwd(), 'out');
  fs.mkdirSync(outDir, { recursive: true });

  app.use(express.json({ limit: '5mb' }));
  app.use('/api/media', express.static(outDir));

  app.get('/api/status', async (_req, res) => {
    const vsUrl = process.env.VOICESTUDIO_URL || 'http://127.0.0.1:3900';
    const vsHealth = await checkVoiceStudioHealth(vsUrl);

    const videoExists = fs.existsSync(path.join(outDir, 'video.mp4'));
    const thumbExists = fs.existsSync(path.join(outDir, 'thumbnail.png'));
    const metaPath = path.join(outDir, 'meta.json');
    const meta = fs.existsSync(metaPath)
      ? JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      : null;

    res.json({
      voiceStudioUrl: vsUrl,
      voiceStudioOnline: vsHealth.ok,
      ttsMode: vsHealth.ok ? 'VoiceStudio (/v1/audio/speech)' : 'MockProvider (Offline Fallback)',
      scriptMode: 'Manual (.script.txt / script.json)',
      hasRenderedVideo: videoExists,
      videoUrl: videoExists ? `/api/media/video.mp4` : null,
      thumbnailUrl: thumbExists ? `/api/media/thumbnail.png` : null,
      lastMeta: meta,
    });
  });

  app.get('/api/skills', (_req, res) => {
    try {
      const skills = listAvailableSkills();
      res.json({ skills });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list skills',
      });
    }
  });

  app.get('/api/characters', (_req, res) => {
    const characters = listCharacterDefinitions().map((c) => ({
      id: c.id,
      name: c.name,
      emotions: c.emotions,
      anims: c.anims,
      defaultVoice: c.defaultVoice ?? 'alloy',
    }));
    res.json({ characters });
  });

  app.get('/api/voices', async (_req, res) => {
    try {
      const report = await listVoiceStudioVoices();
      res.json(report);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list voices',
      });
    }
  });

  app.get('/api/projects', (_req, res) => {
    try {
      const list: Array<{ id: string; title: string; path: string; scriptText: string }> = [];
      const demoPath = path.resolve(process.cwd(), 'examples/demo.script.txt');
      if (fs.existsSync(demoPath)) {
        const scriptText = fs.readFileSync(demoPath, 'utf-8');
        list.push({
          id: 'examples/demo.script.txt',
          title: 'Demo: What if Mom played on your Roblox account?',
          path: 'examples/demo.script.txt',
          scriptText,
        });
      }

      const projectsDir = path.resolve(process.cwd(), 'projects');
      if (fs.existsSync(projectsDir)) {
        for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            const pFile = path.join(projectsDir, entry.name, 'script.txt');
            if (fs.existsSync(pFile)) {
              const scriptText = fs.readFileSync(pFile, 'utf-8');
              const rel = `projects/${entry.name}/script.txt`;
              list.push({
                id: rel,
                title: `Project: ${entry.name}`,
                path: rel,
                scriptText,
              });
            }
          }
        }
      }

      res.json({ projects: list });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list projects',
      });
    }
  });

  app.post('/api/projects', (req, res) => {
    try {
      const { title, scriptText, aspect: rawAspect } = req.body as {
        title?: string;
        scriptText?: string;
        aspect?: string;
      };
      const cleanTitle = (title || 'New BlobToon Project').trim();
      const slug = slugifyTopic(cleanTitle);
      const projDir = path.resolve(process.cwd(), 'projects', slug);
      fs.mkdirSync(projDir, { recursive: true });
      const filePath = path.join(projDir, 'script.txt');
      const resolvedSel = parseAspectSelection(rawAspect);
      const aspect: AspectRatio = resolvedSel === 'all' ? '9:16' : resolvedSel;
      const bodyText =
        typeof scriptText === 'string' && scriptText.trim().length > 0
          ? scriptText
          : createStarterScriptTemplate(cleanTitle, aspect);

      // Validate before saving
      const parsed = parseScriptText(bodyText, `projects/${slug}/script.txt`);
      fs.writeFileSync(filePath, bodyText, 'utf-8');

      res.json({
        path: `projects/${slug}/script.txt`,
        scriptText: bodyText,
        script: parsed,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to save project script',
      });
    }
  });

  app.post('/api/say', async (req, res) => {
    try {
      const { text, voice, speed, mockTts } = req.body as {
        text?: string;
        voice?: string;
        speed?: number;
        mockTts?: boolean;
      };
      const cleanText = (text || 'Xin chào từ BlobToon Studio!').trim();
      const chosenVoice = (voice || process.env.VOICESTUDIO_VOICE || 'alloy').trim();
      const chosenSpeed = typeof speed === 'number' && speed > 0 ? speed : 1.0;

      const tts = mockTts
        ? new MockProvider({ defaultVoice: chosenVoice })
        : new VoiceStudioProvider({ defaultVoice: chosenVoice, fallbackToMock: true });

      const result = await tts.synthesize(cleanText, chosenVoice, chosenSpeed);
      const safeName = `say_${chosenVoice.toLowerCase().replace(/[^a-z0-9_-]+/g, '_')}.wav`;
      const outPath = path.join(outDir, safeName);
      fs.copyFileSync(result.file, outPath);

      res.json({
        audioUrl: `/api/media/${safeName}?t=${Date.now()}`,
        durationSec: result.durationSec,
        provider: result.provider,
        voiceUsed: chosenVoice,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to synthesize voice preview',
      });
    }
  });

  app.post('/api/parse-script', async (req, res) => {
    try {
      const {
        scriptText,
        scriptJson,
        variationId,
        aspect: rawAspect,
        skill: skillName,
        voice,
        mockTts,
        sfx,
        sfxVolume,
        music,
      } = req.body as {
        scriptText?: string;
        scriptJson?: unknown;
        variationId?: string;
        aspect?: string;
        skill?: string;
        voice?: string;
        mockTts?: boolean;
        sfx?: boolean;
        sfxVolume?: number;
        music?: string;
      };

      const variation =
        PALETTE_VARIATIONS.find((v) => v.id === variationId) ?? PALETTE_VARIATIONS[0];
      const skillDef = skillName ? loadSkillByName(skillName) : undefined;

      let script: Script;
      if (typeof scriptText === 'string' && scriptText.trim().length > 0) {
        script = parseScriptText(scriptText, 'script.txt');
      } else if (scriptJson) {
        script = ScriptSchema.parse(scriptJson);
        validateScriptCharactersRegistered(script, 'script.json');
      } else {
        throw new Error('Provide either scriptText (.script.txt) or scriptJson.');
      }

      const parsedSel = rawAspect ? parseAspectSelection(rawAspect) : script.aspect;
      const aspect: AspectRatio = parsedSel === 'all' ? '9:16' : parsedSel;

      const tts = mockTts
        ? new MockProvider({ defaultVoice: voice })
        : new VoiceStudioProvider({ defaultVoice: voice, fallbackToMock: true });

      const { timeline, providerUsed } = await buildTimeline(script, tts, {
        variation,
        aspect,
        voice,
        skill: skillDef?.name ?? script.skill,
        renderParams: skillDef?.renderParams ?? script.renderParams,
        audio: {
          sfx: typeof sfx === 'boolean' ? sfx : true,
          sfxVolume: typeof sfxVolume === 'number' ? sfxVolume : 0.35,
          ...(music ? { music } : {}),
        },
      });

      fs.writeFileSync(path.join(outDir, 'script.json'), JSON.stringify(script, null, 2));
      fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(timeline, null, 2));

      res.json({
        script,
        timeline,
        source: 'manual',
        providerUsed,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Script validation failed',
      });
    }
  });

  app.post('/api/render', async (req, res) => {
    try {
      const {
        timeline: rawTimeline,
        gallery,
        maxDurationSec,
        aspect: rawAspect,
        sfx,
        sfxVolume,
        music,
      } = req.body as {
        timeline?: unknown;
        gallery?: boolean;
        maxDurationSec?: number;
        aspect?: string;
        sfx?: boolean;
        sfxVolume?: number;
        music?: string;
      };

      const selection: AspectSelection = rawAspect ? parseAspectSelection(rawAspect) : '9:16';
      const singleAspect: AspectRatio = selection === 'all' ? '9:16' : selection;

      let timeline: Timeline;
      if (gallery) {
        timeline = createGalleryTimeline(singleAspect);
      } else if (rawTimeline) {
        timeline = TimelineSchema.parse(rawTimeline);
      } else {
        const timelinePath = path.join(outDir, 'timeline.json');
        if (fs.existsSync(timelinePath)) {
          timeline = TimelineSchema.parse(JSON.parse(fs.readFileSync(timelinePath, 'utf-8')));
        } else {
          timeline = createGalleryTimeline(singleAspect);
        }
      }

      if (selection === 'all') {
        const results = await renderTimelineAllAspects(timeline, {
          outDir,
          maxDurationSec: typeof maxDurationSec === 'number' ? maxDurationSec : undefined,
          voiceProviderName: 'mock',
          sfx: typeof sfx === 'boolean' ? sfx : timeline.audio?.sfx ?? true,
          sfxVolume: typeof sfxVolume === 'number' ? sfxVolume : timeline.audio?.sfxVolume ?? 0.35,
          music: music ?? timeline.audio?.music,
        });
        const stamp = Date.now();
        res.json({
          mode: 'all',
          aspect: '9:16',
          videoUrl: `/api/media/video.mp4?t=${stamp}`,
          thumbnailUrl: `/api/media/thumbnail.png?t=${stamp}`,
          allRatios: results.map((r) => ({
            aspect: r.aspect,
            width: r.width,
            height: r.height,
            videoUrl: `/api/media/${path.basename(r.videoPath)}?t=${stamp}`,
            thumbnailUrl: `/api/media/${path.basename(r.thumbnailPath)}?t=${stamp}`,
          })),
          meta: results[0].meta,
          durationSec: results[0].durationSec,
          framesRendered: results[0].framesRendered,
          width: results[0].width,
          height: results[0].height,
          fps: results[0].fps,
        });
        return;
      }

      const adapted = applyAspectToTimeline(timeline, singleAspect);
      const result = await renderTimelineToVideo(adapted, {
        outDir,
        aspect: singleAspect,
        maxDurationSec: typeof maxDurationSec === 'number' ? maxDurationSec : undefined,
        voiceProviderName: 'mock',
        sfx: typeof sfx === 'boolean' ? sfx : adapted.audio?.sfx ?? true,
        sfxVolume: typeof sfxVolume === 'number' ? sfxVolume : adapted.audio?.sfxVolume ?? 0.35,
        music: music ?? adapted.audio?.music,
      });

      const stamp = Date.now();
      res.json({
        mode: 'single',
        aspect: result.aspect,
        videoUrl: `/api/media/video.mp4?t=${stamp}`,
        thumbnailUrl: `/api/media/thumbnail.png?t=${stamp}`,
        meta: result.meta,
        durationSec: result.durationSec,
        framesRendered: result.framesRendered,
        width: result.width,
        height: result.height,
        fps: result.fps,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to render video',
      });
    }
  });

  app.post('/api/batch', async (req, res) => {
    try {
      const { scriptPaths, scriptsText, aspect: rawAspect } = req.body as {
        scriptPaths?: string[];
        scriptsText?: string[];
        aspect?: string;
      };
      const parsedSel = rawAspect ? parseAspectSelection(rawAspect) : '9:16';
      const aspect: AspectRatio = parsedSel === 'all' ? '9:16' : parsedSel;

      const tts = new VoiceStudioProvider({ fallbackToMock: true });
      const results = [];

      if (Array.isArray(scriptsText) && scriptsText.length > 0) {
        for (let i = 0; i < Math.min(8, scriptsText.length); i++) {
          const variation = selectVariationForIndex(i);
          const script = parseScriptText(scriptsText[i], `batch_${i + 1}.script.txt`);
          const { timeline, providerUsed } = await buildTimeline(script, tts, {
            variation,
            aspect,
          });
          results.push({
            index: i,
            topic: script.title,
            variation,
            source: 'manual',
            providerUsed,
            durationSec: timeline.totalDurationSec,
            totalFrames: timeline.totalFrames,
            sceneCount: timeline.scenes.length,
            timeline,
          });
        }
      } else {
        const paths =
          Array.isArray(scriptPaths) && scriptPaths.length > 0
            ? scriptPaths
            : ['examples/demo.script.txt'];
        for (let i = 0; i < Math.min(8, paths.length); i++) {
          const variation = selectVariationForIndex(i);
          const script = loadScriptFromFile(paths[i]);
          const { timeline, providerUsed } = await buildTimeline(script, tts, {
            variation,
            aspect,
          });
          results.push({
            index: i,
            topic: script.title,
            variation,
            source: paths[i],
            providerUsed,
            durationSec: timeline.totalDurationSec,
            totalFrames: timeline.totalFrames,
            sceneCount: timeline.scenes.length,
            timeline,
          });
        }
      }

      res.json({ items: results });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Batch script build failed',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BlobToon Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
