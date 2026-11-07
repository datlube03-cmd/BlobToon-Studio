import { StudioTimeline } from './schema';

export type SkillEffectType =
  | 'pushInZoom' | 'pan' | 'shake' | 'speedChange' | 'transition'
  | 'colorGrade' | 'glitch' | 'letterbox' | 'captionStyle' | 'flash' | 'freezeFrame';

export interface SkillSegmentScope {
  kind: 'scene' | 'lineRange' | 'timeRange';
  sceneIdx?: number;
  startLineIdx?: number;
  endLineIdx?: number;
  startSec?: number;
  endSec?: number;
}

export interface EditSkillPreset {
  id: string;
  name: string;
  description: string;
  parameters: {
    zoomIntensity?: number;
    panX?: number;
    panY?: number;
    shakeAmount?: number;
    speedRate?: number;
    transitionType?: 'none' | 'fade' | 'wipe' | 'zoom' | 'whip';
    brightness?: number;
    contrast?: number;
    saturation?: number;
    tint?: string;
    vignette?: number;
    glitchAmount?: number;
    letterboxRatio?: number;
    captionHighlightColor?: string;
    captionScale?: number;
    flashColor?: string;
    flashDecaySec?: number;
    freezeAtSec?: number;
    freezeDurationSec?: number;
  };
  effects: SkillEffectType[];
}

export interface AppliedSkillInstance {
  instanceId: string;
  presetId: string;
  name: string;
  description: string;
  enabled: boolean;
  order: number;
  scope: SkillSegmentScope;
  parameters: EditSkillPreset['parameters'];
  effects: SkillEffectType[];
}

export const EXAMPLE_EDIT_SKILLS: EditSkillPreset[] = [
  {
    id: 'dramatic-push-in',
    name: '1. Zoom Kịch Tính (Push-In)',
    description: 'Phóng to dần vào nhân vật kèm viền tối nhẹ tạo điểm nhấn.',
    effects: ['pushInZoom', 'colorGrade'],
    parameters: { zoomIntensity: 0.22, contrast: 1.12, vignette: 0.35 },
  },
  {
    id: 'chaos-shake-glitch',
    name: '2. Rung Lắc & Glitch Hỗn Loạn',
    description: 'Rung camera mạnh kèm tách kênh màu glitch và chớp sáng.',
    effects: ['shake', 'glitch', 'flash'],
    parameters: { shakeAmount: 18, glitchAmount: 0.65, flashColor: '#ffffff', flashDecaySec: 0.25 },
  },
  {
    id: 'cinema-letterbox-warm',
    name: '3. Điện Ảnh Letterbox Ấm',
    description: 'Thanh đen điện ảnh an toàn (không che phụ đề) + màu ấm + chuyển cảnh mờ.',
    effects: ['letterbox', 'colorGrade', 'transition'],
    parameters: { letterboxRatio: 0.055, brightness: 1.05, saturation: 1.2, tint: 'rgba(251, 191, 36, 0.10)', transitionType: 'fade' },
  },
  {
    id: 'whip-punch-caption',
    name: '4. Whip Pan & Phụ Đề Nổi Bật',
    description: 'Chuyển cảnh lướt nhanh whip-pan, tăng tốc nhẹ và đổi màu phụ đề hồng neon.',
    effects: ['transition', 'speedChange', 'captionStyle'],
    parameters: { transitionType: 'whip', speedRate: 1.2, captionHighlightColor: '#f43f5e', captionScale: 1.24 },
  },
  {
    id: 'freeze-frame-shock',
    name: '5. Đóng Băng Khoảnh Khắc (Freeze)',
    description: 'Đứng hình 0.45s ở đầu cảnh kèm chớp sáng và tăng tương phản.',
    effects: ['freezeFrame', 'flash', 'colorGrade'],
    parameters: { freezeAtSec: 0.4, freezeDurationSec: 0.45, flashColor: '#fef08a', flashDecaySec: 0.2, contrast: 1.25 },
  },
  {
    id: 'handheld-pan-pop',
    name: '6. Lia Máy Cầm Tay (Pan & Zoom)',
    description: 'Lia máy ngang mượt theo tỉ lệ unit kết hợp phóng nhẹ.',
    effects: ['pan', 'pushInZoom', 'captionStyle'],
    parameters: { panX: 36, panY: -12, zoomIntensity: 0.12, captionHighlightColor: '#38bdf8', captionScale: 1.18 },
  },
];

export function resolveScopeTimeWindow(scope: SkillSegmentScope, timeline: StudioTimeline): { startSec: number; endSec: number } {
  if (scope.kind === 'timeRange') {
    return { startSec: Math.max(0, scope.startSec ?? 0), endSec: Math.min(timeline.totalDurationSec, scope.endSec ?? timeline.totalDurationSec) };
  }
  const sc = timeline.scenes[scope.sceneIdx ?? 0] ?? timeline.scenes[0];
  if (!sc) return { startSec: 0, endSec: timeline.totalDurationSec };
  if (scope.kind === 'lineRange' && sc.lineTimings.length > 0) {
    const sIdx = Math.max(0, Math.min(sc.lineTimings.length - 1, scope.startLineIdx ?? 0));
    const eIdx = Math.max(sIdx, Math.min(sc.lineTimings.length - 1, scope.endLineIdx ?? sIdx));
    return { startSec: sc.lineTimings[sIdx].startSec, endSec: sc.lineTimings[eIdx].endSec };
  }
  return { startSec: sc.startSec, endSec: sc.endSec };
}

