import { AspectRatio, AspectRatioSchema } from '../aspect';
import {
  AnimEnum,
  deriveDefaultThumbnail,
  EmotionEnum,
  PropTypeEnum,
  StudioAnim,
  StudioCharacter,
  StudioEmotion,
  StudioPropType,
  StudioScene,
  StudioScript,
  StudioThumbnail,
  ThumbnailBgStyle,
  ThumbnailBgStyleEnum,
} from './schema';

export interface ScriptDslError {
  line: number;
  message: string;
}

export interface ParsedDslResult {
  script?: StudioScript;
  aspect?: AspectRatio;
  errors: ScriptDslError[];
}

export function serializeScriptToDsl(script: StudioScript, aspect: AspectRatio = '9:16'): string {
  const charDefs = new Map<string, { type: string; color: string }>();
  for (const sc of script.scenes) {
    for (const ch of sc.characters) {
      if (!charDefs.has(ch.id)) {
        charDefs.set(ch.id, { type: ch.charType || 'blob', color: ch.color || '#4cc9f0' });
      }
    }
  }
  if (charDefs.size === 0) charDefs.set('kid', { type: 'blob', color: '#4cc9f0' });

  const th = deriveDefaultThumbnail(script);
  const lines: string[] = [
    `title: ${script.title}`,
    `aspect: ${aspect}`,
    `thumbnail: ${th.text} | bg=${th.bgStyle} | emo1=${th.emotion1} | emo2=${th.emotion2} | prop=${th.keyProp} | accent=${th.accentColor}`,
    'characters:',
  ];
  for (const [id, def] of charDefs.entries()) {
    lines.push(`  ${id}: ${def.type}(color=${def.color})`);
  }

  for (const sc of script.scenes) {
    lines.push(`--- ${sc.label} | bg=${sc.bg[0]},${sc.bg[1]} | caption=${JSON.stringify(sc.caption)}`);
    const charById = new Map<string, StudioCharacter>();
    for (const ch of sc.characters) charById.set(ch.id, ch);

    for (const ln of sc.lines) {
      if (ln.speaker === 'narrator') {
        lines.push(`narrator: ${ln.text}`);
        continue;
      }
      const ch = charById.get(ln.speaker);
      const attrs: string[] = [ln.emotion];
      if (ch) {
        if (ch.anim && ch.anim !== 'idle') attrs.push(ch.anim);
        attrs.push(`x=${Number(ch.x.toFixed(2))}`);
        if (Math.abs(ch.y - 0.78) > 0.03) attrs.push(`y=${Number(ch.y.toFixed(2))}`);
        if (ch.voice) attrs.push(`voice=${ch.voice}`);
      }
      lines.push(`${ln.speaker} [${attrs.join(', ')}]: ${ln.text}`);
    }
    for (const pr of sc.props) {
      const surf = pr.surface || 'ground';
      lines.push(`prop ${pr.type} [x=${Number(pr.x.toFixed(2))}, y=${Number(pr.y.toFixed(2))}, surface=${surf}]`);
    }
  }
  return lines.join('\n');
}

