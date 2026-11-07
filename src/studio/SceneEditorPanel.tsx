import React, { useMemo } from 'react';
import { verifyCaptionRatiosInvariant } from '../aspect';
import { vi } from '../i18n';
import { AudioLibraryItem } from './audioTypes';
import { CustomCharacterDef } from './characterCode';
import { ExportAudioOptions, exportTimelineVideo } from './exportVideo';
import {
  AnimEnum,
  EmotionEnum,
  PropTypeEnum,
  StudioAnim,
  StudioEmotion,
  StudioPropType,
  StudioScene,
  StudioThumbnail,
  StudioTimeline,
} from './schema';
import { decodeAudioDurationSec, readFileAsBase64 } from './storage';
import { ThumbnailPanel } from './ThumbnailPanel';

interface SceneEditorPanelProps {
  activeScene: StudioScene;
  selectedSceneIdx: number;
  timeline: StudioTimeline;
  customCharacters: CustomCharacterDef[];
  voiceLibraryItems: AudioLibraryItem[];
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  audioOptions: ExportAudioOptions;
  exportProgress: number | null;
  showBubbles: boolean;
  setShowBubbles: (v: boolean) => void;
  setExportProgress: (v: number | null) => void;
  setIsPlaying: (v: boolean) => void;
  setErrorMsg: (v: string | null) => void;
  updateScene: (fn: (sc: StudioScene) => StudioScene) => void;
  onUpdateThumbnail: (next: StudioThumbnail) => void;
  onUploadLineAudio: (key: string, item: { audioBase64: string; mimeType: string; durationSec: number }) => void;
  onUploadSceneAudio: (sIdx: number, item: { audioBase64: string; mimeType: string; durationSec: number }) => void;
}

