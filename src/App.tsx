import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Film,
  Sparkles,
  Layers,
  Terminal,
  Download,
  Sliders,
  Eye,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  ASPECT_PRESETS,
  ASPECT_RATIOS,
  AspectRatio,
  AspectSelection,
  getAspectPreset,
} from './aspect';
import {
  Accessory,
  AccessorySchema,
  AnimationType,
  AnimationTypeSchema,
  BackgroundType,
  BackgroundTypeSchema,
  Emotion,
  EmotionSchema,
  PropType,
  PropTypeSchema,
  TransitionType,
  TransitionTypeSchema,
} from './script/schema';
import { PALETTE_VARIATIONS, selectVariationForIndex } from './script/variations';
import {
  applyAspectToTimeline,
  createDefaultTimeline,
  computeWordTimings,
} from './timeline/builder';
import { Timeline, VideoMeta } from './timeline/schema';
import { SceneStage } from './scenes/SceneStage';
import { Blob } from './characters/Blob';
import { Prop } from './characters/Prop';
import { Background } from './scenes/Background';

const PRESET_TOPICS = [
  'What if Mom started playing on your Roblox account',
  'What if every uncompleted homework assignment shrank your room by 10%',
  'What if your little sibling got a remote control that paused you in real life',
  'What if every minute past bedtime cost 100 of your in-game coins',
  'What if the school dentist graded your teeth like a boss battle',
];

type StudioTab = 'studio' | 'gallery' | 'batch' | 'cli';

interface ServerStatus {
  voiceStudioUrl: string;
  voiceStudioOnline: boolean;
  ttsMode: string;
  anthropicConfigured: boolean;
  scriptMode: string;
  hasRenderedVideo: boolean;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  lastMeta: VideoMeta | null;
}

interface BatchItem {
  index: number;
  topic: string;
  variation: (typeof PALETTE_VARIATIONS)[0];
  source: string;
  providerUsed: string;
  durationSec: number;
  totalFrames: number;
  sceneCount: number;
  timeline: Timeline;
}

interface RenderedRatioItem {
  aspect: AspectRatio;
  width: number;
  height: number;
  videoUrl: string;
  thumbnailUrl: string;
}

