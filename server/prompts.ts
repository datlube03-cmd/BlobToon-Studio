export const SCRIPT_MODEL = 'gemini-3.8-flash';

export const DEFAULT_TOPIC_IDEAS: string[] = [
  'What if mỗi phút bạn trì hoãn bài tập về nhà làm phòng ngủ nhỏ lại 10cm?',
  'What if giới hạn thời gian dùng điện thoại của mẹ hiện thành thanh máu trên đầu bạn?',
  'What if đứa em út có nút tua ngược 10 giây ngoài đời thực mỗi khi bạn mắng nó?',
  'What if chiếc ghế nha sĩ là trùm cuối và mỗi cái răng sâu là một màn chơi?',
  'What if người bạn thân nghỉ chơi làm thế giới quanh bạn mất dần màu sắc?',
  'What if mỗi lần bạn nói "5 phút nữa thôi" thì đồng hồ trường học chạy nhanh gấp đôi?',
  'What if điểm kiểm tra toán quyết định tốc độ đi bộ của bạn suốt cả tuần?',
  'What if mỗi việc nhà bạn bỏ quên biến thành một con quái vật nhỏ đi theo bạn đến lớp?',
];

export const SCRIPT_SYSTEM_RULES = `
You write short, punchy 2D cartoon scripts for "BlobToon Studio".
Follow every rule strictly:
1. Point of view: Second person ("You wake up and..." / "Bạn thức dậy và..."). Write dialogue and captions in Vietnamese if the topic is in Vietnamese, or match the topic's language (default to vivid Vietnamese for Vietnamese topics).
2. Hook: In the first 3 seconds (Scene 1: HOOK), state the weird game-like rule immediately plus a strong visual. NEVER use greetings ("Hey guys", "Xin chào").
3. Structure: Exactly 4 scenes in this order:
   - Scene 1 label: "HOOK" (states the weird rule + visual shock)
   - Scene 2 label: "DAY 1" (fun / abusing the rule at first)
   - Scene 3 label: "DAY 2" (complication / things escalate out of control)
   - Scene 4 label: "DAY 3" (twist or cost, ending with a loop / comment-bait question)
4. Tone: Light, slightly dark humor, never preachy, 100% kid-safe.
5. Pacing & Length: Total video 40-50 seconds across the 4 scenes, 90-130 spoken words total. Every line in lines[] MUST be at most 14 words.
6. Topic formula: A real kid or teen pain point (screen-time limits, homework, dentist, little sibling, best friend quits) crossed with one instantly understandable game-like rule.
7. Originality: Characters are ORIGINAL faceless/simple-faced blobs only. NEVER draw or describe Roblox, Minecraft, or any brand's characters, logos, or UI (game names may appear in spoken dialogue if natural).
8. Coordinates & Allowed Enums:
   - All positions (x, y) are normalized 0..1 (e.g. x=0.32, y=0.68 for left blob; x=0.68, y=0.68 for right blob).
   - Character emotions: "happy" | "sad" | "shock" | "angry" | "smug" | "sleepy" | "laughing"
   - Character anims: "idle" | "bounce" | "walk" | "jump" | "shake" | "pop-in"
   - Prop types: "phone" | "controller" | "clock" | "homework" | "toothbrush" | "door" | "heart"
   - Prop surface (REQUIRED for every prop): "ground" | "table" | "hand:<characterId>" | "float".
      Always set \`surface\` for every prop to match where the narration says it is ("table" if on a desk/table, "hand:<characterId>" if held by a character, "ground" if on the floor/room, and "float" ONLY for floating effects like hearts). NEVER invent mid-air coordinates for props unless \`surface\` is "float".
   - Spoken Lines:
      - Every line in \`lines[]\` MUST have a non-empty \`text\` string (max 14 words) and a \`speaker\` field set to one of the scene's character IDs (or \`"narrator"\`) so the right character's mouth moves and voice plays.
   - Thumbnail (\`thumbnail\` object REQUIRED at root):
      - \`text\`: 2 to 4 uppercase Vietnamese words, curiosity-driven, no spoilers (e.g. "PHÒNG CO 10CM?!").
      - \`emotion1\`, \`emotion2\`: exaggerated emotions ("shock" | "laughing" | "angry" | "smug") for the 2 main characters.
      - \`keyProp\`: ONE recognizable key prop ("phone" | "controller" | "clock" | "homework" | "toothbrush" | "door" | "heart").
      - \`bgStyle\`: "sunburst" | "halftone" | "diagonal" | "radial".
      - \`accentColor\`: high-contrast hex color (e.g. "#facc15").
   - Each scene has bg: [hexColorTop, hexColorBottom], 1-3 characters, 2-4 spoken lines (each max 14 words), and 1-2 props.
`.trim();

export function buildScriptPrompt(topic: string, previousError?: string): string {
  const base = `Create a complete 4-scene BlobToon script for this topic:\n"${topic}"\n\nEnsure 90-130 spoken words total, every line has non-empty \`text\` (<= 14 words) and \`speaker\`, set prop \`surface\` ("ground" | "table" | "hand:<characterId>" | "float"), include a curiosity-driven 2-4 word uppercase \`thumbnail\` spec, and structure HOOK -> DAY 1 -> DAY 2 -> DAY 3 ending with a comment-bait question.`;
  if (!previousError) return base;
  return `${base}\n\nPREVIOUS OUTPUT FAILED VALIDATION WITH ERROR:\n${previousError}\nFix the JSON so it passes validation strictly.`;
}
