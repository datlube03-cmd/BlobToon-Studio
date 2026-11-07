import React, { useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { vi } from '../i18n';
import {
  BUILTIN_BLOB_CODE,
  CharacterDrawFn,
  COMMENTED_CHARACTER_TEMPLATE,
  compileCharacterCode,
  createSeededRandom,
  CustomCharacterDef,
} from './characterCode';
import { AnimEnum, EmotionEnum, StudioAnim, StudioEmotion } from './schema';

interface CharacterCodeTabProps {
  customCharacters: CustomCharacterDef[];
  onSaveCharacter: (charDef: CustomCharacterDef) => Promise<void>;
  onDeleteCharacter: (id: string) => Promise<void>;
}

export function CharacterCodeTab({
  customCharacters,
  onSaveCharacter,
  onDeleteCharacter,
}: CharacterCodeTabProps) {
  const [charId, setCharId] = useState('astro_blob');
  const [charName, setCharName] = useState('Astro Blob');
  const [color, setColor] = useState('#a855f7');
  const [accentColor, setAccentColor] = useState('#facc15');
  const [previewEmotion, setPreviewEmotion] = useState<StudioEmotion>('happy');
  const [previewAnim, setPreviewAnim] = useState<StudioAnim>('bounce');
  const [previewSpeaking, setPreviewSpeaking] = useState(true);
  const [code, setCode] = useState(COMMENTED_CHARACTER_TEMPLATE);
  const [compileError, setCompileError] = useState<{ line: number; message: string } | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  // Keep last working function so syntax/runtime errors never crash preview
  const lastValidFnRef = useRef<CharacterDrawFn | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const initial = compileCharacterCode(COMMENTED_CHARACTER_TEMPLATE);
    if (initial.fn) lastValidFnRef.current = initial.fn;
  }, []);

  // Debounce compilation ~300 ms after typing
  useEffect(() => {
    const timer = setTimeout(() => {
      const res = compileCharacterCode(code);
      if (res.fn) {
        lastValidFnRef.current = res.fn;
        setCompileError(null);
      } else if (res.error) {
        setCompileError(res.error);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [code]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const renderPreview = (now: number) => {
      const t = (now - start) / 1000;
      const canvas = previewCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx && lastValidFnRef.current) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#27272a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 210);
        ctx.lineTo(canvas.width, 210);
        ctx.stroke();

        ctx.save();
        ctx.translate(canvas.width / 2, 205);
        try {
          lastValidFnRef.current(ctx, t, {
            emotion: previewEmotion,
            anim: previewAnim,
            speaking: previewSpeaking,
            facing: 'right',
            color,
            accentColor,
            unit: 680,
            seededRandom: createSeededRandom(42),
          });
        } catch (err) {
          setCompileError({
            line: 1,
            message: err instanceof Error ? err.message : String(err),
          });
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(renderPreview);
    };
    raf = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(raf);
  }, [color, accentColor, previewEmotion, previewAnim, previewSpeaking]);

  const handleSave = async () => {
    const cleanId = charId.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'custom_blob';
    await onSaveCharacter({
      id: cleanId,
      name: charName.trim() || cleanId,
      color,
      accentColor,
      code,
      updatedAt: 1,
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1800);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="rounded-lg bg-amber-950/70 border border-amber-700/80 px-3 py-2 text-[11px] text-amber-200 space-y-0.5">
        <div className="font-semibold">{vi.charEditor.securityWarn}</div>
        <div className="text-amber-300/80">{vi.charEditor.deterministicNote}</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-amber-400">{vi.charEditor.header}</h2>
        <div className="flex gap-1.5 text-xs">
          <button type="button" onClick={() => setCode(BUILTIN_BLOB_CODE)} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 cursor-pointer">
            {vi.charEditor.loadBlobBtn}
          </button>
          <button type="button" onClick={() => setCode(COMMENTED_CHARACTER_TEMPLATE)} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 cursor-pointer">
            {vi.charEditor.loadTemplateBtn}
          </button>
          <button type="button" onClick={() => void handleSave()} className="px-2.5 py-1 rounded bg-amber-400 text-zinc-950 font-bold cursor-pointer">
            {savedToast ? '✓ Đã lưu!' : vi.charEditor.saveCharBtn}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <input value={charId} onChange={(e) => setCharId(e.target.value)} placeholder={vi.charEditor.charIdLabel} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 font-mono" />
        <input value={charName} onChange={(e) => setCharName(e.target.value)} placeholder={vi.charEditor.charNameLabel} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1" />
        <label className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded px-2 py-1">
          <span className="text-zinc-400">Màu:</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
        </label>
        <div className="flex items-center gap-1">
          <select value={previewEmotion} onChange={(e) => setPreviewEmotion(e.target.value as StudioEmotion)} className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 flex-1">
            {EmotionEnum.options.map((em) => <option key={em} value={em}>{em}</option>)}
          </select>
          <select value={previewAnim} onChange={(e) => setPreviewAnim(e.target.value as StudioAnim)} className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 flex-1">
            {AnimEnum.options.map((an) => <option key={an} value={an}>{an}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-lg overflow-hidden border border-zinc-800 text-xs">
        <CodeMirror
          value={code}
          height="210px"
          theme="dark"
          extensions={[javascript()]}
          onChange={(val) => setCode(val)}
        />
      </div>

      {compileError && (
        <div className="rounded-lg bg-rose-950/80 border border-rose-700 px-3 py-2 text-xs text-rose-200">
          <span className="font-mono font-bold text-rose-400">Lỗi tại dòng {compileError.line}: </span>
          {compileError.message} <span className="text-zinc-400">(Đang giữ bản vẽ hợp lệ gần nhất)</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pt-1">
        <div className="flex flex-col items-center bg-zinc-950 border border-zinc-800 rounded-lg p-2">
          <div className="w-full flex justify-between items-center text-[11px] text-zinc-400 mb-1">
            <span>{vi.charEditor.previewLabel}</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={previewSpeaking} onChange={(e) => setPreviewSpeaking(e.target.checked)} />
              <span>Đang nói</span>
            </label>
          </div>
          <canvas ref={previewCanvasRef} width={260} height={240} className="rounded border border-zinc-800 bg-black" />
        </div>

        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          <div className="text-xs font-semibold text-zinc-300">Nhân vật đã lưu ({customCharacters.length}):</div>
          {customCharacters.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs">
              <button
                type="button"
                onClick={() => { setCharId(c.id); setCharName(c.name); setColor(c.color); setAccentColor(c.accentColor); setCode(c.code); }}
                className="text-left font-mono text-amber-300 hover:underline cursor-pointer truncate"
              >
                {c.id} ({c.name})
              </button>
              <button type="button" onClick={() => void onDeleteCharacter(c.id)} className="text-rose-400 hover:text-rose-300 px-1.5 cursor-pointer">✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
