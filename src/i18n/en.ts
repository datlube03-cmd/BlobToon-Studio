import type { UiDictionary } from './vi';

export const en: UiDictionary = {
  brandTitle: 'BlobToon Studio',
  nav: {
    studio: 'Script Editor (.script.txt)',
    gallery: 'Character Registry (Blob & Robot)',
    batch: 'Batch Renderer',
    cli: 'CLI Commands & JSON Schema',
  },
  header: {
    aspectLabel: 'Select aspect ratio',
    allAspectsOption: 'All (4 ratios)',
    sfxMuteAria: 'Mute sound effects',
    sfxUnmuteAria: 'Enable sound effects',
    sfxOn: 'SFX ON',
    sfxOff: 'SFX OFF',
    sfxVolumeAria: 'SFX volume',
    renderingBtn: 'Rendering MP4...',
    renderBtn: 'Render MP4 & Thumbnail',
    langToggleAria: 'Switch UI language',
  },
  banner: {
    close: 'Close',
  },
  notices: {
    emptyScriptError:
      'Please enter script content (.script.txt) before compiling the Timeline.',
    compileFailedError: 'Script compilation failed',
    compileSuccess: (scenes: number, sec: number, aspect: string, provider: string) =>
      `Valid! Built ${scenes} scenes (${sec}s, aspect ${aspect}) with ${provider} TTS.`,
    compileFallbackSuccess: (scenes: number, sec: number) =>
      `Validated and built ${scenes} scenes (${sec}s) locally in browser.`,
    saveProjectFailed: 'Failed to save project',
    saveProjectSuccess: (filePath: string) => `Saved script to ${filePath}`,
    auditionFailed: 'Failed to synthesize voice preview',
    auditionSuccess: (voice: string, sec: number, provider: string) =>
      `Synthesized voice preview "${voice}" (${sec}s via ${provider}).`,
    renderingAllAspects:
      'Rendering all 4 aspect ratios (9:16, 16:9, 4:3, 3:4) at 30fps...',
    renderingGallery: (w: number, h: number) =>
      `Rendering Gallery Showcase Video (${w}x${h} @ 30fps)...`,
    renderingSingle: (w: number, h: number, aspect: string) =>
      `Rendering ${w}x${h} (${aspect}) @ 30fps MP4 + Thumbnail PNG...`,
    renderFailed: 'Render failed',
    renderAllSuccess:
      'Rendered all 4 aspect ratios (out_9x16.mp4, out_16x9.mp4, out_4x3.mp4, out_3x4.mp4) and thumbnails.',
    renderSingleSuccess: (w: number, h: number, aspect: string, fps: number, sec: number) =>
      `Rendered ${w}x${h} (${aspect}) ${fps}fps MP4 (${sec}s) and Thumbnail PNG.`,
    emptyBatchPathsError:
      'Please enter at least one script file path (.script.txt / .script.json).',
    batchFailedError: 'Batch run failed',
  },
  editor: {
    sectionTitle: 'Manual Script Editor (.script.txt)',
    projectSelectLabel: 'Open demo template or project in projects/<slug>/script.txt',
    addSceneBtn: '+ New Scene',
    addLineBtn: '+ Dialogue Line',
    saveProjectBtn: 'Save to projects/',
    paletteLabel: 'Lacquer Color Palette',
    skillLabel: 'Skill Render Params',
    defaultSkillOption: 'Default (Standard)',
    compilingBtn: 'Validating syntax & synthesizing TTS...',
    compileBtn: 'Validate Syntax & Build Timeline',
    scenesCount: (count: number) => `${count} Scenes`,
    wordsCount: (count: number) => `${count} Words`,
    sceneBreakdownTitle: (count: number) => `Scenes in Script (${count})`,
    totalDuration: (sec: number) => `Total ${sec}s`,
    charactersInSceneCount: (count: number) => `${count} chars`,
  },
  stage: {
    thumbnailPreviewTitle: (w: number, h: number) => `Thumbnail (${w}×${h})`,
    stageTitle: (aspect: string, label: string) => `Stage (${aspect}): ${label}`,
    safeZonesBtn: 'Safe Zones',
    thumbnailModeBtn: 'Preview Thumbnail',
    pauseAria: 'Pause preview',
    playAria: 'Play preview',
    restartAria: 'Restart from frame 0',
    scrubberAria: 'Timeline frame scrubber',
    frameCounter: (current: number, total: number) => `Frame ${current} / ${total}`,
  },
  audition: {
    title: 'VoiceStudio Audition (npm run say)',
    precedenceHint: 'line > char > script > env',
    textInputAria: 'Audition dialogue line',
    voiceInputAria: 'VoiceStudio voice name',
    synthesizingBtn: 'Synthesizing...',
    sayBtn: 'Audition Voice (Say)',
  },
  inspector: {
    sceneTitle: (label: string) => `Edit Scene: ${label}`,
    frameRange: (start: number, end: number) => `Frames ${start}–${end}`,
    backgroundLabel: 'SVG Background',
    transitionLabel: 'Scene Transition',
    captionLabel: 'Narration & Word-by-Word Highlighted Caption (Fredoka OFL)',
    charactersHeader: (count: number) => `Characters in Scene (${count})`,
    characterTypeAria: (name: string) => `Character type for ${name}`,
    characterColorAria: (name: string) => `Color for character ${name}`,
    emotionLabel: 'Emotion',
    accessoryLabel: 'Accessory',
    animationLabel: 'Animation',
    voiceLabel: 'Voice',
  },
  deliverables: {
    title: 'Rendered Deliverables (out/)',
    defaultTtsStatus: 'MockProvider Ready',
    videoLabel: (res: string) => `MP4 Video (${res})`,
    thumbnailLabel: 'Thumbnail PNG',
    thumbnailAlt: 'Rendered thumbnail',
    allRatiosHeader: 'Rendered all 4 aspect ratios:',
    downloadVideoBtn: 'Download MP4',
    downloadThumbnailBtn: 'Download Thumbnail PNG',
    emptyStatePrompt:
      'Select an aspect ratio (`9:16`, `16:9`, `4:3`, `3:4`, or `All`) and click "Render MP4 & Thumbnail" to mux audio and export deliverables.',
    renderingNowBtn: 'Rendering...',
    renderCurrentTimelineBtn: 'Render Current Timeline',
  },
  gallery: {
    title: 'Character Registry via defineCharacter (Blob & Robot) & SVG Props',
    subtitlePrefix: 'Every character in',
    subtitleSuffix:
      'is automatically registered with normalized anchors (feet, head, bubble) across all aspect ratios.',
    renderingGalleryBtn: 'Rendering gallery showcase...',
    renderGalleryBtn: 'Render Gallery Showcase Video',
    blobSectionTitle: '01. `blob` Character (Classic Squishy Blob — `src/characters/Blob.tsx`)',
    robotSectionTitle: '02. `robot` Character (BoxBot 3000 Square Robot — `src/characters/Robot.tsx`)',
    propSectionTitle: '03. Extensible Prop Registry (`defineProp` — 8 Animated SVG Props)',
    bgSectionTitle: (aspect: string) => `04. Six Multi-Aspect Stage Backgrounds (${aspect})`,
  },
  batch: {
    title: 'Batch Render from Script Files (.script.txt / .script.json)',
    descriptionPrefix: 'Enter script file paths (one per line) or run',
    descriptionSuffix: '. Each script receives a distinct color palette variation.',
    pathsLabel: 'Script File Paths (One per line)',
    runningBtn: 'Building batch timelines...',
    runBtn: 'Build Batch Timelines from Script List',
    resultsHeader: (count: number) => `Batch Results (${count} Palettes)`,
    itemStats: (scenes: number, sec: number, frames: number) =>
      `${scenes} scenes · ${sec}s · ${frames} frames`,
    openInStageBtn: 'Open in Stage',
  },
  cli: {
    title: 'Manual CLI Pipeline (Script In → Video Out)',
    step1Title: '1. Scaffold New Project & Validate Script Syntax',
    step2Title: '2. Render Script to MP4 + Thumbnail + Meta JSON',
    step3Title: '3. List Voices & Audition VoiceStudio',
    liveTimelineTitle: (aspect: string) => `Live Timeline JSON (${aspect})`,
    liveTimelineMeta: (scenes: number, frames: number, seed: number) =>
      `${scenes} scenes · ${frames} frames · seed ${seed}`,
  },
};
