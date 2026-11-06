import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Film,
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
  FileText,
  Save,
  Plus,
  Mic,
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
import { parseScriptText } from './script/parser';
import { PALETTE_VARIATIONS, selectVariationForIndex } from './script/variations';
import {
  applyAspectToTimeline,
  buildBrowserPreviewTimeline,
  computeWordTimings,
  resolveVariationWithColorPalette,
} from './timeline/builder';
import { Timeline, VideoMeta } from './timeline/schema';
import { SkillRenderParams } from './skills/schema';
import { SceneStage } from './scenes/SceneStage';
import {
  Blob,
  RobotCharacterComponent,
  listCharacterDefinitions,
} from './characters';
import { Prop } from './characters/Prop';
import { Background } from './scenes/Background';
import { useLoadBundledFontInRemotion } from './fonts/bundledFont';
import { Locale, getDictionary } from './i18n';

const DEFAULT_DEMO_SCRIPT_TEXT = `title: What if Mom played on your Roblox account?
aspect: 9:16
voice: Narrator
characters:
  kid: blob(color=#4cc9f0, voice=Voice A, accessory=headphones)
  mom: blob(color=#f72585, voice=Voice B, accessory=glasses)

--- DAY 1 | bg=#ffd6a5,#fdffb6 | caption="DAY 1: Mom sets a 1 hour limit"
kid [happy, bounce, x=0.3]: Yay, game time!
mom [angry, slide-in, x=0.7]: Hand it over, my turn.
narrator: Day one looks easy.

--- DAY 2 | bg=#caffbf,#9bf6ff
mom [excited, jump, x=0.5]: I beat your high score!
kid [shock, walk to x=0.4]: Wait... how?!

--- DAY 3 | bg=#fbcfe8,#e9d5ff | caption="DAY 3: Mom is the new clan leader"
mom [smug, bounce, x=0.68]: Your whole squad just voted me guild leader!
kid [sad, shake, x=0.32, silent]: Not my main account!
narrator: Would you finish every chore or start a brand new save file?`;

const ROBOT_DEMO_SCRIPT_TEXT = `title: What if a Square Robot did your chores for 3 days?
aspect: 9:16
voice: Narrator
characters:
  kid: blob(color=#38bdf8, voice=Voice A, accessory=cap)
  bot: robot(color=#fbbf24, accentColor=#f43f5e, voice=Echo)

--- DAY 1 | bg=room | caption="DAY 1: BoxBot 3000 cleans the whole room"
kid [happy, bounce, x=0.3]: Clean my room while I play games!
bot [excited, jump, x=0.7]: Task accepted. Turbo vacuum engaged!
narrator: On day one, having a robot helper feels awesome.

--- DAY 2 | bg=kitchen | caption="DAY 2: BoxBot reorganizes the kitchen by color"
bot [smug, walk to x=0.58]: I sorted your snacks alphabetically by calorie count.
kid [shock, shake, x=0.28]: Where did my chocolate cookies go?!

--- DAY 3 | bg=arcade | caption="DAY 3: BoxBot takes over high scores"
bot [laughing, spin, x=0.66]: Chores complete. Now I am rank number one!
kid [sad, idle, x=0.32, silent]: Give me my controller back!`;

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
  scriptMode: string;
  hasRenderedVideo: boolean;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  lastMeta: VideoMeta | null;
}

interface VoiceOption {
  id: string;
  name: string;
  description?: string;
}

interface ProjectOption {
  id: string;
  title: string;
  path: string;
  scriptText: string;
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
  const registeredCharacters = listCharacterDefinitions();

  const [locale, setLocale] = useState<Locale>('vi');
  const t = getDictionary(locale);

  const [activeTab, setActiveTab] = useState<StudioTab>('studio');
  const [scriptText, setScriptText] = useState<string>(DEFAULT_DEMO_SCRIPT_TEXT);
  const [scriptPathLabel, setScriptPathLabel] = useState<string>('examples/demo.script.txt');
  const [projectsList, setProjectsList] = useState<ProjectOption[]>([
    {
      id: 'examples/demo.script.txt',
      title: 'Demo: What if Mom played on your Roblox account?',
      path: 'examples/demo.script.txt',
      scriptText: DEFAULT_DEMO_SCRIPT_TEXT,
    },
    {
      id: 'preset:robot',
      title: 'Demo 2: What if a Square Robot did your chores?',
      path: 'examples/robot.script.txt',
      scriptText: ROBOT_DEMO_SCRIPT_TEXT,
    },
  ]);

  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([
    { id: 'alloy', name: 'alloy', description: 'Default narrator voice' },
    { id: 'Voice A', name: 'Voice A', description: 'Kid voice' },
    { id: 'Voice B', name: 'Voice B', description: 'Mom voice' },
    { id: 'echo', name: 'echo', description: 'Robot voice' },
    { id: 'shimmer', name: 'shimmer', description: 'Warm voice' },
  ]);
  const [auditionText, setAuditionText] = useState<string>('Hand it over, my turn!');
  const [auditionVoice, setAuditionVoice] = useState<string>('Voice B');
  const [auditionAudioUrl, setAuditionAudioUrl] = useState<string | null>(null);
  const [isAuditioning, setIsAuditioning] = useState<boolean>(false);

