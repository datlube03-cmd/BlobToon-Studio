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
  Volume2,
  VolumeX,
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
  resolveVariationWithColorPalette,
} from './timeline/builder';
import { Timeline, VideoMeta } from './timeline/schema';
import { SkillRenderParams } from './skills/schema';
import { SceneStage } from './scenes/SceneStage';
import { Blob } from './characters/Blob';
import { Prop } from './characters/Prop';
import { Background } from './scenes/Background';
import { useLoadBundledFontInRemotion } from './fonts/bundledFont';

const PRESET_TOPICS = [
  'What if Mom started playing on your Roblox account',
  'What if every uncompleted homework assignment shrank your room by 10%',
  'What if your little sibling got a remote control that paused you in real life',
  'What if every minute past bedtime cost 100 of your in-game coins',
  'What if the school dentist graded your teeth like a boss battle',
];

const BUILTIN_SKILLS: Array<{
  name: string;
  description: string;
  renderParams: SkillRenderParams;
}> = [
  {
    name: 'vietnamese-lacquer',
    description:
      'Chủ đề Sơn Mài & Đèn Lồng Hội An — Bảng màu đỏ son, vàng hoàng kim, ngọc bích và nhịp kể chuyện dí dỏm kiểu Việt Nam',
    renderParams: {
      sceneDurationRange: [2.0, 4.5],
      cameraShake: 'low',
      zoomPunchOnPunchline: true,
      captionStyle: 'bold-pop',
      transitionType: 'wipe',
      sfxIntensity: 'medium',
      ttsSpeedMultiplier: 1.1,
      colorPalette: [
        '#2B0908',
        '#5C1410',
        '#160605',
        '#F59E0B',
        '#FDE047',
        '#10B981',
        '#FB7185',
      ],
      fontFamily: 'Fredoka',
    },
  },
  {
    name: 'example-fastcut',
    description:
      'Tốc độ cao 1.25x TTS, SFX mạnh (high), chuyển cảnh hard-cut 1.5s-2.5s, phụ đề bold-pop',
    renderParams: {
      sceneDurationRange: [1.5, 2.5],
      cameraShake: 'medium',
      zoomPunchOnPunchline: true,
      captionStyle: 'bold-pop',
      transitionType: 'hard-cut',
      bgmGenre: 'arcade-rush',
      sfxIntensity: 'high',
      ttsSpeedMultiplier: 1.25,
    },
  },
  {
    name: 'example-darkmode',
    description:
      'Chủ đề Dark/Neon Cyberpunk với bảng màu neon tối, phụ đề neon-glow và nhạc synth',
    renderParams: {
      sceneDurationRange: [2.0, 4.0],
      cameraShake: 'low',
      zoomPunchOnPunchline: true,
      captionStyle: 'neon-glow',
      transitionType: 'zoom',
      bgmGenre: 'cyber-synth',
      sfxIntensity: 'medium',
      ttsSpeedMultiplier: 1.1,
      colorPalette: [
        '#060714',
        '#121536',
        '#00F5D4',
        '#FF2A85',
        '#FEE440',
        '#9B5DE5',
        '#00BBF9',
      ],
      fontFamily: "'Space Grotesk', 'DejaVu Sans', sans-serif",
    },
  },
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
  useLoadBundledFontInRemotion();
  const [activeTab, setActiveTab] = useState<StudioTab>('studio');
  const [topicInput, setTopicInput] = useState<string>(PRESET_TOPICS[0]);
  const [selectedVariationId, setSelectedVariationId] = useState<string>(PALETTE_VARIATIONS[0].id);
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const [availableSkills, setAvailableSkills] = useState(BUILTIN_SKILLS);
  const [selectedAspect, setSelectedAspect] = useState<AspectSelection>('9:16');
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(true);
  const [sfxVolume, setSfxVolume] = useState<number>(0.35);
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

    fetch('/api/skills')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.skills) && data.skills.length > 0) {
          setAvailableSkills(data.skills);
        }
      })
      .catch(() => {
        // Fallback to BUILTIN_SKILLS
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

  const handleSkillChange = (nextSkillName: string) => {
    setSelectedSkill(nextSkillName);
    const skillObj = availableSkills.find((s) => s.name === nextSkillName);
    const baseVar =
      PALETTE_VARIATIONS.find((v) => v.id === selectedVariationId) ?? PALETTE_VARIATIONS[0];
    const effectiveVar = resolveVariationWithColorPalette(
      baseVar,
      skillObj?.renderParams?.colorPalette
    );
    setTimeline((prev) => ({
      ...prev,
      skill: skillObj?.name,
      renderParams: skillObj?.renderParams,
      variation: effectiveVar,
      scenes: prev.scenes.map((sc, sIdx) => ({
        ...sc,
        transition: skillObj?.renderParams?.transitionType ?? sc.transition,
        characters: sc.characters.map((ch, cIdx) => ({
          ...ch,
          color: effectiveVar.characterPalette[(cIdx + sIdx) % effectiveVar.characterPalette.length],
          hoodieColor: effectiveVar.wallAccent,
        })),
      })),
    }));
  };

  const handleSfxToggle = () => {
    const next = !sfxEnabled;
    setSfxEnabled(next);
    setTimeline((prev) => ({
      ...prev,
      audio: {
        ...prev.audio,
        sfx: next,
        sfxVolume,
      },
    }));
  };

  const handleSfxVolumeChange = (nextVol: number) => {
    const clamped = Math.round(Math.max(0, Math.min(1, nextVol)) * 100) / 100;
    setSfxVolume(clamped);
    setTimeline((prev) => ({
      ...prev,
      audio: {
        ...prev.audio,
        sfx: sfxEnabled,
        sfxVolume: clamped,
      },
    }));
  };

  const handleGenerateTopic = async (overrideTopic?: string) => {
    const targetTopic = (overrideTopic ?? topicInput).trim();
    if (!targetTopic) {
      setErrorBanner('Vui lòng nhập chủ đề "What If / Điều gì xảy ra nếu..." trước khi tạo kịch bản.');
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
          skill: selectedSkill || undefined,
          sfx: sfxEnabled,
          sfxVolume,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tạo kịch bản');
      }
      setTimeline(data.timeline);
      setCurrentFrame(0);
      setSelectedSceneIdx(0);
      setRenderNotice(
        `Đã tạo ${data.timeline.scenes.length} cảnh (${data.timeline.totalDurationSec}s, tỷ lệ ${data.timeline.aspect}${
          data.timeline.skill ? `, skill: ${data.timeline.skill}` : ''
        }) qua ${data.source} + ${data.providerUsed} TTS.`
      );
    } catch {
      const baseVar =
        PALETTE_VARIATIONS.find((v) => v.id === selectedVariationId) ?? PALETTE_VARIATIONS[0];
      const skillObj = availableSkills.find((s) => s.name === selectedSkill);
      const effectiveVar = resolveVariationWithColorPalette(
        baseVar,
        skillObj?.renderParams?.colorPalette
      );
      const localTimeline = createDefaultTimeline(targetTopic, effectiveVar, targetAspect);
      setTimeline({
        ...localTimeline,
        skill: skillObj?.name,
        renderParams: skillObj?.renderParams,
        audio: { sfx: sfxEnabled, sfxVolume },
      });
      setCurrentFrame(0);
      setRenderNotice(
        `Đã tạo ${localTimeline.scenes.length} cảnh (${localTimeline.totalDurationSec}s, tỷ lệ ${targetAspect}) cục bộ.`
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
        ? 'Đang kết xuất cả 4 tỷ lệ khung hình (9:16, 16:9, 4:3, 3:4) ở 30fps...'
        : galleryMode
        ? `Đang kết xuất Video Bộ Sưu Tập (${activePreset.width}x${activePreset.height} @ 30fps)...`
        : `Đang kết xuất ${activePreset.width}x${activePreset.height} (${previewAspect}) @ 30fps MP4 + Ảnh Bìa PNG...`
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
          sfx: sfxEnabled,
          sfxVolume,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Kết xuất thất bại');
      }
      setRenderedVideoUrl(data.videoUrl);
      setRenderedThumbUrl(data.thumbnailUrl);
      setRenderedMeta(data.meta);
      setRenderedAllRatios(Array.isArray(data.allRatios) ? data.allRatios : []);
      setRenderNotice(
        selectedAspect === 'all'
          ? 'Đã kết xuất đủ 4 tỷ lệ khung hình (out_9x16.mp4, out_16x9.mp4, out_4x3.mp4, out_3x4.mp4) và ảnh bìa.'
          : `Đã kết xuất ${data.width}x${data.height} (${data.aspect ?? previewAspect}) ${data.fps}fps MP4 (${data.durationSec}s) và Ảnh Bìa PNG.`
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
      setErrorBanner('Vui lòng nhập ít nhất một chủ đề trong danh sách hàng loạt.');
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
      if (!res.ok) throw new Error(data.error || 'Tạo hàng loạt thất bại');
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
    const skillObj = availableSkills.find((s) => s.name === selectedSkill);
    const effective = resolveVariationWithColorPalette(
      found,
      skillObj?.renderParams?.colorPalette
    );
    setTimeline((prev) => ({
      ...prev,
      variation: effective,
      scenes: prev.scenes.map((sc, sIdx) => ({
        ...sc,
        characters: sc.characters.map((ch, cIdx) => ({
          ...ch,
          color: effective.characterPalette[(cIdx + sIdx) % effective.characterPalette.length],
          hoodieColor: effective.wallAccent,
        })),
      })),
    }));
  };

  const totalSpokenWords = timeline.scenes.reduce(
    (sum, s) => sum + s.narration.trim().split(/\s+/).filter(Boolean).length,
    0
  );

  return (
    <div className="min-h-screen bg-[#120907] text-amber-50 flex flex-col">
      {/* 3-Zone Top Bar Contract — Vietnamese Sơn Mài & Hoàng Kim Theme */}
      <header className="flex items-center justify-between gap-6 px-6 py-3.5 border-b border-[#3d2119] bg-[#160b08]/95 sticky top-0 z-30">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('studio');
          }}
          className="text-xl font-extrabold tracking-tight text-amber-400 font-display whitespace-nowrap shrink-0"
        >
          BlobToon Việt Nam
        </a>

        {/* Zone 2: 4 Single-line Navigation Links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-amber-200/70">
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            className={`hover:text-amber-50 transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeTab === 'studio' ? 'text-amber-300 border-b-2 border-amber-400' : ''
            }`}
          >
            Xưởng Timeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gallery')}
            className={`hover:text-amber-50 transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeTab === 'gallery' ? 'text-amber-300 border-b-2 border-amber-400' : ''
            }`}
          >
            Kho Nhân Vật &amp; Đạo Cụ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('batch')}
            className={`hover:text-amber-50 transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeTab === 'batch' ? 'text-amber-300 border-b-2 border-amber-400' : ''
            }`}
          >
            Tạo Hàng Loạt
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cli')}
            className={`hover:text-amber-50 transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeTab === 'cli' ? 'text-amber-300 border-b-2 border-amber-400' : ''
            }`}
          >
            Lệnh CLI &amp; JSON
          </button>
        </nav>

        {/* Zone 3: Aspect Selector + SFX Toggle & Volume Slider + Render Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <select
            id="header-aspect-select"
            data-testid="aspect-selector"
            aria-label="Chọn tỷ lệ khung hình"
            value={selectedAspect}
            onChange={(e) => handleAspectChange(e.target.value as AspectSelection)}
            className="px-2.5 py-2 text-xs font-semibold bg-[#22120d] border border-[#4d291f] text-amber-50 rounded-lg focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            {ASPECT_RATIOS.map((ratio) => {
              const p = ASPECT_PRESETS[ratio];
              return (
                <option key={ratio} value={ratio}>
                  {ratio} ({p.width}×{p.height})
                </option>
              );
            })}
            <option value="all">Tất cả (4 tỷ lệ)</option>
          </select>

          {/* SFX Toggle + Volume Slider next to Aspect Selector */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#22120d] border border-[#4d291f] rounded-lg">
            <button
              type="button"
              data-testid="sfx-toggle"
              aria-label={sfxEnabled ? 'Tắt hiệu ứng âm thanh' : 'Bật hiệu ứng âm thanh'}
              onClick={handleSfxToggle}
              className={`flex items-center gap-1 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                sfxEnabled ? 'text-amber-400' : 'text-amber-200/40'
              }`}
            >
              {sfxEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>SFX {sfxEnabled ? 'BẬT' : 'TẮT'}</span>
            </button>
            <input
              type="range"
              data-testid="sfx-volume-slider"
              aria-label="Âm lượng SFX"
              min={0}
              max={1}
              step={0.05}
              disabled={!sfxEnabled}
              value={sfxVolume}
              onChange={(e) => handleSfxVolumeChange(Number(e.target.value))}
              className="w-16 accent-amber-400 cursor-pointer disabled:opacity-40"
            />
            <span className="text-[11px] text-amber-200/70 tabular-nums w-8 text-right">
              {Math.round(sfxVolume * 100)}%
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleRenderMp4(false)}
            disabled={isRenderingVideo}
            className="px-4 py-2 text-xs font-semibold text-[#1a0b08] bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <Film className="w-4 h-4" />
            <span>{isRenderingVideo ? 'Đang xuất MP4...' : 'Xuất Video MP4 & Ảnh Bìa'}</span>
          </button>
        </div>
      </header>

      {/* Notification / Error Bar */}
      {(errorBanner || renderNotice) && (
        <div
          className={`px-6 py-2.5 text-xs border-b flex items-center justify-between ${
            errorBanner
              ? 'bg-red-950/70 border-red-800/80 text-red-200'
              : 'bg-[#22120d] border-[#4d291f] text-amber-200'
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
            className="text-amber-200/70 hover:text-amber-50 text-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {activeTab === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN (4 cols): Topic Generator & Scene Sequence */}
            <section className="lg:col-span-4 space-y-6">
              <div className="border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-4">
                <div>
                  <label
                    htmlFor="topic-input"
                    className="block text-sm font-semibold text-amber-50 mb-1.5"
                  >
                    Chủ Đề &ldquo;What If / Điều Gì Xảy Ra Nếu&rdquo; (1 Dòng)
                  </label>
                  <textarea
                    id="topic-input"
                    rows={2}
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    placeholder="VD: What if Mom started playing on your Roblox account"
                    className="w-full rounded-lg bg-[#120907] border border-[#3d2119] px-3.5 py-2.5 text-sm text-amber-50 focus:outline-none focus:border-amber-400"
                  />
                </div>

                {/* Preset Topic Selector */}
                <div>
                  <label
                    htmlFor="preset-topic-select"
                    className="block text-xs font-medium text-amber-200/70 mb-1"
                  >
                    Hoặc chọn chủ đề mẫu có sẵn (Tình huống × Luật chơi)
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
                    className="w-full rounded-lg bg-[#120907] border border-[#3d2119] px-3 py-2 text-xs text-amber-100 focus:outline-none focus:border-amber-400"
                  >
                    <option value="">Chọn chủ đề mẫu...</option>
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
                    className="block text-xs font-medium text-amber-200/70 mb-1"
                  >
                    Bảng Màu Sơn Mài &amp; Biến Thể Nhân Vật
                  </label>
                  <select
                    id="palette-select"
                    value={selectedVariationId}
                    onChange={(e) => handlePaletteChange(e.target.value)}
                    className="w-full rounded-lg bg-[#120907] border border-[#3d2119] px-3 py-2 text-xs text-amber-100 focus:outline-none focus:border-amber-400"
                  >
                    {PALETTE_VARIATIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.characterPalette.slice(0, 3).join(', ')})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Skill Style & Audio/Visual Preset Selector */}
                <div>
                  <label
                    htmlFor="skill-select"
                    className="block text-xs font-medium text-amber-200/70 mb-1"
                  >
                    Kỹ Năng Đạo Diễn (skills/*.md — Nhịp Độ, Âm Thanh &amp; Giao Diện)
                  </label>
                  <select
                    id="skill-select"
                    data-testid="skill-selector"
                    value={selectedSkill}
                    onChange={(e) => handleSkillChange(e.target.value)}
                    className="w-full rounded-lg bg-[#120907] border border-[#3d2119] px-3 py-2 text-xs text-amber-100 focus:outline-none focus:border-amber-400"
                  >
                    <option value="">Mặc định (Sơn Mài Hội An Chuẩn)</option>
                    {availableSkills.map((sk) => (
                      <option key={sk.name} value={sk.name}>
                        {sk.name} — {sk.description}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => handleGenerateTopic()}
                  disabled={isGeneratingScript}
                  className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isGeneratingScript
                      ? 'Đang tạo kịch bản & giọng đọc...'
                      : 'Tạo Kịch Bản & Timeline'}
                  </span>
                </button>

                {/* Unboxed Metadata Summary (Zero-Pill Discipline) */}
                <div className="pt-2 border-t border-[#3d2119] text-xs text-amber-200/70 flex flex-wrap items-center gap-1.5 tabular-nums">
                  <span>{timeline.scenes.length} Cảnh</span>
                  <span aria-hidden="true">·</span>
                  <span>{totalSpokenWords} Từ</span>
                  <span aria-hidden="true">·</span>
                  <span>{timeline.totalDurationSec}s ({timeline.totalFrames}f @ 30fps)</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {activePreset.width}×{activePreset.height} ({previewAspect})
                  </span>
                </div>
              </div>

              {/* Scene Sequence Breakdown */}
              <div className="border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-amber-50">
                    Cấu Trúc 5 Cảnh (LUẬT CHƠI → NGÀY 1–3 → VÒNG LẶP)
                  </h2>
                  <span className="text-xs text-amber-200/70 tabular-nums">
                    Tổng {timeline.totalDurationSec}s
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
                            ? 'bg-[#2d1711] border-amber-400 text-amber-50'
                            : 'bg-[#120907]/80 border-[#3d2119] text-amber-100/80 hover:border-amber-500/50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-amber-400">
                            0{idx + 1}. {scene.label}
                          </span>
                          <span className="text-amber-200/70 tabular-nums">
                            {scene.durationSec}s · {scene.background} · {scene.characters.length} nhân vật
                          </span>
                        </div>
                        <p className="text-xs text-amber-100/85 line-clamp-2 leading-relaxed">
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
              <div className="w-full border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-4 flex flex-col items-center">
                {/* Stage Toolbar */}
                <div className="w-full flex items-center justify-between mb-3 text-xs text-amber-200/70">
                  <span className="font-medium text-amber-100">
                    {thumbnailPreviewMode
                      ? `Ảnh Bìa (${activePreset.width}×${activePreset.height})`
                      : `Sân Khấu (${previewAspect}): ${activeScene.label}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSafeZones((v) => !v)}
                      className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap cursor-pointer ${
                        showSafeZones
                          ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50'
                          : 'bg-[#2a1510] text-amber-100/80 hover:text-amber-50'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5 inline mr-1" />
                      Vùng An Toàn
                    </button>
                    <button
                      type="button"
                      onClick={() => setThumbnailPreviewMode((v) => !v)}
                      className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap cursor-pointer ${
                        thumbnailPreviewMode
                          ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50'
                          : 'bg-[#2a1510] text-amber-100/80 hover:text-amber-50'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5 inline mr-1" />
                      Xem Ảnh Bìa
                    </button>
                  </div>
                </div>

                {/* Adaptive Viewport Container (9:16, 16:9, 4:3, 3:4) */}
                <div
                  data-testid="vertical-stage-player"
                  data-aspect={previewAspect}
                  className={`w-full ${STAGE_CONTAINER_CLASSES[previewAspect]} rounded-xl overflow-hidden border-2 border-[#4d291f] shadow-xl bg-[#120907] relative transition-all`}
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
                      aria-label={isPlaying ? 'Tạm dừng xem trước' : 'Phát xem trước'}
                      onClick={() => {
                        setThumbnailPreviewMode(false);
                        setIsPlaying((p) => !p);
                      }}
                      className="p-2 rounded-lg bg-amber-400 text-[#1a0b08] hover:bg-amber-300 transition-colors cursor-pointer shrink-0"
                    >
                      {isPlaying && !thumbnailPreviewMode ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Phát lại từ khung hình 0"
                      onClick={() => {
                        setThumbnailPreviewMode(false);
                        setCurrentFrame(0);
                      }}
                      className="p-2 rounded-lg bg-[#2a1510] text-amber-100 hover:bg-[#381d16] transition-colors cursor-pointer shrink-0"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <input
                      type="range"
                      aria-label="Thanh tua khung hình timeline"
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

                  <div className="flex items-center justify-between text-xs text-amber-200/70 tabular-nums">
                    <span>
                      Khung hình {currentFrame} / {timeline.totalFrames}
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
              <div className="border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-amber-50 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <span>Chỉnh Sửa Cảnh: {activeScene.label}</span>
                  </h2>
                  <span className="text-xs text-amber-200/70 tabular-nums">
                    Khung {activeScene.startFrame}–{activeScene.endFrame}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="scene-bg-select"
                      className="block text-xs text-amber-200/70 mb-1"
                    >
                      Bối Cảnh SVG
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
                      className="w-full rounded-lg bg-[#120907] border border-[#3d2119] px-2.5 py-1.5 text-xs text-amber-50"
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
                      className="block text-xs text-amber-200/70 mb-1"
                    >
                      Hiệu Ứng Chuyển Cảnh
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
                      className="w-full rounded-lg bg-[#120907] border border-[#3d2119] px-2.5 py-1.5 text-xs text-amber-50"
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
                    className="block text-xs text-amber-200/70 mb-1"
                  >
                    Lời Thoại &amp; Phụ Đề Tô Sáng Từng Từ (Fredoka OFL)
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
                    className="w-full rounded-lg bg-[#120907] border border-[#3d2119] px-3 py-2 text-xs text-amber-50"
                  />
                </div>

                {/* Character Controls */}
                <div className="space-y-3 pt-2 border-t border-[#3d2119]">
                  <div className="text-xs font-semibold text-amber-100">
                    Nhân Vật Blob Trong Cảnh ({activeScene.characters.length})
                  </div>
                  {activeScene.characters.map((char, cIdx) => (
                    <div
                      key={char.id}
                      className="p-3 rounded-lg bg-[#120907]/80 border border-[#3d2119] space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-amber-50">{char.name}</span>
                        <input
                          type="color"
                          aria-label={`Màu của nhân vật ${char.name}`}
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
                            className="block text-[11px] text-amber-200/70 mb-0.5"
                          >
                            Cảm xúc
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
                            className="w-full rounded bg-[#1d100c] border border-[#3d2119] px-2 py-1 text-xs text-amber-100"
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
                            className="block text-[11px] text-amber-200/70 mb-0.5"
                          >
                            Phụ kiện
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
                            className="w-full rounded bg-[#1d100c] border border-[#3d2119] px-2 py-1 text-xs text-amber-100"
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
                            className="block text-[11px] text-amber-200/70 mb-0.5"
                          >
                            Chuyển động
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
                            className="w-full rounded bg-[#1d100c] border border-[#3d2119] px-2 py-1 text-xs text-amber-100"
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
              <div className="border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-amber-50">
                    Thành Phẩm Đã Kết Xuất (out/)
                  </h2>
                  <span className="text-xs text-amber-200/70">
                    {serverStatus?.ttsMode || 'MockProvider Sẵn Sàng'}
                  </span>
                </div>

                {renderedVideoUrl ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-amber-200/70 mb-1">
                          Video MP4 ({renderedMeta?.resolution || `${activePreset.width}×${activePreset.height}`})
                        </div>
                        <video
                          key={renderedVideoUrl}
                          src={renderedVideoUrl}
                          controls
                          playsInline
                          className="w-full rounded-lg border border-[#3d2119] bg-black"
                        />
                      </div>
                      {renderedThumbUrl && (
                        <div>
                          <div className="text-xs text-amber-200/70 mb-1">Ảnh Bìa PNG</div>
                          <img
                            src={renderedThumbUrl}
                            alt="Ảnh bìa đã kết xuất"
                            referrerPolicy="no-referrer"
                            className="w-full object-contain rounded-lg border border-[#3d2119] bg-[#120907]"
                          />
                        </div>
                      )}
                    </div>

                    {renderedAllRatios.length > 0 && (
                      <div className="pt-2 border-t border-[#3d2119] space-y-1.5">
                        <div className="text-xs font-semibold text-amber-400">
                          Đã xuất đủ 4 tỷ lệ khung hình:
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {renderedAllRatios.map((r) => (
                            <a
                              key={r.aspect}
                              href={r.videoUrl}
                              download
                              className="px-2.5 py-1.5 rounded bg-[#120907] border border-[#3d2119] hover:border-amber-400 text-xs text-amber-100 flex items-center justify-between"
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
                      <div className="text-xs text-amber-200/70 space-y-1 pt-2 border-t border-[#3d2119] tabular-nums">
                        <div className="text-amber-100 font-medium">{renderedMeta.title}</div>
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
                        className="flex-1 py-2 px-3 bg-[#2a1510] hover:bg-[#381d16] text-amber-50 text-xs font-medium rounded-lg text-center flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải Video MP4</span>
                      </a>
                      {renderedThumbUrl && (
                        <a
                          href={renderedThumbUrl}
                          download="thumbnail.png"
                          className="flex-1 py-2 px-3 bg-[#2a1510] hover:bg-[#381d16] text-amber-50 text-xs font-medium rounded-lg text-center flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Tải Ảnh Bìa PNG</span>
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-lg bg-[#120907]/80 border border-[#3d2119] text-center space-y-3">
                    <p className="text-xs text-amber-200/70">
                      Chọn tỷ lệ khung hình (`9:16`, `16:9`, `4:3`, `3:4`, hoặc `Tất cả`) và nhấn
                      &ldquo;Xuất Video MP4 &amp; Ảnh Bìa&rdquo; để ghép âm thanh và xuất thành phẩm.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRenderMp4(false)}
                      disabled={isRenderingVideo}
                      className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-[#1a0b08] font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      {isRenderingVideo ? 'Đang kết xuất...' : 'Kết Xuất Timeline Hiện Tại'}
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: ASSET GALLERY (Kho Nhân Vật, Cảm Xúc & Đạo Cụ) */}
        {activeTab === 'gallery' && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#3d2119] pb-5">
              <div>
                <h1 className="text-2xl font-bold text-amber-50 font-display">
                  Kho Nhân Vật Blob, Cảm Xúc &amp; Đạo Cụ SVG Thuần Code
                </h1>
                <p className="text-sm text-amber-200/70 mt-1">
                  Mọi nhân vật, biểu cảm khuôn mặt, phụ kiện, đạo cụ và bối cảnh sân khấu đều được vẽ
                  bằng toán học khung hình TypeScript &amp; Remotion với chủ đề Sơn Mài Việt Nam.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRenderMp4(true)}
                disabled={isRenderingVideo}
                className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-[#1a0b08] font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2"
              >
                <Film className="w-4 h-4" />
                <span>
                  {isRenderingVideo ? 'Đang xuất video bộ sưu tập...' : 'Xuất Video Trình Diễn Bộ Sưu Tập'}
                </span>
              </button>
            </div>

            {/* 8 Emotions Grid */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-amber-50">
                01. Biểu Cảm Nhân Vật Blob &amp; Phụ Kiện Đặc Trưng
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                {EmotionSchema.options.map((emotion, idx) => {
                  const acc = AccessorySchema.options[(idx + 1) % AccessorySchema.options.length];
                  const color =
                    PALETTE_VARIATIONS[0].characterPalette[
                      idx % PALETTE_VARIATIONS[0].characterPalette.length
                    ];
                  return (
                    <div
                      key={emotion}
                      className="border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-3 flex flex-col items-center"
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
                      <div className="text-xs text-amber-100 font-medium mt-1">
                        {emotion} · {acc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 8 Extensible Props Grid */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-amber-50">
                02. Kho Đạo Cụ Mở Rộng (8 Đạo Cụ SVG Động)
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                {PropTypeSchema.options.map((propType) => (
                  <div
                    key={propType}
                    className="border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-3 flex flex-col items-center"
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
                    <div className="text-xs text-amber-100 font-medium mt-1">{propType}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* 6 SVG Stage Backgrounds */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-amber-50">
                03. Sáu Bối Cảnh Sân Khấu Đa Tỷ Lệ ({previewAspect})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {BackgroundTypeSchema.options.map((bgType, idx) => {
                  const variation = selectVariationForIndex(idx);
                  return (
                    <div
                      key={bgType}
                      className="border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-2.5 flex flex-col items-center"
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
                      <div className="text-xs text-amber-100 font-medium mt-2">
                        {bgType} · {variation.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: BATCH VARIATIONS (Tạo Hàng Loạt & Biến Thể Bảng Màu) */}
        {activeTab === 'batch' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-4">
              <h1 className="text-lg font-bold text-amber-50 font-display flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <span>Tạo Kịch Bản Hàng Loạt &amp; Hệ Thống Biến Thể</span>
              </h1>
              <p className="text-xs text-amber-200/70 leading-relaxed">
                Nhập mỗi dòng một chủ đề &ldquo;What If&rdquo; (cùng định dạng với tệp{' '}
                <code className="text-amber-300 font-mono">topics.txt</code>). Mỗi video trong lô sẽ
                được gán tự động một bảng màu Việt Nam (Sơn Mài Hội An, Ngọc Bích Tràng An, Đèn Lồng
                Đỏ Son, Lam Gốm Bát Tràng, Hoàng Kim Đông Hồ) để không có hai video nào trùng màu.
              </p>

              <div>
                <label
                  htmlFor="batch-topics-textarea"
                  className="block text-xs font-medium text-amber-100 mb-1.5"
                >
                  Danh Sách Chủ Đề Hàng Loạt (Mỗi dòng 1 chủ đề)
                </label>
                <textarea
                  id="batch-topics-textarea"
                  rows={6}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  className="w-full rounded-lg bg-[#120907] border border-[#3d2119] p-3 text-xs text-amber-50 font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleRunBatch}
                disabled={isRunningBatch}
                className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-[#1a0b08] font-semibold text-xs rounded-lg transition-colors cursor-pointer"
              >
                {isRunningBatch
                  ? 'Đang tạo kịch bản & timeline hàng loạt...'
                  : 'Tạo Timeline Hàng Loạt Với Bảng Màu Riêng'}
              </button>
            </div>

            <div className="lg:col-span-7 border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-amber-50">
                  Ma Trận Biến Thể Bảng Màu ({batchResults.length || PALETTE_VARIATIONS.length} Biến Thể)
                </h2>
                <span className="text-xs text-amber-200/70 font-mono">
                  npm run batch -- topics.txt --aspect {selectedAspect}
                </span>
              </div>

              {batchResults.length > 0 ? (
                <div className="space-y-3">
                  {batchResults.map((item) => (
                    <div
                      key={item.index}
                      className="p-4 rounded-lg bg-[#120907]/85 border border-[#3d2119] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-amber-400">
                          #{item.index} · {item.variation.name}
                        </div>
                        <div className="text-sm font-semibold text-amber-50">{item.topic}</div>
                        <div className="text-xs text-amber-200/70 tabular-nums">
                          {item.sceneCount} cảnh · {item.durationSec}s · {item.totalFrames} frames ·
                          Đạo cụ: {item.variation.preferredProps.join(', ')}
                        </div>
                        <div className="flex items-center gap-1.5 pt-1">
                          {item.variation.characterPalette.map((hex) => (
                            <span
                              key={hex}
                              style={{ backgroundColor: hex }}
                              className="w-4 h-4 rounded border border-[#120907] inline-block"
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
                        className="px-3.5 py-2 bg-[#2a1510] hover:bg-[#381d16] text-amber-50 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Mở Trong Xưởng
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {PALETTE_VARIATIONS.map((v, i) => (
                    <div
                      key={v.id}
                      className="p-3.5 rounded-lg bg-[#120907]/80 border border-[#3d2119] flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold text-amber-50">
                          0{i + 1}. {v.name}
                        </div>
                        <div className="text-xs text-amber-200/70">
                          Phụ kiện: {v.defaultAccessories.join(', ')} · Đạo cụ:{' '}
                          {v.preferredProps.join(', ')}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {v.characterPalette.map((hex) => (
                          <span
                            key={hex}
                            style={{ backgroundColor: hex }}
                            className="w-5 h-5 rounded border border-[#120907]"
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
            <div className="lg:col-span-6 border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-4">
              <h1 className="text-lg font-bold text-amber-50 font-display flex items-center gap-2">
                <Terminal className="w-5 h-5 text-amber-400" />
                <span>Lệnh CLI &amp; Quy Trình Kết Xuất Đa Tỷ Lệ</span>
              </h1>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-lg bg-[#120907] border border-[#3d2119] space-y-1">
                  <div className="font-semibold text-amber-400">
                    1. Chạy Toàn Bộ Quy Trình Từ Chủ Đề → MP4
                  </div>
                  <code className="block font-mono text-amber-100">
                    npm run make -- &quot;{topicInput}&quot; --aspect {selectedAspect} --skill vietnamese-lacquer
                  </code>
                  <p className="text-amber-200/70">
                    Lưu thư mục riêng <code className="font-mono">out/&lt;slug&gt;/</code> gồm{' '}
                    <code className="font-mono">script.json</code>,{' '}
                    <code className="font-mono">timeline.json</code>,{' '}
                    <code className="font-mono">audio/</code>, MP4,{' '}
                    <code className="font-mono">thumbnail.png</code>, và{' '}
                    <code className="font-mono">meta.json</code>.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#120907] border border-[#3d2119] space-y-1">
                  <div className="font-semibold text-amber-400">
                    2. Kết Xuất Đồng Thời Cả 4 Tỷ Lệ Khung Hình
                  </div>
                  <code className="block font-mono text-amber-100">
                    npm run render -- --gallery --aspect all
                  </code>
                  <p className="text-amber-200/70">
                    Tự động xuất <code className="font-mono">out_9x16.mp4</code>,{' '}
                    <code className="font-mono">out_16x9.mp4</code>,{' '}
                    <code className="font-mono">out_4x3.mp4</code>, và{' '}
                    <code className="font-mono">out_3x4.mp4</code> với bố cục thích ứng.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#120907] border border-[#3d2119] space-y-1">
                  <div className="font-semibold text-amber-400">
                    3. Gợi Ý Chủ Đề, Demo SFX &amp; Kiểm Tra Hệ Thống
                  </div>
                  <code className="block font-mono text-amber-100">
                    npm run sfx:demo
                  </code>
                  <code className="block font-mono text-amber-100">npm run doctor</code>
                  <p className="text-amber-200/70">
                    Tạo video trình diễn 11 hiệu ứng âm thanh tổng hợp bằng toán học và kiểm tra trạng
                    thái Node, ffmpeg/ffprobe, .env và VoiceStudio.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-amber-50">
                  Nguồn Dữ Liệu Duy Nhất: Live Timeline JSON ({timeline.aspect})
                </h2>
                <span className="text-xs text-amber-200/70 font-mono">
                  {timeline.scenes.length} cảnh · {timeline.totalFrames} frames · seed {timeline.seed}
                </span>
              </div>
              <pre className="p-4 rounded-lg bg-[#120907] border border-[#3d2119] text-[11px] text-amber-100/90 font-mono overflow-auto max-h-[460px]">
                {JSON.stringify(timeline, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
