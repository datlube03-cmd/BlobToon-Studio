import { AspectRatio } from '../aspect';
import { SkillDefinition } from '../skills/schema';
import {
  Script,
  ScriptSchema,
  countSpokenWords,
  estimateScriptDurationSec,
  PaletteVariation,
  PropType,
  BackgroundType,
} from './schema';
import { PALETTE_VARIATIONS, applyVariationToScript } from './variations';

function detectTopicTheme(topic: string): {
  painPoint: string;
  partnerName: string;
  partnerAccessory: 'glasses' | 'crown' | 'cap' | 'bowtie' | 'bandana';
  primaryProp: PropType;
  secondaryProp: PropType;
  backgrounds: [BackgroundType, BackgroundType, BackgroundType, BackgroundType, BackgroundType];
} {
  const lower = topic.toLowerCase();
  if (
    lower.includes('mom') ||
    lower.includes('roblox') ||
    lower.includes('account') ||
    lower.includes('game')
  ) {
    return {
      painPoint: 'your main gaming account',
      partnerName: 'Mom',
      partnerAccessory: 'glasses',
      primaryProp: 'controller',
      secondaryProp: 'trophy',
      backgrounds: ['room', 'arcade', 'kitchen', 'arcade', 'room'],
    };
  }
  if (
    lower.includes('homework') ||
    lower.includes('school') ||
    lower.includes('shrank') ||
    lower.includes('math')
  ) {
    return {
      painPoint: 'skipping homework',
      partnerName: 'Teacher',
      partnerAccessory: 'bowtie',
      primaryProp: 'homework',
      secondaryProp: 'clock',
      backgrounds: ['school', 'room', 'room', 'school', 'void'],
    };
  }
  if (
    lower.includes('sibling') ||
    lower.includes('brother') ||
    lower.includes('sister') ||
    lower.includes('remote')
  ) {
    return {
      painPoint: 'your little sibling',
      partnerName: 'Lil Bro',
      partnerAccessory: 'cap',
      primaryProp: 'controller',
      secondaryProp: 'phone',
      backgrounds: ['kitchen', 'room', 'street', 'kitchen', 'room'],
    };
  }
  if (lower.includes('dentist') || lower.includes('teeth') || lower.includes('brush')) {
    return {
      painPoint: 'skipping brushing your teeth',
      partnerName: 'Dr. Plaque',
      partnerAccessory: 'crown',
      primaryProp: 'toothbrush',
      secondaryProp: 'heart',
      backgrounds: ['room', 'kitchen', 'school', 'arcade', 'room'],
    };
  }
  if (
    lower.includes('bedtime') ||
    lower.includes('sleep') ||
    lower.includes('coin') ||
    lower.includes('phone')
  ) {
    return {
      painPoint: 'staying up past midnight',
      partnerName: 'Sleep Timer',
      partnerAccessory: 'bandana',
      primaryProp: 'clock',
      secondaryProp: 'phone',
      backgrounds: ['room', 'arcade', 'room', 'void', 'room'],
    };
  }
  return {
    painPoint: 'breaking the house rule',
    partnerName: 'The Enforcer',
    partnerAccessory: 'glasses',
    primaryProp: 'clock',
    secondaryProp: 'phone',
    backgrounds: ['room', 'kitchen', 'school', 'arcade', 'room'],
  };
}

/**
 * Pure deterministic script template builder (no LLM, no external calls).
 */
