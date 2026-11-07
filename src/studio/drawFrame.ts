import { computeSafeArea, getAspectPreset } from '../aspect';
import { drawWordByWordCaption } from './captions';
import { CharacterDrawFn, createSeededRandom } from './characterCode';
import { AppliedSkillInstance, evaluateSkillsAtTime } from './editSkills';
import { CharacterMotionAnchor, drawStudioProp, drawTableSurface, getSceneSurfaces, resolvePropBox, SceneSurfaces } from './props';
import { DEFAULT_LAYOUT, StageLayout, StudioAnim, StudioCharacter, StudioEmotion, StudioTimeline, TimelineScene } from './schema';

export interface DrawFrameOptions {
  customCharFns?: Map<string, CharacterDrawFn>;
  appliedSkills?: AppliedSkillInstance[];
  bypassSkills?: boolean;
  showBubbles?: boolean;
}

function backOut(p: number): number {
  return 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
}

/** Wraps line text to at most 2 lines of <= 28 chars; returns null if empty or too long. */
export function wrapBubbleText(rawText: string, maxChars = 28): string[] | null {
  const clean = (rawText || '').trim();
  if (!clean) return null;
  const lines: string[] = [];
  let cur = '';
  for (const w of clean.split(/\s+/)) {
    if (w.length > maxChars) return null;
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) cur = next;
    else { lines.push(cur); if (lines.length >= 2) return null; cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 && lines.length <= 2 ? lines : null;
}

function computeMotion(anim: StudioAnim, localSec: number, unit: number) {
  const s = unit / 1080;
  let dx = 0, sx = 1, sy = 1, lift = 0;
  if (anim === 'idle') { const b = Math.sin(localSec * 3.8); sx = 1 + b * 0.035; sy = 1 - b * 0.035; }
  else if (anim === 'bounce') { const b = Math.abs(Math.sin(localSec * 5.2)); lift = b * 42 * s; sy = 1 + (b - 0.3) * 0.1; sx = 1 - (b - 0.3) * 0.08; }
  else if (anim === 'walk') { dx = Math.sin(localSec * 2.6) * 48 * s; lift = Math.abs(Math.sin(localSec * 6.5)) * 18 * s; }
  else if (anim === 'jump') {
    const phase = (localSec * 1.4) % 1, arc = phase < 0.65 ? Math.sin((phase / 0.65) * Math.PI) : 0;
    lift = arc * 115 * s; sy = arc > 0.1 ? 1.08 : 0.9; sx = arc > 0.1 ? 0.93 : 1.1;
  } else if (anim === 'shake') { dx = Math.sin(localSec * 34) * 14 * s; }
  else if (anim === 'pop-in') { const p = Math.min(1, localSec / 0.45); sx = sy = backOut(p); lift = (1 - p) * 40 * s; }
  return { dx, dy: -lift, sx, sy, lift };
}

function resolveCharacterPosition(char: StudioCharacter, idx: number, total: number, layout: StageLayout) {
  const preset = getAspectPreset(layout.aspect), safe = computeSafeArea(layout.aspect);
  const marginX = layout.unit * 0.12;
  const normX = !preset.isPortrait && total > 1 ? ((idx + 0.5) / total) * 0.55 + char.x * 0.45 : char.x;
  const x = Math.max(safe.left + marginX, Math.min(safe.right - marginX, safe.left + normX * safe.width));
  return { x, y: layout.groundY };
}

function drawBackground(ctx: CanvasRenderingContext2D, scene: TimelineScene, layout: StageLayout, surfaces: SceneSurfaces) {
  const { width: w, height: h, unit } = layout, s = unit / 1080;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, scene.bg[0] || '#1e1b4b'); grad.addColorStop(1, scene.bg[1] || '#312e81');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#222222'; ctx.lineWidth = Math.max(4, 8 * s);
  if (scene.bgKind === 'room') { ctx.fillStyle = 'rgba(15, 23, 42, 0.55)'; ctx.fillRect(w * 0.12, h * 0.22, 250 * s, 250 * s); ctx.strokeRect(w * 0.12, h * 0.22, 250 * s, 250 * s); }
  else if (scene.bgKind === 'school') { ctx.fillStyle = '#064e3b'; ctx.fillRect(w * 0.14, h * 0.22, w * 0.72, 260 * s); ctx.strokeRect(w * 0.14, h * 0.22, w * 0.72, 260 * s); }
  ctx.fillStyle = '#141420'; ctx.fillRect(0, surfaces.floorY, w, h - surfaces.floorY);
  ctx.beginPath(); ctx.moveTo(0, surfaces.floorY); ctx.lineTo(w, surfaces.floorY); ctx.stroke();
  drawTableSurface(ctx, surfaces, layout);
}