export function parseDslToScript(rawText: string): ParsedDslResult {
  const errors: ScriptDslError[] = [];
  const rawLines = rawText.split(/\r?\n/);

  let title = 'Untitled BlobToon';
  let aspect: AspectRatio = '9:16';
  let inCharactersBlock = false;
  let parsedThumb: Partial<StudioThumbnail> | undefined;
  const declaredChars = new Map<string, { charType: string; color: string }>();
  const scenes: StudioScene[] = [];
  let currentScene: StudioScene | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const lineNo = i + 1;
    const trimmed = rawLines[i].trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    if (trimmed.startsWith('---')) {
      inCharactersBlock = false;
      const parts = trimmed.replace(/^---\s*/, '').split('|').map((p) => p.trim());
      const label = parts[0] || `SCENE ${scenes.length + 1}`;
      let bg: [string, string] = ['#1e1b4b', '#312e81'];
      let caption = label;

      for (const part of parts.slice(1)) {
        if (part.startsWith('bg=')) {
          const cols = part.slice(3).split(',').map((c) => c.trim());
          if (cols.length === 2 && /^#[0-9a-fA-F]{3,8}$/.test(cols[0]) && /^#[0-9a-fA-F]{3,8}$/.test(cols[1])) {
            bg = [cols[0], cols[1]];
          } else errors.push({ line: lineNo, message: 'bg phải có dạng bg=#hex1,#hex2' });
        } else if (part.startsWith('caption=')) {
          caption = part.slice(8).trim().replace(/^["']|["']$/g, '');
        } else errors.push({ line: lineNo, message: `Thuộc tính cảnh không hợp lệ: "${part}"` });
      }
      currentScene = { label, bg, caption, characters: [], lines: [], props: [] };
      scenes.push(currentScene);
      continue;
    }

    if (!currentScene) {
      if (trimmed.startsWith('title:')) {
        inCharactersBlock = false;
        title = trimmed.slice(6).trim();
        if (!title) errors.push({ line: lineNo, message: 'title không được để trống' });
      } else if (trimmed.startsWith('aspect:')) {
        inCharactersBlock = false;
        const val = trimmed.slice(7).trim();
        const parsed = AspectRatioSchema.safeParse(val);
        if (!parsed.success) errors.push({ line: lineNo, message: `aspect "${val}" không hợp lệ (9:16, 16:9, 4:3, 3:4)` });
        else aspect = parsed.data;
      } else if (trimmed.startsWith('thumbnail:')) {
        inCharactersBlock = false;
        const parts = trimmed.slice(10).split('|').map((p) => p.trim()).filter(Boolean);
        parsedThumb = { text: (parts[0] || '').toUpperCase() };
        for (const p of parts.slice(1)) {
          const [k, v] = p.split('=').map((s) => s.trim());
          if (k === 'bg' && ThumbnailBgStyleEnum.safeParse(v).success) parsedThumb.bgStyle = v as ThumbnailBgStyle;
          else if (k === 'emo1' && EmotionEnum.safeParse(v).success) parsedThumb.emotion1 = v as StudioEmotion;
          else if (k === 'emo2' && EmotionEnum.safeParse(v).success) parsedThumb.emotion2 = v as StudioEmotion;
          else if (k === 'prop' && PropTypeEnum.safeParse(v).success) parsedThumb.keyProp = v as StudioPropType;
          else if (k === 'accent' && /^#[0-9a-fA-F]{3,8}$/.test(v)) parsedThumb.accentColor = v;
        }
      } else if (trimmed === 'characters:') {
        inCharactersBlock = true;
      } else if (inCharactersBlock) {
        const m = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*([a-zA-Z0-9_-]+)\(\s*color\s*=\s*(#[0-9a-fA-F]{3,8})\s*\)$/);
        if (!m) errors.push({ line: lineNo, message: 'Khai báo nhân vật sai. Ví dụ: kid: blob(color=#4cc9f0)' });
        else declaredChars.set(m[1], { charType: m[2], color: m[3] });
      } else {
        errors.push({ line: lineNo, message: 'Dòng nằm ngoài cảnh (thiếu "--- SCENE | bg=... | caption=...")' });
      }
      continue;
    }

    if (trimmed.startsWith('prop ')) {
      const pm = trimmed.match(/^prop\s+([a-zA-Z0-9_-]+)(?:\s*\[(.*)\])?$/);
      if (!pm) { errors.push({ line: lineNo, message: 'Cú pháp prop sai. Ví dụ: prop phone [x=0.5, y=0.6, surface=table]' }); continue; }
      const pTypeParse = PropTypeEnum.safeParse(pm[1]);
      if (!pTypeParse.success) { errors.push({ line: lineNo, message: `Loại prop "${pm[1]}" không hỗ trợ` }); continue; }
      let px = 0.5, py = 0.6, surface = pTypeParse.data === 'heart' ? 'float' : 'ground';
      if (pm[2]) {
        for (const token of pm[2].split(',').map((t) => t.trim()).filter(Boolean)) {
          const [k, v] = token.split('=').map((s) => s.trim());
          const num = Number(v);
          if (k === 'x' && !Number.isNaN(num) && num >= 0 && num <= 1) px = num;
          else if (k === 'y' && !Number.isNaN(num) && num >= 0 && num <= 1) py = num;
          else if (k === 'surface' && /^(ground|table|float|hand:[a-zA-Z0-9_-]+)$/.test(v)) surface = v;
          else errors.push({ line: lineNo, message: `Thuộc tính prop "${token}" không hợp lệ` });
        }
      }
      currentScene.props.push({ type: pTypeParse.data as StudioPropType, x: px, y: py, surface });
      continue;
    }

    const lm = trimmed.match(/^([a-zA-Z0-9_-]+)(?:\s*\[([^\]]*)\])?\s*:\s*(.*)$/);
    if (!lm) { errors.push({ line: lineNo, message: 'Cú pháp thoại sai. Ví dụ: kid [happy, bounce, x=0.3]: Yay!' }); continue; }

    const speaker = lm[1], bracket = lm[2] || '', text = lm[3].trim();
    if (!text) { errors.push({ line: lineNo, message: 'Nội dung câu thoại không được để trống' }); continue; }
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount > 16) errors.push({ line: lineNo, message: `Câu thoại quá dài (${wordCount} từ, tối đa 16 từ)` });

    let emotion: StudioEmotion = 'happy', anim: StudioAnim = 'idle';
    let x = currentScene.characters.length === 0 ? 0.32 : 0.68, y = 0.78;
    let voice: string | undefined;

    if (bracket.trim()) {
      for (const tok of bracket.split(',').map((t) => t.trim()).filter(Boolean)) {
        if (tok.includes('=')) {
          const [k, v] = tok.split('=').map((s) => s.trim());
          if (k === 'x' || k === 'y') {
            const num = Number(v);
            if (Number.isNaN(num) || num < 0 || num > 1) errors.push({ line: lineNo, message: `${k}=${v} phải trong 0..1` });
            else if (k === 'x') x = num; else y = num;
          } else if (k === 'voice') voice = v;
          else if (k === 'bubble') { /* ignore bubble flag in DSL */ }
          else errors.push({ line: lineNo, message: `Thuộc tính "${tok}" không hợp lệ` });
        } else if (EmotionEnum.safeParse(tok).success) emotion = tok as StudioEmotion;
        else if (AnimEnum.safeParse(tok).success) anim = tok as StudioAnim;
        else errors.push({ line: lineNo, message: `Giá trị "${tok}" không phải emotion/anim hợp lệ` });
      }
    }

    const isNarrator = speaker === 'narrator';
    currentScene.lines.push({ speaker, text, emotion, bubble: false });

    if (!isNarrator) {
      const existingChar = currentScene.characters.find((c) => c.id === speaker);
      const decl = declaredChars.get(speaker);
      if (!existingChar) {
        currentScene.characters.push({
          id: speaker, charType: decl?.charType || 'blob',
          color: decl?.color || (speaker === 'mom' ? '#f72585' : '#4cc9f0'),
          emotion, anim, x, y, voice,
        });
      } else if (bracket.trim()) {
        existingChar.emotion = emotion;
        if (anim !== 'idle') existingChar.anim = anim;
        existingChar.x = x; existingChar.y = y;
        if (voice) existingChar.voice = voice;
      }
    }
  }

  if (scenes.length === 0) errors.push({ line: 1, message: 'Kịch bản phải có ít nhất 1 cảnh bắt đầu bằng "---"' });
  for (const sc of scenes) {
    if (sc.lines.length === 0) errors.push({ line: 1, message: `Cảnh "${sc.label}" chưa có câu thoại nào` });
  }
  if (errors.length > 0) return { errors, aspect };
  const baseScript: StudioScript = { title, description: `${title} - BlobToon Studio`, hashtags: ['#blobtoon', '#whatif'], scenes };
  baseScript.thumbnail = { ...deriveDefaultThumbnail(baseScript), ...parsedThumb, text: parsedThumb?.text || deriveDefaultThumbnail(baseScript).text };
  return { aspect, errors: [], script: baseScript };
}
