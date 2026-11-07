import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AspectRatio, getAspectPreset } from '../aspect';
import { CharacterDrawFn } from './characterCode';
import {
  deriveDefaultThumbnail,
  EmotionEnum,
  PropTypeEnum,
  StudioEmotion,
  StudioPropType,
  StudioScript,
  StudioThumbnail,
  ThumbnailBgStyle,
  ThumbnailBgStyleEnum,
} from './schema';
import {
  drawThumbnail,
  exportThumbnailImage,
  generateThumbnailVariants,
  ThumbnailRenderMetrics,
} from './thumbnail';

interface ThumbnailPanelProps {
  script: StudioScript;
  aspect: AspectRatio;
  customCharFns?: Map<string, CharacterDrawFn>;
  onUpdateThumbnail: (next: StudioThumbnail) => void;
}

export function ThumbnailPanel({
  script,
  aspect,
  customCharFns,
  onUpdateThumbnail,
}: ThumbnailPanelProps) {
  const thumb = useMemo(() => deriveDefaultThumbnail(script), [script]);
  const [variants, setVariants] = useState<StudioThumbnail[]>([]);
  const [activeVarIdx, setActiveVarIdx] = useState<number>(0);
  const [previewYoutube, setPreviewYoutube] = useState(false);
  const [metrics, setMetrics] = useState<ThumbnailRenderMetrics>({
    safeAreaOk: true,
    contrastRatio: 8,
    contrastWarning: null,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const preset = getAspectPreset(previewYoutube ? '16:9' : aspect);
  const previewW = previewYoutube ? 1280 : preset.width;
  const previewH = previewYoutube ? 720 : preset.height;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const m = drawThumbnail(ctx, script, {
      aspect: previewYoutube ? '16:9' : aspect,
      width: previewW,
      height: previewH,
      thumbnailOverride: thumb,
      customCharFns,
    });
    setMetrics(m);
  }, [script, thumb, aspect, previewYoutube, previewW, previewH, customCharFns]);

  const patch = (partial: Partial<StudioThumbnail>) => {
    onUpdateThumbnail({ ...thumb, ...partial });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-amber-400">Ảnh Bìa (Thumbnail Studio)</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPreviewYoutube(false)}
            className={`px-2 py-0.5 rounded cursor-pointer ${!previewYoutube ? 'bg-amber-400 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-300'}`}
          >
            {aspect} ({preset.width}×{preset.height})
          </button>
          <button
            type="button"
            onClick={() => setPreviewYoutube(true)}
            className={`px-2 py-0.5 rounded cursor-pointer ${previewYoutube ? 'bg-amber-400 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-300'}`}
          >
            YT 16:9 (1280×720)
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center bg-zinc-950 border border-zinc-800 rounded-lg p-2">
        <canvas
          ref={canvasRef}
          width={previewW}
          height={previewH}
          className="w-full max-h-[220px] object-contain rounded border border-zinc-700"
        />
        <div className="w-full flex items-center justify-between text-[11px] pt-1.5 text-zinc-400">
          <span className={metrics.safeAreaOk ? 'text-emerald-400' : 'text-rose-400'}>
            Safe Area: {metrics.safeAreaOk ? 'OK' : 'Cần thu nhỏ chữ'}
          </span>
          <span className={metrics.contrastRatio >= 4.5 ? 'text-emerald-400' : 'text-amber-300'}>
            Tương phản: {metrics.contrastRatio}:1
          </span>
        </div>
        {metrics.contrastWarning && (
          <div className="w-full mt-1 px-2 py-1 rounded bg-amber-950/90 border border-amber-700 text-amber-200 text-[11px]">
            ⚠️ {metrics.contrastWarning}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            const nextVars = generateThumbnailVariants(script);
            setVariants(nextVars);
            setActiveVarIdx(0);
            onUpdateThumbnail(nextVars[0]);
          }}
          className="px-2.5 py-1 rounded bg-sky-500/20 border border-sky-500/50 text-sky-300 hover:bg-sky-500/30 font-semibold cursor-pointer"
        >
          Tạo 3 phương án
        </button>
        {variants.map((v, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setActiveVarIdx(idx);
              onUpdateThumbnail(v);
            }}
            className={`px-2 py-1 rounded border cursor-pointer ${activeVarIdx === idx ? 'bg-amber-400 text-zinc-950 border-amber-300 font-bold' : 'bg-zinc-950 border-zinc-800 text-zinc-300'}`}
          >
            PA #{idx + 1} ({v.bgStyle})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <input
          type="text"
          value={thumb.text}
          onChange={(e) => patch({ text: e.target.value.toUpperCase() })}
          placeholder="TIÊU ĐỀ 2-4 TỪ"
          className="col-span-2 rounded bg-zinc-950 border border-zinc-800 px-2 py-1 font-bold text-amber-300"
        />
        <label className="flex items-center gap-1.5 bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
          <span className="text-zinc-400">Cỡ chữ:</span>
          <input
            type="range"
            min={0.7}
            max={1.35}
            step={0.05}
            value={thumb.fontScale ?? 1}
            onChange={(e) => patch({ fontScale: Number(e.target.value) })}
            className="w-full accent-amber-400"
          />
        </label>
        <label className="flex items-center justify-between bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
          <span className="text-zinc-400">Màu nhấn:</span>
          <input
            type="color"
            value={thumb.accentColor}
            onChange={(e) => patch({ accentColor: e.target.value })}
          />
        </label>

        <select
          value={thumb.bgStyle}
          onChange={(e) => patch({ bgStyle: e.target.value as ThumbnailBgStyle })}
          className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1"
          title="Kiểu nền"
        >
          {ThumbnailBgStyleEnum.options.map((st) => (
            <option key={st} value={st}>Nền: {st}</option>
          ))}
        </select>
        <select
          value={thumb.keyProp}
          onChange={(e) => patch({ keyProp: e.target.value as StudioPropType })}
          className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1"
          title="Đạo cụ chính"
        >
          {PropTypeEnum.options.map((pt) => (
            <option key={pt} value={pt}>Đạo cụ: {pt}</option>
          ))}
        </select>

        <select
          value={thumb.emotion1}
          onChange={(e) => patch({ emotion1: e.target.value as StudioEmotion })}
          className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1"
        >
          {EmotionEnum.options.map((em) => (
            <option key={em} value={em}>NV1: {em}</option>
          ))}
        </select>
        <select
          value={thumb.emotion2}
          onChange={(e) => patch({ emotion2: e.target.value as StudioEmotion })}
          className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1"
        >
          {EmotionEnum.options.map((em) => (
            <option key={em} value={em}>NV2: {em}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => patch({ swapCharacters: !thumb.swapCharacters })}
          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 cursor-pointer"
        >
          ⇄ Đổi chỗ / Lật 2 nhân vật
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 pt-1">
        <button
          type="button"
          onClick={() => void exportThumbnailImage(script, { aspect, thumbnailOverride: thumb, customCharFns, format: 'png', fileLabel: aspect.replace(':', 'x') })}
          className="py-1.5 px-2 rounded bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold cursor-pointer text-[11px]"
        >
          PNG {aspect}
        </button>
        <button
          type="button"
          onClick={() => void exportThumbnailImage(script, { aspect: '16:9', width: 1280, height: 720, thumbnailOverride: thumb, customCharFns, format: 'png', fileLabel: '16x9_1280x720' })}
          className="py-1.5 px-2 rounded bg-zinc-800 hover:bg-zinc-700 font-semibold cursor-pointer text-[11px]"
        >
          PNG 1280×720
        </button>
        <button
          type="button"
          onClick={() => void exportThumbnailImage(script, { aspect: '16:9', width: 1280, height: 720, thumbnailOverride: thumb, customCharFns, format: 'jpg', fileLabel: '16x9_1280x720' })}
          className="py-1.5 px-2 rounded bg-zinc-800 hover:bg-zinc-700 font-semibold cursor-pointer text-[11px]"
        >
          JPG 1280×720 (&lt;2MB)
        </button>
      </div>
    </div>
  );
}
