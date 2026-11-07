import { computeSafeArea } from '../aspect';
import { StageLayout, StudioProp, TimelineScene } from './schema';

export interface SceneSurfaces {
  floorY: number;
  tableTopY: number;
  tableLeft: number;
  tableWidth: number;
  hasTable: boolean;
}

export interface CharacterMotionAnchor {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  facing: 'left' | 'right';
}

export function getSceneSurfaces(scene: TimelineScene, layout: StageLayout): SceneSurfaces {
  const s = layout.unit / 1080;
  const safe = computeSafeArea(layout.aspect);
  const floorY = layout.groundY;
  const tableTopY = Math.round(floorY - 210 * s);
  const tableWidth = Math.round(Math.min(safe.width * 0.56, 540 * s));
  const tableLeft = Math.round(layout.width / 2 - tableWidth / 2);
  const hasTable =
    scene.bgKind === 'kitchen' ||
    scene.props.some((p) => (p.surface || 'ground') === 'table');
  return { floorY, tableTopY, tableLeft, tableWidth, hasTable };
}

export function drawTableSurface(
  ctx: CanvasRenderingContext2D,
  surfaces: SceneSurfaces,
  layout: StageLayout
): void {
  if (!surfaces.hasTable) return;
  const s = layout.unit / 1080;
  const { tableLeft, tableWidth, tableTopY, floorY } = surfaces;
  const topThickness = Math.round(26 * s);
  const legW = Math.round(24 * s);
  const legH = Math.max(10, floorY - (tableTopY + topThickness));

  ctx.save();
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = Math.max(4, 8 * s);
  ctx.lineJoin = 'round';

  // Table legs resting on floorY
  ctx.fillStyle = '#78350f';
  ctx.fillRect(tableLeft + 28 * s, tableTopY + topThickness, legW, legH);
  ctx.strokeRect(tableLeft + 28 * s, tableTopY + topThickness, legW, legH);
  ctx.fillRect(tableLeft + tableWidth - 28 * s - legW, tableTopY + topThickness, legW, legH);
  ctx.strokeRect(tableLeft + tableWidth - 28 * s - legW, tableTopY + topThickness, legW, legH);

  // Table top plank (top edge is at tableTopY)
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.roundRect(tableLeft, tableTopY, tableWidth, topThickness, 8 * s);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws each prop with bottom-center at (0, 0) so resting props sit flush on their surface line.
 */
export function drawPropGeometry(ctx: CanvasRenderingContext2D, type: StudioProp['type']) {
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (type === 'phone') {
    // Rounded body
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.roundRect(-34, -116, 68, 116, 14); ctx.fill(); ctx.stroke();
    // Bright inner screen
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.roundRect(-25, -100, 50, 82, 7); ctx.fill(); ctx.stroke();
    // Small camera dot at top
    ctx.fillStyle = '#222222';
    ctx.beginPath(); ctx.arc(0, -108, 3.5, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'controller') {
    // Controller body with two grips
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(-42, -74);
    ctx.lineTo(42, -74);
    ctx.bezierCurveTo(78, -74, 84, -14, 58, 0);
    ctx.bezierCurveTo(44, 4, 34, -18, 22, -22);
    ctx.lineTo(-22, -22);
    ctx.bezierCurveTo(-34, -18, -44, 4, -58, 0);
    ctx.bezierCurveTo(-84, -14, -78, -74, -42, -74);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Left D-pad cross
    ctx.strokeStyle = '#222222'; ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-46, -48); ctx.lineTo(-22, -48);
    ctx.moveTo(-34, -60); ctx.lineTo(-34, -36);
    ctx.stroke();
    // Two action buttons on right
    ctx.lineWidth = 5;
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath(); ctx.arc(28, -44, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.arc(46, -54, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (type === 'clock') {
    // Twin bells on top
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(-34, -92, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(34, -92, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Clock face
    ctx.fillStyle = '#fef08a';
    ctx.beginPath(); ctx.arc(0, -52, 48, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, -52, 36, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Hands
    ctx.beginPath();
    ctx.moveTo(0, -52); ctx.lineTo(0, -74);
    ctx.moveTo(0, -52); ctx.lineTo(18, -52);
    ctx.stroke();
  } else if (type === 'homework') {
    // Paper sheet with lines
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(-46, -112, 92, 112, 6); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#222222'; ctx.lineWidth = 5;
    for (const ly of [-86, -66, -46, -26]) {
      ctx.beginPath(); ctx.moveTo(-30, ly); ctx.lineTo(30, ly); ctx.stroke();
    }
  } else if (type === 'toothbrush') {
    // Bristle head
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(24, -36, 36, 20, 4); ctx.fill(); ctx.stroke();
    // Handle resting on surface
    ctx.fillStyle = '#34d399';
    ctx.beginPath(); ctx.roundRect(-64, -18, 128, 18, 8); ctx.fill(); ctx.stroke();
  } else if (type === 'door') {
    // Door frame & panel resting on floor
    ctx.fillStyle = '#92400e';
    ctx.fillRect(-62, -216, 124, 216); ctx.strokeRect(-62, -216, 124, 216);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-46, -198, 92, 82); ctx.strokeRect(-46, -198, 92, 82);
    ctx.fillRect(-46, -98, 92, 78); ctx.strokeRect(-46, -98, 92, 78);
    // Door handle
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.arc(32, -106, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (type === 'heart') {
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-52, -32, -56, -78, -24, -78);
    ctx.bezierCurveTo(-8, -78, 0, -62, 0, -54);
    ctx.bezierCurveTo(0, -62, 8, -78, 24, -78);
    ctx.bezierCurveTo(56, -78, 52, -32, 0, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
}

export function resolvePropBox(
  prop: StudioProp,
  layout: StageLayout,
  surfaces: SceneSurfaces,
  charAnchors: CharacterMotionAnchor[],
  t: number
): { px: number; py: number; left: number; top: number; right: number; bottom: number; drawShadow: boolean } {
  const s = layout.unit / 1080;
  const safe = computeSafeArea(layout.aspect);
  const surface = prop.surface || (prop.type === 'heart' ? 'float' : 'ground');

  let px = safe.left + prop.x * safe.width;
  let py = surfaces.floorY;
  let drawShadow = true;

  if (surface === 'table') {
    const pad = 44 * s;
    px = Math.max(surfaces.tableLeft + pad, Math.min(surfaces.tableLeft + surfaces.tableWidth - pad, px));
    py = surfaces.tableTopY;
  } else if (surface === 'ground') {
    py = surfaces.floorY;
  } else if (surface.startsWith('hand:')) {
    const anchor = charAnchors.find((c) => c.id === surface.slice(5)) ?? charAnchors[0];
    if (anchor) {
      px = anchor.x + anchor.dx + (anchor.facing === 'right' ? 92 * s : -92 * s);
      py = anchor.y + anchor.dy - 78 * s;
      drawShadow = false;
    }
  } else if (surface === 'float') {
    py = safe.top + prop.y * (surfaces.floorY - safe.top) + Math.sin(t * 3.4) * 12 * s;
    drawShadow = false;
  }

  const hw = (prop.type === 'door' ? 68 : prop.type === 'controller' ? 76 : 56) * s;
  const h = (prop.type === 'door' ? 220 : prop.type === 'phone' || prop.type === 'homework' ? 120 : 96) * s;
  return { px, py, left: px - hw, top: py - h, right: px + hw, bottom: py, drawShadow };
}

export function drawStudioProp(
  ctx: CanvasRenderingContext2D,
  prop: StudioProp,
  layout: StageLayout,
  surfaces: SceneSurfaces,
  charAnchors: CharacterMotionAnchor[],
  t: number
): void {
  const s = layout.unit / 1080;
  const { px, py, drawShadow } = resolvePropBox(prop, layout, surfaces, charAnchors, t);

  ctx.save();
  if (drawShadow) {
    const shW = (prop.type === 'door' ? 74 : prop.type === 'controller' ? 68 : 48) * s;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath(); ctx.ellipse(px, py + 4 * s, shW, 11 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.translate(px, py);
  ctx.scale(s, s);
  drawPropGeometry(ctx, prop.type);
  ctx.restore();
}
