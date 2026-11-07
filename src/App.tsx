import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ASPECT_RATIOS, AspectRatio } from './aspect';
import { vi } from './i18n';
import { renderMixedAudioBuffer } from './studio/audioEngine';
import { AudioStudioTab } from './studio/AudioStudioTab';
import { AudioProjectState, DEFAULT_AUDIO_PROJECT, resolveAllScheduledClips } from './studio/audioTypes';
import { ensureFredokaFontLoaded, getFontFallbackWarning } from './studio/captions';
import { CharacterCodeTab } from './studio/CharacterCodeTab';
import { CharacterDrawFn, compileCharacterCode, CustomCharacterDef } from './studio/characterCode';
import { drawFrame } from './studio/drawFrame';
import { AppliedSkillInstance } from './studio/editSkills';
import { EditSkillsTab } from './studio/EditSkillsTab';
import { ManualScriptTab } from './studio/ManualScriptTab';
import { SAMPLE_SCRIPT, SAMPLE_TOPIC } from './studio/sample';
import { SceneEditorPanel } from './studio/SceneEditorPanel';
import { buildTimelineFromScript, getLayoutForAspect, sanitizeAndValidateScript, StudioScript } from './studio/schema';
import { deleteCustomCharacter, downloadProjectJson, getCachedScript, getSavedCharacters, loadAudioProjectState, parseImportedProjectFile, saveAudioProjectState, saveCustomCharacter, setCachedScript } from './studio/storage';
import { TimelinePanel } from './studio/TimelinePanel';

type LeftTab = 'ai' | 'manual' | 'char' | 'skills' | 'audio';