  const [selectedVariationId, setSelectedVariationId] = useState<string>(PALETTE_VARIATIONS[0].id);
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const [availableSkills, setAvailableSkills] = useState(BUILTIN_SKILLS);
  const [selectedAspect, setSelectedAspect] = useState<AspectSelection>('9:16');
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(true);
  const [sfxVolume, setSfxVolume] = useState<number>(0.35);

  const [timeline, setTimeline] = useState<Timeline>(() => {
    const parsed = parseScriptText(DEFAULT_DEMO_SCRIPT_TEXT, 'demo.script.txt');
    return buildBrowserPreviewTimeline(parsed, PALETTE_VARIATIONS[0], '9:16');
  });
  const [selectedSceneIdx, setSelectedSceneIdx] = useState<number>(0);

  // Playback state for live 30fps Remotion stage
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showSafeZones, setShowSafeZones] = useState<boolean>(false);
  const [thumbnailPreviewMode, setThumbnailPreviewMode] = useState<boolean>(false);

  // Validation & Render status
  const [isParsingScript, setIsParsingScript] = useState<boolean>(false);
  const [isRenderingVideo, setIsRenderingVideo] = useState<boolean>(false);
  const [renderNotice, setRenderNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [renderedThumbUrl, setRenderedThumbUrl] = useState<string | null>(null);
  const [renderedMeta, setRenderedMeta] = useState<VideoMeta | null>(null);
  const [renderedAllRatios, setRenderedAllRatios] = useState<RenderedRatioItem[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);

  // Batch mode state
  const [batchPathsText, setBatchPathsText] = useState<string>('examples/demo.script.txt');
  const [batchResults, setBatchResults] = useState<BatchItem[]>([]);
  const [isRunningBatch, setIsRunningBatch] = useState<boolean>(false);

  const previewAspect: AspectRatio =
    selectedAspect === 'all' ? timeline.aspect ?? '9:16' : selectedAspect;
  const activePreset = getAspectPreset(previewAspect);

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
      .catch(() => {});

    fetch('/api/skills')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.skills) && data.skills.length > 0) {
          const normalized = data.skills
            .map((entry: { name?: string; skill?: (typeof BUILTIN_SKILLS)[0] }) =>
              entry.skill ? entry.skill : entry
            )
            .filter((s: { name?: string }): s is (typeof BUILTIN_SKILLS)[0] => Boolean(s && s.name));
          if (normalized.length > 0) {
            setAvailableSkills(normalized);
          }
        }
      })
      .catch(() => {});

    fetch('/api/voices')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.voices) && data.voices.length > 0) {
          setVoiceOptions(data.voices);
        }
      })
      .catch(() => {});

    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.projects) && data.projects.length > 0) {
          const merged: ProjectOption[] = [
            ...data.projects,
            {
              id: 'preset:robot',
              title: 'Demo 2: What if a Square Robot did your chores?',
              path: 'examples/robot.script.txt',
              scriptText: ROBOT_DEMO_SCRIPT_TEXT,
            },
          ];
          const seenPaths = new Set<string>();
          const uniqueProjects = merged.filter((p) => {
            if (!p || !p.path || seenPaths.has(p.path)) return false;
            seenPaths.add(p.path);
            return true;
          });
          setProjectsList(uniqueProjects);
        }
      })
      .catch(() => {});
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

  const activeSceneIndex = timeline.scenes.findIndex(
    (s) => currentFrame >= s.startFrame && currentFrame < s.endFrame
  );
  const effectiveSceneIdx =
    activeSceneIndex >= 0
      ? activeSceneIndex
      : Math.min(selectedSceneIdx, timeline.scenes.length - 1);
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
      scenes: prev.scenes.map((sc) => ({
        ...sc,
        transition: skillObj?.renderParams?.transitionType ?? sc.transition,
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

  const handleParseAndBuildTimeline = async (overrideScriptText?: string) => {
    const rawText = (overrideScriptText ?? scriptText).trim();
    if (!rawText) {
      setErrorBanner(t.notices.emptyScriptError);
      return;
    }

    setErrorBanner(null);
    setIsParsingScript(true);
    setRenderNotice(null);

    const targetAspect: AspectRatio = selectedAspect === 'all' ? '9:16' : selectedAspect;
    const baseVar =
      PALETTE_VARIATIONS.find((v) => v.id === selectedVariationId) ?? PALETTE_VARIATIONS[0];
    const skillObj = availableSkills.find((s) => s.name === selectedSkill);
    const effectiveVar = resolveVariationWithColorPalette(
      baseVar,
      skillObj?.renderParams?.colorPalette
    );

    // 1. Validate locally first so line-number errors show immediately
    let localParsed;
    try {
      localParsed = parseScriptText(rawText, scriptPathLabel || 'script.txt');
    } catch (err) {
      setIsParsingScript(false);
      setErrorBanner(err instanceof Error ? err.message : String(err));
      return;
    }

    try {
      const res = await fetch('/api/parse-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptText: rawText,
          variationId: selectedVariationId,
          aspect: targetAspect,
          skill: selectedSkill || undefined,
          sfx: sfxEnabled,
          sfxVolume,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t.notices.compileFailedError);
      }
      setTimeline(data.timeline);
      setCurrentFrame(0);
      setSelectedSceneIdx(0);
      setRenderNotice(
        t.notices.compileSuccess(
          data.timeline.scenes.length,
          data.timeline.totalDurationSec,
          data.timeline.aspect,
          data.providerUsed
        )
      );
    } catch (err) {
      // Fallback to browser preview timeline if server is offline
      const localTimeline = buildBrowserPreviewTimeline(
        localParsed,
        effectiveVar,
        targetAspect,
        skillObj?.renderParams,
        skillObj?.name
      );
      setTimeline({
        ...localTimeline,
        audio: { sfx: sfxEnabled, sfxVolume },
      });
      setCurrentFrame(0);
      setSelectedSceneIdx(0);
      setRenderNotice(
        t.notices.compileFallbackSuccess(
          localTimeline.scenes.length,
          localTimeline.totalDurationSec
        )
      );
      if (err instanceof Error && err.message.startsWith('line ')) {
        setErrorBanner(err.message);
      }
    } finally {
      setIsParsingScript(false);
    }
  };

  const handleSaveProject = async () => {
    setErrorBanner(null);
    try {
      const parsed = parseScriptText(scriptText, scriptPathLabel);
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: parsed.title,
          scriptText,
          aspect: selectedAspect,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.notices.saveProjectFailed);
      setScriptPathLabel(data.path);
      setRenderNotice(t.notices.saveProjectSuccess(data.path));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAuditionVoice = async () => {
    if (!auditionText.trim()) return;
    setErrorBanner(null);
    setIsAuditioning(true);
    try {
      const res = await fetch('/api/say', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: auditionText,
          voice: auditionVoice,
          speed: 1.0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.notices.auditionFailed);
      setAuditionAudioUrl(data.audioUrl);
      setRenderNotice(
        t.notices.auditionSuccess(data.voiceUsed, data.durationSec, data.provider)
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAuditioning(false);
    }
  };

  const handleRenderMp4 = async (galleryMode = false) => {
    setErrorBanner(null);
    setIsRenderingVideo(true);
    setRenderNotice(
      selectedAspect === 'all'
        ? t.notices.renderingAllAspects
        : galleryMode
        ? t.notices.renderingGallery(activePreset.width, activePreset.height)
        : t.notices.renderingSingle(activePreset.width, activePreset.height, previewAspect)
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
        throw new Error(data.error || t.notices.renderFailed);
      }
      setRenderedVideoUrl(data.videoUrl);
      setRenderedThumbUrl(data.thumbnailUrl);
      setRenderedMeta(data.meta);
      setRenderedAllRatios(Array.isArray(data.allRatios) ? data.allRatios : []);
      setRenderNotice(
        selectedAspect === 'all'
          ? t.notices.renderAllSuccess
          : t.notices.renderSingleSuccess(
              data.width,
              data.height,
              data.aspect ?? previewAspect,
              data.fps,
              data.durationSec
            )
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRenderingVideo(false);
    }
  };

  const handleRunBatch = async () => {
    const paths = batchPathsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (paths.length === 0) {
      setErrorBanner(t.notices.emptyBatchPathsError);
      return;
    }
    setErrorBanner(null);
    setIsRunningBatch(true);
    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptPaths: paths,
          aspect: selectedAspect === 'all' ? '9:16' : selectedAspect,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.notices.batchFailedError);
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
          {t.brandTitle}
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
            {t.nav.studio}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gallery')}
            className={`hover:text-amber-50 transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeTab === 'gallery' ? 'text-amber-300 border-b-2 border-amber-400' : ''
            }`}
          >
            {t.nav.gallery}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('batch')}
            className={`hover:text-amber-50 transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeTab === 'batch' ? 'text-amber-300 border-b-2 border-amber-400' : ''
            }`}
          >
            {t.nav.batch}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cli')}
            className={`hover:text-amber-50 transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeTab === 'cli' ? 'text-amber-300 border-b-2 border-amber-400' : ''
            }`}
          >
            {t.nav.cli}
          </button>
        </nav>

        {/* Zone 3: Language Switch + Aspect Selector + SFX Toggle & Volume Slider + Render Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="locale-toggle"
            aria-label={t.header.langToggleAria}
            onClick={() => setLocale((prev) => (prev === 'vi' ? 'en' : 'vi'))}
            className="px-2 py-1.5 text-xs font-bold bg-[#22120d] border border-[#4d291f] text-amber-300 rounded-lg hover:border-amber-400 cursor-pointer uppercase"
          >
            {locale}
          </button>

          <select
            id="header-aspect-select"
            data-testid="aspect-selector"
            aria-label={t.header.aspectLabel}
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
            <option value="all">{t.header.allAspectsOption}</option>
          </select>

          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#22120d] border border-[#4d291f] rounded-lg">
            <button
              type="button"
              data-testid="sfx-toggle"
              aria-label={sfxEnabled ? t.header.sfxMuteAria : t.header.sfxUnmuteAria}
              onClick={handleSfxToggle}
              className={`flex items-center gap-1 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                sfxEnabled ? 'text-amber-400' : 'text-amber-200/40'
              }`}
            >
              {sfxEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{sfxEnabled ? t.header.sfxOn : t.header.sfxOff}</span>
            </button>
            <input
              type="range"
              data-testid="sfx-volume-slider"
              aria-label={t.header.sfxVolumeAria}
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
            <span>{isRenderingVideo ? t.header.renderingBtn : t.header.renderBtn}</span>
          </button>
        </div>
      </header>

      {/* Notification / Line-Number Error Bar */}
      {(errorBanner || renderNotice) && (
        <div
          data-testid="status-banner"
          className={`px-6 py-2.5 text-xs border-b flex items-center justify-between ${
            errorBanner
              ? 'bg-red-950/80 border-red-800/80 text-red-200'
              : 'bg-[#22120d] border-[#4d291f] text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2 font-mono">
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
            {t.banner.close}
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {activeTab === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN (4 cols): Manual .script.txt Editor & Project Manager */}
            <section className="lg:col-span-4 space-y-6">
              <div className="border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="script-editor-textarea"
                    className="text-sm font-semibold text-amber-50 flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span>{t.editor.sectionTitle}</span>
                  </label>
                  <span className="text-[11px] font-mono text-amber-300/80">
                    {scriptPathLabel}
                  </span>
                </div>

                {/* Project / Demo Template Selector */}
                <div>
                  <label
                    htmlFor="project-select"
                    className="block text-xs font-medium text-amber-200/70 mb-1"
                  >
                    {t.editor.projectSelectLabel}
                  </label>
                  <select
                    id="project-select"
                    data-testid="project-selector"
                    value={
                      projectsList.some((p) => p.path === scriptPathLabel)
                        ? scriptPathLabel
                        : projectsList[0]?.path ?? ''
                    }
                    onChange={(e) => {
                      const chosen = projectsList.find((p) => p.path === e.target.value);
                      if (chosen) {
                        setScriptPathLabel(chosen.path);
                        setScriptText(chosen.scriptText);
                        handleParseAndBuildTimeline(chosen.scriptText);
                      }
                    }}
                    className="w-full rounded-lg bg-[#120907] border border-[#3d2119] px-3 py-2 text-xs text-amber-100 focus:outline-none focus:border-amber-400"
                  >
                    {projectsList.map((p) => (
                      <option key={p.path} value={p.path}>
                        {p.title} ({p.path})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Plain-text .script.txt Editor */}
                <textarea
                  id="script-editor-textarea"
                  data-testid="script-editor"
                  rows={12}
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  spellCheck={false}
                  className="w-full rounded-lg bg-[#120907] border border-[#3d2119] px-3.5 py-2.5 text-xs font-mono leading-relaxed text-amber-50 focus:outline-none focus:border-amber-400"
                />

                {/* Quick Snippet Inserters */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setScriptText(
                        (prev) =>
                          `${prev.trimEnd()}\n\n--- NEW SCENE | bg=arcade | caption="NEW SCENE"\nkid [happy, bounce, x=0.35]: New line here!\n`
                      )
                    }
                    className="px-2.5 py-1.5 rounded bg-[#2a1510] hover:bg-[#381d16] text-amber-100 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t.editor.addSceneBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setScriptText(
                        (prev) =>
                          `${prev.trimEnd()}\nkid [shock, jump, x=0.4]: Wait... really?!\n`
                      )
                    }
                    className="px-2.5 py-1.5 rounded bg-[#2a1510] hover:bg-[#381d16] text-amber-100 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t.editor.addLineBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProject}
                    className="px-2.5 py-1.5 rounded bg-[#2a1510] hover:bg-[#381d16] text-amber-100 text-xs flex items-center gap-1 cursor-pointer ml-auto"
                  >
                    <Save className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t.editor.saveProjectBtn}</span>
                  </button>
                </div>

                {/* Palette & Skill Render Params Selectors */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="palette-select"
                      className="block text-xs font-medium text-amber-200/70 mb-1"
                    >
                      {t.editor.paletteLabel}
                    </label>
                    <select
                      id="palette-select"
                      value={selectedVariationId}
                      onChange={(e) => handlePaletteChange(e.target.value)}
                      className="w-full rounded-lg bg-[#120907] border border-[#3d2119] px-2.5 py-2 text-xs text-amber-100 focus:outline-none focus:border-amber-400"
                    >
                      {PALETTE_VARIATIONS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="skill-select"
                      className="block text-xs font-medium text-amber-200/70 mb-1"
                    >
                      {t.editor.skillLabel}
                    </label>
                    <select
                      id="skill-select"
                      data-testid="skill-selector"
                      value={selectedSkill}
                      onChange={(e) => handleSkillChange(e.target.value)}
                      className="w-full rounded-lg bg-[#120907] border border-[#3d2119] px-2.5 py-2 text-xs text-amber-100 focus:outline-none focus:border-amber-400"
                    >
                      <option value="">{t.editor.defaultSkillOption}</option>
                      {availableSkills.map((sk) => (
                        <option key={sk.name} value={sk.name}>
                          {sk.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="compile-script-btn"
                  onClick={() => handleParseAndBuildTimeline()}
                  disabled={isParsingScript}
                  className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isParsingScript ? t.editor.compilingBtn : t.editor.compileBtn}</span>
                </button>

                {/* Unboxed Metadata Summary */}
                <div className="pt-2 border-t border-[#3d2119] text-xs text-amber-200/70 flex flex-wrap items-center gap-1.5 tabular-nums">
                  <span>{t.editor.scenesCount(timeline.scenes.length)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t.editor.wordsCount(totalSpokenWords)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {timeline.totalDurationSec}s ({timeline.totalFrames}f @ 30fps)
                  </span>
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
                    {t.editor.sceneBreakdownTitle(timeline.scenes.length)}
                  </h2>
                  <span className="text-xs text-amber-200/70 tabular-nums">
                    {t.editor.totalDuration(timeline.totalDurationSec)}
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
                            {scene.durationSec}s · {scene.background} ·{' '}
                            {t.editor.charactersInSceneCount(scene.characters.length)}
                          </span>
                        </div>
                        <p className="text-xs text-amber-100/85 line-clamp-2 leading-relaxed">
                          {scene.caption}
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
                      ? t.stage.thumbnailPreviewTitle(activePreset.width, activePreset.height)
                      : t.stage.stageTitle(previewAspect, activeScene.label)}
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
                      {t.stage.safeZonesBtn}
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
                      {t.stage.thumbnailModeBtn}
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
                      aria-label={isPlaying ? t.stage.pauseAria : t.stage.playAria}
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
                      aria-label={t.stage.restartAria}
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
                      aria-label={t.stage.scrubberAria}
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
                    <span>{t.stage.frameCounter(currentFrame, timeline.totalFrames)}</span>
                    <span>
                      {(currentFrame / timeline.fps).toFixed(2)}s / {timeline.totalDurationSec}s
                    </span>
                  </div>
                </div>
              </div>

              {/* VoiceStudio Audition Card (npm run say / voices) */}
              <div className="w-full border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-amber-50 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t.audition.title}</span>
                  </h3>
                  <span className="text-[11px] text-amber-200/70">
                    {t.audition.precedenceHint}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    aria-label={t.audition.textInputAria}
                    value={auditionText}
                    onChange={(e) => setAuditionText(e.target.value)}
                    className="col-span-2 rounded bg-[#120907] border border-[#3d2119] px-2.5 py-1.5 text-xs text-amber-50"
                  />
                  <input
                    type="text"
                    list="voicestudio-voice-list"
                    aria-label={t.audition.voiceInputAria}
                    value={auditionVoice}
                    onChange={(e) => setAuditionVoice(e.target.value)}
                    placeholder="Voice A"
                    className="rounded bg-[#120907] border border-[#3d2119] px-2.5 py-1.5 text-xs text-amber-50"
                  />
                  <datalist id="voicestudio-voice-list">
                    {voiceOptions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAuditionVoice}
                    disabled={isAuditioning}
                    className="px-3 py-1.5 bg-[#2a1510] hover:bg-[#381d16] text-amber-100 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    {isAuditioning ? t.audition.synthesizingBtn : t.audition.sayBtn}
                  </button>
                  {auditionAudioUrl && (
                    <audio
                      key={auditionAudioUrl}
                      src={auditionAudioUrl}
                      controls
                      className="h-7 flex-1"
                    />
                  )}
                </div>
              </div>
            </section>

            {/* RIGHT COLUMN (4 cols): Scene, Character Type & Voice Inspector + Rendered Output */}
            <section className="lg:col-span-4 space-y-6">
              <div className="border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-amber-50 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <span>{t.inspector.sceneTitle(activeScene.label)}</span>
                  </h2>
                  <span className="text-xs text-amber-200/70 tabular-nums">
                    {t.inspector.frameRange(activeScene.startFrame, activeScene.endFrame)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="scene-bg-select"
                      className="block text-xs text-amber-200/70 mb-1"
                    >
                      {t.inspector.backgroundLabel}
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
                      {t.inspector.transitionLabel}
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
                    {t.inspector.captionLabel}
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

                {/* Character Controls with Registry Type (blob / robot) & Voice */}
                <div className="space-y-3 pt-2 border-t border-[#3d2119]">
                  <div className="text-xs font-semibold text-amber-100">
                    {t.inspector.charactersHeader(activeScene.characters.length)}
                  </div>
                  {activeScene.characters.map((char, cIdx) => (
                    <div
                      key={char.id}
                      className="p-3 rounded-lg bg-[#120907]/80 border border-[#3d2119] space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-semibold text-amber-50">
                          {char.name} ({char.id})
                        </span>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={t.inspector.characterTypeAria(char.name)}
                            value={char.type || 'blob'}
                            onChange={(e) =>
                              updateActiveScene((s) => ({
                                ...s,
                                characters: s.characters.map((c, i) =>
                                  i === cIdx ? { ...c, type: e.target.value } : c
                                ),
                              }))
                            }
                            className="rounded bg-[#1d100c] border border-[#3d2119] px-2 py-0.5 text-[11px] text-amber-300 font-mono"
                          >
                            {registeredCharacters.map((rc) => (
                              <option key={rc.id} value={rc.id}>
                                type={rc.id}
                              </option>
                            ))}
                          </select>
                          <input
                            type="color"
                            aria-label={t.inspector.characterColorAria(char.name)}
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
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label
                            htmlFor={`emotion-${char.id}`}
                            className="block text-[11px] text-amber-200/70 mb-0.5"
                          >
                            {t.inspector.emotionLabel}
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
                            className="w-full rounded bg-[#1d100c] border border-[#3d2119] px-1.5 py-1 text-xs text-amber-100"
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
                            {t.inspector.accessoryLabel}
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
                            className="w-full rounded bg-[#1d100c] border border-[#3d2119] px-1.5 py-1 text-xs text-amber-100"
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
                            {t.inspector.animationLabel}
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
                            className="w-full rounded bg-[#1d100c] border border-[#3d2119] px-1.5 py-1 text-xs text-amber-100"
                          >
                            {AnimationTypeSchema.options.map((an) => (
                              <option key={an} value={an}>
                                {an}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`voice-${char.id}`}
                            className="block text-[11px] text-amber-200/70 mb-0.5"
                          >
                            {t.inspector.voiceLabel}
                          </label>
                          <input
                            id={`voice-${char.id}`}
                            type="text"
                            list="voicestudio-voice-list"
                            value={char.voice ?? timeline.voicesUsed?.[char.id] ?? 'alloy'}
                            onChange={(e) =>
                              updateActiveScene((s) => ({
                                ...s,
                                characters: s.characters.map((c, i) =>
                                  i === cIdx ? { ...c, voice: e.target.value } : c
                                ),
                              }))
                            }
                            className="w-full rounded bg-[#1d100c] border border-[#3d2119] px-1.5 py-1 text-xs text-amber-100"
                          />
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
                    {t.deliverables.title}
                  </h2>
                  <span className="text-xs text-amber-200/70">
                    {serverStatus?.ttsMode || t.deliverables.defaultTtsStatus}
                  </span>
                </div>

                {renderedVideoUrl ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-amber-200/70 mb-1">
                          {t.deliverables.videoLabel(
                            renderedMeta?.resolution ||
                              `${activePreset.width}×${activePreset.height}`
                          )}
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
                          <div className="text-xs text-amber-200/70 mb-1">
                            {t.deliverables.thumbnailLabel}
                          </div>
                          <img
                            src={renderedThumbUrl}
                            alt={t.deliverables.thumbnailAlt}
                            referrerPolicy="no-referrer"
                            className="w-full object-contain rounded-lg border border-[#3d2119] bg-[#120907]"
                          />
                        </div>
                      )}
                    </div>

                    {renderedAllRatios.length > 0 && (
                      <div className="pt-2 border-t border-[#3d2119] space-y-1.5">
                        <div className="text-xs font-semibold text-amber-400">
                          {t.deliverables.allRatiosHeader}
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
                          {renderedMeta.fps}fps · {renderedMeta.durationSec}s
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
                        <span>{t.deliverables.downloadVideoBtn}</span>
                      </a>
                      {renderedThumbUrl && (
                        <a
                          href={renderedThumbUrl}
                          download="thumbnail.png"
                          className="flex-1 py-2 px-3 bg-[#2a1510] hover:bg-[#381d16] text-amber-50 text-xs font-medium rounded-lg text-center flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{t.deliverables.downloadThumbnailBtn}</span>
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-lg bg-[#120907]/80 border border-[#3d2119] text-center space-y-3">
                    <p className="text-xs text-amber-200/70">{t.deliverables.emptyStatePrompt}</p>
                    <button
                      type="button"
                      onClick={() => handleRenderMp4(false)}
                      disabled={isRenderingVideo}
                      className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-[#1a0b08] font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      {isRenderingVideo
                        ? t.deliverables.renderingNowBtn
                        : t.deliverables.renderCurrentTimelineBtn}
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: ASSET & CHARACTER REGISTRY GALLERY (Blob + Robot + Props + Backgrounds) */}
        {activeTab === 'gallery' && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#3d2119] pb-5">
              <div>
                <h1 className="text-2xl font-bold text-amber-50 font-display">
                  {t.gallery.title}
                </h1>
                <p className="text-sm text-amber-200/70 mt-1">
                  {t.gallery.subtitlePrefix}{' '}
                  <code className="font-mono text-amber-300">src/characters/*.tsx</code>{' '}
                  {t.gallery.subtitleSuffix}
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
                  {isRenderingVideo
                    ? t.gallery.renderingGalleryBtn
                    : t.gallery.renderGalleryBtn}
                </span>
              </button>
            </div>

            {/* Section 1: Classic Squishy Blob ('blob') */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-amber-50">
                {t.gallery.blobSectionTitle}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3">
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
                      <svg viewBox="0 0 360 400" className="w-full h-36">
                        <Blob
                          id={`gal-blob-${emotion}`}
                          name={emotion.toUpperCase()}
                          color={color}
                          accessory={acc}
                          x={180}
                          y={210}
                          size={0.85}
                          emotion={emotion}
                          animation="bounce"
                          speaking={idx % 2 === 0}
                          voiceActive={true}
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

            {/* Section 2: BoxBot 3000 ('robot') */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-amber-50">
                {t.gallery.robotSectionTitle}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3">
                {EmotionSchema.options.map((emotion, idx) => {
                  const anim =
                    AnimationTypeSchema.options[idx % AnimationTypeSchema.options.length];
                  const color =
                    PALETTE_VARIATIONS[1].characterPalette[
                      idx % PALETTE_VARIATIONS[1].characterPalette.length
                    ];
                  return (
                    <div
                      key={`robot-${emotion}`}
                      className="border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-3 flex flex-col items-center"
                    >
                      <svg viewBox="0 0 360 400" className="w-full h-36">
                        <g transform="translate(180, 215)">
                          <RobotCharacterComponent
                            frame={currentFrame}
                            fps={30}
                            unit={1080}
                            emotion={emotion}
                            anim={anim}
                            speaking={idx % 2 === 0}
                            facing="right"
                            color={color}
                            accentColor="#facc15"
                            scale={0.82}
                            voiceActive={true}
                          />
                        </g>
                      </svg>
                      <div className="text-xs text-amber-100 font-medium mt-1">
                        {emotion} · {anim}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section 3: 8 Extensible Props Grid */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-amber-50">
                {t.gallery.propSectionTitle}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                {PropTypeSchema.options.map((propType) => (
                  <div
                    key={propType}
                    className="border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-3 flex flex-col items-center"
                  >
                    <svg viewBox="0 0 260 280" className="w-full h-32">
                      <Prop
                        id={`gal-prop-${propType}`}
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

            {/* Section 4: 6 SVG Stage Backgrounds */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-amber-50">
                {t.gallery.bgSectionTitle(previewAspect)}
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

        {/* TAB 3: BATCH SCRIPT RENDERING */}
        {activeTab === 'batch' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-4">
              <h1 className="text-lg font-bold text-amber-50 font-display flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <span>{t.batch.title}</span>
              </h1>
              <p className="text-xs text-amber-200/70 leading-relaxed">
                {t.batch.descriptionPrefix}{' '}
                <code className="text-amber-300 font-mono">
                  npm run batch -- examples
                </code>
                {t.batch.descriptionSuffix}
              </p>

              <div>
                <label
                  htmlFor="batch-paths-textarea"
                  className="block text-xs font-medium text-amber-100 mb-1.5"
                >
                  {t.batch.pathsLabel}
                </label>
                <textarea
                  id="batch-paths-textarea"
                  rows={5}
                  value={batchPathsText}
                  onChange={(e) => setBatchPathsText(e.target.value)}
                  className="w-full rounded-lg bg-[#120907] border border-[#3d2119] p-3 text-xs text-amber-50 font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleRunBatch}
                disabled={isRunningBatch}
                className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-[#1a0b08] font-semibold text-xs rounded-lg transition-colors cursor-pointer"
              >
                {isRunningBatch ? t.batch.runningBtn : t.batch.runBtn}
              </button>
            </div>

            <div className="lg:col-span-7 border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-amber-50">
                  {t.batch.resultsHeader(batchResults.length || PALETTE_VARIATIONS.length)}
                </h2>
                <span className="text-xs text-amber-200/70 font-mono">
                  npm run batch -- examples --mock-tts
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
                          #{item.index + 1} · {item.variation.name} ({item.source})
                        </div>
                        <div className="text-sm font-semibold text-amber-50">{item.topic}</div>
                        <div className="text-xs text-amber-200/70 tabular-nums">
                          {t.batch.itemStats(item.sceneCount, item.durationSec, item.totalFrames)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setTimeline(item.timeline);
                          setSelectedVariationId(item.variation.id);
                          setCurrentFrame(0);
                          setActiveTab('studio');
                        }}
                        className="px-3.5 py-2 bg-[#2a1510] hover:bg-[#381d16] text-amber-50 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {t.batch.openInStageBtn}
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
                          Sky: {v.skyTop} → {v.skyBottom} · Highlight: {v.captionHighlight}
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
                <span>{t.cli.title}</span>
              </h1>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-lg bg-[#120907] border border-[#3d2119] space-y-1">
                  <div className="font-semibold text-amber-400">{t.cli.step1Title}</div>
                  <code className="block font-mono text-amber-100">
                    npm run new -- &quot;What if Mom played on your Roblox account?&quot;
                  </code>
                  <code className="block font-mono text-amber-100">
                    npm run validate -- examples/demo.script.txt
                  </code>
                </div>

                <div className="p-3.5 rounded-lg bg-[#120907] border border-[#3d2119] space-y-1">
                  <div className="font-semibold text-amber-400">{t.cli.step2Title}</div>
                  <code className="block font-mono text-amber-100">
                    npm run make -- examples/demo.script.txt --aspect {selectedAspect} --mock-tts
                  </code>
                  <code className="block font-mono text-amber-100">
                    npm run render -- examples/demo.script.txt --mock-tts --aspect all
                  </code>
                </div>

                <div className="p-3.5 rounded-lg bg-[#120907] border border-[#3d2119] space-y-1">
                  <div className="font-semibold text-amber-400">{t.cli.step3Title}</div>
                  <code className="block font-mono text-amber-100">npm run voices</code>
                  <code className="block font-mono text-amber-100">
                    npm run say -- &quot;Hand it over, my turn!&quot; --voice &quot;Voice B&quot; --mock-tts
                  </code>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 border border-[#3d2119] bg-[#1d100c]/90 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-amber-50">
                  {t.cli.liveTimelineTitle(timeline.aspect)}
                </h2>
                <span className="text-xs text-amber-200/70 font-mono">
                  {t.cli.liveTimelineMeta(
                    timeline.scenes.length,
                    timeline.totalFrames,
                    timeline.seed
                  )}
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
