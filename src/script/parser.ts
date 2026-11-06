import { AspectRatio, AspectRatioSchema } from '../aspect';
import { validateCharacterTypeId } from '../characters';
import {
  Accessory,
  AccessorySchema,
  AnimationType,
  AnimationTypeSchema,
  BackgroundType,
  BackgroundTypeSchema,
  BeatSpec,
  CharacterSpec,
  Emotion,
  EmotionSchema,
  PropSpec,
  PropType,
  PropTypeSchema,
  SceneSpec,
  Script,
  ScriptLine,
  ScriptSchema,
  TransitionType,
  TransitionTypeSchema,
} from './schema';

const DEFAULT_BACKGROUNDS: BackgroundType[] = [
  'room',
  'arcade',
  'kitchen',
  'school',
  'street',
  'void',
];

const DEFAULT_TRANSITIONS: TransitionType[] = ['zoom', 'wipe', 'slide', 'iris', 'zoom'];

export function deriveDefaultAnimFromEmotion(emotion: Emotion): AnimationType {
  switch (emotion) {
    case 'happy':
      return 'bounce';
    case 'shock':
      return 'jump';
    case 'angry':
      return 'shake';
    case 'sad':
      return 'idle';
    case 'smug':
      return 'slide-in';
    case 'scared':
      return 'shake';
    case 'sleepy':
      return 'spin';
    case 'laughing':
    case 'excited':
      return 'bounce';
  }
}

interface ParsedCharacterHeader {
  id: string;
  name: string;
  type: string;
  color: string;
  accentColor?: string;
  voice?: string;
  accessory: Accessory;
}