function drawCharacter(
  ctx: CanvasRenderingContext2D, char: StudioCharacter, anchor: CharacterMotionAnchor,
  motion: { sx: number; sy: number; lift: number }, emotion: StudioEmotion,
  speaking: boolean, localSec: number, layout: StageLayout, sizeBoost: number, customFn?: CharacterDrawFn
) {
  const s = (layout.unit / 1080) * sizeBoost, shadowScale = Math.max(0.35, 1 - motion.lift / (180 * s));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath(); ctx.ellipse(anchor.x + anchor.dx, anchor.y + 14 * s, 105 * s * shadowScale, 24 * s * shadowScale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(anchor.x + anchor.dx, anchor.y + anchor.dy);
  if (customFn) {
    ctx.scale(motion.sx * sizeBoost, motion.sy * sizeBoost);
    try {
      customFn(ctx, localSec, { emotion, anim: char.anim, speaking, facing: anchor.facing, color: char.color || '#38bdf8', accentColor: '#facc15', unit: layout.unit, seededRandom: createSeededRandom(char.id.length * 17) });
      ctx.restore(); return;
    } catch { /* fallback to built-in blob */ }
  }
  ctx.scale(motion.sx * s, motion.sy * s);
  ctx.fillStyle = char.color || '#38bdf8'; ctx.strokeStyle = '#222222'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(-105, 0); ctx.bezierCurveTo(-115, -155, -75, -235, 0, -235);
  ctx.bezierCurveTo(75, -235, 115, -155, 105, 0); ctx.quadraticCurveTo(0, 22, -105, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#222222'; ctx.strokeStyle = '#222222'; ctx.lineWidth = 7;
  const eyeY = -125;
  if (emotion === 'sleepy' || emotion === 'laughing') {
    for (const ex of [-36, 36]) { ctx.beginPath(); ctx.arc(ex, eyeY, 14, Math.PI, 0, emotion === 'sleepy'); ctx.stroke(); }
  } else {
    const r = emotion === 'shock' ? 16 : 12;
    ctx.beginPath(); ctx.arc(-36, eyeY, r, 0, Math.PI * 2); ctx.arc(36, eyeY, r, 0, Math.PI * 2); ctx.fill();
  }
  if (emotion === 'angry' || emotion === 'smug') {
    ctx.beginPath(); ctx.moveTo(-54, eyeY - 28); ctx.lineTo(-18, eyeY - 16);
    ctx.moveTo(54, eyeY - 22); ctx.lineTo(18, eyeY - (emotion === 'angry' ? 14 : 28)); ctx.stroke();
  }
  const mouthY = -75;
  ctx.beginPath();
  if (speaking) { ctx.ellipse(0, mouthY, 22, 8 + Math.abs(Math.sin(localSec * 22)) * 20, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (emotion === 'sad') { ctx.arc(0, mouthY + 14, 20, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  else if (emotion === 'shock') { ctx.arc(0, mouthY, 14, 0, Math.PI * 2); ctx.stroke(); }
  else { ctx.arc(0, mouthY - 6, 22, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  ctx.restore();
}

export function drawFrame(
  ctx: CanvasRenderingContext2D, t: number, timeline: StudioTimeline,
  layout: StageLayout = DEFAULT_LAYOUT, options?: DrawFrameOptions
): void {
  const scenes = timeline.scenes;
  if (!scenes.length) return;
  const sk = evaluateSkillsAtTime(t, timeline, options?.appliedSkills ?? [], Boolean(options?.bypassSkills), layout.unit);
  const clampedT = Math.max(0, Math.min(sk.effectiveTimeSec, timeline.totalDurationSec - 0.001));
  const scene = scenes.find((s) => clampedT >= s.startSec && clampedT < s.endSec) ?? scenes[scenes.length - 1];
  const localSec = Math.max(0, clampedT - scene.startSec);
  const s = layout.unit / 1080;
  const safe = computeSafeArea(layout.aspect);
  const surfaces = getSceneSurfaces(scene, layout);
  const showBubbles = Boolean(options?.showBubbles);
  const sizeBoost = showBubbles ? 1 : 1.08;

  ctx.save();
  if (sk.filterCss !== 'none') ctx.filter = sk.filterCss;

  const trType = sk.transitionType ?? (scene.index > 0 && localSec < 0.25 ? scene.transition : null);
  const trProg = sk.transitionType ? sk.transitionProgress : Math.min(1, localSec / 0.25);
  if (trType === 'wipe') {
    ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.beginPath(); ctx.rect(0, 0, layout.width * trProg, layout.height); ctx.clip();
  } else if (trType === 'whip') {
    ctx.translate((1 - trProg) * layout.width * 0.45, 0);
  } else if (trType === 'zoom') {
    const z = 0.88 + 0.12 * trProg;
    ctx.translate(layout.width / 2, layout.height / 2); ctx.scale(z, z); ctx.translate(-layout.width / 2, -layout.height / 2);
  }

  ctx.translate(layout.width / 2 + sk.panX + sk.shakeX, layout.height / 2 + sk.panY + sk.shakeY);
  ctx.scale(sk.zoom, sk.zoom); ctx.translate(-layout.width / 2, -layout.height / 2);

  drawBackground(ctx, scene, layout, surfaces);
  const activeLine = scene.lineTimings.find((l) => clampedT >= l.startSec && clampedT <= l.endSec);
  const bubbleLine = showBubbles
    ? scene.lineTimings.find((l, idx) => clampedT >= l.startSec && clampedT <= Math.min(scene.lineTimings[idx + 1]?.startSec ?? scene.endSec, l.endSec + 0.3) - 0.005)
    : undefined;
  const charStates = scene.characters.map((ch, idx) => {
    const pos = resolveCharacterPosition(ch, idx, scene.characters.length, layout);
    const motion = computeMotion(ch.anim, localSec, layout.unit);
    return { ch, motion, anchor: { id: ch.id, x: pos.x, y: pos.y, dx: motion.dx, dy: motion.dy, facing: (pos.x < layout.width / 2 ? 'right' : 'left') as 'left' | 'right' } };
  });

  const anchors = charStates.map((c) => c.anchor);
  for (const prop of scene.props) if ((prop.surface || 'ground') === 'ground' || prop.surface === 'table') drawStudioProp(ctx, prop, layout, surfaces, anchors, clampedT);
  for (const { ch, anchor, motion } of charStates) {
    const isSpeaking = activeLine?.speaker === ch.id;
    const customFn = options?.customCharFns?.get(ch.charType || '') ?? options?.customCharFns?.get(ch.id);
    drawCharacter(ctx, ch, anchor, motion, isSpeaking && activeLine ? activeLine.emotion : ch.emotion, Boolean(isSpeaking), localSec, layout, sizeBoost, customFn);
  }
  for (const prop of scene.props) if ((prop.surface || 'ground') !== 'ground' && prop.surface !== 'table') drawStudioProp(ctx, prop, layout, surfaces, anchors, clampedT);

  const spState = showBubbles && bubbleLine && bubbleLine.speaker !== 'narrator' ? charStates.find((c) => c.ch.id === bubbleLine.speaker) : undefined;
  const bLines = spState && bubbleLine ? wrapBubbleText(bubbleLine.text, 28) : null;
  if (spState && bubbleLine && bLines) {
    const headX = spState.anchor.x + spState.anchor.dx, headY = spState.anchor.y + spState.anchor.dy - 240 * s * spState.motion.sy;
    const fontSize = Math.round(28 * s), lineH = Math.round(34 * s);
    ctx.font = `700 ${fontSize}px "Fredoka", sans-serif`;
    const bw = Math.min(safe.width * 0.78, Math.max(190 * s, Math.max(...bLines.map((ln) => ctx.measureText(ln).width)) + 48 * s));
    const bh = (bLines.length === 1 ? 68 : 104) * s, minX = safe.left + 8 * s, maxX = Math.max(minX, safe.right - bw - 8 * s);
    const by = Math.max(safe.top + 62 * s, Math.min(safe.bottom - layout.unit * 0.16 - bh, headY - bh - 22 * s));
    const obstacles = [
      ...charStates.filter((c) => c.ch.id !== spState.ch.id).map((c) => ({ left: c.anchor.x + c.anchor.dx - 105 * s, top: c.anchor.y + c.anchor.dy - 245 * s, right: c.anchor.x + c.anchor.dx + 105 * s, bottom: c.anchor.y + c.anchor.dy - 20 * s })),
      ...scene.props.map((pr) => resolvePropBox(pr, layout, surfaces, anchors, clampedT)),
    ];
    let bx = Math.max(minX, Math.min(maxX, headX - bw / 2));
    for (const dx of [0, -95 * s, 95 * s, -180 * s, 180 * s, -260 * s, 260 * s]) {
      const candX = Math.max(minX, Math.min(maxX, headX - bw / 2 + dx));
      if (!obstacles.some((o) => candX < o.right && candX + bw > o.left && by < o.bottom && by + bh + 18 * s > o.top)) { bx = candX; break; }
    }
    const tailX = Math.max(-bw / 2 + 28 * s, Math.min(bw / 2 - 28 * s, headX - (bx + bw / 2)));
    ctx.save(); ctx.translate(bx + bw / 2, by + bh / 2);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#222222'; ctx.lineWidth = Math.max(4, 7 * s);
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 20 * s); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tailX - 14 * s, bh / 2 - 2 * s); ctx.lineTo(tailX, bh / 2 + 18 * s); ctx.lineTo(tailX + 14 * s, bh / 2 - 2 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111827'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    bLines.forEach((ln, idx) => ctx.fillText(ln, 0, (idx - (bLines.length - 1) / 2) * lineH));
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  if (sk.tint) { ctx.fillStyle = sk.tint; ctx.fillRect(0, 0, layout.width, layout.height); }
  if (sk.vignette > 0) {
    const rad = ctx.createRadialGradient(layout.width / 2, layout.height / 2, layout.unit * 0.25, layout.width / 2, layout.height / 2, layout.unit * 0.85);
    rad.addColorStop(0, 'rgba(0,0,0,0)'); rad.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, sk.vignette)})`);
    ctx.fillStyle = rad; ctx.fillRect(0, 0, layout.width, layout.height);
  }
  if (sk.glitchAmount > 0) {
    const offset = Math.round(sk.glitchAmount * 14 * s * Math.sin(t * 60));
    ctx.fillStyle = 'rgba(244, 63, 94, 0.22)'; ctx.fillRect(offset, layout.height * 0.36, layout.width, 28 * s);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)'; ctx.fillRect(-offset, layout.height * 0.58, layout.width, 22 * s);
  }
  if (sk.letterboxRatio > 0) {
    const bh = Math.round(layout.height * sk.letterboxRatio);
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, layout.width, bh); ctx.fillRect(0, layout.height - bh, layout.width, bh);
  }
  if (trType === 'fade') { ctx.fillStyle = `rgba(9,9,11,${(1 - trProg).toFixed(2)})`; ctx.fillRect(0, 0, layout.width, layout.height); }
  if (sk.flashAlpha > 0) { ctx.save(); ctx.globalAlpha = sk.flashAlpha; ctx.fillStyle = sk.flashColor; ctx.fillRect(0, 0, layout.width, layout.height); ctx.restore(); }
  const captionText = activeLine?.text || scene.caption;
  drawWordByWordCaption(ctx, captionText, clampedT, activeLine ? activeLine.startSec : scene.startSec, activeLine ? activeLine.durationSec : scene.durationSec, layout.aspect, {
    highlightColor: sk.captionHighlightColor, scaleBoost: sk.captionScale,
  });
  ctx.restore();
}
