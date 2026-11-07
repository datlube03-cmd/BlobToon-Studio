import { StudioAnim, StudioEmotion } from './schema';

export interface CustomCharacterDrawProps {
  emotion: StudioEmotion;
  anim: StudioAnim;
  speaking: boolean;
  facing: 'left' | 'right';
  color: string;
  accentColor: string;
  unit: number;
  seededRandom: (seed?: number) => number;
}

export interface CustomCharacterDef {
  id: string;
  name: string;
  color: string;
  accentColor: string;
  code: string;
  updatedAt: number;
}

export type CharacterDrawFn = (
  ctx: CanvasRenderingContext2D,
  t: number,
  props: CustomCharacterDrawProps
) => void;

export function createSeededRandom(baseSeed = 42): (offset?: number) => number {
  let state = baseSeed >>> 0;
  return (offset = 0) => {
    let x = (state + Math.imul(offset + 1, 0x9e3779b9)) >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    state = (state + 0x6d2b79f5) >>> 0;
    return (x >>> 0) / 4294967296;
  };
}

export const BUILTIN_BLOB_CODE = `// Nhân vật Blob mặc định (Deterministic Canvas 2D)
function draw(ctx, t, props) {
  const { emotion, speaking, color, accentColor, unit } = props;
  const s = unit / 1080;
  ctx.save();
  ctx.scale(s, s);

  // Thân Blob với viền đậm #222
  ctx.fillStyle = color || '#4cc9f0';
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-105, 0);
  ctx.bezierCurveTo(-115, -155, -75, -235, 0, -235);
  ctx.bezierCurveTo(75, -235, 115, -155, 105, 0);
  ctx.quadraticCurveTo(0, 22, -105, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Má hồng / điểm nhấn
  ctx.fillStyle = accentColor || 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(-45, -175, 22, 11, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Mắt
  ctx.fillStyle = '#222222';
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 7;
  const eyeY = -125;
  if (emotion === 'sleepy' || emotion === 'laughing') {
    for (const ex of [-36, 36]) {
      ctx.beginPath();
      ctx.arc(ex, eyeY, 14, Math.PI, 0, emotion === 'sleepy');
      ctx.stroke();
    }
  } else {
    const r = emotion === 'shock' ? 16 : 12;
    ctx.beginPath();
    ctx.arc(-36, eyeY, r, 0, Math.PI * 2);
    ctx.arc(36, eyeY, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Miệng nhép theo giọng nói
  const mouthY = -75;
  ctx.beginPath();
  if (speaking) {
    const open = 8 + Math.abs(Math.sin(t * 22)) * 20;
    ctx.ellipse(0, mouthY, 22, open, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (emotion === 'sad') {
    ctx.arc(0, mouthY + 14, 20, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (emotion === 'shock') {
    ctx.arc(0, mouthY, 14, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.arc(0, mouthY - 6, 22, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}`;

export const COMMENTED_CHARACTER_TEMPLATE = `// Mẫu nhân vật tuỳ chỉnh: viết hàm draw(ctx, t, props)
// props gồm: { emotion, anim, speaking, facing, color, accentColor, unit, seededRandom }
// LƯU Ý: Không dùng Math.random() hoặc Date.now() (dùng props.seededRandom(seed) để tất định).
function draw(ctx, t, props) {
  const { emotion, speaking, color, accentColor, unit, seededRandom } = props;
  const s = unit / 1080;
  const bob = Math.sin(t * 5) * 6;
  const sparkle = seededRandom(1) * 8;

  ctx.save();
  ctx.scale(s, s);

  // Thân nhân vật có sừng nhỏ
  ctx.fillStyle = color || '#a855f7';
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(-95, -220 + bob, 190, 220, 68);
  ctx.fill();
  ctx.stroke();

  // Ăng-ten phát sáng trên đầu
  ctx.fillStyle = accentColor || '#facc15';
  ctx.beginPath();
  ctx.arc(0, -250 + bob, 16 + sparkle * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Mắt & Miệng
  ctx.fillStyle = '#222222';
  const r = emotion === 'shock' ? 16 : 11;
  ctx.beginPath();
  ctx.arc(-34, -130 + bob, r, 0, Math.PI * 2);
  ctx.arc(34, -130 + bob, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  if (speaking) {
    ctx.ellipse(0, -78 + bob, 20, 8 + Math.abs(Math.sin(t * 20)) * 16, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.arc(0, -82 + bob, 20, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}`;

function extractErrorLine(err: unknown): number {
  const stack = err instanceof Error ? err.stack || err.message : String(err);
  const m = stack.match(/<anonymous>:(\d+):(\d+)/) || stack.match(/line (\d+)/i);
  if (m) {
    const rawLine = Number(m[1]);
    return Math.max(1, rawLine - 2);
  }
  return 1;
}

export function compileCharacterCode(code: string): {
  fn?: CharacterDrawFn;
  error?: { line: number; message: string };
} {
  const lines = code.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cleaned = lines[i].replace(/\/\/.*$/, '');
    if (/\bMath\.random\b/.test(cleaned) || /\bDate\.now\b/.test(cleaned)) {
      return {
        error: {
          line: i + 1,
          message: 'Không được dùng Math.random() hoặc Date.now(). Hãy dùng props.seededRandom(seed) để đảm bảo tính tất định.',
        },
      };
    }
  }

  try {
    const factory = new Function(
      'seededRandom',
      `"use strict";\n${code}\n;if (typeof draw !== "function") { throw new Error("Phải định nghĩa hàm draw(ctx, t, props)"); }\nreturn draw;`
    );
    const fn = factory(createSeededRandom(101)) as CharacterDrawFn;
    // Smoke-test on a tiny offscreen canvas so runtime errors are caught immediately
    if (typeof document !== 'undefined') {
      const testCanvas = document.createElement('canvas');
      testCanvas.width = 64;
      testCanvas.height = 64;
      const testCtx = testCanvas.getContext('2d');
      if (testCtx) {
        fn(testCtx, 0.5, {
          emotion: 'happy',
          anim: 'idle',
          speaking: false,
          facing: 'right',
          color: '#4cc9f0',
          accentColor: '#facc15',
          unit: 1080,
          seededRandom: createSeededRandom(42),
        });
      }
    }
    return { fn };
  } catch (err) {
    return {
      error: {
        line: extractErrorLine(err),
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
