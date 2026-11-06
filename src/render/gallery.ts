import { AspectRatio } from '../aspect';
import { listCharacterDefinitions } from '../characters';
import { Script, ScriptSchema } from '../script/schema';
import { PALETTE_VARIATIONS } from '../script/variations';
import { assembleTimelineFromDurations } from '../timeline/builder';
import { Timeline } from '../timeline/schema';

/**
 * Generates a deterministic showcase Script exercising all registered characters (`blob`, `robot`, etc.),
 * emotions, animations, accessories, props, and backgrounds across any aspect ratio.
 */
export function createGalleryScript(aspect: AspectRatio = '9:16'): Script {
  const registeredIds = listCharacterDefinitions().map((d) => d.id);
  const secondType = registeredIds.includes('robot') ? 'robot' : registeredIds[0] || 'blob';

  const raw: Script = {
    aspect,
    topic: 'BlobToon Asset & Character Registry Gallery Showcase',
    title: 'BlobToon Registry Showcase: Blob & Robot Characters',
    hook: 'Meet all registered characters, emotions, animations, accessories, and stage props!',
    description:
      'Automated gallery composition showcasing registered character plugins (blob, robot), emotions, animations, accessories, props, and backgrounds.',
    hashtags: ['#blobtoon', '#remotion', '#svg', '#animation', '#gallery'],
    scenes: [
      {
        id: 'gallery_scene_1',
        label: 'BLOB & ROBOT',
        narration:
          'Welcome to the BlobToon registry! Both squishy Blobs and BoxBot Robots animate with pure SVG math.',
        caption:
          'Welcome to the BlobToon registry! Both squishy Blobs and BoxBot Robots animate with pure SVG math.',
        background: 'room',
        transition: 'zoom',
        characters: [
          {
            id: 'gal_c1',
            name: 'Sky Blob',
            type: 'blob',
            color: '#38bdf8',
            accessory: 'headphones',
            hoodieColor: '#6366f1',
            size: 1.0,
            x: 0.25,
            y: 0.62,
            emotion: 'happy',
            animation: 'bounce',
            speaking: true,
            flipX: false,
          },
          {
            id: 'gal_c2',
            name: 'BoxBot',
            type: secondType,
            color: '#f472b6',
            accentColor: '#38bdf8',
            accessory: 'glasses',
            hoodieColor: '#ec4899',
            size: 1.02,
            x: 0.52,
            y: 0.62,
            emotion: 'shock',
            animation: 'jump',
            speaking: false,
            flipX: false,
          },
          {
            id: 'gal_c3',
            name: 'Mint Blob',
            type: 'blob',
            color: '#34d399',
            accessory: 'crown',
            hoodieColor: '#10b981',
            size: 0.98,
            x: 0.78,
            y: 0.62,
            emotion: 'smug',
            animation: 'walk',
            speaking: false,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'gal_p1',
            type: 'controller',
            x: 0.35,
            y: 0.44,
            scale: 1.1,
            rotation: -10,
            animation: 'bounce',
            label: 'CONTROLLER',
          },
          {
            id: 'gal_p2',
            type: 'trophy',
            x: 0.68,
            y: 0.44,
            scale: 1.1,
            rotation: 8,
            animation: 'spin',
            label: 'TROPHY',
          },
        ],
        beats: [
          {
            atProgress: 0.15,
            targetId: 'gal_c1',
            emotion: 'happy',
            bubbleText: 'BOUNCE + HAPPY!',
          },
          {
            atProgress: 0.55,
            targetId: 'gal_c2',
            emotion: 'shock',
            bubbleText: 'ROBOT SHOCK!',
          },
        ],
      },
      {
        id: 'gallery_scene_2',
        label: 'EMOTIONS 2',
        narration:
          'Next come angry shakes, sad raindrops, scared trembles, and laughing squash and stretch.',
        caption:
          'Next come angry shakes, sad raindrops, scared trembles, and laughing squash and stretch.',
        background: 'arcade',
        transition: 'wipe',
        characters: [
          {
            id: 'gal_c4',
            name: 'Gold Bot',
            type: secondType,
            color: '#fbbf24',
            accentColor: '#f43f5e',
            accessory: 'cap',
            hoodieColor: '#f59e0b',
            size: 1.0,
            x: 0.25,
            y: 0.62,
            emotion: 'angry',
            animation: 'shake',
            speaking: true,
            flipX: false,
          },
          {
            id: 'gal_c5',
            name: 'Violet',
            type: 'blob',
            color: '#a78bfa',
            accessory: 'hoodie',
            hoodieColor: '#7c3aed',
            size: 1.0,
            x: 0.52,
            y: 0.62,
            emotion: 'sad',
            animation: 'idle',
            speaking: false,
            flipX: false,
          },
          {
            id: 'gal_c6',
            name: 'Coral',
            type: 'blob',
            color: '#fb7185',
            accessory: 'bowtie',
            hoodieColor: '#e11d48',
            size: 1.04,
            x: 0.78,
            y: 0.62,
            emotion: 'laughing',
            animation: 'squash-and-stretch',
            speaking: false,
            flipX: true,
          },
        ],
        props: [
          {
            id: 'gal_p3',
            type: 'phone',
            x: 0.36,
            y: 0.44,
            scale: 1.05,
            rotation: 6,
            animation: 'shake',
            label: 'PHONE',
          },
          {
            id: 'gal_p4',
            type: 'clock',
            x: 0.66,
            y: 0.44,
            scale: 1.05,
            rotation: 0,
            animation: 'bounce',
            label: 'TIMER',
          },
        ],
        beats: [
          {
            atProgress: 0.2,
            targetId: 'gal_c4',
            emotion: 'angry',
            bubbleText: 'ANGRY + SHAKE!',
          },
          {
            atProgress: 0.6,
            targetId: 'gal_c6',
            emotion: 'laughing',
            bubbleText: 'SQUASH & STRETCH!',
          },
        ],
      },
      {
        id: 'gallery_scene_3',
        label: 'STAGE & PROPS',
        narration:
          'Finally we test sleepy spins, scared slide-ins, and all remaining props across kitchen and school.',
        caption:
          'Finally we test sleepy spins, scared slide-ins, and all remaining props across kitchen and school.',
        background: 'school',
        transition: 'iris',
        characters: [
          {
            id: 'gal_c7',
            name: 'bandana',
            type: 'blob',
            color: '#38bdf8',
            accessory: 'bandana',
            hoodieColor: '#0284c7',
            size: 1.0,
            x: 0.32,
            y: 0.62,
            emotion: 'scared',
            animation: 'slide-in',
            speaking: true,
            flipX: false,
          },
          {
            id: 'gal_c8',
            name: 'SleepyBot',
            type: secondType,
            color: '#f472b6',
            accentColor: '#facc15',
            accessory: 'none',
            hoodieColor: '#db2777',
            size: 1.0,
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
            id: 'gal_p5',
            type: 'homework',
            x: 0.24,
            y: 0.44,
            scale: 0.95,
            rotation: -8,
            animation: 'bounce',
          },
          {
            id: 'gal_p6',
            type: 'door',
            x: 0.5,
            y: 0.44,
            scale: 0.95,
            rotation: 0,
            animation: 'scale-pop',
          },
          {
            id: 'gal_p7',
            type: 'heart',
            x: 0.76,
            y: 0.44,
            scale: 0.95,
            rotation: 8,
            animation: 'bounce',
          },
        ],
        beats: [
          {
            atProgress: 0.25,
            targetId: 'gal_c7',
            emotion: 'scared',
            bubbleText: 'SLIDE-IN + SCARED!',
          },
        ],
      },
    ],
  };

  return ScriptSchema.parse(raw);
}

export function createGalleryTimeline(aspect: AspectRatio = '9:16'): Timeline {
  const script = createGalleryScript(aspect);
  const durations = script.scenes.map(() => ({ durationSec: 2.55 }));
  return assembleTimelineFromDurations(script, durations, {
    aspect,
    variation: PALETTE_VARIATIONS[0],
    scenePaddingSec: 0.45,
  });
}
