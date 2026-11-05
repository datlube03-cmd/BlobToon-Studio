# BlobToon — Multi-Aspect 2D "What If" Cartoon Video Generator

BlobToon is a TypeScript + Remotion CLI tool and Web Studio that turns a one-line topic like `"What if Mom started playing on your Roblox account"` into a finished 2D cartoon video (**MP4, 30fps, 40–50s**) in **any aspect ratio** (`9:16`, `16:9`, `4:3`, `3:4`, or `all`) with synthesized voiceover, word-by-word highlighted burned-in captions, a high-contrast **Thumbnail PNG**, and `meta.json`. Every character, emotion, accessory, prop, and stage backdrop is generated purely from code in SVG.

---

## Supported Aspect Ratios (`src/aspect.ts`)

All aspect ratio presets are defined in a single source of truth (`src/aspect.ts`). The stage layout **adapts** (never stretches) by computing `unit = min(width, height)` and sizing characters, strokes, fonts, speech bubbles, shadows, and props from `unit`:

| Aspect | Resolution | Orientation | Safe Area | Primary Use |
|---|---|---|---|---|
| `9:16` *(default)* | `1080×1920` | Portrait | Top 6%, Left 5%, Right 13%, Bottom 20% (Shorts UI clear) | YouTube Shorts / TikTok / Reels |
| `16:9` | `1920×1080` | Landscape | 5% margin on all sides (+ `1280×720` `thumbnail.png`) | YouTube Landscape |
| `4:3` | `1440×1080` | Landscape | 5% margin on all sides | Classic / Facebook |
| `3:4` | `1080×1440` | Portrait | 5% margin on all sides | Portrait Feed |

---

## Skills Mechanism (`skills/*.md`)

Drop a `.md` skill file into the `skills/` directory to customize writing style, pacing, and Remotion rendering parameters without modifying code or original prompt files.

### 1. Skill File Format Convention (`skills/<name>.md`)

See the pre-written template at `skills/example-fastcut.md`:

```markdown
## name: example-fastcut
description: High-retention fast-cut editing style with rapid 1.5s-2.5s scenes, punchy under-10-word sentences, medium camera shake, zoom punches, bold-pop captions, and hard-cut transitions.

## Style Rules (writing style, pacing, tone)

Fast cuts, short dialogues and sentences under 10 words each, each scene max 2 to 2.5 seconds, hook must appear in the first 1 second with zero filler. Keep energy kinetic, humorous, and immediate.

## Render Params (optional — technical parameters for Remotion)

```json
{
  "sceneDurationRange": [1.5, 2.5],
  "cameraShake": "medium",
  "zoomPunchOnPunchline": true,
  "captionStyle": "bold-pop",
  "transitionType": "hard-cut"
}
```
```

### 2. How to Create and Use a New Skill

1. Create a new file `skills/<your-skill>.md` (or copy `skills/example-fastcut.md`).
2. Fill in `## name: <your-skill>`, `description: <short summary>`, `## Style Rules`, and an optional `## Render Params` JSON block (`sceneDurationRange`, `cameraShake`: `"none" | "low" | "medium" | "high"`, `zoomPunchOnPunchline`: `boolean`, `captionStyle`: `"default" | "bold-pop" | "neon-glow" | "minimal"`, `transitionType`: `"hard-cut" | "fade" | "slide" | "zoom" | "wipe" | "iris"`).
3. Verify your skill syntax and list all installed skills:
   ```bash
   npm run skills
   ```
4. Run `make` with `--skill <your-skill>`:
   ```bash
   npm run make -- "What if Mom started playing on your Roblox account" --skill example-fastcut --aspect 16:9
   ```
   - **Style Rules** are appended at runtime to `prompts/script_system.md` (without overwriting the file on disk).
   - **Render Params** are merged into `timeline.json` and automatically applied by `renderVideo.ts`, `Background.tsx`, `SceneStage.tsx`, and `Caption.tsx`.
   - Omitting `--skill` preserves the standard default behavior unchanged.

---

## Output Directory Layout (`out/<slug>/`)

Each generated video writes a self-contained folder under `out/<slug>/` (and also copies deliverables to `--out` when explicitly passed):

```text
out/<slug>/
├── script.json       # Validated LLM / deterministic script (reused on resume)
├── timeline.json     # Single source of truth timeline with frame, word timings & renderParams
├── audio/            # Per-scene synthesized WAV files (01_scene_hook.wav, ...)
├── video.mp4         # Rendered MP4 (or out_9x16.mp4, out_16x9.mp4, out_4x3.mp4, out_3x4.mp4)
├── thumbnail.png     # Aspect-matched thumbnail (1280x720 for 16:9)
└── meta.json         # Title, description, hashtags, aspect, resolution, seed, skill, renderParams
```

---

## CLI Usage

```bash
# 1. List and validate all skill files in skills/*.md
npm run skills

# 2. Check environment health (Node 22+, ffmpeg/ffprobe, .env keys, prompts/, VoiceStudio reachability)
npm run doctor

# 3. Generate ranked "What If" topic ideas (pain point x game rule) with hook strength & 1-line reason
npm run ideas -- "school homework" --count 10

# 4. Full end-to-end pipeline (with optional --skill and --aspect)
npm run make -- "What if Mom started playing on your Roblox account" --aspect 9:16
npm run make -- "What if Mom started playing on your Roblox account" --skill example-fastcut --aspect 16:9
npm run make -- "What if Mom started playing on your Roblox account" --aspect all

# 5. Render an existing timeline.json or component gallery in one or all aspect ratios
npm run render -- out/what-if-mom-started-playing-on-your-roblox/timeline.json --aspect 16:9
npm run render -- --gallery --aspect all --out out/gallery

# 6. Batch mode across topics.txt with --aspect and --skill support
npm run batch -- topics.txt --aspect 9:16 --out out/batch

# 7. Launch Remotion Studio (use the "aspect" dropdown in composition props to switch live)
npm run preview -- --aspect 16:9

# 8. Launch Web Studio & API server on http://localhost:3000
npm run dev

# 9. Run unit, skill, safe-area & smoke test suite
npm test
```
