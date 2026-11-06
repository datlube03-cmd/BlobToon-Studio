import { PaletteVariation, Script } from './schema';

export const PALETTE_VARIATIONS: PaletteVariation[] = [
  {
    id: 'sunset-arcade',
    name: 'Sơn Mài Hội An (Hội An Lacquer)',
    skyTop: '#2b0908',
    skyBottom: '#5c1410',
    floorColor: '#160605',
    wallAccent: '#f59e0b',
    captionHighlight: '#fde047',
    characterPalette: ['#fbbf24', '#34d399', '#fb7185', '#38bdf8'],
    defaultAccessories: ['headphones', 'glasses', 'hoodie'],
    preferredProps: ['controller', 'phone', 'trophy', 'heart'],
  },
  {
    id: 'mint-classroom',
    name: 'Ngọc Bích Tràng An (Tràng An Jade)',
    skyTop: '#064e3b',
    skyBottom: '#115e59',
    floorColor: '#042f2e',
    wallAccent: '#34d399',
    captionHighlight: '#fde047',
    characterPalette: ['#fbbf24', '#a78bfa', '#f87171', '#60a5fa'],
    defaultAccessories: ['cap', 'glasses', 'bowtie'],
    preferredProps: ['homework', 'clock', 'door', 'trophy'],
  },
  {
    id: 'crimson-curfew',
    name: 'Đèn Lồng Đỏ Son (Crimson Lantern)',
    skyTop: '#450a0a',
    skyBottom: '#7f1d1d',
    floorColor: '#1c1917',
    wallAccent: '#fb7185',
    captionHighlight: '#fde047',
    characterPalette: ['#4ade80', '#38bdf8', '#facc15', '#c084fc'],
    defaultAccessories: ['hoodie', 'crown', 'bandana'],
    preferredProps: ['clock', 'phone', 'door', 'toothbrush'],
  },
  {
    id: 'cobalt-kitchen',
    name: 'Lam Gốm Bát Tràng (Bát Tràng Ceramic)',
    skyTop: '#0c4a6e',
    skyBottom: '#1e3a8a',
    floorColor: '#090d16',
    wallAccent: '#38bdf8',
    captionHighlight: '#38bdf8',
    characterPalette: ['#fb923c', '#f472b6', '#a3e635', '#e879f9'],
    defaultAccessories: ['glasses', 'cap', 'headphones'],
    preferredProps: ['toothbrush', 'clock', 'heart', 'phone'],
  },
  {
    id: 'amber-overdrive',
    name: 'Hoàng Kim Đông Hồ (Đông Hồ Gold)',
    skyTop: '#422006',
    skyBottom: '#713f12',
    floorColor: '#18181b',
    wallAccent: '#facc15',
    captionHighlight: '#fde047',
    characterPalette: ['#22d3ee', '#f43f5e', '#a855f7', '#4ade80'],
    defaultAccessories: ['bandana', 'hoodie', 'crown'],
    preferredProps: ['controller', 'homework', 'clock', 'trophy'],
  },
];

/**
 * Computes a deterministic 32-bit positive integer seed from any string (e.g., topic + index).
 */
export function computeTopicSeed(input: string, index = 0): number {
  let h = 2166136261 ^ index;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0) || 42;
}

export function selectVariationForIndex(index: number): PaletteVariation {
  const safeIdx = Math.abs(index) % PALETTE_VARIATIONS.length;
  return PALETTE_VARIATIONS[safeIdx];
}

export function selectVariationBySeed(seed: number): PaletteVariation {
  return PALETTE_VARIATIONS[Math.abs(seed) % PALETTE_VARIATIONS.length];
}

export function slugifyTopic(topic: string): string {
  const cleaned = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || 'blobtoon-project';
}

export function applyVariationToScript(script: Script, variation: PaletteVariation): Script {
  const cloned: Script = JSON.parse(JSON.stringify(script));
  cloned.scenes = cloned.scenes.map((scene, sIdx) => {
    const updatedChars = scene.characters.map((char, cIdx) => {
      const paletteColor = variation.characterPalette[(cIdx + sIdx) % variation.characterPalette.length];
      const fallbackAcc = variation.defaultAccessories[cIdx % variation.defaultAccessories.length];
      return {
        ...char,
        color: paletteColor,
        accessory: char.accessory === 'none' ? fallbackAcc : char.accessory,
        hoodieColor: variation.wallAccent,
      };
    });
    const updatedProps =
      scene.props.length > 0
        ? scene.props
        : [
            {
              id: `var_prop_${sIdx}`,
              type: variation.preferredProps[sIdx % variation.preferredProps.length],
              x: 0.5,
              y: 0.45,
              scale: 1.05,
              rotation: 0,
              animation: 'bounce' as const,
            },
          ];
    return {
      ...scene,
      characters: updatedChars,
      props: updatedProps,
    };
  });
  return cloned;
}