function unquote(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function capitalizeName(id: string): string {
  if (!id) return 'Character';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Validates that every character `type` in a Script is registered in the character registry.
 */
export function validateScriptCharactersRegistered(script: Script, sourceLabel = 'script'): void {
  for (let sIdx = 0; sIdx < script.scenes.length; sIdx++) {
    const scene = script.scenes[sIdx];
    for (const char of scene.characters) {
      const typeId = char.type || 'blob';
      const check = validateCharacterTypeId(typeId);
      if (!check.valid) {
        throw new Error(
          `${sourceLabel} (scene "${scene.label}", character "${char.id}"): unknown character type '${typeId}'. Known character types: ${check.knownIds.join(', ')}`
        );
      }
    }
  }
}

/**
 * Parses a plain-text `.script.txt` string into a validated `Script` object.
 * Errors always include the 1-based line number (`line N: ...`) and a clear hint.
 */
export function parseScriptText(rawContent: string, filename = 'script.txt'): Script {
  const lines = rawContent.split(/\r?\n/);

  let title = '';
  let topic = '';
  let aspect: AspectRatio = '9:16';
  let defaultVoice: string | undefined;
  let skill: string | undefined;
  let description = '';
  let hashtags: string[] = ['#whatif', '#shorts', '#animation', '#blobtoon'];

  const characters = new Map<string, ParsedCharacterHeader>();
  let inCharactersBlock = false;
  let seenFirstScene = false;

  interface WorkingScene {
    headerLine: number;
    label: string;
    bgType: BackgroundType;
    bgColors?: [string, string];
    captionOverride?: string;
    transition: TransitionType;
    lines: Array<{
      lineNum: number;
      speakerId: string;
      text: string;
      emotion?: Emotion;
      animation?: AnimationType;
      x?: number;
      walkToX?: number;
      voice?: string;
      speed?: number;
      silent: boolean;
    }>;
    props: PropSpec[];
  }

  const workingScenes: WorkingScene[] = [];
  let currentScene: WorkingScene | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const lineNum = idx + 1;
    const rawLine = lines[idx];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }

    // Scene divider: `--- DAY 1 | bg=#ffd6a5,#fdffb6 | caption="DAY 1: ..."`
    if (trimmed.startsWith('---')) {
      seenFirstScene = true;
      inCharactersBlock = false;

      const afterDashes = trimmed.replace(/^---+\s*/, '').trim();
      const segments = afterDashes
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);

      const sceneIdx = workingScenes.length;
      const label = segments[0] || `SCENE ${sceneIdx + 1}`;
      let bgType: BackgroundType = DEFAULT_BACKGROUNDS[sceneIdx % DEFAULT_BACKGROUNDS.length];
      let bgColors: [string, string] | undefined;
      let captionOverride: string | undefined;
      let transition: TransitionType = DEFAULT_TRANSITIONS[sceneIdx % DEFAULT_TRANSITIONS.length];

      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        const eqPos = seg.indexOf('=');
        if (eqPos === -1) {
          throw new Error(
            `line ${lineNum}: invalid scene option '${seg}'. Expected key=value (e.g. bg=#ffd6a5,#fdffb6 or caption="...").`
          );
        }
        const key = seg.slice(0, eqPos).trim().toLowerCase();
        const val = unquote(seg.slice(eqPos + 1).trim());

        if (key === 'bg' || key === 'background') {
          if (val.includes(',')) {
            const parts = val.split(',').map((p) => p.trim());
            if (
              parts.length !== 2 ||
              !/^#[0-9a-fA-F]{6}$/.test(parts[0]) ||
              !/^#[0-9a-fA-F]{6}$/.test(parts[1])
            ) {
              throw new Error(
                `line ${lineNum}: invalid bg color pair '${val}'. Expected two 6-digit hex colors like bg=#ffd6a5,#fdffb6.`
              );
            }
            bgColors = [parts[0], parts[1]];
          } else {
            const parsedBg = BackgroundTypeSchema.safeParse(val.toLowerCase());
            if (!parsedBg.success) {
              throw new Error(
                `line ${lineNum}: unknown background '${val}'. Known backgrounds: ${BackgroundTypeSchema.options.join(', ')} (or hex pair #top,#bottom).`
              );
            }
            bgType = parsedBg.data;
          }
        } else if (key === 'caption') {
          captionOverride = val;
        } else if (key === 'transition') {
          const parsedTr = TransitionTypeSchema.safeParse(val.toLowerCase());
          if (!parsedTr.success) {
            throw new Error(
              `line ${lineNum}: unknown transition '${val}'. Known: ${TransitionTypeSchema.options.join(', ')}.`
            );
          }
          transition = parsedTr.data;
        } else {
          throw new Error(
            `line ${lineNum}: unknown scene header key '${key}'. Supported: bg, caption, transition.`
          );
        }
      }

      currentScene = {
        headerLine: lineNum,
        label,
        bgType,
        bgColors,
        captionOverride,
        transition,
        lines: [],
        props: [],
      };
      workingScenes.push(currentScene);
      continue;
    }

    // Header section before first `---`
    if (!seenFirstScene) {
      // Check if we are inside `characters:` block (indented line or `id: type(...)`)
      if (inCharactersBlock && (/^\s+/.test(rawLine) || /^([a-zA-Z0-9_-]+)\s*:\s*[a-zA-Z0-9_-]+\s*\(/.test(trimmed))) {
        const charMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*([a-zA-Z0-9_-]+)\s*\((.*)\)\s*$/);
        if (!charMatch) {
          throw new Error(
            `line ${lineNum}: invalid character declaration '${trimmed}'. Expected format: id: type(color=#4cc9f0, voice=Voice A)`
          );
        }
        const charId = charMatch[1].trim().toLowerCase();
        const charType = charMatch[2].trim().toLowerCase();
        const paramsRaw = charMatch[3].trim();

        const typeCheck = validateCharacterTypeId(charType);
        if (!typeCheck.valid) {
          throw new Error(
            `line ${lineNum}: unknown character type '${charType}' for '${charId}'. Known character types: ${typeCheck.knownIds.join(', ')}`
          );
        }

        let color = '#38bdf8';
        let accentColor: string | undefined;
        let voice: string | undefined = typeCheck.definition?.defaultVoice;
        let accessory: Accessory = 'none';
        let displayName = capitalizeName(charId);

        if (paramsRaw.length > 0) {
          const pairs = paramsRaw
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          for (const pair of pairs) {
            const eq = pair.indexOf('=');
            if (eq === -1) {
              throw new Error(
                `line ${lineNum}: invalid character option '${pair}' for '${charId}'. Expected key=value.`
              );
            }
            const k = pair.slice(0, eq).trim().toLowerCase();
            const v = unquote(pair.slice(eq + 1).trim());
            if (k === 'color') {
              if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
                throw new Error(
                  `line ${lineNum}: invalid hex color '${v}' for character '${charId}'. Expected 6-digit hex like #4cc9f0.`
                );
              }
              color = v;
            } else if (k === 'accent' || k === 'accentcolor' || k === 'hoodiecolor') {
              if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
                throw new Error(
                  `line ${lineNum}: invalid accent color '${v}' for character '${charId}'.`
                );
              }
              accentColor = v;
            } else if (k === 'voice') {
              voice = v;
            } else if (k === 'name') {
              displayName = v;
            } else if (k === 'accessory') {
              const accParsed = AccessorySchema.safeParse(v.toLowerCase());
              if (!accParsed.success) {
                throw new Error(
                  `line ${lineNum}: unknown accessory '${v}' for '${charId}'. Known: ${AccessorySchema.options.join(', ')}`
                );
              }
              accessory = accParsed.data;
            } else {
              throw new Error(
                `line ${lineNum}: unknown character parameter '${k}' for '${charId}'. Supported: color, accentColor, voice, accessory, name.`
              );
            }
          }
        }

        characters.set(charId, {
          id: charId,
          name: displayName,
          type: charType,
          color,
          accentColor,
          voice,
          accessory,
        });
        continue;
      }

      inCharactersBlock = false;
      const colonPos = trimmed.indexOf(':');
      if (colonPos === -1) {
        throw new Error(
          `line ${lineNum}: expected header 'key: value' or scene divider '--- SCENE', got '${trimmed}'.`
        );
      }

      const key = trimmed.slice(0, colonPos).trim().toLowerCase();
      const val = unquote(trimmed.slice(colonPos + 1).trim());

      if (key === 'characters') {
        inCharactersBlock = true;
      } else if (key === 'title') {
        title = val;
      } else if (key === 'topic') {
        topic = val;
      } else if (key === 'aspect') {
        const parsedAspect = AspectRatioSchema.safeParse(val);
        if (!parsedAspect.success) {
          throw new Error(
            `line ${lineNum}: invalid aspect '${val}'. Supported: 9:16, 16:9, 4:3, 3:4.`
          );
        }
        aspect = parsedAspect.data;
      } else if (key === 'voice') {
        defaultVoice = val || undefined;
      } else if (key === 'skill') {
        skill = val || undefined;
      } else if (key === 'description') {
        description = val;
      } else if (key === 'hashtags') {
        hashtags = val
          .split(/[\s,]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => (t.startsWith('#') ? t : `#${t}`));
      } else {
        throw new Error(
          `line ${lineNum}: unknown header key '${key}'. Known header keys: title, topic, aspect, voice, skill, description, hashtags, characters.`
        );
      }
      continue;
    }

    // Inside a scene!
    if (!currentScene) {
      throw new Error(`line ${lineNum}: line appears before any '--- SCENE' header.`);
    }

    // Optional prop line: `prop phone [x=0.5, y=0.45, scale=1.1, anim=bounce, label="NEW RULE"]`
    if (/^prop\s+/i.test(trimmed)) {
      const propMatch = trimmed.match(/^prop\s+([a-zA-Z0-9_-]+)(?:\s*\[(.*)\])?\s*$/i);
      if (!propMatch) {
        throw new Error(
          `line ${lineNum}: invalid prop syntax '${trimmed}'. Expected: prop <type> [x=0.5, y=0.45, label="..."]`
        );
      }
      const propTypeRaw = propMatch[1].toLowerCase();
      const propParsed = PropTypeSchema.safeParse(propTypeRaw);
      if (!propParsed.success) {
        throw new Error(
          `line ${lineNum}: unknown prop '${propTypeRaw}'. Known props: ${PropTypeSchema.options.join(', ')}`
        );
      }
      let px = 0.5;
      let py = 0.45;
      let pScale = 1.1;
      let pAnim: AnimationType = 'bounce';
      let pLabel: string | undefined;

      const bracketBody = propMatch[2]?.trim() || '';
      if (bracketBody) {
        const parts = bracketBody.split(',').map((s) => s.trim()).filter(Boolean);
        for (const part of parts) {
          const eq = part.indexOf('=');
          if (eq !== -1) {
            const pk = part.slice(0, eq).trim().toLowerCase();
            const pv = unquote(part.slice(eq + 1).trim());
            if (pk === 'x') px = Number(pv);
            else if (pk === 'y') py = Number(pv);
            else if (pk === 'scale') pScale = Number(pv);
            else if (pk === 'anim' || pk === 'animation') {
              const ap = AnimationTypeSchema.safeParse(pv.toLowerCase());
              if (!ap.success) {
                throw new Error(
                  `line ${lineNum}: unknown animation '${pv}'. Known: ${AnimationTypeSchema.options.join(', ')}`
                );
              }
              pAnim = ap.data;
            } else if (pk === 'label') {
              pLabel = pv;
            }
          }
        }
      }

      currentScene.props.push({
        id: `prop_${workingScenes.length}_${currentScene.props.length + 1}`,
        type: propParsed.data as PropType,
        x: Math.max(0.08, Math.min(0.92, px)),
        y: Math.max(0.18, Math.min(0.85, py)),
        scale: pScale,
        rotation: 0,
        animation: pAnim,
        ...(pLabel ? { label: pLabel } : {}),
      });
      continue;
    }

    // Dialogue / narrator line:
    // `kid [happy, bounce, x=0.3, voice=Voice A, speed=1.1, silent]: Yay, game time!`
    // or `narrator: Day one looks easy.`
    const lineMatch = trimmed.match(/^([a-zA-Z0-9_-]+)(?:\s*\[([^\]]*)\])?\s*:\s*(.+)$/);
    if (!lineMatch) {
      throw new Error(
        `line ${lineNum}: invalid dialogue line '${trimmed}'. Expected format: speaker [emotion, anim, x=0.3]: Dialogue text`
      );
    }

    const speakerId = lineMatch[1].trim().toLowerCase();
    const modifiersRaw = lineMatch[2]?.trim() || '';
    let spokenText = lineMatch[3].trim();

    if (speakerId !== 'narrator' && !characters.has(speakerId)) {
      const knownList = Array.from(characters.keys());
      throw new Error(
        `line ${lineNum}: unknown character '${speakerId}'. Known: ${
          knownList.length > 0 ? knownList.join(', ') : '(none declared in characters: block)'
        }`
      );
    }

    let emotion: Emotion | undefined;
    let animation: AnimationType | undefined;
    let x: number | undefined;
    let walkToX: number | undefined;
    let lineVoice: string | undefined;
    let lineSpeed: number | undefined;
    let silent = false;

    if (spokenText.startsWith('(silent)')) {
      silent = true;
      spokenText = spokenText.replace(/^\(silent\)\s*/i, '').trim();
    } else if (spokenText.endsWith('(silent)')) {
      silent = true;
      spokenText = spokenText.replace(/\s*\(silent\)$/i, '').trim();
    }

    if (modifiersRaw.length > 0) {
      const tokens = modifiersRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      for (const tok of tokens) {
        const lowerTok = tok.toLowerCase();

        if (lowerTok === 'silent' || lowerTok === '(silent)') {
          silent = true;
          continue;
        }

        // `walk to x=0.4`
        const walkMatch = lowerTok.match(/^walk\s+to\s+x\s*=\s*([0-9.]+)$/);
        if (walkMatch) {
          animation = 'walk';
          walkToX = Number(walkMatch[1]);
          if (Number.isNaN(walkToX) || walkToX < 0.08 || walkToX > 0.92) {
            throw new Error(
              `line ${lineNum}: invalid 'walk to x=${walkMatch[1]}'. Expected x between 0.08 and 0.92.`
            );
          }
          continue;
        }

        if (tok.includes('=')) {
          const eq = tok.indexOf('=');
          const mk = tok.slice(0, eq).trim().toLowerCase();
          const mv = unquote(tok.slice(eq + 1).trim());
          if (mk === 'x') {
            x = Number(mv);
            if (Number.isNaN(x) || x < 0.08 || x > 0.92) {
              throw new Error(
                `line ${lineNum}: invalid x=${mv}. Expected a normalized number in [0.08, 0.92].`
              );
            }
          } else if (mk === 'voice') {
            lineVoice = mv;
          } else if (mk === 'speed') {
            lineSpeed = Number(mv);
            if (Number.isNaN(lineSpeed) || lineSpeed <= 0) {
              throw new Error(
                `line ${lineNum}: invalid speed=${mv}. Expected a positive multiplier like 1.1.`
              );
            }
          } else if (mk === 'anim' || mk === 'animation') {
            const parsedAnim = AnimationTypeSchema.safeParse(mv.toLowerCase());
            if (!parsedAnim.success) {
              throw new Error(
                `line ${lineNum}: unknown animation '${mv}'. Known: ${AnimationTypeSchema.options.join(', ')}`
              );
            }
            animation = parsedAnim.data;
          } else if (mk === 'emotion') {
            const parsedEmo = EmotionSchema.safeParse(mv.toLowerCase());
            if (!parsedEmo.success) {
              throw new Error(
                `line ${lineNum}: unknown emotion '${mv}'. Known: ${EmotionSchema.options.join(', ')}`
              );
            }
            emotion = parsedEmo.data;
          } else {
            throw new Error(
              `line ${lineNum}: unknown modifier '${mk}=${mv}'. Supported: x, voice, speed, anim, emotion, silent.`
            );
          }
          continue;
        }

        // Bare token: check if it's an Emotion or AnimationType
        const emoTry = EmotionSchema.safeParse(lowerTok);
        if (emoTry.success) {
          emotion = emoTry.data;
          continue;
        }
        const animTry = AnimationTypeSchema.safeParse(lowerTok);
        if (animTry.success) {
          animation = animTry.data;
          continue;
        }

        throw new Error(
          `line ${lineNum}: unknown modifier '${tok}'. Known emotions: [${EmotionSchema.options.join(
            ', '
          )}]; known animations: [${AnimationTypeSchema.options.join(', ')}].`
        );
      }
    }

    if (!spokenText) {
      throw new Error(`line ${lineNum}: dialogue text for '${speakerId}' cannot be empty.`);
    }

    currentScene.lines.push({
      lineNum,
      speakerId,
      text: spokenText,
      emotion,
      animation,
      x,
      walkToX,
      voice: lineVoice,
      speed: lineSpeed,
      silent,
    });
  }

  if (!title) {
    throw new Error(`line 1: missing required 'title:' header in ${filename}.`);
  }
  if (characters.size === 0) {
    throw new Error(
      `line 1: missing 'characters:' block in ${filename}. Declare at least one character.`
    );
  }
  if (workingScenes.length === 0) {
    throw new Error(
      `line 1: no scenes found in ${filename}. Start each scene with '--- SCENE NAME'.`
    );
  }

  const allDeclaredChars = Array.from(characters.values());

  // Build SceneSpec array
  const scenes: SceneSpec[] = workingScenes.map((ws, sIdx) => {
    if (ws.lines.length === 0) {
      throw new Error(
        `line ${ws.headerLine}: scene '${ws.label}' has no dialogue or narrator lines.`
      );
    }

    // Determine order of appearance of characters in this scene
    const sceneCharIds: string[] = [];
    for (const ln of ws.lines) {
      if (ln.speakerId !== 'narrator' && !sceneCharIds.includes(ln.speakerId)) {
        sceneCharIds.push(ln.speakerId);
      }
    }
    if (sceneCharIds.length === 0) {
      // Narrator-only scene: place declared characters on stage
      for (const ch of allDeclaredChars.slice(0, 2)) {
        sceneCharIds.push(ch.id);
      }
    }

    // Auto-layout positions left-to-right if x is omitted
    const count = sceneCharIds.length;
    const defaultPositions =
      count === 1
        ? [0.5]
        : count === 2
        ? [0.3, 0.7]
        : count === 3
        ? [0.24, 0.5, 0.76]
        : [0.2, 0.4, 0.6, 0.8];

    const sceneCharacters: CharacterSpec[] = sceneCharIds.slice(0, 4).map((cid, cIdx) => {
      const decl = characters.get(cid)!;
      const firstLineForChar = ws.lines.find((l) => l.speakerId === cid);
      const initialEmotion: Emotion = firstLineForChar?.emotion ?? 'happy';
      const initialAnim: AnimationType =
        firstLineForChar?.animation ?? deriveDefaultAnimFromEmotion(initialEmotion);
      const initialX = firstLineForChar?.x ?? defaultPositions[cIdx] ?? 0.5;
      const hasSpokenLine = ws.lines.some((l) => l.speakerId === cid && !l.silent);

      return {
        id: decl.id,
        name: decl.name,
        type: decl.type,
        color: decl.color,
        ...(decl.accentColor ? { accentColor: decl.accentColor } : {}),
        ...(decl.voice ? { voice: decl.voice } : {}),
        accessory: decl.accessory,
        size: 1.0,
        x: initialX,
        y: 0.62,
        emotion: initialEmotion,
        animation: initialAnim,
        speaking: hasSpokenLine,
        flipX: initialX > 0.52,
      };
    });

    // Build beats from character lines so bubbles, emotion changes, and walk-to-x fire in sequence
    const charLines = ws.lines.filter((l) => l.speakerId !== 'narrator');
    const beats: BeatSpec[] = charLines.map((ln, lIdx) => {
      const progress = Number(
        Math.min(0.85, Math.max(0.08, (lIdx + 0.2) / Math.max(1, ws.lines.length))).toFixed(2)
      );
      const emo = ln.emotion;
      const anim = ln.animation ?? (emo ? deriveDefaultAnimFromEmotion(emo) : undefined);
      const targetX = ln.walkToX ?? ln.x;

      return {
        atProgress: progress,
        targetId: ln.speakerId,
        ...(emo ? { emotion: emo } : {}),
        ...(anim ? { animation: anim } : {}),
        bubbleText: ln.text.slice(0, 48),
        ...(targetX !== undefined ? { x: targetX } : {}),
      };
    });

    // Narration combines spoken (non-silent) lines; if all lines are silent, use all line texts for timing
    const spokenLines = ws.lines.filter((l) => !l.silent);
    const narrationText =
      (spokenLines.length > 0 ? spokenLines : ws.lines).map((l) => l.text).join(' ').trim() ||
      ws.label;
    const captionText = ws.captionOverride || narrationText;

    const scriptLines: ScriptLine[] = ws.lines.map((l) => ({
      speakerId: l.speakerId,
      text: l.text,
      ...(l.emotion ? { emotion: l.emotion } : {}),
      ...(l.animation ? { animation: l.animation } : {}),
      ...(l.x !== undefined ? { x: l.x } : {}),
      ...(l.walkToX !== undefined ? { walkToX: l.walkToX } : {}),
      ...(l.voice ? { voice: l.voice } : {}),
      ...(l.speed !== undefined ? { speed: l.speed } : {}),
      silent: l.silent,
    }));

    return {
      id: `scene_${sIdx + 1}`,
      label: ws.label,
      narration: narrationText,
      caption: captionText,
      background: ws.bgType,
      ...(ws.bgColors ? { bgColors: ws.bgColors } : {}),
      transition: ws.transition,
      characters: sceneCharacters,
      props: ws.props,
      beats,
      lines: scriptLines,
    };
  });

  const cleanTopic = topic || title.replace(/\?$/, '');
  const baseFilename = filename.split(/[\\/]/).pop() || filename;
  const rawScript: Script = {
    aspect,
    ...(defaultVoice ? { voice: defaultVoice } : {}),
    ...(skill ? { skill } : {}),
    topic: cleanTopic,
    title,
    hook: scenes[0].narration,
    description:
      description ||
      `${title} — Manual 2D BlobToon cartoon rendered from ${baseFilename}.`,
    hashtags,
    scenes,
  };

  const parsed = ScriptSchema.parse(rawScript);
  validateScriptCharactersRegistered(parsed, filename);
  return parsed;
}

