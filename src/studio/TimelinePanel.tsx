import React, { useRef, useState } from 'react';
import { vi } from '../i18n';
import { AudioKind, AudioPlacement, AudioProjectState, resolveAllScheduledClips, snapTimeSec } from './audioTypes';
import { AppliedSkillInstance, resolveScopeTimeWindow } from './editSkills';
import { StudioTimeline } from './schema';

interface TimelinePanelProps {
  timeline: StudioTimeline;
  currentTime: number;
  selectedSceneIdx: number;
  audioProject: AudioProjectState;
  setAudioProject: React.Dispatch<React.SetStateAction<AudioProjectState>>;
  appliedSkills: AppliedSkillInstance[];
  onSeek: (sec: number) => void;
  onSelectScene: (idx: number) => void;
}

export function TimelinePanel({
  timeline, currentTime, selectedSceneIdx, audioProject, setAudioProject, appliedSkills, onSeek, onSelectScene,
}: TimelinePanelProps) {
  const trackContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ id: string; mode: 'move' | 'trimL' | 'trimR'; origStart: number; origDur: number; origOff: number; startX: number } | null>(null);

  const total = Math.max(0.1, timeline.totalDurationSec);
  const playheadPct = Math.min(100, Math.max(0, (currentTime / total) * 100));
  const libMap = new Map(audioProject.library.map((i) => [i.id, i]));
  const scheduled = resolveAllScheduledClips(timeline, audioProject);
  const selectedPlacement = audioProject.placements.find((p) => p.id === selectedPlacementId) ?? null;

  const clientXToSec = (clientX: number): number => {
    const rect = trackContainerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return Number((ratio * total).toFixed(2));
  };

  const handleTrackMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState) return;
    const rect = trackContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const deltaSec = ((e.clientX - dragState.startX) / Math.max(1, rect.width)) * total;
    setAudioProject((prev) => ({
      ...prev,
      placements: prev.placements.map((pl) => {
        if (pl.id !== dragState.id) return pl;
        const itemDur = libMap.get(pl.audioId)?.durationSec ?? pl.durationSec;
        if (dragState.mode === 'move') {
          return { ...pl, startSec: snapTimeSec(dragState.origStart + deltaSec, timeline) };
        }
        if (dragState.mode === 'trimL') {
          const d = Math.max(-dragState.origOff, Math.min(dragState.origDur - 0.15, deltaSec));
          return {
            ...pl,
            startSec: snapTimeSec(dragState.origStart + d, timeline),
            offsetSec: Number(Math.max(0, dragState.origOff + d).toFixed(2)),
            durationSec: Number(Math.max(0.15, dragState.origDur - d).toFixed(2)),
          };
        }
        const maxDur = pl.loop ? total : Math.max(0.15, itemDur - pl.offsetSec);
        return { ...pl, durationSec: Number(Math.max(0.15, Math.min(maxDur, dragState.origDur + deltaSec)).toFixed(2)) };
      }),
    }));
  };

  const handleDropOnKindTrack = (e: React.DragEvent<HTMLDivElement>, targetKind: AudioKind) => {
    e.preventDefault();
    e.stopPropagation();
    const audioId = e.dataTransfer.getData('text/plain');
    const item = libMap.get(audioId);
    if (!item) return;
    const startSec = snapTimeSec(clientXToSec(e.clientX), timeline);
    const newPl: AudioPlacement = {
      id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      audioId: item.id, kind: targetKind, startSec, durationSec: item.durationSec,
      offsetSec: 0, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, muted: false, loop: targetKind === 'music',
    };
    setAudioProject((prev) => ({ ...prev, placements: [...prev.placements, newPl] }));
    setSelectedPlacementId(newPl.id);
  };

  const toggleMuteKind = (k: AudioKind) =>
    setAudioProject((p) => ({ ...p, mixer: { ...p.mixer, mute: { ...p.mixer.mute, [k]: !p.mixer.mute[k] } } }));
  const toggleSoloKind = (k: AudioKind) =>
    setAudioProject((p) => ({ ...p, mixer: { ...p.mixer, solo: { ...p.mixer.solo, [k]: !p.mixer.solo[k] } } }));

  const updateSelected = (patch: Partial<AudioPlacement>) => {
    if (!selectedPlacement) return;
    setAudioProject((prev) => ({
      ...prev,
      placements: prev.placements.map((p) => (p.id === selectedPlacement.id ? { ...p, ...patch } : p)),
    }));
  };

  return (
    <div
      onMouseMove={handleTrackMouseMove}
      onMouseUp={() => setDragState(null)}
      onMouseLeave={() => setDragState(null)}
      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2 select-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-amber-400">{vi.timelinePanel.header}</span>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">{vi.header.masterVolLabel}:</span>
          <input
            type="range" min={0} max={1.5} step={0.05} value={audioProject.mixer.masterVolume}
            onChange={(e) => setAudioProject((p) => ({ ...p, mixer: { ...p.mixer, masterVolume: Number(e.target.value) } }))}
            className="w-20 accent-amber-400"
          />
          <span className="font-mono text-zinc-300 w-10">{Math.round(audioProject.mixer.masterVolume * 100)}%</span>
          <span className="font-mono text-zinc-400">{currentTime.toFixed(2)}s / {total.toFixed(2)}s</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2 items-center text-[11px]">
        <div className="col-span-3 space-y-1.5 text-zinc-400 font-medium pr-1">
          <div className="h-7 flex items-center">{vi.timelinePanel.scenesTrack}</div>
          {(['voice', 'sfx', 'music'] as const).map((k) => (
            <div key={k} className="h-7 flex items-center justify-between gap-1">
              <span className="truncate">{k === 'voice' ? vi.timelinePanel.voiceTrack : k === 'sfx' ? vi.timelinePanel.sfxTrack : vi.timelinePanel.musicTrack}</span>
              <span className="flex gap-0.5 shrink-0">
                <button type="button" onClick={() => toggleMuteKind(k)} className={`px-1 rounded text-[9px] font-bold cursor-pointer ${audioProject.mixer.mute[k] ? 'bg-rose-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>M</button>
                <button type="button" onClick={() => toggleSoloKind(k)} className={`px-1 rounded text-[9px] font-bold cursor-pointer ${audioProject.mixer.solo[k] ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>S</button>
              </span>
            </div>
          ))}
          <div className="h-6 flex items-center">{vi.timelinePanel.skillsTrack}</div>
        </div>

        <div
          ref={trackContainerRef}
          onClick={(e) => { if (!dragState) onSeek(clientXToSec(e.clientX)); }}
          className="col-span-9 relative bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 space-y-1.5 cursor-pointer overflow-hidden"
        >
          <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20 pointer-events-none" style={{ left: `${playheadPct}%` }} />

          {/* 1. Scenes Track */}
          <div className="relative h-7 w-full bg-zinc-900/70 rounded overflow-hidden">
            {timeline.scenes.map((sc, idx) => (
              <div
                key={idx}
                onClick={(e) => { e.stopPropagation(); onSelectScene(idx); onSeek(sc.startSec + 0.05); }}
                style={{ left: `${(sc.startSec / total) * 100}%`, width: `${(sc.durationSec / total) * 100}%` }}
                className={`absolute top-0.5 bottom-0.5 rounded px-1.5 flex items-center justify-between text-[10px] font-bold truncate border ${idx === selectedSceneIdx ? 'bg-amber-400/25 border-amber-400 text-amber-200' : 'bg-zinc-800/90 border-zinc-700 text-zinc-300'}`}
              >
                <span className="truncate">{sc.label}</span>
                <span className="opacity-70">{sc.durationSec}s</span>
              </div>
            ))}
          </div>

          {/* 2, 3, 4. Audio Tracks (voice, sfx, music) */}
          {(['voice', 'sfx', 'music'] as const).map((kind) => {
            const trackPlacements = audioProject.placements.filter((p) => p.kind === kind);
            const autoClips = scheduled.filter((c) => c.kind === kind && c.source !== 'placement');
            return (
              <div
                key={kind}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDropOnKindTrack(e, kind)}
                className="relative h-7 w-full bg-zinc-900/70 rounded overflow-hidden"
              >
                {autoClips.map((ac) => (
                  <div
                    key={ac.id}
                    title={ac.name}
                    style={{ left: `${(ac.startSec / total) * 100}%`, width: `${Math.max(1.5, (ac.durationSec / total) * 100)}%` }}
                    className={`absolute top-1 bottom-1 rounded px-1 text-[9px] flex items-center truncate pointer-events-none ${kind === 'voice' ? 'bg-sky-500/25 border border-sky-500/50 text-sky-200' : kind === 'sfx' ? 'bg-fuchsia-500/30 border border-fuchsia-400 text-fuchsia-200' : 'bg-emerald-500/25 border border-emerald-500/50 text-emerald-200'}`}
                  >
                    {ac.name}
                  </div>
                ))}
                {trackPlacements.map((pl) => {
                  const item = libMap.get(pl.audioId);
                  const isSel = pl.id === selectedPlacementId;
                  return (
                    <div
                      key={pl.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedPlacementId(pl.id); }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedPlacementId(pl.id);
                        setDragState({ id: pl.id, mode: 'move', origStart: pl.startSec, origDur: pl.durationSec, origOff: pl.offsetSec, startX: e.clientX });
                      }}
                      style={{ left: `${(pl.startSec / total) * 100}%`, width: `${Math.max(2.5, (pl.durationSec / total) * 100)}%` }}
                      className={`absolute top-0.5 bottom-0.5 rounded px-2 flex items-center justify-between text-[9px] font-semibold truncate border ${pl.muted ? 'opacity-40 bg-zinc-800 border-zinc-600' : isSel ? 'bg-amber-400/30 border-amber-300 text-amber-100 z-10' : 'bg-indigo-500/35 border-indigo-400 text-indigo-100'}`}
                    >
                      <span
                        onMouseDown={(e) => { e.stopPropagation(); setSelectedPlacementId(pl.id); setDragState({ id: pl.id, mode: 'trimL', origStart: pl.startSec, origDur: pl.durationSec, origOff: pl.offsetSec, startX: e.clientX }); }}
                        className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-300/60 cursor-ew-resize"
                        title="Kéo cắt đầu (Trim Start)"
                      />
                      <span className="truncate">{item?.name || 'Clip'} ({pl.gainDb >= 0 ? `+${pl.gainDb}` : pl.gainDb}dB)</span>
                      <span
                        onMouseDown={(e) => { e.stopPropagation(); setSelectedPlacementId(pl.id); setDragState({ id: pl.id, mode: 'trimR', origStart: pl.startSec, origDur: pl.durationSec, origOff: pl.offsetSec, startX: e.clientX }); }}
                        className="absolute right-0 top-0 bottom-0 w-1.5 bg-amber-300/60 cursor-ew-resize"
                        title="Kéo cắt đuôi (Trim End)"
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* 5. Edit Skills Track */}
          <div className="relative h-6 w-full bg-zinc-900/70 rounded overflow-hidden">
            {appliedSkills.filter((sk) => sk.enabled).map((sk) => {
              const win = resolveScopeTimeWindow(sk.scope, timeline);
              return (
                <div
                  key={sk.instanceId}
                  style={{ left: `${(win.startSec / total) * 100}%`, width: `${Math.max(2, ((win.endSec - win.startSec) / total) * 100)}%` }}
                  className="absolute top-0.5 bottom-0.5 rounded bg-purple-500/30 border border-purple-400 text-purple-200 text-[9px] px-1 flex items-center truncate"
                >
                  #{sk.order + 1} {sk.name}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Placement Controls */}
      {selectedPlacement && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold text-amber-300">
            Clip: {libMap.get(selectedPlacement.audioId)?.name} ({selectedPlacement.startSec}s · dài {selectedPlacement.durationSec}s)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">Gain(dB):<input type="number" min={-24} max={12} value={selectedPlacement.gainDb} onChange={(e) => updateSelected({ gainDb: Number(e.target.value) })} className="w-12 bg-zinc-900 rounded px-1 py-0.5" /></label>
            <label className="flex items-center gap-1">FadeIn:<input type="number" step={0.1} min={0} max={5} value={selectedPlacement.fadeInSec} onChange={(e) => updateSelected({ fadeInSec: Number(e.target.value) })} className="w-12 bg-zinc-900 rounded px-1 py-0.5" /></label>
            <label className="flex items-center gap-1">FadeOut:<input type="number" step={0.1} min={0} max={5} value={selectedPlacement.fadeOutSec} onChange={(e) => updateSelected({ fadeOutSec: Number(e.target.value) })} className="w-12 bg-zinc-900 rounded px-1 py-0.5" /></label>
            <label className="flex items-center gap-1">Offset:<input type="number" step={0.1} min={0} value={selectedPlacement.offsetSec} onChange={(e) => updateSelected({ offsetSec: Number(e.target.value) })} className="w-12 bg-zinc-900 rounded px-1 py-0.5" /></label>
            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={selectedPlacement.muted} onChange={(e) => updateSelected({ muted: e.target.checked })} className="accent-amber-400" />Mute</label>
            {selectedPlacement.kind === 'music' && (
              <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={selectedPlacement.loop} onChange={(e) => updateSelected({ loop: e.target.checked })} className="accent-amber-400" />Loop</label>
            )}
            <button type="button" onClick={() => { setAudioProject((p) => ({ ...p, placements: p.placements.filter((x) => x.id !== selectedPlacement.id) })); setSelectedPlacementId(null); }} className="px-2 py-0.5 rounded bg-rose-900/60 text-rose-200 cursor-pointer">Xóa clip</button>
          </div>
        </div>
      )}
    </div>
  );
}
