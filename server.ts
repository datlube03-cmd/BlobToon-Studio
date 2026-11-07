import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { DEFAULT_TOPIC_IDEAS, SCRIPT_MODEL, SCRIPT_SYSTEM_RULES, buildScriptPrompt } from './server/prompts';
import { sanitizeAndValidateScript } from './src/studio/schema';

dotenv.config();

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY on server.');
  return new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
}

const SCRIPT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
    scenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          bg: { type: Type.ARRAY, items: { type: Type.STRING } },
          caption: { type: Type.STRING },
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                color: { type: Type.STRING },
                emotion: { type: Type.STRING },
                anim: { type: Type.STRING },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
              },
              required: ['id', 'color', 'emotion', 'anim', 'x', 'y'],
            },
          },
          lines: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                speaker: { type: Type.STRING },
                text: { type: Type.STRING },
                emotion: { type: Type.STRING },
              },
              required: ['speaker', 'text', 'emotion'],
            },
          },
          props: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                surface: { type: Type.STRING },
              },
              required: ['type', 'x', 'y', 'surface'],
            },
          },
        },
        required: ['label', 'bg', 'caption', 'characters', 'lines', 'props'],
      },
    },
    thumbnail: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING },
        emotion1: { type: Type.STRING },
        emotion2: { type: Type.STRING },
        keyProp: { type: Type.STRING },
        bgStyle: { type: Type.STRING },
        accentColor: { type: Type.STRING },
      },
      required: ['text', 'emotion1', 'emotion2', 'keyProp', 'bgStyle', 'accentColor'],
    },
  },
  required: ['title', 'description', 'hashtags', 'scenes', 'thumbnail'],
};

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/config', (_req, res) => {
    res.json({
      scriptModel: SCRIPT_MODEL,
      defaultIdeas: DEFAULT_TOPIC_IDEAS,
    });
  });

  app.post('/api/ideas', async (_req, res) => {
    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: SCRIPT_MODEL,
        contents:
          'Hãy tạo 8 ý tưởng chủ đề "What if..." bằng tiếng Việt cho video hoạt hình ngắn 2D về nỗi khổ của học sinh/tuổi teen (bài tập, giới hạn giờ chơi điện thoại, nha sĩ, em út, bạn thân nghỉ chơi) kết hợp với 1 luật chơi như game cực dễ hiểu.',
        config: {
          systemInstruction: SCRIPT_SYSTEM_RULES,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ideas: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['ideas'],
          },
        },
      });
      const parsed = JSON.parse((response.text ?? '{}').trim()) as { ideas?: string[] };
      const ideas =
        Array.isArray(parsed.ideas) && parsed.ideas.length >= 8
          ? parsed.ideas.slice(0, 8)
          : DEFAULT_TOPIC_IDEAS;
      res.json({ ideas });
    } catch {
      res.json({ ideas: DEFAULT_TOPIC_IDEAS, fallback: true });
    }
  });

  app.post('/api/script', async (req, res) => {
    try {
      const { topic } = req.body as { topic?: string };
      const cleanTopic = (topic || '').trim();
      if (!cleanTopic) {
        res.status(400).json({ error: 'Vui lòng nhập chủ đề "What if..."' });
        return;
      }

      const ai = getGeminiClient();
      let lastError = '';

      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await ai.models.generateContent({
          model: SCRIPT_MODEL,
          contents: buildScriptPrompt(cleanTopic, lastError || undefined),
          config: {
            systemInstruction: SCRIPT_SYSTEM_RULES,
            responseMimeType: 'application/json',
            responseSchema: SCRIPT_RESPONSE_SCHEMA,
          },
        });

        try {
          const rawJson = JSON.parse((response.text ?? '{}').trim());
          const { script: validated, warnings } = sanitizeAndValidateScript(rawJson);
          res.json({ script: validated, warnings, model: SCRIPT_MODEL, attempts: attempt + 1 });
          return;
        } catch (valErr) {
          lastError = valErr instanceof Error ? valErr.message : String(valErr);
        }
      }

      res.status(422).json({
        error: `Kịch bản từ Gemini không khớp schema sau 3 lần thử: ${lastError}`,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Lỗi gọi Gemini tạo kịch bản',
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
    console.log(`[BlobToon Studio] Running on http://localhost:${PORT}`);
  });
}

startServer();