/**
 * Loads and parses either a `.script.txt` or `.json` script file from disk (Node/CLI only).
 */
export function loadScriptFromFile(filePath: string): Script {
  const getBuiltin = (
    process as unknown as { getBuiltinModule?: (id: string) => unknown }
  ).getBuiltinModule;
  if (typeof getBuiltin !== 'function') {
    throw new Error('loadScriptFromFile is only available in Node.js environments.');
  }
  const fs = getBuiltin('node:fs') as typeof import('node:fs');
  const path = getBuiltin('node:path') as typeof import('node:path');
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Script file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf-8');
  if (resolved.endsWith('.txt')) {
    return parseScriptText(raw, path.basename(resolved));
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Invalid JSON in ${path.basename(resolved)}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const res = ScriptSchema.safeParse(json);
  if (!res.success) {
    const details = res.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid Script schema in ${path.basename(resolved)}:\n${details}`);
  }
  validateScriptCharactersRegistered(res.data, path.basename(resolved));
  return res.data;
}

/**
 * Generates a commented starter `.script.txt` template for `npm run new -- "<title>"`.
 */
export function createStarterScriptTemplate(title: string, aspect: AspectRatio = '9:16'): string {
  const cleanTitle = title.trim() || 'What if Mom played on your Roblox account?';
  return `# BlobToon Manual Script (${cleanTitle})
# Edit characters, scenes, emotions, animations, and VoiceStudio voices below.
# Run: npm run validate -- <this-file>
# Render: npm run make -- <this-file> --mock-tts

title: ${cleanTitle}
aspect: ${aspect}
voice: Narrator
characters:
  kid: blob(color=#4cc9f0, voice=Voice A, accessory=headphones)
  mom: blob(color=#f72585, voice=Voice B, accessory=glasses)

--- DAY 1 | bg=#ffd6a5,#fdffb6 | caption="DAY 1: Mom sets a 1 hour limit"
kid [happy, bounce, x=0.3]: Yay, game time!
mom [angry, slide-in, x=0.7]: Hand it over, my turn.
narrator: Day one looks easy.

--- DAY 2 | bg=#caffbf,#9bf6ff
mom [excited, jump, x=0.5]: I beat your high score!
kid [shock, walk to x=0.4]: Wait... how?!

--- DAY 3 | bg=arcade | caption="DAY 3: Mom takes over the whole squad"
mom [smug, bounce, x=0.68]: Your friends just voted me clan leader!
kid [sad, shake, x=0.32, silent]: Even my own squad?!
narrator: Now you have to vacuum the living room just to rent your account back.
`;
}