export default function App() {
  const [leftTab, setLeftTab] = useState<LeftTab>('ai');
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [fontReady, setFontReady] = useState(false);
  const [customCharacters, setCustomCharacters] = useState<CustomCharacterDef[]>([]);
  const [appliedSkills, setAppliedSkills] = useState<AppliedSkillInstance[]>([]);
  const [bypassSkills, setBypassSkills] = useState(false);
  const [audioProject, setAudioProject] = useState<AudioProjectState>(DEFAULT_AUDIO_PROJECT);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [topic, setTopic] = useState(SAMPLE_TOPIC);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [script, setScript] = useState<StudioScript>(SAMPLE_SCRIPT);
  const [selectedSceneIdx, setSelectedSceneIdx] = useState(0);
  const [lineAudios, setLineAudios] = useState<Record<string, { durationSec: number; audioBase64: string; mimeType: string }>>({});
  const [sceneAudios, setSceneAudios] = useState<Record<number, { durationSec: number; audioBase64: string; mimeType: string }>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [warnMsg, setWarnMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [showBubbles, setShowBubbles] = useState(false);
  const [mixedBuffer, setMixedBuffer] = useState<AudioBuffer | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lastSyncTimeRef = useRef<number>(0);

  const layout = useMemo(() => getLayoutForAspect(aspect), [aspect]);
  const timeline = useMemo(() => buildTimelineFromScript(topic, script, 'user', lineAudios, sceneAudios, aspect), [topic, script, lineAudios, sceneAudios, aspect]);
  const totalWords = useMemo(() => script.scenes.reduce((a, s) => a + s.lines.reduce((w, l) => w + l.text.trim().split(/\s+/).filter(Boolean).length, 0), 0), [script]);

  const customCharFns = useMemo(() => {
    const map = new Map<string, CharacterDrawFn>();
    customCharacters.forEach((c) => { const fn = compileCharacterCode(c.code).fn; if (fn) map.set(c.id, fn); });
    return map;
  }, [customCharacters]);

  useEffect(() => {
    void ensureFredokaFontLoaded().then(() => { setFontReady(true); const warn = getFontFallbackWarning(); if (warn) setWarnMsg(warn); });
    void getSavedCharacters().then(setCustomCharacters);
    void loadAudioProjectState().then((st) => { setAudioProject(st); setAudioLoaded(true); });
  }, []);

  useEffect(() => { if (audioLoaded) void saveAudioProjectState(audioProject); }, [audioProject, audioLoaded]);

  useEffect(() => {
    let cancelled = false;
    const scheduled = resolveAllScheduledClips(timeline, audioProject);
    if (scheduled.length === 0) { setMixedBuffer(null); return; }
    void renderMixedAudioBuffer(timeline, audioProject).then((buf) => { if (!cancelled) setMixedBuffer(buf); }).catch(() => { if (!cancelled) setMixedBuffer(null); });
    return () => { cancelled = true; };
  }, [timeline, audioProject]);

  const stopPreviewAudio = () => {
    if (activeSourceRef.current) {
      try { activeSourceRef.current.stop(); } catch { /* ignore */ }
      activeSourceRef.current.disconnect();
      activeSourceRef.current = null;
    }
  };

  const startPreviewAudioAt = (offsetSec: number) => {
    stopPreviewAudio();
    if (!mixedBuffer || !audioCtxRef.current || audioCtxRef.current.state !== 'running' || offsetSec >= mixedBuffer.duration) return;
    const src = audioCtxRef.current.createBufferSource();
    src.buffer = mixedBuffer;
    src.connect(audioCtxRef.current.destination);
    src.start(0, Math.max(0, offsetSec));
    activeSourceRef.current = src;
    lastSyncTimeRef.current = offsetSec;
  };

  useEffect(() => {
    if (!isPlaying || exportProgress !== null || !mixedBuffer) { stopPreviewAudio(); return; }
    startPreviewAudioAt(currentTime);
    return () => stopPreviewAudio();
  }, [isPlaying, exportProgress, mixedBuffer]);

  useEffect(() => {
    if (isPlaying && exportProgress === null && mixedBuffer && Math.abs(currentTime - lastSyncTimeRef.current) > 0.35) startPreviewAudioAt(currentTime);
    else lastSyncTimeRef.current = currentTime;
  }, [currentTime, isPlaying, exportProgress, mixedBuffer]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawFrame(ctx, currentTime, timeline, layout, { customCharFns, appliedSkills, bypassSkills, showBubbles });
  }, [currentTime, timeline, layout, fontReady, customCharFns, appliedSkills, bypassSkills, showBubbles]);

  useEffect(() => {
    if (!isPlaying || exportProgress !== null) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setCurrentTime((prev) => {
        if (prev + dt >= timeline.totalDurationSec) { startPreviewAudioAt(0); return 0; }
        return prev + dt;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, timeline.totalDurationSec, exportProgress, mixedBuffer]);

  const ensureAudioCtx = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  const handleGenerateScript = async () => {
    ensureAudioCtx(); setErrorMsg(null); setWarnMsg(null); setIsGenerating(true);
    try {
      let nextScript = await getCachedScript(topic);
      if (nextScript) setFromCache(true);
      else {
        setFromCache(false);
        const res = await fetch('/api/script', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không thể tạo kịch bản');
        nextScript = sanitizeAndValidateScript(data.script).script;
        await setCachedScript(topic, nextScript);
      }
      setScript(nextScript); setSelectedSceneIdx(0); setLineAudios({}); setSceneAudios({}); setCurrentTime(0);
    } catch (err) { setErrorMsg(err instanceof Error ? err.message : String(err)); } finally { setIsGenerating(false); }
  };

  const handleFetchIdeas = async () => {
    setLoadingIdeas(true);
    try { const res = await fetch('/api/ideas', { method: 'POST' }), data = await res.json(); if (Array.isArray(data.ideas)) setIdeas(data.ideas); } catch { /* ignore */ } finally { setLoadingIdeas(false); }
  };

  const activeScene = script.scenes[selectedSceneIdx] ?? script.scenes[0];
  const updateScene = (fn: (sc: StudioScript['scenes'][0]) => StudioScript['scenes'][0]) => setScript((prev) => ({ ...prev, scenes: prev.scenes.map((s, idx) => (idx === selectedSceneIdx ? fn(s) : s)) }));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="px-5 py-2.5 border-b border-zinc-800 bg-zinc-900/90 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-base font-bold text-amber-400">{vi.appName}</h1><p className="text-[11px] text-zinc-400">{vi.appSubtitle}</p></div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1">
            <span className="text-zinc-400 px-1.5">{vi.header.aspectLabel}:</span>
            {ASPECT_RATIOS.map((r) => <button key={r} type="button" onClick={() => setAspect(r)} className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${aspect === r ? 'bg-amber-400 text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800'}`}>{r}</button>)}
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-emerald-300">{vi.header.localAudioBadge}</span>
          {fromCache && <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700">{vi.left.cachedBadge}</span>}
        </div>
      </header>

      {(errorMsg || warnMsg) && (
        <div className="px-6 py-2 bg-amber-950/80 border-b border-amber-700 text-xs flex items-center justify-between gap-4">
          <span className="text-amber-200">{errorMsg || warnMsg}</span>
          {errorMsg && <button type="button" onClick={handleGenerateScript} className="px-3 py-1 rounded bg-amber-400 text-zinc-950 font-semibold cursor-pointer">{vi.left.retryBtn}</button>}
        </div>
      )}

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 max-w-[1600px] w-full mx-auto">
        <section className="lg:col-span-4 space-y-3">
          <div className="grid grid-cols-3 gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 text-xs">
            {(['ai', 'manual', 'audio', 'char', 'skills'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setLeftTab(t)} className={`py-1.5 px-2 rounded-lg font-semibold cursor-pointer ${leftTab === t ? 'bg-amber-400 text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800'}`}>
                {t === 'ai' ? vi.tabs.aiScript : t === 'manual' ? vi.tabs.manualScript : t === 'audio' ? vi.tabs.audioLib : t === 'char' ? vi.tabs.charCode : vi.tabs.editSkills}
              </button>
            ))}
          </div>

          {leftTab === 'ai' && (
            <>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-amber-400">{vi.left.topicHeader}</h2><button type="button" onClick={handleFetchIdeas} className="px-2.5 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 cursor-pointer">{loadingIdeas ? vi.left.ideasLoading : vi.left.ideasBtn}</button></div>
                <textarea rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={vi.left.topicPlaceholder} className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 text-xs" />
                {ideas.length > 0 && <div className="max-h-24 overflow-y-auto space-y-1">{ideas.map((idText, idx) => <button key={idx} type="button" onClick={() => setTopic(idText)} className="w-full text-left text-xs px-2 py-1 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-300 truncate cursor-pointer">{idx + 1}. {idText}</button>)}</div>}
                <button type="button" onClick={handleGenerateScript} disabled={isGenerating} className="w-full py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs cursor-pointer disabled:opacity-50">{isGenerating ? vi.left.generatingBtn : vi.left.generateBtn}</button>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-amber-400">{vi.left.scriptHeader}</h2><span className="text-xs text-zinc-400">{vi.left.wordsStat(totalWords, timeline.totalDurationSec)}</span></div>
                <div className="text-xs font-semibold text-zinc-200">{script.title}</div>
                <div className="space-y-1.5">{timeline.scenes.map((sc, i) => <button key={i} type="button" onClick={() => { setSelectedSceneIdx(i); setCurrentTime(sc.startSec + 0.05); }} className={`w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer ${i === selectedSceneIdx ? 'border-amber-400 bg-zinc-800' : 'border-zinc-800 bg-zinc-950'}`}><div className="flex justify-between font-bold text-amber-300"><span>{sc.label}</span><span>{sc.durationSec}s</span></div><div className="text-zinc-300 truncate">{sc.caption}</div></button>)}</div>
                <div className="pt-2 border-t border-zinc-800 flex gap-2">
                  <button type="button" onClick={() => downloadProjectJson({ version: 3, topic, aspect, script, lineAudios, sceneAudios, customCharacters, appliedSkills, audioProject })} className="flex-1 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs cursor-pointer">{vi.left.exportJsonBtn}</button>
                  <label className="flex-1 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-center cursor-pointer">{vi.left.importJsonBtn}<input type="file" accept=".json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const proj = await parseImportedProjectFile(f); setTopic(proj.topic); if (proj.aspect) setAspect(proj.aspect); setScript(proj.script); setLineAudios(proj.lineAudios); setSceneAudios(proj.sceneAudios); if (proj.customCharacters?.length) { setCustomCharacters(proj.customCharacters); for (const c of proj.customCharacters) await saveCustomCharacter(c); } if (proj.appliedSkills) setAppliedSkills(proj.appliedSkills); if (proj.audioProject) setAudioProject(proj.audioProject); setCurrentTime(0); } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'File JSON không hợp lệ'); } }} /></label>
                </div>
              </div>
            </>
          )}
          {leftTab === 'manual' && <ManualScriptTab script={script} aspect={aspect} onApplyManualScript={(nextScript, nextAspect) => { setScript(nextScript); setAspect(nextAspect); setSelectedSceneIdx(0); setCurrentTime(0); }} />}
          {leftTab === 'audio' && <AudioStudioTab script={script} timeline={timeline} currentTime={currentTime} audioProject={audioProject} setAudioProject={setAudioProject} onApplyLineAudios={(map) => setLineAudios((prev) => ({ ...prev, ...map }))} setErrorMsg={setErrorMsg} />}
          {leftTab === 'char' && <CharacterCodeTab customCharacters={customCharacters} onSaveCharacter={async (c) => { await saveCustomCharacter(c); setCustomCharacters(await getSavedCharacters()); }} onDeleteCharacter={async (id) => { await deleteCustomCharacter(id); setCustomCharacters(await getSavedCharacters()); }} />}
          {leftTab === 'skills' && <EditSkillsTab timeline={timeline} selectedSceneIdx={selectedSceneIdx} appliedSkills={appliedSkills} setAppliedSkills={setAppliedSkills} bypassSkills={bypassSkills} setBypassSkills={setBypassSkills} />}
        </section>

        <section className="lg:col-span-4 flex flex-col items-center space-y-4">
          <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center space-y-3">
            <div className="text-xs font-semibold text-zinc-300">{vi.center.stageHeader(aspect, layout.width, layout.height)}</div>
            <canvas ref={canvasRef} width={layout.width} height={layout.height} className="w-full max-h-[420px] object-contain rounded-xl border-2 border-zinc-700 bg-black shadow-lg" />
            <div className="w-full flex items-center gap-2">
              <button type="button" onClick={() => { ensureAudioCtx(); setIsPlaying((p) => !p); }} className="px-3 py-1.5 rounded bg-amber-400 text-zinc-950 font-bold text-xs cursor-pointer">{isPlaying ? vi.center.pauseBtn : vi.center.playBtn}</button>
              <button type="button" onClick={() => { ensureAudioCtx(); setCurrentTime(0); startPreviewAudioAt(0); }} className="px-2.5 py-1.5 rounded bg-zinc-800 text-xs cursor-pointer">{vi.center.restartBtn}</button>
              <input type="range" min={0} max={timeline.totalDurationSec} step={0.05} value={currentTime} onChange={(e) => { setIsPlaying(false); setCurrentTime(Number(e.target.value)); }} className="flex-1 accent-amber-400" />
              <span className="text-xs text-zinc-400 tabular-nums">{vi.center.timeLabel(currentTime, timeline.totalDurationSec)}</span>
            </div>
          </div>
          <TimelinePanel timeline={timeline} currentTime={currentTime} selectedSceneIdx={selectedSceneIdx} audioProject={audioProject} setAudioProject={setAudioProject} appliedSkills={appliedSkills} onSeek={(sec) => { ensureAudioCtx(); setIsPlaying(false); setCurrentTime(sec); }} onSelectScene={setSelectedSceneIdx} />
        </section>

        <SceneEditorPanel activeScene={activeScene} selectedSceneIdx={selectedSceneIdx} timeline={timeline} customCharacters={customCharacters} voiceLibraryItems={audioProject.library.filter((i) => i.kind === 'voice')} canvasRef={canvasRef} audioOptions={{ audioProject, customCharFns, appliedSkills, bypassSkills, showBubbles }} showBubbles={showBubbles} setShowBubbles={setShowBubbles} exportProgress={exportProgress} setExportProgress={setExportProgress} setIsPlaying={setIsPlaying} setErrorMsg={setErrorMsg} updateScene={updateScene} onUpdateThumbnail={(nextThumb) => setScript((prev) => ({ ...prev, thumbnail: nextThumb }))} onUploadLineAudio={(key, item) => setLineAudios((prev) => ({ ...prev, [key]: item }))} onUploadSceneAudio={(sIdx, item) => setSceneAudios((prev) => ({ ...prev, [sIdx]: item }))} />
      </main>
    </div>
  );
}