export function buildDeterministicScript(
  topic: string,
  variation: PaletteVariation = PALETTE_VARIATIONS[0],
  aspect: AspectRatio = '9:16',
  skill?: SkillDefinition
): Script {
  const cleanTopic = topic.trim() || 'What if Mom started playing on your Roblox account';
  const theme = detectTopicTheme(cleanTopic);
  const c1 = variation.characterPalette[0] || '#38bdf8';
  const c2 = variation.characterPalette[1] || '#f472b6';

  const isMomTopic = cleanTopic.toLowerCase().includes('mom');
  const isFastCutSkill = Boolean(
    skill &&
      ((skill.renderParams?.sceneDurationRange &&
        skill.renderParams.sceneDurationRange[1] <= 3.5) ||
        /fast\s*cut|under\s*10\s*words|max\s*2\s*seconds/i.test(skill.styleRules))
  );

  const hookNarration = isFastCutSkill
    ? isMomTopic
      ? 'Skip one chore? Mom takes your gaming account!'
      : `New rule starts now: ${cleanTopic.replace(/\?$/, '').slice(0, 34)}!`
    : isMomTopic
    ? 'Every time you skip a chore, your Mom plays on your main gaming account for one full hour.'
    : `Tonight a new rule starts: ${cleanTopic.replace(/\?$/, '').slice(0, 58)}, and a floating timer tracks every second.`;

  const day1Narration = isFastCutSkill
    ? isMomTopic
      ? 'Day One: Mom mashes buttons and beats the boss!'
      : `Day One: ${theme.partnerName} steps in and boosts your stats!`
    : isMomTopic
    ? 'On Day One, you leave one plate in the sink just to test it. Mom grabs your controller, mashes buttons, and beats the boss you were stuck on.'
    : `On Day One, you test the rule on purpose just to see what happens. You relax while ${theme.partnerName} steps in, and your stats skyrocket.`;

  const day2Narration = isFastCutSkill
    ? isMomTopic
      ? 'Day Two: She trades your sword for a pink hat!'
      : `Day Two: ${theme.partnerName} trades all your rare gear away!`
    : isMomTopic
    ? 'By Day Two, she refuses to log off. She trades your rarest sword for a pink gardening hat and renames your feared clan to Mommy Knows Best.'
    : `By Day Two, the loophole turns into a nightmare. ${theme.partnerName} rewrites your inventory, trades your best gear away, and locks the settings menu.`;

  const day3Narration = isFastCutSkill
    ? isMomTopic
      ? 'Day Three: Your squad votes Mom as clan leader!'
      : `Day Three: Your friends vote ${theme.partnerName} as party leader!`
    : isMomTopic
    ? 'On Day Three, your whole squad joins the server and likes her better than you. She grounds you from your own guild unless you vacuum right now.'
    : `On Day Three, your friends log on and vote ${theme.partnerName} as party leader. Now you must finish every chore just to rent your profile back.`;

  const loopNarration = isFastCutSkill
    ? isMomTopic
      ? 'Wait—Dad just logged into your alt account next!'
      : 'Wait—tomorrow doubles the penalty if you fail again!'
    : isMomTopic
    ? 'Wait until you see whose account Dad just logged into next—would you delete your save file or hand over the controller?'
    : `Then a notification flashes with an even worse deal for tomorrow—would you take that penalty or reset to zero?`;

  const rawScript: Script = {
    aspect,
    ...(skill ? { skill: skill.name } : {}),
    topic: cleanTopic,
    title: cleanTopic.endsWith('?') ? cleanTopic : `${cleanTopic}?`,
    hook: hookNarration,
    description: `${cleanTopic} — A procedural 2D BlobToon video exploring what happens across Day 1, Day 2, and Day 3 when this rule takes over.`,
    hashtags: ['#whatif', '#shorts', '#animation', '#blobtoon', '#gaminghumor'],
    scenes: [
      {
        id: 'scene_hook',
        label: 'THE RULE',
        narration: hookNarration,
        caption: hookNarration,
        background: theme.backgrounds[0],
        transition: skill?.renderParams?.transitionType ?? 'zoom',
        characters: [
          {
            id: 'you',
            name: 'You',
            type: 'blob',
            color: c1,
            accessory: 'headphones',
            hoodieColor: variation.wallAccent,
            size: 1.0,
            x: 0.31,
            y: 0.62,
            emotion: 'shock',
            animation: 'scale-pop',
            speaking: true,
            flipX: false,
          },
          {
            id: 'partner',
            name: theme.partnerName,
            type: 'blob',
            color: c2,
            accessory: theme.partnerAccessory,
            hoodieColor: '#f59e0b',
            size: 1.05,
            x: 0.69,
            y: 0.62,
            emotion: 'smug',
            animation: 'slide-in',
            speaking: false,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'prop_hook_1',
            type: theme.primaryProp,
            x: 0.5,
            y: 0.46,
            scale: 1.15,
            rotation: -12,
            animation: 'bounce',
            label: 'NEW RULE',
          },
        ],
        beats: [
          {
            atProgress: 0.15,
            targetId: 'you',
            emotion: 'shock',
            animation: 'jump',
            bubbleText: 'WAIT WHAT?!',
          },
          {
            atProgress: 0.6,
            targetId: 'partner',
            emotion: 'smug',
            animation: 'bounce',
            bubbleText: 'MY TURN NOW!',
          },
        ],
      },
      {
        id: 'scene_day1',
        label: 'DAY 1',
        narration: day1Narration,
        caption: day1Narration,
        background: theme.backgrounds[1],
        transition: 'wipe',
        characters: [
          {
            id: 'you',
            name: 'You',
            type: 'blob',
            color: c1,
            accessory: 'headphones',
            hoodieColor: variation.wallAccent,
            size: 0.98,
            x: 0.3,
            y: 0.62,
            emotion: 'happy',
            animation: 'bounce',
            speaking: false,
            flipX: false,
          },
          {
            id: 'partner',
            name: theme.partnerName,
            type: 'blob',
            color: c2,
            accessory: theme.partnerAccessory,
            hoodieColor: '#f59e0b',
            size: 1.08,
            x: 0.7,
            y: 0.62,
            emotion: 'laughing',
            animation: 'squash-and-stretch',
            speaking: true,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'prop_d1_1',
            type: theme.secondaryProp,
            x: 0.5,
            y: 0.45,
            scale: 1.1,
            rotation: 8,
            animation: 'spin',
            label: 'BOSS CLEARED!',
          },
        ],
        beats: [
          {
            atProgress: 0.2,
            targetId: 'you',
            emotion: 'happy',
            bubbleText: 'FREE XP!',
          },
          {
            atProgress: 0.65,
            targetId: 'partner',
            emotion: 'laughing',
            animation: 'jump',
            bubbleText: 'TOO EASY!',
          },
        ],
      },
      {
        id: 'scene_day2',
        label: 'DAY 2',
        narration: day2Narration,
        caption: day2Narration,
        background: theme.backgrounds[2],
        transition: 'slide',
        characters: [
          {
            id: 'you',
            name: 'You',
            type: 'blob',
            color: c1,
            accessory: 'hoodie',
            hoodieColor: variation.wallAccent,
            size: 0.98,
            x: 0.32,
            y: 0.62,
            emotion: 'angry',
            animation: 'shake',
            speaking: true,
            flipX: false,
          },
          {
            id: 'partner',
            name: theme.partnerName,
            type: 'blob',
            color: c2,
            accessory: 'crown',
            hoodieColor: '#f59e0b',
            size: 1.1,
            x: 0.68,
            y: 0.62,
            emotion: 'smug',
            animation: 'walk',
            speaking: false,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'prop_d2_1',
            type: 'heart',
            x: 0.46,
            y: 0.46,
            scale: 1.08,
            rotation: -6,
            animation: 'bounce',
            label: 'TRADED!',
          },
          {
            id: 'prop_d2_2',
            type: 'clock',
            x: 0.76,
            y: 0.42,
            scale: 0.92,
            rotation: 0,
            animation: 'shake',
          },
        ],
        beats: [
          {
            atProgress: 0.25,
            targetId: 'you',
            emotion: 'shock',
            animation: 'shake',
            bubbleText: 'MY LEGENDARY?!',
          },
          {
            atProgress: 0.7,
            targetId: 'partner',
            emotion: 'smug',
            bubbleText: 'PINK HAT IS CUTER.',
          },
        ],
      },
      {
        id: 'scene_day3',
        label: 'DAY 3',
        narration: day3Narration,
        caption: day3Narration,
        background: theme.backgrounds[3],
        transition: 'iris',
        characters: [
          {
            id: 'you',
            name: 'You',
            type: 'blob',
            color: c1,
            accessory: 'hoodie',
            hoodieColor: variation.wallAccent,
            size: 0.95,
            x: 0.3,
            y: 0.62,
            emotion: 'sad',
            animation: 'idle',
            speaking: false,
            flipX: false,
          },
          {
            id: 'partner',
            name: theme.partnerName,
            type: 'blob',
            color: c2,
            accessory: 'crown',
            hoodieColor: '#f59e0b',
            size: 1.12,
            x: 0.7,
            y: 0.62,
            emotion: 'laughing',
            animation: 'bounce',
            speaking: true,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'prop_d3_1',
            type: 'door',
            x: 0.5,
            y: 0.45,
            scale: 1.05,
            rotation: 0,
            animation: 'scale-pop',
            label: 'KICKED FROM GUILD',
          },
        ],
        beats: [
          {
            atProgress: 0.2,
            targetId: 'partner',
            emotion: 'smug',
            bubbleText: 'GO VACUUM FIRST!',
          },
          {
            atProgress: 0.68,
            targetId: 'you',
            emotion: 'sad',
            animation: 'squash-and-stretch',
            bubbleText: 'EVEN MY SQUAD?!',
          },
        ],
      },
      {
        id: 'scene_loop',
        label: 'THE LOOP',
        narration: loopNarration,
        caption: loopNarration,
        background: theme.backgrounds[4],
        transition: 'zoom',
        characters: [
          {
            id: 'you',
            name: 'You',
            type: 'blob',
            color: c1,
            accessory: 'headphones',
            hoodieColor: variation.wallAccent,
            size: 1.02,
            x: 0.32,
            y: 0.62,
            emotion: 'shock',
            animation: 'jump',
            speaking: true,
            flipX: false,
          },
          {
            id: 'partner',
            name: theme.partnerName,
            type: 'blob',
            color: c2,
            accessory: theme.partnerAccessory,
            hoodieColor: '#f59e0b',
            size: 1.06,
            x: 0.68,
            y: 0.62,
            emotion: 'sleepy',
            animation: 'spin',
            speaking: false,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'prop_loop_1',
            type: 'phone',
            x: 0.5,
            y: 0.45,
            scale: 1.15,
            rotation: 10,
            animation: 'shake',
            label: 'DAD LOGGED IN',
          },
        ],
        beats: [
          {
            atProgress: 0.25,
            targetId: 'you',
            emotion: 'shock',
            bubbleText: 'NOT DAD TOO!',
          },
        ],
      },
    ],
  };

  return applyVariationToScript(ScriptSchema.parse(rawScript), variation);
}

export function validateScriptConstraints(
  script: Script,
  skill?: SkillDefinition
): {
  valid: boolean;
  wordCount: number;
  estimatedDurationSec: number;
  errors: string[];
} {
  const errors: string[] = [];
  const wordCount = countSpokenWords(script);
  const estimatedDurationSec = estimateScriptDurationSec(script);

  if (script.scenes.length < 1) {
    errors.push('Script must include at least 1 scene.');
  }
  if (!skill && script.scenes.length === 5 && (wordCount < 20 || wordCount > 260)) {
    errors.push(`Spoken word count is out of range (got ${wordCount} words).`);
  }

  return {
    valid: errors.length === 0,
    wordCount,
    estimatedDurationSec,
    errors,
  };
}