export function SceneEditorPanel({
  activeScene,
  selectedSceneIdx,
  timeline,
  customCharacters,
  voiceLibraryItems,
  canvasRef,
  audioOptions,
  exportProgress,
  showBubbles,
  setShowBubbles,
  setExportProgress,
  setIsPlaying,
  setErrorMsg,
  updateScene,
  onUpdateThumbnail,
  onUploadLineAudio,
  onUploadSceneAudio,
}: SceneEditorPanelProps) {
  const captionCheck = useMemo(() => verifyCaptionRatiosInvariant(), []);
  const charTypeOptions = useMemo(
    () => ['blob', ...customCharacters.map((c) => c.id)],
    [customCharacters]
  );

  return (
    <section className="lg:col-span-4 space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 max-h-[540px] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-400">
            {vi.right.editorHeader}: {activeScene.label}
          </h2>
          <label className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] cursor-pointer">
            {vi.right.uploadSceneAudioBtn}
            <input type="file" accept=".wav,.mp3,.m4a,.ogg,.flac,audio/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const { base64, mimeType } = await readFileAsBase64(f);
              const durationSec = await decodeAudioDurationSec(base64, activeScene.caption);
              onUploadSceneAudio(selectedSceneIdx, { audioBase64: base64, mimeType, durationSec });
            }} />
          </label>
        </div>

        <input
          type="text"
          value={activeScene.caption}
          onChange={(e) => updateScene((s) => ({ ...s, caption: e.target.value }))}
          className="w-full rounded bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs"
        />

        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">{vi.right.bgColorsLabel}:</span>
          <input type="color" value={activeScene.bg[0]} onChange={(e) => updateScene((s) => ({ ...s, bg: [e.target.value, s.bg[1]] }))} />
          <input type="color" value={activeScene.bg[1]} onChange={(e) => updateScene((s) => ({ ...s, bg: [s.bg[0], e.target.value] }))} />
        </div>

        <div className="space-y-1.5 pt-2 border-t border-zinc-800">
          <div className="text-xs font-semibold text-zinc-300">{vi.right.charactersHeader}</div>
          {activeScene.characters.map((ch, cIdx) => (
            <div key={cIdx} className="bg-zinc-950 p-2 rounded space-y-1.5 text-xs">
              <div className="grid grid-cols-3 gap-1.5 items-center">
                <span className="font-mono font-bold text-amber-300 truncate">{ch.id}</span>
                <select
                  value={ch.charType || 'blob'}
                  onChange={(e) => updateScene((s) => ({ ...s, characters: s.characters.map((c, i) => (i === cIdx ? { ...c, charType: e.target.value } : c)) }))}
                  className="bg-zinc-900 rounded px-1 py-0.5"
                >
                  {charTypeOptions.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                </select>
                <input type="color" value={ch.color} onChange={(e) => updateScene((s) => ({ ...s, characters: s.characters.map((c, i) => (i === cIdx ? { ...c, color: e.target.value } : c)) }))} />
              </div>
              <div className="grid grid-cols-4 gap-1.5 items-center">
                <select value={ch.emotion} onChange={(e) => updateScene((s) => ({ ...s, characters: s.characters.map((c, i) => (i === cIdx ? { ...c, emotion: e.target.value as StudioEmotion } : c)) }))} className="bg-zinc-900 rounded px-1 py-0.5">
                  {EmotionEnum.options.map((em) => <option key={em} value={em}>{em}</option>)}
                </select>
                <select value={ch.anim} onChange={(e) => updateScene((s) => ({ ...s, characters: s.characters.map((c, i) => (i === cIdx ? { ...c, anim: e.target.value as StudioAnim } : c)) }))} className="bg-zinc-900 rounded px-1 py-0.5">
                  {AnimEnum.options.map((an) => <option key={an} value={an}>{an}</option>)}
                </select>
                <input type="number" step={0.05} min={0.1} max={0.9} value={ch.x} onChange={(e) => updateScene((s) => ({ ...s, characters: s.characters.map((c, i) => (i === cIdx ? { ...c, x: Number(e.target.value) } : c)) }))} className="bg-zinc-900 rounded px-1 py-0.5" title="Vị trí X" />
                <input type="number" step={0.05} min={0.4} max={0.95} value={ch.y} onChange={(e) => updateScene((s) => ({ ...s, characters: s.characters.map((c, i) => (i === cIdx ? { ...c, y: Number(e.target.value) } : c)) }))} className="bg-zinc-900 rounded px-1 py-0.5" title="Vị trí Y" />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 pt-2 border-t border-zinc-800">
          <div className="text-xs font-semibold text-zinc-300">{vi.right.linesHeader}</div>
          {activeScene.lines.map((ln, lIdx) => {
            const speakerOpts = ['narrator', ...activeScene.characters.map((c) => c.id)];
            const lineKey = `${selectedSceneIdx}:${lIdx}`;
            return (
              <div key={lIdx} className="bg-zinc-950 p-2 rounded space-y-1 text-xs">
                <input type="text" value={ln.text} onChange={(e) => updateScene((s) => ({ ...s, lines: s.lines.map((l, i) => (i === lIdx ? { ...l, text: e.target.value } : l)) }))} className="w-full bg-zinc-900 rounded px-2 py-1" />
                <div className="flex items-center gap-1.5">
                  <select value={ln.speaker} onChange={(e) => { const sp = e.target.value; updateScene((s) => ({ ...s, lines: s.lines.map((l, i) => (i === lIdx ? { ...l, speaker: sp, bubble: false } : l)) })); }} className="bg-zinc-900 rounded px-1.5 py-0.5 font-mono text-amber-300">
                    {speakerOpts.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                  {voiceLibraryItems.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const chosen = voiceLibraryItems.find((v) => v.id === e.target.value);
                        if (chosen) onUploadLineAudio(lineKey, { audioBase64: chosen.audioBase64, mimeType: chosen.mimeType, durationSec: chosen.durationSec });
                      }}
                      className="bg-zinc-900 rounded px-1.5 py-0.5 text-[11px] max-w-[120px]"
                    >
                      <option value="">-- Chọn từ Thư viện --</option>
                      {voiceLibraryItems.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.durationSec}s)</option>)}
                    </select>
                  )}
                  <label className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 cursor-pointer ml-auto">
                    {vi.right.uploadAudioBtn}
                    <input type="file" accept=".wav,.mp3,.m4a,.ogg,.flac,audio/*" className="hidden" onChange={async (e) => {
                      const f = e.target.files?.[0]; if (!f) return;
                      const { base64, mimeType } = await readFileAsBase64(f);
                      const durationSec = await decodeAudioDurationSec(base64, ln.text);
                      onUploadLineAudio(lineKey, { audioBase64: base64, mimeType, durationSec });
                    }} />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5 pt-2 border-t border-zinc-800">
          <div className="text-xs font-semibold text-zinc-300">{vi.right.propsHeader}</div>
          {activeScene.props.map((pr, pIdx) => {
            const surfaceOptions = ['ground', 'table', 'float', ...activeScene.characters.map((c) => `hand:${c.id}`)];
            return (
              <div key={pIdx} className="grid grid-cols-4 gap-1.5 text-xs bg-zinc-950 p-1.5 rounded">
                <select value={pr.type} onChange={(e) => updateScene((s) => ({ ...s, props: s.props.map((p, i) => (i === pIdx ? { ...p, type: e.target.value as StudioPropType } : p)) }))} className="bg-zinc-900 rounded px-1 py-0.5">
                  {PropTypeEnum.options.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
                </select>
                <select value={pr.surface || 'ground'} onChange={(e) => updateScene((s) => ({ ...s, props: s.props.map((p, i) => (i === pIdx ? { ...p, surface: e.target.value } : p)) }))} className="bg-zinc-900 rounded px-1 py-0.5" title="Bề mặt (Surface)">
                  {surfaceOptions.map((sf) => <option key={sf} value={sf}>{sf}</option>)}
                </select>
                <input type="number" step={0.05} value={pr.x} onChange={(e) => updateScene((s) => ({ ...s, props: s.props.map((p, i) => (i === pIdx ? { ...p, x: Number(e.target.value) } : p)) }))} className="bg-zinc-900 rounded px-1 py-0.5" title="X" />
                <input type="number" step={0.05} value={pr.y} onChange={(e) => updateScene((s) => ({ ...s, props: s.props.map((p, i) => (i === pIdx ? { ...p, y: Number(e.target.value) } : p)) }))} className="bg-zinc-900 rounded px-1 py-0.5" title="Y" />
              </div>
            );
          })}
        </div>
      </div>

      <ThumbnailPanel
        script={timeline.script}
        aspect={timeline.aspect ?? '9:16'}
        customCharFns={audioOptions.customCharFns}
        onUpdateThumbnail={onUpdateThumbnail}
      />

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-emerald-400">{vi.header.captionCheckBtn}</span>
          <span className="font-mono text-zinc-400">gap/fs=0.28 · lh/fs=1.18 ({captionCheck.passed ? 'OK' : 'ERR'})</span>
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-400">{vi.right.exportHeader}</h2>
          <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={showBubbles} onChange={(e) => setShowBubbles(e.target.checked)} className="accent-amber-400" />
            <span>Hiện bong bóng thoại</span>
          </label>
        </div>
        <p className="text-[11px] text-zinc-400">{vi.right.exportRealtimeNote}</p>
        {exportProgress !== null && (
          <div className="w-full bg-zinc-800 h-2 rounded overflow-hidden"><div className="bg-amber-400 h-full" style={{ width: `${exportProgress}%` }} /></div>
        )}
        <button
          type="button"
          disabled={exportProgress !== null}
          onClick={async () => {
            if (!canvasRef.current) return;
            setIsPlaying(false); setExportProgress(0);
            try { await exportTimelineVideo(canvasRef.current, timeline, setExportProgress, audioOptions); }
            catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Lỗi quay video'); }
            finally { setExportProgress(null); }
          }}
          className="w-full py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs cursor-pointer disabled:opacity-50"
        >
          {exportProgress !== null ? vi.right.exportingVideoBtn(exportProgress) : vi.right.exportVideoBtn}
        </button>
      </div>
    </section>
  );
}