export interface EvaluatedSkillFrameState {
  effectiveTimeSec: number;
  zoom: number; panX: number; panY: number; shakeX: number; shakeY: number;
  filterCss: string; tint: string | null; vignette: number;
  glitchAmount: number; letterboxRatio: number;
  flashAlpha: number; flashColor: string;
  transitionType: 'none' | 'fade' | 'wipe' | 'zoom' | 'whip' | null;
  transitionProgress: number;
  captionHighlightColor?: string; captionScale?: number;
}

export function evaluateSkillsAtTime(
  t: number,
  timeline: StudioTimeline,
  skills: AppliedSkillInstance[],
  bypassAll: boolean,
  unit: number
): EvaluatedSkillFrameState {
  const s = unit / 1080;
  const state: EvaluatedSkillFrameState = {
    effectiveTimeSec: t, zoom: 1, panX: 0, panY: 0, shakeX: 0, shakeY: 0,
    filterCss: 'none', tint: null, vignette: 0, glitchAmount: 0, letterboxRatio: 0,
    flashAlpha: 0, flashColor: '#ffffff', transitionType: null, transitionProgress: 1,
  };
  if (bypassAll || skills.length === 0) return state;

  const active = [...skills].filter((sk) => sk.enabled).sort((a, b) => a.order - b.order);
  let brightness = 1, contrast = 1, saturation = 1;

  for (const sk of active) {
    const win = resolveScopeTimeWindow(sk.scope, timeline);
    if (t < win.startSec || t > win.endSec) continue;
    const dur = Math.max(0.1, win.endSec - win.startSec);
    const localSec = t - win.startSec;
    const progress = Math.max(0, Math.min(1, localSec / dur));
    const p = sk.parameters;

    if (sk.effects.includes('freezeFrame') && p.freezeDurationSec) {
      const fStart = p.freezeAtSec ?? 0.3;
      if (localSec >= fStart && localSec <= fStart + p.freezeDurationSec) state.effectiveTimeSec = win.startSec + fStart;
    }
    if (sk.effects.includes('speedChange') && p.speedRate && p.speedRate !== 1) {
      state.effectiveTimeSec = Math.min(win.endSec - 0.01, win.startSec + localSec * p.speedRate);
    }
    if (sk.effects.includes('pushInZoom') && p.zoomIntensity) state.zoom *= 1 + p.zoomIntensity * progress;
    if (sk.effects.includes('pan')) { state.panX += (p.panX ?? 0) * progress * s; state.panY += (p.panY ?? 0) * progress * s; }
    if (sk.effects.includes('shake') && p.shakeAmount) {
      const amt = p.shakeAmount * s;
      state.shakeX += Math.sin(t * 43) * amt; state.shakeY += Math.cos(t * 37) * amt * 0.7;
    }
    if (sk.effects.includes('colorGrade')) {
      brightness *= p.brightness ?? 1; contrast *= p.contrast ?? 1; saturation *= p.saturation ?? 1;
      if (p.tint) state.tint = p.tint;
      if (p.vignette) state.vignette = Math.max(state.vignette, p.vignette);
    }
    if (sk.effects.includes('glitch') && p.glitchAmount) state.glitchAmount = Math.max(state.glitchAmount, p.glitchAmount);
    if (sk.effects.includes('letterbox') && p.letterboxRatio) {
      state.letterboxRatio = Math.max(state.letterboxRatio, Math.min(0.055, p.letterboxRatio));
    }
    if (sk.effects.includes('flash')) {
      const decay = Math.max(0.08, p.flashDecaySec ?? 0.22);
      if (localSec <= decay) { state.flashAlpha = Math.max(state.flashAlpha, (1 - localSec / decay) * 0.75); state.flashColor = p.flashColor || '#ffffff'; }
    }
    if (sk.effects.includes('transition') && p.transitionType && p.transitionType !== 'none' && localSec < 0.32) {
      state.transitionType = p.transitionType; state.transitionProgress = localSec / 0.32;
    }
    if (sk.effects.includes('captionStyle')) {
      if (p.captionHighlightColor) state.captionHighlightColor = p.captionHighlightColor;
      if (p.captionScale) state.captionScale = p.captionScale;
    }
  }

  if (brightness !== 1 || contrast !== 1 || saturation !== 1) {
    state.filterCss = `brightness(${brightness.toFixed(2)}) contrast(${contrast.toFixed(2)}) saturate(${saturation.toFixed(2)})`;
  }
  return state;
}