const STAGE_CONTAINER_CLASSES: Record<AspectRatio, string> = {
  '9:16': 'max-w-[330px] aspect-[9/16]',
  '16:9': 'max-w-[460px] aspect-[16/9]',
  '4:3': 'max-w-[430px] aspect-[4/3]',
  '3:4': 'max-w-[360px] aspect-[3/4]',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<StudioTab>('studio');
  const [topicInput, setTopicInput] = useState<string>(PRESET_TOPICS[0]);
  const [selectedVariationId, setSelectedVariationId] = useState<string>(PALETTE_VARIATIONS[0].id);
  const [selectedAspect, setSelectedAspect] = useState<AspectSelection>('9:16');
  const [timeline, setTimeline] = useState<Timeline>(() =>
    createDefaultTimeline(PRESET_TOPICS[0], PALETTE_VARIATIONS[0], '9:16')
  );
  const [selectedSceneIdx, setSelectedSceneIdx] = useState<number>(0);

  // Playback state for live 30fps Remotion stage
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showSafeZones, setShowSafeZones] = useState<boolean>(false);
  const [thumbnailPreviewMode, setThumbnailPreviewMode] = useState<boolean>(false);

  // Generation & Render status
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [isRenderingVideo, setIsRenderingVideo] = useState<boolean>(false);
  const [renderNotice, setRenderNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [renderedThumbUrl, setRenderedThumbUrl] = useState<string | null>(null);
  const [renderedMeta, setRenderedMeta] = useState<VideoMeta | null>(null);
  const [renderedAllRatios, setRenderedAllRatios] = useState<RenderedRatioItem[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);

  // Batch mode state
  const [batchText, setBatchText] = useState<string>(PRESET_TOPICS.join('\n'));
  const [batchResults, setBatchResults] = useState<BatchItem[]>([]);
  const [isRunningBatch, setIsRunningBatch] = useState<boolean>(false);

  // Effective preview aspect ratio (when "all" is selected, preview uses timeline.aspect)
  const previewAspect: AspectRatio =
    selectedAspect === 'all' ? timeline.aspect ?? '9:16' : selectedAspect;
  const activePreset = getAspectPreset(previewAspect);

  // Fetch initial server status & pre-rendered artifacts if present
  useEffect(() => {
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ServerStatus | null) => {
        if (data) {
          setServerStatus(data);
          if (data.videoUrl) setRenderedVideoUrl(`${data.videoUrl}?t=${Date.now()}`);
          if (data.thumbnailUrl) setRenderedThumbUrl(`${data.thumbnailUrl}?t=${Date.now()}`);
          if (data.lastMeta) setRenderedMeta(data.lastMeta);
        }
      })
      .catch(() => {
        // Offline client fallback
      });
  }, []);

  // 30fps playback loop
  const totalFramesRef = useRef(timeline.totalFrames);
  totalFramesRef.current = timeline.totalFrames;

  useEffect(() => {
    if (!isPlaying || thumbnailPreviewMode) return;
    const intervalMs = 1000 / 30;
    const timer = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % Math.max(1, totalFramesRef.current));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, thumbnailPreviewMode]);

  // Keep selectedSceneIdx synced when user scrubs or plays
  const activeSceneIndex = timeline.scenes.findIndex(
    (s) => currentFrame >= s.startFrame && currentFrame < s.endFrame
  );
  const effectiveSceneIdx =
    activeSceneIndex >= 0 ? activeSceneIndex : Math.min(selectedSceneIdx, timeline.scenes.length - 1);
  const activeScene = timeline.scenes[effectiveSceneIdx] ?? timeline.scenes[0];
  const sceneFrame = Math.max(0, currentFrame - activeScene.startFrame);

  const handleAspectChange = (nextSelection: AspectSelection) => {
    setSelectedAspect(nextSelection);
    if (nextSelection !== 'all') {
      setTimeline((prev) => applyAspectToTimeline(prev, nextSelection));
    }
  };

  const handleGenerateTopic = async (overrideTopic?: string) => {
    const targetTopic = (overrideTopic ?? topicInput).trim();
    if (!targetTopic) {
      setErrorBanner('Please enter a What If topic before generating a script.');
      return;
    }
    setErrorBanner(null);
    setIsGeneratingScript(true);
    setRenderNotice(null);

    const targetAspect: AspectRatio = selectedAspect === 'all' ? '9:16' : selectedAspect;

    try {
      const res = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: targetTopic,
          variationId: selectedVariationId,
          aspect: targetAspect,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate script');
      }
      setTimeline(data.timeline);
      setCurrentFrame(0);
      setSelectedSceneIdx(0);
      setRenderNotice(
        `Generated ${data.timeline.scenes.length} scenes (${data.timeline.totalDurationSec}s, ${data.timeline.aspect}) via ${data.source} + ${data.providerUsed} TTS.`
      );
    } catch {
      const variation =
        PALETTE_VARIATIONS.find((v) => v.id === selectedVariationId) ?? PALETTE_VARIATIONS[0];
      const localTimeline = createDefaultTimeline(targetTopic, variation, targetAspect);
      setTimeline(localTimeline);
      setCurrentFrame(0);
      setRenderNotice(
        `Generated ${localTimeline.scenes.length} scenes (${localTimeline.totalDurationSec}s, ${targetAspect}) locally.`
      );
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleRenderMp4 = async (galleryMode = false) => {
    setErrorBanner(null);
    setIsRenderingVideo(true);
    setRenderNotice(
      selectedAspect === 'all'
        ? 'Rendering all 4 aspect ratios (9:16, 16:9, 4:3, 3:4) @ 30fps...'
        : galleryMode
        ? `Rendering Component Gallery MP4 (${activePreset.width}x${activePreset.height} @ 30fps)...`
        : `Rendering ${activePreset.width}x${activePreset.height} (${previewAspect}) @ 30fps MP4 + Thumbnail PNG...`
    );

    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeline: galleryMode ? undefined : timeline,
          gallery: galleryMode,
          aspect: selectedAspect,
          maxDurationSec: galleryMode ? 8 : 10,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Render failed');
      }
      setRenderedVideoUrl(data.videoUrl);
      setRenderedThumbUrl(data.thumbnailUrl);
      setRenderedMeta(data.meta);
      setRenderedAllRatios(Array.isArray(data.allRatios) ? data.allRatios : []);
      setRenderNotice(
        selectedAspect === 'all'
          ? 'Rendered all 4 aspect ratios (out_9x16.mp4, out_16x9.mp4, out_4x3.mp4, out_3x4.mp4) and thumbnails.'
          : `Rendered ${data.width}x${data.height} (${data.aspect ?? previewAspect}) ${data.fps}fps MP4 (${data.durationSec}s) and Thumbnail PNG.`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRenderingVideo(false);
    }
  };

  const handleRunBatch = async () => {
    const topics = batchText
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (topics.length === 0) {
      setErrorBanner('Enter at least one topic in the batch list.');
      return;
    }
    setErrorBanner(null);
    setIsRunningBatch(true);
    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topics,
          aspect: selectedAspect === 'all' ? '9:16' : selectedAspect,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch failed');
      setBatchResults(data.items || []);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunningBatch(false);
    }
  };

  const updateActiveScene = (updater: (scene: Timeline['scenes'][0]) => Timeline['scenes'][0]) => {
    setTimeline((prev) => {
      const nextScenes = prev.scenes.map((s, idx) => (idx === effectiveSceneIdx ? updater(s) : s));
      return {
        ...prev,
        scenes: nextScenes,
      };
    });
  };

  const handlePaletteChange = (varId: string) => {
    setSelectedVariationId(varId);
    const found = PALETTE_VARIATIONS.find((v) => v.id === varId);
    if (!found) return;
    setTimeline((prev) => ({
      ...prev,
      variation: found,
      scenes: prev.scenes.map((sc, sIdx) => ({
        ...sc,
        characters: sc.characters.map((ch, cIdx) => ({
          ...ch,
          color: found.characterPalette[(cIdx + sIdx) % found.characterPalette.length],
          hoodieColor: found.wallAccent,
        })),
      })),
    }));
  };

  const totalSpokenWords = timeline.scenes.reduce(
    (sum, s) => sum + s.narration.trim().split(/\s+/).filter(Boolean).length,
    0
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-slate-950/95 sticky top-0 z-30">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('studio');
          }}
          className="text-xl font-extrabold tracking-tight text-white font-display whitespace-nowrap shrink-0"
        >
          BlobToon Studio
        </a>

        {/* Zone 2: 4 Single-line Navigation Links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeTab === 'studio' ? 'text-white border-b-2 border-amber-400' : ''
            }`}
          >
            Timeline Studio
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gallery')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeTab === 'gallery' ? 'text-white border-b-2 border-amber-400' : ''
            }`}
          >
            Asset Gallery
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('batch')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeTab === 'batch' ? 'text-white border-b-2 border-amber-400' : ''
            }`}
          >
            Batch Variations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cli')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeTab === 'cli' ? 'text-white border-b-2 border-amber-400' : ''
            }`}
          >
            CLI Reference
          </button>
        </nav>

        {/* Zone 3: Aspect Selector next to the Render Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <select
            id="header-aspect-select"
            data-testid="aspect-selector"
            aria-label="Aspect ratio selector"
            value={selectedAspect}
            onChange={(e) => handleAspectChange(e.target.value as AspectSelection)}
            className="px-2.5 py-2 text-xs font-semibold bg-slate-900 border border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            {ASPECT_RATIOS.map((ratio) => {
              const p = ASPECT_PRESETS[ratio];
              return (
                <option key={ratio} value={ratio}>
                  {ratio} ({p.width}×{p.height})
                </option>
              );
            })}
            <option value="all">all (4 ratios)</option>
          </select>

          <button
            type="button"
            onClick={() => handleRenderMp4(false)}
            disabled={isRenderingVideo}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <Film className="w-4 h-4" />
            <span>{isRenderingVideo ? 'Rendering MP4...' : 'Render MP4 & Thumbnail'}</span>
          </button>
        </div>
      </header>

      {/* Notification / Error Bar */}
      {(errorBanner || renderNotice) && (
        <div
          className={`px-6 py-2.5 text-xs border-b flex items-center justify-between ${
            errorBanner
              ? 'bg-red-950/60 border-red-800/80 text-red-200'
              : 'bg-slate-900 border-slate-800 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {errorBanner ? (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{errorBanner || renderNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorBanner(null);
              setRenderNotice(null);
            }}
            className="text-slate-400 hover:text-white text-xs whitespace-nowrap shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {activeTab === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN (4 cols): Topic Generator & Scene Sequence */}
            <section className="lg:col-span-4 space-y-6">
              <div className="border border-slate-800 bg-slate-900/60 rounded-xl p-5 space-y-4">
                <div>
                  <label
                    htmlFor="topic-input"
                    className="block text-sm font-semibold text-slate-100 mb-1.5"
                  >
                    One-Line &ldquo;What If&rdquo; Topic
                  </label>
                  <textarea
                    id="topic-input"
                    rows={2}
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    placeholder="e.g. What if Mom started playing on your Roblox account"
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                </div>

                {/* Preset Topic Selector */}
                <div>
                  <label
                    htmlFor="preset-topic-select"
                    className="block text-xs font-medium text-slate-400 mb-1"
                  >
                    Or load a tested pain-point x game-rule preset
                  </label>
                  <select
                    id="preset-topic-select"
                    value={PRESET_TOPICS.includes(topicInput) ? topicInput : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        setTopicInput(e.target.value);
                        handleGenerateTopic(e.target.value);
                      }
                    }}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  >
                    <option value="">Select preset topic...</option>
                    {PRESET_TOPICS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Palette Variation Selector */}
                <div>
                  <label
                    htmlFor="palette-select"
                    className="block text-xs font-medium text-slate-400 mb-1"
                  >
                    Visual Palette &amp; Character Variation
                  </label>
                  <select
                    id="palette-select"
                    value={selectedVariationId}
                    onChange={(e) => handlePaletteChange(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  >
                    {PALETTE_VARIATIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.characterPalette.slice(0, 3).join(', ')})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => handleGenerateTopic()}
                  disabled={isGeneratingScript}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-white text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isGeneratingScript
                      ? 'Generating Script & Voice...'
                      : 'Generate Script & Timeline'}
                  </span>
                </button>

                {/* Unboxed Metadata Summary (Zero-Pill Discipline) */}
                <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 flex flex-wrap items-center gap-1.5 tabular-nums">
                  <span>{timeline.scenes.length} Scenes</span>
                  <span aria-hidden="true">·</span>
                  <span>{totalSpokenWords} Words</span>
                  <span aria-hidden="true">·</span>
                  <span>{timeline.totalDurationSec}s ({timeline.totalFrames}f @ 30fps)</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {activePreset.width}×{activePreset.height} ({previewAspect})
                  </span>
                </div>
              </div>

              {/* Scene Sequence Breakdown */}
              <div className="border border-slate-800 bg-slate-900/60 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">
                    Narrative Structure (HOOK → DAY 1–3 → LOOP)
                  </h2>
                  <span className="text-xs text-slate-400 tabular-nums">
                    {timeline.totalDurationSec}s total
                  </span>
                </div>

                <div className="space-y-2">
                  {timeline.scenes.map((scene, idx) => {
                    const isSelected = idx === effectiveSceneIdx;
                    return (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={() => {
                          setSelectedSceneIdx(idx);
                          setCurrentFrame(scene.startFrame + 8);
                          setThumbnailPreviewMode(false);
                        }}
                        className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800/90 border-amber-400/80 text-white'
                            : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-amber-400">
                            0{idx + 1}. {scene.label}
                          </span>
                          <span className="text-slate-400 tabular-nums">
                            {scene.durationSec}s · {scene.background} · {scene.characters.length} blobs
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                          {scene.narration}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* CENTER COLUMN (4 cols): Adaptive Multi-Aspect Remotion Stage Player */}
            <section className="lg:col-span-4 flex flex-col items-center space-y-4">
              <div className="w-full border border-slate-800 bg-slate-900/60 rounded-xl p-4 flex flex-col items-center">
                {/* Stage Toolbar */}
                <div className="w-full flex items-center justify-between mb-3 text-xs text-slate-400">
                  <span className="font-medium text-slate-200">
                    {thumbnailPreviewMode
                      ? `Thumbnail (${activePreset.width}×${activePreset.height})`
                      : `Stage (${previewAspect}): ${activeScene.label}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSafeZones((v) => !v)}
                      className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap cursor-pointer ${
                        showSafeZones
                          ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5 inline mr-1" />
                      Safe Zones
                    </button>
                    <button
                      type="button"
                      onClick={() => setThumbnailPreviewMode((v) => !v)}
                      className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap cursor-pointer ${
                        thumbnailPreviewMode
                          ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5 inline mr-1" />
                      Thumbnail Mode
                    </button>
                  </div>
                </div>

                {/* Adaptive Viewport Container (9:16, 16:9, 4:3, 3:4) */}
                <div
                  data-testid="vertical-stage-player"
                  data-aspect={previewAspect}
                  className={`w-full ${STAGE_CONTAINER_CLASSES[previewAspect]} rounded-xl overflow-hidden border-2 border-slate-800 shadow-xl bg-slate-950 relative transition-all`}
                >
                  <SceneStage
                    scene={thumbnailPreviewMode ? timeline.scenes[0] : activeScene}
                    variation={timeline.variation}
                    sceneFrame={thumbnailPreviewMode ? 24 : sceneFrame}
                    fps={timeline.fps}
                    aspect={previewAspect}
                    renderParams={timeline.renderParams}
                    showSafeZones={showSafeZones}
                    thumbnailBannerTitle={thumbnailPreviewMode ? timeline.title : undefined}
                  />
                </div>

                {/* Transport Controls & Frame Scrubber */}
                <div className="w-full mt-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                      onClick={() => {
                        setThumbnailPreviewMode(false);
                        setIsPlaying((p) => !p);
                      }}
                      className="p-2 rounded-lg bg-amber-400 text-slate-950 hover:bg-amber-300 transition-colors cursor-pointer shrink-0"
                    >
                      {isPlaying && !thumbnailPreviewMode ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Restart preview from frame 0"
                      onClick={() => {
                        setThumbnailPreviewMode(false);
                        setCurrentFrame(0);
                      }}
                      className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <input
                      type="range"
                      aria-label="Timeline frame scrubber"
                      min={0}
                      max={Math.max(1, timeline.totalFrames - 1)}
                      value={currentFrame}
                      onChange={(e) => {
                        setThumbnailPreviewMode(false);
                        setIsPlaying(false);
                        setCurrentFrame(Number(e.target.value));
                      }}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
                    <span>
                      Frame {currentFrame} / {timeline.totalFrames}
                    </span>
                    <span>
                      {(currentFrame / timeline.fps).toFixed(2)}s / {timeline.totalDurationSec}s
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT COLUMN (4 cols): Scene Inspector & Rendered MP4/Thumbnail Output */}
            <section className="lg:col-span-4 space-y-6">
              {/* Scene & Character Live Editor */}
              <div className="border border-slate-800 bg-slate-900/60 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <span>Scene Inspector: {activeScene.label}</span>
                  </h2>
                  <span className="text-xs text-slate-400 tabular-nums">
                    Frames {activeScene.startFrame}–{activeScene.endFrame}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="scene-bg-select"
                      className="block text-xs text-slate-400 mb-1"
                    >
                      SVG Background
                    </label>
                    <select
                      id="scene-bg-select"
                      value={activeScene.background}
                      onChange={(e) =>
                        updateActiveScene((s) => ({
                          ...s,
                          background: e.target.value as BackgroundType,
                        }))
                      }
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      {BackgroundTypeSchema.options.map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="scene-trans-select"
                      className="block text-xs text-slate-400 mb-1"
                    >
                      Scene Transition
                    </label>
                    <select
                      id="scene-trans-select"
                      value={activeScene.transition}
                      onChange={(e) =>
                        updateActiveScene((s) => ({
                          ...s,
                          transition: e.target.value as TransitionType,
                        }))
                      }
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      {TransitionTypeSchema.options.map((tr) => (
                        <option key={tr} value={tr}>
                          {tr}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="scene-caption-input"
                    className="block text-xs text-slate-400 mb-1"
                  >
                    Narration &amp; Word-Highlighted Caption
                  </label>
                  <textarea
                    id="scene-caption-input"
                    rows={2}
                    value={activeScene.caption}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveScene((s) => ({
                        ...s,
                        narration: val,
                        caption: val,
                        words: computeWordTimings(val, s.voiceDurationSec, timeline.fps),
                      }));
                    }}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100"
                  />
                </div>

                {/* Character Controls */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="text-xs font-semibold text-slate-300">
                    Blob Characters in Scene ({activeScene.characters.length})
                  </div>
                  {activeScene.characters.map((char, cIdx) => (
                    <div
                      key={char.id}
                      className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white">{char.name}</span>
                        <input
                          type="color"
                          aria-label={`${char.name} blob color`}
                          value={char.color}
                          onChange={(e) =>
                            updateActiveScene((s) => ({
                              ...s,
                              characters: s.characters.map((c, i) =>
                                i === cIdx ? { ...c, color: e.target.value } : c
                              ),
                            }))
                          }
                          className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label
                            htmlFor={`emotion-${char.id}`}
                            className="block text-[11px] text-slate-400 mb-0.5"
                          >
                            Emotion
                          </label>
                          <select
                            id={`emotion-${char.id}`}
                            value={char.emotion}
                            onChange={(e) =>
                              updateActiveScene((s) => ({
                                ...s,
                                characters: s.characters.map((c, i) =>
                                  i === cIdx ? { ...c, emotion: e.target.value as Emotion } : c
                                ),
                              }))
                            }
                            className="w-full rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-slate-200"
                          >
                            {EmotionSchema.options.map((em) => (
                              <option key={em} value={em}>
                                {em}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`accessory-${char.id}`}
                            className="block text-[11px] text-slate-400 mb-0.5"
                          >
                            Accessory
                          </label>
                          <select
                            id={`accessory-${char.id}`}
                            value={char.accessory}
                            onChange={(e) =>
                              updateActiveScene((s) => ({
                                ...s,
                                characters: s.characters.map((c, i) =>
                                  i === cIdx ? { ...c, accessory: e.target.value as Accessory } : c
                                ),
                              }))
                            }
                            className="w-full rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-slate-200"
                          >
                            {AccessorySchema.options.map((acc) => (
                              <option key={acc} value={acc}>
                                {acc}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`anim-${char.id}`}
                            className="block text-[11px] text-slate-400 mb-0.5"
                          >
                            Motion
                          </label>
                          <select
                            id={`anim-${char.id}`}
                            value={char.animation}
                            onChange={(e) =>
                              updateActiveScene((s) => ({
                                ...s,
                                characters: s.characters.map((c, i) =>
                                  i === cIdx
                                    ? { ...c, animation: e.target.value as AnimationType }
                                    : c
                                ),
                              }))
                            }
                            className="w-full rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-slate-200"
                          >
                            {AnimationTypeSchema.options.map((an) => (
                              <option key={an} value={an}>
                                {an}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rendered MP4 & Thumbnail Deliverables Card */}
              <div className="border border-slate-800 bg-slate-900/60 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">
                    Rendered Output Deliverables (out/)
                  </h2>
                  <span className="text-xs text-slate-400">
                    {serverStatus?.ttsMode || 'MockProvider Ready'}
                  </span>
                </div>

                {renderedVideoUrl ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-400 mb-1">
                          MP4 Video ({renderedMeta?.resolution || `${activePreset.width}×${activePreset.height}`})
                        </div>
                        <video
                          key={renderedVideoUrl}
                          src={renderedVideoUrl}
                          controls
                          playsInline
                          className="w-full rounded-lg border border-slate-800 bg-black"
                        />
                      </div>
                      {renderedThumbUrl && (
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Thumbnail PNG</div>
                          <img
                            src={renderedThumbUrl}
                            alt="Rendered Thumbnail"
                            referrerPolicy="no-referrer"
                            className="w-full object-contain rounded-lg border border-slate-800 bg-slate-950"
                          />
                        </div>
                      )}
                    </div>

                    {renderedAllRatios.length > 0 && (
                      <div className="pt-2 border-t border-slate-800 space-y-1.5">
                        <div className="text-xs font-semibold text-amber-400">
                          All 4 Aspect Ratio Outputs Rendered:
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {renderedAllRatios.map((r) => (
                            <a
                              key={r.aspect}
                              href={r.videoUrl}
                              download
                              className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 hover:border-amber-400 text-xs text-slate-200 flex items-center justify-between"
                            >
                              <span>
                                {r.aspect} ({r.width}×{r.height})
                              </span>
                              <Download className="w-3.5 h-3.5 text-amber-400" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {renderedMeta && (
                      <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-800 tabular-nums">
                        <div className="text-slate-200 font-medium">{renderedMeta.title}</div>
                        <div>
                          {renderedMeta.resolution} ({renderedMeta.aspect ?? previewAspect}) ·{' '}
                          {renderedMeta.fps}fps · {renderedMeta.durationSec}s · seed:{' '}
                          {renderedMeta.seed ?? timeline.seed}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={renderedVideoUrl}
                        download="video.mp4"
                        className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg text-center flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download MP4</span>
                      </a>
                      {renderedThumbUrl && (
                        <a
                          href={renderedThumbUrl}
                          download="thumbnail.png"
                          className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg text-center flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Thumbnail PNG</span>
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center space-y-3">
                    <p className="text-xs text-slate-400">
                      Choose an aspect ratio (`9:16`, `16:9`, `4:3`, `3:4`, or `all`) and click
                      &ldquo;Render MP4 &amp; Thumbnail&rdquo; to mux scene voiceovers and encode
                      your video + Thumbnail PNG.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRenderMp4(false)}
                      disabled={isRenderingVideo}
                      className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      {isRenderingVideo ? 'Rendering...' : 'Render Current Timeline Now'}
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: ASSET GALLERY (Phase 2 Showcase of all Emotions, Props, Accessories, Backgrounds) */}
        {activeTab === 'gallery' && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <h1 className="text-2xl font-bold text-white font-display">
                  Procedural SVG Character, Emotion &amp; Prop Gallery
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Every blob, face emotion, accessory, prop, and stage backdrop is rendered purely from
                  TypeScript &amp; Remotion frame math with zero external image dependencies.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRenderMp4(true)}
                disabled={isRenderingVideo}
                className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2"
              >
                <Film className="w-4 h-4" />
                <span>
                  {isRenderingVideo ? 'Rendering Gallery Video...' : 'Render Gallery Showcase MP4'}
                </span>
              </button>
            </div>

            {/* 7 Emotions Grid */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-white">
                01. Seven Expressive Blob Emotions &amp; Accessories
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                {EmotionSchema.options.map((emotion, idx) => {
                  const acc = AccessorySchema.options[(idx + 1) % AccessorySchema.options.length];
                  const color =
                    PALETTE_VARIATIONS[0].characterPalette[
                      idx % PALETTE_VARIATIONS[0].characterPalette.length
                    ];
                  return (
                    <div
                      key={emotion}
                      className="border border-slate-800 bg-slate-900/60 rounded-xl p-3 flex flex-col items-center"
                    >
                      <svg viewBox="0 0 360 400" className="w-full h-40">
                        <Blob
                          name={emotion.toUpperCase()}
                          color={color}
                          accessory={acc}
                          x={180}
                          y={210}
                          size={0.85}
                          emotion={emotion}
                          animation="bounce"
                          speaking={idx % 2 === 0}
                          isVoiceActive={true}
                          frame={currentFrame}
                          fps={30}
                        />
                      </svg>
                      <div className="text-xs text-slate-300 font-medium mt-1">
                        {emotion} · {acc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 8 Extensible Props Grid */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-white">
                02. Extensible Prop Registry (8 Procedural SVG Props)
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                {PropTypeSchema.options.map((propType) => (
                  <div
                    key={propType}
                    className="border border-slate-800 bg-slate-900/60 rounded-xl p-3 flex flex-col items-center"
                  >
                    <svg viewBox="0 0 260 280" className="w-full h-32">
                      <Prop
                        type={propType as PropType}
                        x={130}
                        y={120}
                        scale={0.95}
                        animation="bounce"
                        label={propType.toUpperCase()}
                        frame={currentFrame}
                        fps={30}
                      />
                    </svg>
                    <div className="text-xs text-slate-300 font-medium mt-1">{propType}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* 6 SVG Stage Backgrounds */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-white">
                03. Six Procedural Multi-Aspect Stage Backgrounds ({previewAspect})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {BackgroundTypeSchema.options.map((bgType, idx) => {
                  const variation = selectVariationForIndex(idx);
                  return (
                    <div
                      key={bgType}
                      className="border border-slate-800 bg-slate-900/60 rounded-xl p-2.5 flex flex-col items-center"
                    >
                      <svg
                        viewBox={`0 0 ${activePreset.width} ${activePreset.height}`}
                        className="w-full rounded-lg overflow-hidden"
                      >
                        <Background
                          type={bgType}
                          variation={variation}
                          frame={currentFrame}
                          width={activePreset.width}
                          height={activePreset.height}
                        />
                      </svg>
                      <div className="text-xs text-slate-300 font-medium mt-2">
                        {bgType} · {variation.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: BATCH VARIATIONS (Phase 6 Multi-Video Variation Engine) */}
        {activeTab === 'batch' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 border border-slate-800 bg-slate-900/60 rounded-xl p-5 space-y-4">
              <h1 className="text-lg font-bold text-white font-display flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <span>Batch Topic Generator &amp; Variation System</span>
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enter one &ldquo;What If&rdquo; topic per line (same format as{' '}
                <code className="text-amber-300 font-mono">topics.txt</code>). Each video in the batch
                is automatically assigned a distinct background palette, character color scheme,
                accessory set, and prop set so batch outputs never look identical.
              </p>

              <div>
                <label
                  htmlFor="batch-topics-textarea"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Batch Topics List (1 per line)
                </label>
                <textarea
                  id="batch-topics-textarea"
                  rows={6}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-slate-100 font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleRunBatch}
                disabled={isRunningBatch}
                className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
              >
                {isRunningBatch
                  ? 'Generating Batch Scripts & Timelines...'
                  : 'Generate Batch Timelines with Unique Variations'}
              </button>
            </div>

            <div className="lg:col-span-7 border border-slate-800 bg-slate-900/60 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                  Batch Variation Matrix ({batchResults.length || PALETTE_VARIATIONS.length} Variations)
                </h2>
                <span className="text-xs text-slate-400 font-mono">
                  npm run batch -- topics.txt --aspect {selectedAspect}
                </span>
              </div>

              {batchResults.length > 0 ? (
                <div className="space-y-3">
                  {batchResults.map((item) => (
                    <div
                      key={item.index}
                      className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-amber-400">
                          #{item.index} · {item.variation.name}
                        </div>
                        <div className="text-sm font-semibold text-white">{item.topic}</div>
                        <div className="text-xs text-slate-400 tabular-nums">
                          {item.sceneCount} scenes · {item.durationSec}s · {item.totalFrames} frames ·
                          Props: {item.variation.preferredProps.join(', ')}
                        </div>
                        <div className="flex items-center gap-1.5 pt-1">
                          {item.variation.characterPalette.map((hex) => (
                            <span
                              key={hex}
                              style={{ backgroundColor: hex }}
                              className="w-4 h-4 rounded border border-slate-900 inline-block"
                              title={hex}
                            />
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setTimeline(item.timeline);
                          setTopicInput(item.topic);
                          setSelectedVariationId(item.variation.id);
                          setCurrentFrame(0);
                          setActiveTab('studio');
                        }}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Load into Studio
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {PALETTE_VARIATIONS.map((v, i) => (
                    <div
                      key={v.id}
                      className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold text-white">
                          0{i + 1}. {v.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          Accessories: {v.defaultAccessories.join(', ')} · Props:{' '}
                          {v.preferredProps.join(', ')}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {v.characterPalette.map((hex) => (
                          <span
                            key={hex}
                            style={{ backgroundColor: hex }}
                            className="w-5 h-5 rounded border border-slate-900"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: CLI PIPELINE & TIMELINE JSON INSPECTOR */}
        {activeTab === 'cli' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 border border-slate-800 bg-slate-900/60 rounded-xl p-5 space-y-4">
              <h1 className="text-lg font-bold text-white font-display flex items-center gap-2">
                <Terminal className="w-5 h-5 text-amber-400" />
                <span>CLI Commands &amp; Multi-Aspect Workflow</span>
              </h1>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-semibold text-amber-400">1. Full End-to-End Pipeline</div>
                  <code className="block font-mono text-slate-200">
                    npm run make -- &quot;{topicInput}&quot; --aspect {selectedAspect}
                  </code>
                  <p className="text-slate-400">
                    Saves per-video folder <code className="font-mono">out/&lt;slug&gt;/</code> with{' '}
                    <code className="font-mono">script.json</code>,{' '}
                    <code className="font-mono">timeline.json</code>,{' '}
                    <code className="font-mono">audio/</code>, MP4(s),{' '}
                    <code className="font-mono">thumbnail.png</code>, and{' '}
                    <code className="font-mono">meta.json</code>.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-semibold text-amber-400">
                    2. Render All 4 Aspect Ratios at Once
                  </div>
                  <code className="block font-mono text-slate-200">
                    npm run render -- --gallery --aspect all
                  </code>
                  <p className="text-slate-400">
                    Renders <code className="font-mono">out_9x16.mp4</code>,{' '}
                    <code className="font-mono">out_16x9.mp4</code>,{' '}
                    <code className="font-mono">out_4x3.mp4</code>, and{' '}
                    <code className="font-mono">out_3x4.mp4</code> with adaptive layout.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-semibold text-amber-400">
                    3. Topic Ideas &amp; System Doctor
                  </div>
                  <code className="block font-mono text-slate-200">
                    npm run ideas -- &quot;school homework&quot; --count 10
                  </code>
                  <code className="block font-mono text-slate-200">npm run doctor</code>
                  <p className="text-slate-400">
                    Generates ranked topic ideas (pain point × game rule) and verifies Node,
                    ffmpeg/ffprobe, .env keys, and VoiceStudio status.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 border border-slate-800 bg-slate-900/60 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                  Single Source of Truth: Live Timeline JSON ({timeline.aspect})
                </h2>
                <span className="text-xs text-slate-400 font-mono">
                  {timeline.scenes.length} scenes · {timeline.totalFrames} frames · seed {timeline.seed}
                </span>
              </div>
              <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono overflow-auto max-h-[460px]">
                {JSON.stringify(timeline, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
