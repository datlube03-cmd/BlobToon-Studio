# BlobToon — Multi-Aspect 2D "What If" Cartoon Video Generator

BlobToon is a TypeScript + Remotion CLI tool and Web Studio that turns a one-line topic like `"What if Mom started playing on your Roblox account"` into a finished 2D cartoon video (**MP4, 30fps, 40–50s**) in **any aspect ratio** (`9:16`, `16:9`, `4:3`, `3:4`, or `all`) with synthesized voiceover, procedural sound effects (SFX), optional background music (BGM), word-by-word highlighted burned-in captions, a high-contrast **Thumbnail PNG**, and `meta.json`. Every character, emotion, accessory, prop, stage backdrop, and sound effect is generated purely from code.

---

## Supported Aspect Ratios (`src/aspect.ts`)

All aspect ratio presets and caption/stage metrics are defined in a single source of truth (`src/aspect.ts`). The stage layout **adapts** (never stretches) by computing `unit = min(width, height)` and sizing characters, strokes, fonts, speech bubbles, shadows, and props from `unit`:

| Aspect | Resolution | Orientation | Caption `fontSize` / `maxWidth` | Safe Area | Primary Use |
|---|---|---|---|---|---|
| `9:16` *(default)* | `1080×1920` | Portrait | `unit * 0.042` / `86%` width | Top 6%, Left 5%, Right 13%, Bottom 20% | YouTube Shorts / TikTok / Reels |
| `16:9` | `1920×1080` | Landscape | `unit * 0.039` / `58%` width | 5% margin on all sides (+ `1280×720` `thumbnail.png`) | YouTube Landscape |
| `4:3` | `1440×1080` | Landscape | `unit * 0.039` / `70%` width | 5% margin on all sides | Classic / Facebook |
| `3:4` | `1080×1440` | Portrait | `unit * 0.040` / `86%` width | 5% margin on all sides | Portrait Feed |

Across all ratios, `wordGap = fontSize * 0.28`, `lineHeight = fontSize * 1.18`, `letterSpacing = 0`, and `outlineStroke = fontSize * 0.12`. Active word highlighting scales in-place without changing text layout or word advance.

---

## Code-Generated Sound Effects (`src/sfx/`)

All sound effects are synthesized in pure TypeScript DSP (`src/sfx/synth.ts`) as 44.1 kHz 16-bit mono WAV files (normalized to `<= 0.8` peak) and cached deterministically in `cache/sfx/<name>_<variant>.wav`. No external audio assets or network calls are required.

### 1. How SFX Events Are Derived (`src/sfx/events.ts`)

`collectSfxEvents(timeline, fps)` is a pure function that inspects the timeline and returns sorted `SfxEvent[]` items:
- **Scene transitions** (`sceneIdx > 0`): `whoosh` for `slide`/`wipe`/`fade`, `swish` for `zoom`/`iris`, `pop` (volume `0.6`) for `hard-cut`.
- **Character entrances**: `pop` at `enterFrame` (staggered by `80ms` when multiple characters enter together).
- **Speech bubbles**: `pop` (volume `0.5`) when a speech bubble appears.
- **Character animations**:
  - `bounce` / `jump`: `boing` on takeoff + `thud` (volume `0.5`) on landing (`+0.35s`).
  - `walk`: `tick` every `0.28s` while walking (volume `0.4`).
  - `shake`: `rattle` at animation start.
- **Prop entrances**: `swish` when a prop enters (`enterFrame`).
- **Emotion changes**:
  - `shock` -> `gasp`
  - `sad` -> `sad` (wah-wah slide)
  - `angry` -> `buzz`
  - `laughing` / `happy` (when newly entering that emotion) -> `ding`
- **Anti-spam & polyphony rules**:
  - Never fires two events of the same `SfxName` on the same frame.
  - Caps simultaneous overlapping SFX at `<= 3` (dropping lowest-priority overlaps).
- **Manual per-scene overrides**:
  - Mute a scene's automatic SFX: set `"sfx": false` on the scene in `script.json` / `timeline.json`.
  - Add custom scene cues: set `"sfx": [{ "type": "ding", "atSec": 0.4, "volume": 0.9 }]`.

### 2. How to Add a New Sound Effect

