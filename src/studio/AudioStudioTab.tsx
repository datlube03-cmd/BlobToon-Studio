import React, { useRef, useState } from 'react';
import { vi } from '../i18n';
import { analyzeAndImportAudioFile, matchVoicesByFilename, splitLongVoiceBySilence } from './audioEngine';
import { AudioEventType, AudioKind, AudioLibraryItem, AudioProjectState, snapTimeSec } from './audioTypes';
import { StudioScript, StudioTimeline } from './schema';

interface AudioStudioTabProps {
  script: StudioScript;
  timeline: StudioTimeline;
  currentTime: number;
  audioProject: AudioProjectState;
  setAudioProject: React.Dispatch<React.SetStateAction<AudioProjectState>>;
  onApplyLineAudios: (map: Record<string, { durationSec: number; audioBase64: string; mimeType: string }>) => void;
  setErrorMsg: (msg: string | null) => void;
}

const EVENT_LABELS: Record<AudioEventType, string> = {
  scene_start: 'Đầu cảnh (scene start)',
  scene_end: 'Cuối cảnh (scene end)',
  char_appear: 'Nhân vật xuất hiện',
  line_start: 'Bắt đầu câu thoại',
  emotion_change: 'Đổi cảm xúc sang...',
};

export function AudioStudioTab({
  script, timeline, currentTime, audioProject, setAudioProject, onApplyLineAudios, setErrorMsg,
}: AudioStudioTabProps) {
  const [importKind, setImportKind] = useState<AudioKind>('voice');
  const [filterKind, setFilterKind] = useState<AudioKind | 'all'>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const existingNames = audioProject.library.map((i) => i.name);
    const added: AudioLibraryItem[] = [];
    for (const file of Array.from(files)) {
      try {
        const item = await analyzeAndImportAudioFile(file, importKind, [...existingNames, ...added.map((a) => a.name)]);
        added.push(item);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : `Không đọc được file ${file.name}`);
      }
    }
    if (added.length > 0) setAudioProject((prev) => ({ ...prev, library: [...prev.library, ...added] }));
  };

  const togglePreview = (item: AudioLibraryItem) => {
    if (playingId === item.id) { previewAudioRef.current?.pause(); setPlayingId(null); return; }
    previewAudioRef.current?.pause();
    const audio = new Audio(`data:${item.mimeType};base64,${item.audioBase64}`);
    audio.onended = () => setPlayingId(null);
    previewAudioRef.current = audio;
    setPlayingId(item.id);
    void audio.play().catch(() => setPlayingId(null));
  };

  const placeOnTimeline = (item: AudioLibraryItem) => {
    const startSec = snapTimeSec(currentTime, timeline);
    setAudioProject((prev) => ({
      ...prev,
      placements: [
        ...prev.placements,
        {
          id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          audioId: item.id, kind: item.kind, startSec, durationSec: item.durationSec,
          offsetSec: 0, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, muted: false, loop: item.kind === 'music',
        },
      ],
    }));
  };

  const removeLibraryItem = (id: string) => {
    setAudioProject((prev) => ({
      ...prev,
      library: prev.library.filter((i) => i.id !== id),
      placements: prev.placements.filter((p) => p.audioId !== id),
      eventBindings: prev.eventBindings.filter((b) => b.audioId !== id),
      musicConfig: prev.musicConfig.audioId === id ? { ...prev.musicConfig, audioId: null } : prev.musicConfig,
    }));
  };

  const voiceItems = audioProject.library.filter((i) => i.kind === 'voice');
  const sfxItems = audioProject.library.filter((i) => i.kind === 'sfx');
  const musicItems = audioProject.library.filter((i) => i.kind === 'music');
  const visibleItems = audioProject.library.filter((i) => filterKind === 'all' || i.kind === filterKind);
  const mc = audioProject.musicConfig;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-3 text-xs max-h-[680px] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-amber-400">{vi.audioStudio.header}</h2>
        <span className="text-[10px] text-emerald-300 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded">100% Local IndexedDB</span>
      </div>
      <p className="text-[11px] text-zinc-400">{vi.audioStudio.localPrivacyNote}</p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void handleFiles(e.dataTransfer.files); }}
        className="border-2 border-dashed border-zinc-700 hover:border-amber-400 rounded-xl p-2.5 bg-zinc-950/70 space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-zinc-300 font-semibold">Nhập vào loại:</span>
          <div className="flex gap-1">
            {(['voice', 'sfx', 'music'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setImportKind(k)} className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${importKind === k ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300'}`}>
                {k === 'voice' ? 'Giọng' : k === 'sfx' ? 'Hiệu ứng' : 'Nhạc nền'}
              </button>
            ))}
          </div>
        </div>
        <label className="block w-full text-center py-2 rounded bg-zinc-900 hover:bg-zinc-800 text-amber-300 font-medium cursor-pointer">
          {vi.audioStudio.dropPrompt}
          <input type="file" multiple accept=".wav,.mp3,.m4a,.ogg,.flac,audio/*" className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex gap-1">
          {(['all', 'voice', 'sfx', 'music'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilterKind(f)} className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${filterKind === f ? 'bg-zinc-200 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-400'}`}>
              {f === 'all' ? `Tất cả (${audioProject.library.length})` : f === 'voice' ? `Giọng (${voiceItems.length})` : f === 'sfx' ? `SFX (${sfxItems.length})` : `Nhạc (${musicItems.length})`}
            </button>
          ))}
        </div>
        {voiceItems.length > 0 && (
          <div className="flex gap-1">
            <button type="button" onClick={() => onApplyLineAudios(matchVoicesByFilename(voiceItems, script))} className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 hover:bg-sky-500/30 text-[11px] cursor-pointer">{vi.audioStudio.matchByFilenameBtn}</button>
            <button type="button" onClick={async () => onApplyLineAudios(await splitLongVoiceBySilence(voiceItems[0], script))} className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30 text-[11px] cursor-pointer">{vi.audioStudio.splitSilenceBtn}</button>
          </div>
        )}
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {visibleItems.length === 0 && <div className="text-zinc-500 text-center py-3">Chưa có file âm thanh nào trong thư viện.</div>}
        {visibleItems.map((item) => (
          <div key={item.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)} className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 flex items-center gap-2">
            <button type="button" onClick={() => togglePreview(item)} className="w-6 h-6 rounded bg-amber-400 text-zinc-950 font-bold flex items-center justify-center shrink-0 cursor-pointer">{playingId === item.id ? '■' : '▶'}</button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`px-1 rounded text-[10px] font-bold ${item.kind === 'voice' ? 'bg-sky-900 text-sky-200' : item.kind === 'sfx' ? 'bg-fuchsia-900 text-fuchsia-200' : 'bg-emerald-900 text-emerald-200'}`}>{item.kind.toUpperCase()}</span>
                {editingId === item.id ? (
                  <input
                    type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => {
                      if (editingName.trim()) setAudioProject((prev) => ({ ...prev, library: prev.library.map((i) => (i.id === item.id ? { ...i, name: editingName.trim() } : i)) }));
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} autoFocus
                    className="bg-zinc-900 border border-amber-400 rounded px-1 py-0.5 text-xs w-32"
                  />
                ) : (
                  <span className="font-semibold text-zinc-200 truncate" title={item.name}>{item.name}</span>
                )}
                <span className="text-zinc-400 font-mono text-[10px]">{item.durationSec}s</span>
                {item.clipping && <span className="text-[10px] px-1 rounded bg-rose-950 text-rose-300 border border-rose-700">{vi.audioStudio.clippingWarn}</span>}
              </div>
              <div className="h-4 flex items-end gap-0.5 mt-1">
                {item.peaks.map((pk, idx) => <div key={idx} style={{ height: `${pk}%` }} className={`flex-1 rounded-t ${item.clipping ? 'bg-rose-400' : 'bg-amber-400/75'}`} />)}
              </div>
            </div>
            <button type="button" onClick={() => placeOnTimeline(item)} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-[11px] cursor-pointer" title="Đặt vào vị trí Playhead">+ Đặt</button>
            <button type="button" onClick={() => { setEditingId(item.id); setEditingName(item.name); }} className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] cursor-pointer">Sửa tên</button>
            <button type="button" onClick={() => removeLibraryItem(item.id)} className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-rose-900 text-rose-300 text-[11px] cursor-pointer">Xóa</button>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-zinc-800 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-amber-300">{vi.audioStudio.eventsHeader}</span>
          <button
            type="button" disabled={audioProject.library.length === 0}
            onClick={() => {
              const first = sfxItems[0] ?? audioProject.library[0];
              if (first) setAudioProject((prev) => ({ ...prev, eventBindings: [...prev.eventBindings, { id: `evb-${Date.now()}`, event: 'scene_start', filter: '', audioId: first.id, gainDb: 0 }] }));
            }}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 cursor-pointer disabled:opacity-40"
          >
            {vi.audioStudio.addEventBtn}
          </button>
        </div>
        {audioProject.eventBindings.map((b) => (
          <div key={b.id} className="grid grid-cols-12 gap-1 items-center bg-zinc-950 p-1.5 rounded border border-zinc-800">
            <select value={b.event} onChange={(e) => setAudioProject((prev) => ({ ...prev, eventBindings: prev.eventBindings.map((x) => (x.id === b.id ? { ...x, event: e.target.value as AudioEventType } : x)) }))} className="col-span-4 bg-zinc-900 rounded px-1 py-0.5 text-[11px]">
              {(Object.keys(EVENT_LABELS) as AudioEventType[]).map((ev) => <option key={ev} value={ev}>{EVENT_LABELS[ev]}</option>)}
            </select>
            <input type="text" placeholder="Lọc (HOOK, kid...)" value={b.filter} onChange={(e) => setAudioProject((prev) => ({ ...prev, eventBindings: prev.eventBindings.map((x) => (x.id === b.id ? { ...x, filter: e.target.value } : x)) }))} className="col-span-3 bg-zinc-900 rounded px-1.5 py-0.5 text-[11px]" />
            <select value={b.audioId} onChange={(e) => setAudioProject((prev) => ({ ...prev, eventBindings: prev.eventBindings.map((x) => (x.id === b.id ? { ...x, audioId: e.target.value } : x)) }))} className="col-span-3 bg-zinc-900 rounded px-1 py-0.5 text-[11px]">
              {audioProject.library.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
            <input type="number" min={-24} max={12} value={b.gainDb} onChange={(e) => setAudioProject((prev) => ({ ...prev, eventBindings: prev.eventBindings.map((x) => (x.id === b.id ? { ...x, gainDb: Number(e.target.value) } : x)) }))} className="col-span-1 bg-zinc-900 rounded px-1 py-0.5 text-[11px]" title="Gain (dB)" />
            <button type="button" onClick={() => setAudioProject((prev) => ({ ...prev, eventBindings: prev.eventBindings.filter((x) => x.id !== b.id) }))} className="col-span-1 text-rose-400 hover:text-rose-300 font-bold cursor-pointer">×</button>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-zinc-800 space-y-2">
        <div className="font-semibold text-emerald-400">{vi.audioStudio.musicHeader}</div>
        <div className="grid grid-cols-2 gap-2 items-center">
          <select value={mc.audioId || ''} onChange={(e) => setAudioProject((prev) => ({ ...prev, musicConfig: { ...prev.musicConfig, audioId: e.target.value || null } }))} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1">
            <option value="">-- Không chọn nhạc nền --</option>
            {musicItems.concat(audioProject.library.filter((i) => i.kind !== 'music')).map((it) => <option key={it.id} value={it.id}>{it.name} ({it.durationSec}s)</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={mc.loop} onChange={(e) => setAudioProject((prev) => ({ ...prev, musicConfig: { ...prev.musicConfig, loop: e.target.checked } }))} className="accent-amber-400" /><span>Loop</span></label>
            <span className="text-zinc-400 ml-1">Cảnh:</span>
            <input type="number" min={1} max={script.scenes.length} value={mc.startSceneIdx + 1} onChange={(e) => setAudioProject((prev) => ({ ...prev, musicConfig: { ...prev.musicConfig, startSceneIdx: Math.max(0, Number(e.target.value) - 1) } }))} className="w-10 bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5" />
            <span>→</span>
            <input type="number" min={1} max={script.scenes.length} value={Math.min(script.scenes.length, mc.endSceneIdx + 1)} onChange={(e) => setAudioProject((prev) => ({ ...prev, musicConfig: { ...prev.musicConfig, endSceneIdx: Math.max(0, Number(e.target.value) - 1) } }))} className="w-10 bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 bg-zinc-950 p-2 rounded border border-zinc-800">
          <span>{vi.audioStudio.duckingLabel}: <strong>{mc.duckingDb > 0 ? `-${mc.duckingDb} dB` : 'Tắt (0 dB)'}</strong></span>
          <input type="range" min={0} max={15} step={1} value={mc.duckingDb} onChange={(e) => setAudioProject((prev) => ({ ...prev, musicConfig: { ...prev.musicConfig, duckingDb: Number(e.target.value) } }))} className="w-28 accent-emerald-400" />
        </div>
      </div>
    </div>
  );
}
