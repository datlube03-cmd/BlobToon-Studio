# BlobToon Plain-Text Script Format (`*.script.txt`)

BlobToon parses human-friendly `.script.txt` files directly into the same `Script` Zod schema as `script.json`.

---

## 1. Complete Example (`examples/demo.script.txt`)

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

--- DAY 3 | bg=#fbcfe8,#e9d5ff | caption="DAY 3: Mom is the new clan leader"
mom [smug, bounce, x=0.68]: Your whole squad just voted me guild leader!
kid [sad, shake, x=0.32, silent]: Not my main account!
narrator: Would you finish every chore or start a brand new save file?
```

---

## 2. Header Fields

| Field | Required | Description |
|-------|----------|-------------|
| `title:` | Yes | Video title (used in thumbnail banner and `meta.json`) |
| `aspect:` | No | `9:16` (default), `16:9`, `4:3`, or `3:4` |
| `voice:` | No | Project-wide default VoiceStudio voice name/ID |
| `skill:` | No | Optional skill file name in `skills/` (e.g. `vietnamese-lacquer`, `example-fastcut`) |
| `description:` | No | Description for `meta.json` |
| `hashtags:` | No | Space or comma-separated hashtags |
| `characters:` | Yes | Indented list of `id: type(color=#hex, voice=Name, accessory=...)` |

### Character Declaration Syntax
```text
characters:
  kid: blob(color=#4cc9f0, voice=Voice A, accessory=headphones)
  bot: robot(color=#fbbf24, accentColor=#f43f5e, voice=Echo)
```
- `type` must match a registered character ID (`blob`, `robot`, or any custom character in `src/characters/`).
- Supported options: `color=#RRGGBB`, `accentColor=#RRGGBB`, `voice=<name>`, `accessory=none|headphones|glasses|crown|cap|hoodie|bowtie|bandana`, `name=<Display Name>`.

---

## 3. Scene Dividers (`---`)

Each scene starts with `---` followed by the scene badge label and optional pipe-separated parameters:

```text
--- DAY 1 | bg=#ffd6a5,#fdffb6 | caption="DAY 1: Mom sets a 1 hour limit" | transition=wipe
```

- `bg`: Either two 6-digit hex colors (`bg=#ffd6a5,#fdffb6`) OR a named stage environment (`room`, `arcade`, `kitchen`, `school`, `street`, `void`). If omitted, BlobToon cycles through the default stage environments.
- `caption`: Overrides the burned-in subtitle text for the scene. If omitted, the subtitle is built from all spoken lines in the scene.
- `transition`: `zoom`, `wipe`, `slide`, `iris`, or `hard-cut`.

---

## 4. Dialogue, Action & Narrator Lines

```text
kid [happy, bounce, x=0.3, voice=Voice A, speed=1.1]: Yay, game time!
kid [shock, walk to x=0.4, silent]: Wait... how?!
narrator: Day one looks easy.
```

- **Auto-Layout (`x`)**: If `x` is omitted, characters are automatically positioned left-to-right in order of appearance (`[0.3, 0.7]` for 2 characters).
- **Default Animation**: If animation is omitted, it is derived from the emotion (`happy` -> `bounce`, `shock` -> `jump`, `angry` -> `shake`, `sad` -> `idle`, `smug` -> `slide-in`, `sleepy` -> `spin`).
- **`walk to x=0.4`**: Sets the animation to `walk` and moves the character to normalized horizontal position `0.4` on that beat.
- **`silent` or `(silent)`**: Displays the character's speech bubble and animation without generating TTS audio for that line.
- **`narrator:`**: Synthesizes voiceover narration without displaying a character speech bubble.
- **Voice Resolution Order**: `line.voice > character.voice > script.voice > VOICESTUDIO_VOICE`.
