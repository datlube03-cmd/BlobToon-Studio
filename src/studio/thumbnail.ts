import { AspectRatio, getAspectPreset } from '../aspect';
import { ensureFredokaFontLoaded } from './captions';
import { CharacterDrawFn, createSeededRandom } from './characterCode';
import { drawPropGeometry } from './props';
import { deriveDefaultThumbnail, StudioEmotion, StudioPropType, StudioScript, StudioThumbnail, ThumbnailBgStyle } from './schema';

export interface DrawThumbnailOptions {
  aspect?: AspectRatio;
  width?: number;
  height?: number;
  thumbnailOverride?: Partial<StudioThumbnail>;
  customCharFns?: Map<string, CharacterDrawFn>;
}

export interface ThumbnailRenderMetrics {
  safeAreaOk: boolean;
  contrastRatio: number;
  contrastWarning: string | null;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function computeContrastRatio(hex1: string, hex2: string): number {
  const l1 = relLuminance(hexToRgb(hex1)), l2 = relLuminance(hexToRgb(hex2));
  return Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
}

function drawThumbnailBackground(ctx: CanvasRenderingContext2D, w: number, h: number, style: ThumbnailBgStyle, c1: string, c2: string, focalX: number, focalY: number) {
  ctx.save();
  if (style === 'sunburst') {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, w, h);
    const rays = 24, radius = Math.hypot(w, h) * 1.25;
    ctx.fillStyle = c2;
    for (let i = 0; i < rays; i += 2) {
      ctx.beginPath(); ctx.moveTo(focalX, focalY);
      ctx.arc(focalX, focalY, radius, (i / rays) * Math.PI * 2, ((i + 1) / rays) * Math.PI * 2); ctx.closePath(); ctx.fill();
    }
  } else if (style === 'diagonal') {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.moveTo(w * 0.42, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(w * 0.18, h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#222222'; ctx.lineWidth = Math.max(6, Math.min(w, h) * 0.01);
    ctx.beginPath(); ctx.moveTo(w * 0.42, 0); ctx.lineTo(w * 0.18, h); ctx.stroke();
  } else if (style === 'halftone') {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, c1); grad.addColorStop(1, c2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    const step = Math.max(28, Math.round(Math.min(w, h) * 0.042));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const d = Math.hypot(x - focalX, y - focalY) / Math.hypot(w, h);
        ctx.beginPath(); ctx.arc(x, y, Math.max(3, step * 0.34 * (1 - d * 0.55)), 0, Math.PI * 2); ctx.fill();
      }
    }
  } else {
    const rad = ctx.createRadialGradient(focalX, focalY, Math.min(w, h) * 0.08, focalX, focalY, Math.hypot(w, h) * 0.78);
    rad.addColorStop(0, c2); rad.addColorStop(1, c1);
    ctx.fillStyle = rad; ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function drawBigThumbnailCharacter(
  ctx: CanvasRenderingContext2D, color: string, emotion: StudioEmotion, x: number, y: number,
  scale: number, facing: 'left' | 'right', unit: number, customFn?: CharacterDrawFn
) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath(); ctx.ellipse(x, y + 12 * scale, 108 * scale, 24 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x, y);
  if (customFn) {
    const uScale = (scale * 1080) / unit;
    ctx.scale(uScale, uScale);
    try {
      customFn(ctx, 0.35, { emotion, anim: 'idle', speaking: emotion === 'shock' || emotion === 'laughing', facing, color, accentColor: '#facc15', unit, seededRandom: createSeededRandom(color.length * 19) });
      ctx.restore(); return;
    } catch { /* fallback to built-in blob */ }
  }
  ctx.scale(facing === 'left' ? -scale : scale, scale);
  ctx.fillStyle = color; ctx.strokeStyle = '#222222'; ctx.lineWidth = 11;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-105, 0); ctx.bezierCurveTo(-118, -158, -76, -238, 0, -238);
  ctx.bezierCurveTo(76, -238, 118, -158, 105, 0); ctx.quadraticCurveTo(0, 22, -105, 0); ctx.closePath(); ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#ffffff';
  const eyeY = -128, eyeR = emotion === 'shock' ? 24 : 18;
  for (const ex of [-38, 38]) {
    ctx.beginPath(); ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#222222';
    ctx.beginPath(); ctx.arc(ex + 3, eyeY, emotion === 'shock' ? 9 : 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
  }
  ctx.strokeStyle = '#222222'; ctx.lineWidth = 9;
  if (emotion === 'angry' || emotion === 'smug') {
    ctx.beginPath(); ctx.moveTo(-60, eyeY - 34); ctx.lineTo(-16, eyeY - 18);
    ctx.moveTo(60, eyeY - 26); ctx.lineTo(16, eyeY - (emotion === 'angry' ? 18 : 34)); ctx.stroke();
  }
  const mouthY = -70;
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  if (emotion === 'shock') { ctx.ellipse(0, mouthY, 24, 30, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  else if (emotion === 'laughing' || emotion === 'happy') { ctx.arc(0, mouthY - 8, 28, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else if (emotion === 'angry' || emotion === 'sad') { ctx.arc(0, mouthY + 18, 24, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); }
  else { ctx.moveTo(-22, mouthY); ctx.quadraticCurveTo(8, mouthY + 14, 26, mouthY - 10); ctx.stroke(); }
  ctx.restore();
}

export function drawThumbnail(
  ctx: CanvasRenderingContext2D, script: StudioScript, options: DrawThumbnailOptions = {}
): ThumbnailRenderMetrics {
  const aspect = options.aspect ?? '9:16', preset = getAspectPreset(aspect);
  const w = options.width ?? preset.width, h = options.height ?? preset.height, unit = Math.min(w, h);
  const s = unit / 1080, isPortrait = h > w;
  const thumb: StudioThumbnail = { ...deriveDefaultThumbnail(script), ...options.thumbnailOverride };

  const sc0 = script.scenes[0], bg1 = sc0?.bg[0] || '#1e1b4b', bg2 = sc0?.bg[1] || '#be123c';
  const charZoneCenterX = isPortrait ? w * 0.5 : w * 0.71;
  const charZoneBottomY = isPortrait ? (aspect === '9:16' ? h * 0.77 : h * 0.88) : h * 0.89;
  drawThumbnailBackground(ctx, w, h, thumb.bgStyle, bg1, bg2, charZoneCenterX, charZoneBottomY - 190 * s);

  const safeLeft = Math.round(w * 0.06), safeRight = Math.round(w * 0.94);
  const safeTop = Math.round(h * 0.06), safeBottom = Math.round(h * (aspect === '9:16' ? 0.8 : 0.94));

  const rawChars: Array<{ id: string; color: string; charType?: string }> = (
    sc0?.characters.length ? sc0.characters : [{ id: 'ban', color: '#38bdf8' }, { id: 'me', color: '#f472b6' }]
  ).slice(0, 2);
  const chars = thumb.swapCharacters && rawChars.length > 1 ? [rawChars[1], rawChars[0]] : rawChars;
  const bigScale = (isPortrait ? 1.88 : 1.78) * s, spreadX = (isPortrait ? 148 : 142) * s;
  const c1X = chars.length > 1 ? charZoneCenterX - spreadX : charZoneCenterX, c2X = charZoneCenterX + spreadX * 0.92;

  if (chars[1]) {
    const fn2 = options.customCharFns?.get(chars[1].charType || '') ?? options.customCharFns?.get(chars[1].id);
    drawBigThumbnailCharacter(ctx, chars[1].color || '#f472b6', thumb.emotion2, c2X, charZoneBottomY - 16 * s, bigScale * 0.94, 'left', unit, fn2);
  }
  const fn1 = options.customCharFns?.get(chars[0].charType || '') ?? options.customCharFns?.get(chars[0].id);
  drawBigThumbnailCharacter(ctx, chars[0].color || '#38bdf8', thumb.emotion1, c1X, charZoneBottomY, bigScale, 'right', unit, fn1);

  const propScale = 1.65 * s, propX = chars.length > 1 ? (c1X + c2X) * 0.5 : c1X + 165 * s, propY = charZoneBottomY - 82 * s;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath(); ctx.ellipse(propX, propY + 8 * s, 68 * s, 15 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(propX, propY); ctx.scale(propScale, propScale);
  drawPropGeometry(ctx, thumb.keyProp);
  ctx.restore();

  const words = (thumb.text || 'CHUYỆN GÌ ĐÂY?!').trim().toUpperCase().split(/\s+/).filter(Boolean).slice(0, 4);
  const titleLines = words.length <= 2 ? [words.join(' ')] : [words.slice(0, 2).join(' '), words.slice(2).join(' ')];
  const titleBoxLeft = safeLeft, titleBoxRight = isPortrait ? safeRight : Math.round(w * 0.52);
  const titleBoxW = titleBoxRight - titleBoxLeft, titleBoxCenterX = Math.round((titleBoxLeft + titleBoxRight) / 2);

  let mainFontPx = Math.round(unit * (isPortrait ? 0.118 : 0.112) * (thumb.fontScale ?? 1));
  ctx.save();
  while (mainFontPx > 32) {
    ctx.font = `700 ${mainFontPx}px "Fredoka", sans-serif`;
    if (Math.max(...titleLines.map((ln) => ctx.measureText(ln).width)) <= titleBoxW * 0.94) break;
    mainFontPx -= 3;
  }
  const tagFontPx = Math.max(24, Math.round(mainFontPx * 0.44)), lineStep = Math.round(mainFontPx * 1.08);
  const totalBlockH = tagFontPx + 14 * s + titleLines.length * lineStep;
  const tagY = isPortrait ? Math.max(safeTop + tagFontPx, Math.round(safeTop + (h * 0.33 - totalBlockH) * 0.45)) : Math.round(h * 0.5 - totalBlockH * 0.42);

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.font = `700 ${tagFontPx}px "Fredoka", sans-serif`;
  ctx.lineWidth = Math.max(6, Math.round(tagFontPx * 0.24));
  ctx.strokeStyle = '#111827'; ctx.strokeText('WHAT IF...', titleBoxCenterX, tagY + 4 * s);
  ctx.fillStyle = '#ffffff'; ctx.fillText('WHAT IF...', titleBoxCenterX, tagY);

  ctx.font = `700 ${mainFontPx}px "Fredoka", sans-serif`;
  const outlineW = Math.max(10, Math.round(mainFontPx * 0.22));
  let safeAreaOk = true;
  titleLines.forEach((ln, idx) => {
    const ly = tagY + tagFontPx * 0.75 + (idx + 0.65) * lineStep, wPx = ctx.measureText(ln).width;
    if (titleBoxCenterX - wPx / 2 < safeLeft - 4 || titleBoxCenterX + wPx / 2 > safeRight + 4 || ly + mainFontPx / 2 > safeBottom + 4) safeAreaOk = false;
    ctx.fillStyle = '#09090b'; ctx.strokeStyle = '#09090b'; ctx.lineWidth = outlineW;
    ctx.strokeText(ln, titleBoxCenterX + 6 * s, ly + 8 * s);
    ctx.strokeStyle = '#111827'; ctx.strokeText(ln, titleBoxCenterX, ly);
    ctx.fillStyle = idx === titleLines.length - 1 ? thumb.accentColor : '#ffffff';
    ctx.fillText(ln, titleBoxCenterX, ly);
  });
  ctx.restore();

  const cRatio = Math.max(computeContrastRatio(thumb.accentColor, bg1), computeContrastRatio('#ffffff', bg1));
  return { safeAreaOk, contrastRatio: cRatio, contrastWarning: cRatio < 4.5 ? `Độ tương phản tiêu đề (${cRatio}:1) thấp hơn mức khuyến nghị 4.5:1.` : null };
}

export function generateThumbnailVariants(script: StudioScript): StudioThumbnail[] {
  const base = deriveDefaultThumbnail(script);
  const prop2: StudioPropType = script.scenes[1]?.props[0]?.type ?? (base.keyProp === 'phone' ? 'controller' : 'phone');
  const prop3: StudioPropType = script.scenes[2]?.props[0]?.type ?? 'clock';
  return [
    { ...base, bgStyle: 'sunburst', emotion1: 'shock', emotion2: 'smug', accentColor: '#facc15', swapCharacters: false },
    { ...base, bgStyle: 'diagonal', emotion1: 'angry', emotion2: 'laughing', keyProp: prop2, accentColor: '#38bdf8', swapCharacters: true },
    { ...base, bgStyle: 'halftone', emotion1: 'laughing', emotion2: 'shock', keyProp: prop3, accentColor: '#fb7185', swapCharacters: false },
  ];
}

export async function exportThumbnailImage(
  script: StudioScript, options: DrawThumbnailOptions & { format: 'png' | 'jpg'; fileLabel: string }
): Promise<void> {
  await ensureFredokaFontLoaded();
  const aspect = options.aspect ?? '9:16', preset = getAspectPreset(aspect);
  const canvas = document.createElement('canvas');
  canvas.width = options.width ?? preset.width; canvas.height = options.height ?? preset.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  drawThumbnail(ctx, script, options);

  const mime = options.format === 'jpg' ? 'image/jpeg' : 'image/png';
  let quality = 0.92;
  const toBlobWithLimit = (): Promise<Blob | null> => new Promise((r) => canvas.toBlob((b) => r(b), mime, options.format === 'jpg' ? quality : undefined));
  let blob = await toBlobWithLimit();
  while (blob && options.format === 'jpg' && blob.size > 1_950_000 && quality > 0.5) { quality -= 0.1; blob = await toBlobWithLimit(); }
  if (!blob) return;
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `${script.title.slice(0, 28).replace(/\s+/g, '_')}_thumb_${options.fileLabel}.${options.format}`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 2500);
}
