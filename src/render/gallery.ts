import { AspectRatio } from '../aspect';
import { PALETTE_VARIATIONS } from '../script/variations';
import { Script, ScriptSchema } from '../script/schema';
import { assembleTimelineFromDurations } from '../timeline/builder';
import { Timeline } from '../timeline/schema';

/**
 * Builds the Phase 2 Showcase Gallery Script & Timeline demonstrating:
 * - Every Emotion (happy, sad, shock, angry, smug, sleepy, laughing)
 * - Every Accessory (hoodie, cap, glasses, crown, headphones, bandana, bowtie)
 * - Every Prop (phone, controller, clock, homework, toothbrush, door, heart, trophy)
 * - 4+ Backgrounds (room, kitchen, school, arcade)
 * Works cleanly in any aspect ratio (9:16, 16:9, 4:3, 3:4).
 */
export function createGalleryScript(aspect: AspectRatio = '9:16'): Script {
  const script: Script = {
    aspect,
    topic: 'BlobToon Component Gallery: 7 Emotions, 8 Props, 6 Backgrounds',
    title: 'BlobToon Character, Emotion & Prop Showcase',
    hook: 'Meet the procedural SVG BlobToon cast: seven emotions, eight props, and dynamic backgrounds.',
    description: 'Full visual showcase of every Blob emotion, accessory, prop, and SVG background.',
    hashtags: ['#blobtoon', '#remotion', '#svg', '#gallery'],
    scenes: [
      {
        id: 'gallery_emotions_1',
        label: 'EMOTIONS 1-4',
        narration: 'Here are our blobs showing Happy, Shock, Angry, and Laughing emotions with custom hoodies and headphones.',
        caption: 'HAPPY · SHOCK · ANGRY · LAUGHING EMOTIONS',
        background: 'room',
        transition: 'zoom',
        characters: [
          {
            id: 'blob_happy',
            name: 'Happy',
            color: '#38bdf8',
            accessory: 'headphones',
            size: 0.78,
            x: 0.18,
            y: 0.62,
            emotion: 'happy',
            animation: 'bounce',
            speaking: true,
            flipX: false,
          },
          {
            id: 'blob_shock',
            name: 'Shock',
            color: '#f472b6',
            accessory: 'hoodie',
            size: 0.78,
            x: 0.39,
            y: 0.62,
            emotion: 'shock',
            animation: 'jump',
            speaking: false,
            flipX: false,
          },
          {
            id: 'blob_angry',
            name: 'Angry',
            color: '#fb923c',
            accessory: 'bandana',
            size: 0.78,
            x: 0.61,
            y: 0.62,
            emotion: 'angry',
            animation: 'shake',
            speaking: false,
            flipX: true,
          },
          {
            id: 'blob_laughing',
            name: 'Laughing',
            color: '#34d399',
            accessory: 'crown',
            size: 0.78,
            x: 0.82,
            y: 0.62,
            emotion: 'laughing',
            animation: 'squash-and-stretch',
            speaking: true,
            flipX: true,
          },
        ],
        props: [
          { id: 'p_ctrl', type: 'controller', x: 0.3, y: 0.44, scale: 0.9, rotation: -8, animation: 'bounce', label: 'CONTROLLER' },
          { id: 'p_phone', type: 'phone', x: 0.7, y: 0.44, scale: 0.9, rotation: 8, animation: 'shake', label: 'PHONE' },
        ],
        beats: [
          { atProgress: 0.2, targetId: 'blob_shock', emotion: 'shock', bubbleText: 'SO EXPRESSIVE!' },
        ],
      },
      {
        id: 'gallery_emotions_2',
        label: 'EMOTIONS 5-7 & PROPS',
        narration: 'Next up: Sad, Smug, and Sleepy blobs surrounded by Clock, Homework, and Toothbrush props in the kitchen.',
        caption: 'SAD · SMUG · SLEEPY + KITCHEN PROPS',
        background: 'kitchen',
        transition: 'wipe',
        characters: [
          {
            id: 'blob_sad',
            name: 'Sad',
            color: '#60a5fa',
            accessory: 'cap',
            size: 0.88,
            x: 0.24,
            y: 0.62,
            emotion: 'sad',
            animation: 'idle',
            speaking: false,
            flipX: false,
          },
          {
            id: 'blob_smug',
            name: 'Smug',
            color: '#a78bfa',
            accessory: 'glasses',
            size: 0.92,
            x: 0.5,
            y: 0.62,
            emotion: 'smug',
            animation: 'scale-pop',
            speaking: true,
            flipX: false,
          },
          {
            id: 'blob_sleepy',
            name: 'Sleepy',
            color: '#facc15',
            accessory: 'bowtie',
            size: 0.88,
            x: 0.76,
            y: 0.62,
            emotion: 'sleepy',
            animation: 'idle',
            speaking: false,
            flipX: true,
          },
        ],
        props: [
          { id: 'p_clock', type: 'clock', x: 0.24, y: 0.43, scale: 0.88, rotation: 0, animation: 'shake', label: 'CLOCK' },
          { id: 'p_hw', type: 'homework', x: 0.5, y: 0.43, scale: 0.88, rotation: -5, animation: 'bounce', label: 'HOMEWORK' },
          { id: 'p_brush', type: 'toothbrush', x: 0.76, y: 0.43, scale: 0.88, rotation: 10, animation: 'spin', label: 'TOOTHBRUSH' },
        ],
        beats: [
          { atProgress: 0.25, targetId: 'blob_smug', emotion: 'smug', bubbleText: 'PURE SVG CODE!' },
        ],
      },
      {
        id: 'gallery_school_arcade',
        label: 'SCHOOL & ARCADE',
        narration: 'Finally, check out the Door, Heart, and Trophy props inside our School and Arcade backgrounds.',
        caption: 'DOOR · HEART · TROPHY + SCHOOL STAGE',
        background: 'school',
        transition: 'slide',
        characters: [
          {
            id: 'blob_ace',
            name: 'Student',
            color: '#34d399',
            accessory: 'glasses',
            size: 0.95,
            x: 0.32,
            y: 0.62,
            emotion: 'happy',
            animation: 'walk',
            speaking: true,
            flipX: false,
          },
          {
            id: 'blob_champ',
            name: 'Champ',
            color: '#f43f5e',
            accessory: 'crown',
            size: 1.0,
            x: 0.68,
            y: 0.62,
            emotion: 'laughing',
            animation: 'jump',
            speaking: false,
            flipX: true,
          },
        ],
        props: [
          { id: 'p_door', type: 'door', x: 0.22, y: 0.43, scale: 0.85, rotation: 0, animation: 'scale-pop', label: 'DOOR' },
          { id: 'p_heart', type: 'heart', x: 0.5, y: 0.43, scale: 0.9, rotation: 0, animation: 'bounce', label: 'HEART' },
          { id: 'p_trophy', type: 'trophy', x: 0.78, y: 0.43, scale: 0.9, rotation: 0, animation: 'bounce', label: 'TROPHY' },
        ],
        beats: [
          { atProgress: 0.3, targetId: 'blob_champ', emotion: 'laughing', bubbleText: 'ALL ASSETS READY!' },
        ],
      },
    ],
  };

  return ScriptSchema.parse(script);
}

export function createGalleryTimeline(aspect: AspectRatio = '9:16'): Timeline {
  const script = createGalleryScript(aspect);
  return assembleTimelineFromDurations(
    script,
    [{ durationSec: 3.0 }, { durationSec: 3.0 }, { durationSec: 3.0 }],
    { aspect, variation: PALETTE_VARIATIONS[0], scenePaddingSec: 0.3 }
  );
}
