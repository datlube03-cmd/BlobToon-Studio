# BlobToon — Manual 2D Cartoon Renderer (Script In, Video Out)

BlobToon turns your hand-written `.script.txt` or `script.json` files into finished 2D cartoon videos (**MP4 @ 30fps**), burned-in word-by-word highlighted captions (bundled OFL **Fredoka Bold** font measured via `opentype.js`), procedural WebAudio/PCM sound effects (**SFX**), custom **Remotion** SVG character plugins (`blob`, `robot`, or your own), **VoiceStudio** local TTS synthesis, a high-contrast **Thumbnail PNG**, and **Meta JSON**.

Everything is generated deterministically from your scripts and React/SVG code — **zero LLM calls, zero API keys, and zero hand-drawn external assets required**.

---

## 1. Quick Start

```bash
# 1. Check Node, ffmpeg, ffprobe, VoiceStudio & bundled OFL font
npm run doctor

# 2. Scaffold a new project in projects/<slug>/script.txt
npm run new -- "What if Mom played on your Roblox account?"

# 3. Validate any .script.txt or .script.json file (reports exact line numbers on error)
npm run validate -- examples/demo.script.txt

# 4. Render examples/demo.script.txt with offline MockProvider TTS
npm run make -- examples/demo.script.txt --mock-tts

# 5. Render in a specific aspect ratio (9:16, 16:9, 4:3, 3:4, or all)
npm run render -- examples/demo.script.txt --mock-tts --aspect 16:9
npm run render -- examples/demo.script.txt --mock-tts --aspect all
```

---

## 2. Writing a Script (`*.script.txt`)

See [`docs/script-format.md`](docs/script-format.md) for the full specification.

```text
title: What if Mom played on your Roblox account?
aspect: 9:16
voice: Narrator
characters:
  kid: blob(color=#4cc9f0, voice=Voice A)
  mom: blob(color=#f72585, voice=Voice B)

--- DAY 1 | bg=#ffd6a5,#fdffb6 | caption="DAY 1: Mom sets a 1 hour limit"
kid [happy, bounce, x=0.3]: Yay, game time!
mom [angry, slide-in, x=0.7]: Hand it over, my turn.
narrator: Day one looks easy.

--- DAY 2 | bg=#caffbf,#9bf6ff
mom [excited, jump, x=0.5]: I beat your high score!
kid [shock, walk to x=0.4]: Wait... how?!
```

You can also author scripts in JSON (`examples/demo.script.json`) validated against [`schema/script.schema.json`](schema/script.schema.json) for full VS Code autocomplete.

---

## 3. Adding Custom Characters (`defineCharacter`), Animations (`defineAnim`) & Props (`defineProp`)

See [`docs/adding-a-character.md`](docs/adding-a-character.md) and the starter template in [`src/characters/_template.tsx`](src/characters/_template.tsx).

Built-in characters registered in `src/characters/`:
- `blob` (`src/characters/Blob.tsx`) — Squishy pear-shaped 2D cartoon blob with 8 accessories
- `robot` (`src/characters/Robot.tsx`) — BoxBot 3000 square robot with antenna, LED visor eyes, and digital equalizer mouth

---

## 4. Selecting & Auditioning Voices (VoiceStudio)

Voices resolve in this order:
`line.voice > character.voice > script.voice (project default) > VOICESTUDIO_VOICE (env)`

```bash
# List available VoiceStudio voices or setup instructions
npm run voices

# Synthesize and audition a single line to out/say_<voice>.wav
npm run say -- "Hand it over, my turn!" --voice "Voice B" --speed 1.1 --mock-tts
```

---

## 5. Aspect Ratios (`src/aspect.ts`)

| Aspect | Resolution | Use Case |
|--------|------------|----------|
| `9:16` (default) | `1080×1920` | Shorts / TikTok / Reels |
| `16:9` | `1920×1080` | YouTube Landscape |
| `4:3` | `1440×1080` | Classic / Desktop Feed |
| `3:4` | `1080×1440` | Portrait Feed |

---

## 6. Interactive Web UI & Tests

```bash
# Launch the interactive Script Editor & Multi-Aspect Remotion Stage UI on http://localhost:3000
npm run dev

# Run the automated test suite (no API key or network required)
npm test
```