1. Add the new sound identifier to `SFX_NAMES` in `src/script/schema.ts`.
2. Add its synthesizer definition (`durationSec` + `render(ctx)` sample generator) to `SFX_REGISTRY` in `src/sfx/synth.ts`.
3. Optionally map an animation, prop, or emotion trigger to the new sound in `collectSfxEvents()` (`src/sfx/events.ts`).
4. Run `npm run sfx:demo` and `npm test` to verify the waveform, peak level (`<= 0.8`), and WAV cache output.

### 3. How to Control or Disable SFX & Music

- **CLI flags** (supported on `make`, `render`, and `batch`):
  ```bash
  # Default: SFX enabled at volume 0.35 (-18 dB under voiceover)
  npm run make -- "What if Mom started playing on your Roblox account" --sfx on --sfx-volume 0.35

  # Disable SFX completely (voiceover only)
  npm run render -- out/timeline.json --sfx off

  # Mix optional background music (looped/trimmed to video length, ducked under voiceover)
  npm run render -- out/timeline.json --music path/to/bgm.wav --music-volume 0.15

  # Render a 6-second demo showcasing all 11 procedural SFX + emotions + props
  npm run sfx:demo
  ```
- **Web UI**: Use the **SFX ON/OFF** toggle and volume slider next to the aspect ratio selector in the top header bar.

---

## Skills Mechanism (`skills/*.md`)

Drop a `.md` skill file into the `skills/` directory to customize writing style, pacing, audio/TTS, and Remotion visual styling without modifying code or original prompt files.

### Built-in Skills
- `skills/example-fastcut.md`: Fast 1.5s–2.5s cuts, `ttsSpeedMultiplier: 1.25`, `sfxIntensity: "high"`, `bgmGenre: "arcade-rush"`, `cameraShake: "medium"`, `captionStyle: "bold-pop"`, `transitionType: "hard-cut"`.
- `skills/example-darkmode.md`: Dark/Neon Cyberpunk theme (`colorPalette` of 7 hex codes, custom `fontFamily`, `captionStyle: "neon-glow"`, `bgmGenre: "cyber-synth"`, `ttsSpeedMultiplier: 1.1`).

### Skill Render Params Schema (`src/skills/schema.ts`)

```json
{
  "sceneDurationRange": [1.5, 2.5],
  "cameraShake": "medium",
  "zoomPunchOnPunchline": true,
  "captionStyle": "bold-pop",
  "transitionType": "hard-cut",
  "bgmGenre": "arcade-rush",
  "sfxIntensity": "high",
  "ttsSpeedMultiplier": 1.25,
  "colorPalette": ["#060714", "#121536", "#00F5D4", "#FF2A85", "#FEE440"],
  "fontFamily": "'Space Grotesk', 'DejaVu Sans', sans-serif"
}
```

---

## CLI Usage

```bash
# 1. List and validate all skill files in skills/*.md
npm run skills

# 2. Render the 6s procedural SFX & emotion showcase video (out/sfx-demo/video.mp4)
npm run sfx:demo

# 3. Check environment health (Node 22+, ffmpeg/ffprobe, .env keys, prompts/, VoiceStudio reachability)
npm run doctor

# 4. Generate ranked "What If" topic ideas (pain point x game rule)
npm run ideas -- "school homework" --count 10

# 5. Full end-to-end pipeline (with optional --skill, --aspect, --sfx, --music)
npm run make -- "What if Mom started playing on your Roblox account" --aspect 9:16
npm run make -- "What if Mom started playing on your Roblox account" --skill example-fastcut --aspect 16:9
npm run make -- "What if Mom started playing on your Roblox account" --skill example-darkmode --aspect 9:16

# 6. Render an existing timeline.json or component gallery in one or all aspect ratios
npm run render -- out/what-if-mom-started-playing-on-your-roblox/timeline.json --aspect 16:9
npm run render -- --gallery --aspect all --out out/gallery

# 7. Batch mode across topics.txt
npm run batch -- topics.txt --aspect 9:16 --out out/batch

# 8. Launch Remotion Studio
npm run preview -- --aspect 16:9

# 9. Launch Web Studio & API server on http://localhost:3000
npm run dev

# 10. Run unit, caption-spacing, SFX synth/events, skill, safe-area & smoke test suite
npm test
```
