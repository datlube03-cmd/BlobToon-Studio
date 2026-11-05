import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { AspectRatio, AspectRatioSchema } from './src/aspect';
import { generateScript } from './src/script/generator';
import { generateTopicIdeas } from './src/script/ideas';
import {
  PALETTE_VARIATIONS,
  computeTopicSeed,
  selectVariationForIndex,
} from './src/script/variations';
import { createDefaultTtsProvider } from './src/voice/provider';
import { applyAspectToTimeline, buildTimeline } from './src/timeline/builder';
import { parseTimelineStrict } from './src/timeline/schema';
import {
  renderTimelineAllAspects,
  renderTimelineToVideo,
} from './src/render/renderVideo';
import { createGalleryScript } from './src/render/gallery';
import { runDoctorChecks } from './src/cli/doctor';
import { slugify } from './src/cli/index';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  const outDir = path.resolve(process.cwd(), 'out');
  const cacheDir = path.resolve(process.cwd(), 'cache');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  app.use('/out', express.static(outDir));
  app.use('/cache', express.static(cacheDir));

  app.get('/api/status', async (_req, res) => {
    const vsUrl = (process.env.VOICESTUDIO_URL || 'http://127.0.0.1:3900').replace(/\/+$/, '');
    let voiceStudioOnline = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      const ping = await fetch(`${vsUrl}/.well-known/voicestudio-speech`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      voiceStudioOnline = ping.ok;
    } catch {
      voiceStudioOnline = false;
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
    const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
    const anthropicConfigured =
      Boolean(anthropicKey) &&
      anthropicKey !== 'your_anthropic_api_key_here' &&
      anthropicKey !== 'MY_ANTHROPIC_API_KEY';

    const videoExists = fs.existsSync(path.join(outDir, 'video.mp4'));
    const thumbExists = fs.existsSync(path.join(outDir, 'thumbnail.png'));
    const metaPath = path.join(outDir, 'meta.json');
    let lastMeta = null;
    if (fs.existsSync(metaPath)) {
      try {
        lastMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch {
        lastMeta = null;
      }
    }

    res.json({
      voiceStudioUrl: vsUrl,
      voiceStudioOnline,
      ttsMode: voiceStudioOnline
        ? 'VoiceStudio HTTP (/v1/audio/speech)'
        : 'MockProvider (Offline Fallback)',
      anthropicConfigured,
      anthropicModel,
      scriptMode: anthropicConfigured ? `Claude ${anthropicModel}` : 'Deterministic Rule Engine',
      hasRenderedVideo: videoExists,
      videoUrl: videoExists ? `/out/video.mp4` : null,
      thumbnailUrl: thumbExists ? `/out/thumbnail.png` : null,
      lastMeta,
    });
  });

  app.get('/api/doctor', async (_req, res) => {
    const report = await runDoctorChecks();
    res.json(report);
  });

  app.post('/api/ideas', async (req, res) => {
    try {
      const niche =
        typeof req.body?.niche === 'string' && req.body.niche.trim()
          ? req.body.niche.trim()
          : 'gaming & school rules';
      const count = typeof req.body?.count === 'number' ? req.body.count : 10;
      const result = await generateTopicIdeas(niche, count);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/script', async (req, res) => {
    try {
      const topic =
        typeof req.body?.topic === 'string' && req.body.topic.trim()
          ? req.body.topic.trim()
          : 'What if Mom started playing on your Roblox account';
      const parsedAspect = AspectRatioSchema.safeParse(req.body?.aspect);
      const aspect: AspectRatio = parsedAspect.success ? parsedAspect.data : '9:16';
      const variationId = req.body?.variationId;
      const variation =
        PALETTE_VARIATIONS.find((v) => v.id === variationId) ?? PALETTE_VARIATIONS[0];
      const voice = typeof req.body?.voice === 'string' ? req.body.voice : undefined;

      const { script, source, attempts } = await generateScript(topic, {
        variation,
        aspect,
      });
      const tts = createDefaultTtsProvider();
      const seed = computeTopicSeed(topic);
      const { timeline, providerUsed } = await buildTimeline(script, tts, {
        aspect,
        seed,
        variation,
        voice,
      });

      const slugDir = path.join(outDir, slugify(topic));
      fs.mkdirSync(slugDir, { recursive: true });
      fs.writeFileSync(path.join(slugDir, 'script.json'), JSON.stringify(script, null, 2), 'utf-8');
      fs.writeFileSync(path.join(slugDir, 'timeline.json'), JSON.stringify(timeline, null, 2), 'utf-8');
      fs.writeFileSync(path.join(outDir, 'script.json'), JSON.stringify(script, null, 2), 'utf-8');
      fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(timeline, null, 2), 'utf-8');

      res.json({
        script,
        timeline,
        source,
        attempts,
        providerUsed,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/render', async (req, res) => {
    try {
      const isGallery = Boolean(req.body?.gallery);
      const rawAspect = req.body?.aspect;
      const isAllAspects = rawAspect === 'all';
      const parsedAspect = AspectRatioSchema.safeParse(rawAspect);
      const requestedAspect: AspectRatio | undefined = parsedAspect.success
        ? parsedAspect.data
        : undefined;

      const maxDurationSec =
        typeof req.body?.maxDurationSec === 'number' ? req.body.maxDurationSec : undefined;

      let timeline;
      let providerUsed = 'mock';

      if (isGallery) {
        const galleryScript = createGalleryScript(requestedAspect ?? '9:16');
        const tts = createDefaultTtsProvider();
        const built = await buildTimeline(galleryScript, tts, {
          aspect: requestedAspect ?? '9:16',
          variation: PALETTE_VARIATIONS[0],
        });
        timeline = built.timeline;
        providerUsed = built.providerUsed;
      } else if (req.body?.timeline) {
        timeline = parseTimelineStrict(req.body.timeline);
        if (requestedAspect) {
          timeline = applyAspectToTimeline(timeline, requestedAspect);
        }
      } else {
        const { script } = await generateScript(
          'What if Mom started playing on your Roblox account',
          { aspect: requestedAspect ?? '9:16' }
        );
        const tts = createDefaultTtsProvider();
        const built = await buildTimeline(script, tts, {
          aspect: requestedAspect ?? '9:16',
        });
        timeline = built.timeline;
        providerUsed = built.providerUsed;
      }

      const cacheBust = Date.now();

      if (isAllAspects) {
        const allRes = await renderTimelineAllAspects(timeline, {
          outDir,
          maxDurationSec,
          voiceProviderName: providerUsed,
        });
        const first = allRes[0];
        const ratioItems = allRes.map((r) => ({
          aspect: r.aspect,
          width: r.width,
          height: r.height,
          videoUrl: `/out/${path.basename(r.videoPath)}?t=${cacheBust}`,
          thumbnailUrl: `/out/${path.basename(r.thumbnailPath)}?t=${cacheBust}`,
        }));
        res.json({
          ok: true,
          aspect: 'all',
          videoUrl: `/out/${path.basename(first.videoPath)}?t=${cacheBust}`,
          thumbnailUrl: `/out/${path.basename(first.thumbnailPath)}?t=${cacheBust}`,
          allVideos: ratioItems,
          allRatios: ratioItems,
          durationSec: first.durationSec,
          width: first.width,
          height: first.height,
          fps: first.fps,
          meta: first.meta,
          timeline: first.timelinePath ? timeline : timeline,
        });
        return;
      }

      const targetAspect = requestedAspect ?? timeline.aspect ?? '9:16';
      const videoFilename = isGallery ? 'gallery.mp4' : 'video.mp4';
      const thumbnailFilename = isGallery ? 'gallery-thumbnail.png' : 'thumbnail.png';
      const metaFilename = isGallery ? 'gallery-meta.json' : 'meta.json';
      const timelineFilename = isGallery ? 'gallery-timeline.json' : 'timeline.json';

      const result = await renderTimelineToVideo(timeline, {
        outDir,
        aspect: targetAspect,
        videoFilename,
        thumbnailFilename,
        metaFilename,
        timelineFilename,
        maxDurationSec,
        voiceProviderName: providerUsed,
      });

      // Also save inside out/<slug>/
      const slugDir = path.join(outDir, slugify(timeline.topic));
      fs.mkdirSync(slugDir, { recursive: true });
      fs.copyFileSync(result.videoPath, path.join(slugDir, videoFilename));
      fs.copyFileSync(result.thumbnailPath, path.join(slugDir, thumbnailFilename));
      fs.copyFileSync(result.metaPath, path.join(slugDir, metaFilename));
      fs.copyFileSync(result.timelinePath, path.join(slugDir, timelineFilename));

      res.json({
        ok: true,
        aspect: result.aspect,
        videoUrl: `/out/${videoFilename}?t=${cacheBust}`,
        thumbnailUrl: `/out/${thumbnailFilename}?t=${cacheBust}`,
        metaUrl: `/out/${metaFilename}?t=${cacheBust}`,
        timelineUrl: `/out/${timelineFilename}?t=${cacheBust}`,
        durationSec: result.durationSec,
        width: result.width,
        height: result.height,
        fps: result.fps,
        meta: result.meta,
        timeline: applyAspectToTimeline(timeline, targetAspect),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/batch', async (req, res) => {
    try {
      const rawTopics: string[] = Array.isArray(req.body?.topics)
        ? req.body.topics
        : [
            'What if Mom started playing on your Roblox account',
            'What if every uncompleted homework assignment shrank your room by 10%',
            'What if your little sibling got a remote control that paused you in real life',
            'What if every minute past bedtime cost 100 of your in-game coins',
          ];

      const parsedAspect = AspectRatioSchema.safeParse(req.body?.aspect);
      const aspect: AspectRatio = parsedAspect.success ? parsedAspect.data : '9:16';

      const tts = createDefaultTtsProvider();
      const items = [];

      for (let i = 0; i < rawTopics.length; i++) {
        const topic = rawTopics[i].trim();
        if (!topic) continue;
        const seed = computeTopicSeed(topic, i);
        const variation = selectVariationForIndex(i);
        const { script, source } = await generateScript(topic, { variation, aspect });
        const { timeline, providerUsed } = await buildTimeline(script, tts, {
          aspect,
          seed,
          variation,
        });
        items.push({
          index: i + 1,
          topic,
          aspect,
          seed,
          variation,
          source,
          providerUsed,
          durationSec: timeline.totalDurationSec,
          totalFrames: timeline.totalFrames,
          sceneCount: timeline.scenes.length,
          timeline,
        });
      }

      res.json({ items });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
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
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BlobToon Studio Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
