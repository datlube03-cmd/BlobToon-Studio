import React from 'react';
import { interpolate } from 'remotion';
import {
  AspectRatio,
  BoundingBox,
  SafeAreaBox,
  StageLayoutMetrics,
  computeBubblePlacement,
  computeStageLayout,
} from '../aspect';
import { getCharacterDefinition, BlobCharacterDef } from '../characters';
import { Caption, computeCaptionLayout } from '../characters/Caption';
import { Prop } from '../characters/Prop';
import { SpeechBubble } from '../characters/SpeechBubble';
import { AnimationType, Emotion, PaletteVariation, TransitionType } from '../script/schema';
import { SkillRenderParams } from '../skills/schema';
import { resolveVariationWithColorPalette } from '../timeline/builder';
import { TimelineScene } from '../timeline/schema';
import { Background } from './Background';

export interface SceneStageProps {
  scene: TimelineScene;
  variation: PaletteVariation;
  sceneFrame: number;
  fps: number;
  aspect?: AspectRatio;
  renderParams?: SkillRenderParams;
  showSafeZones?: boolean;
  thumbnailBannerTitle?: string;
}

function computeSceneTransitionStyle(
  transition: TransitionType,
  sceneFrame: number,
  durationInFrames: number,
  width: number,
  height: number
): { transform?: string; opacity: number; clipPath?: string } {
  const enterProgress = Math.min(1, sceneFrame / 9);
  const exitStart = Math.max(10, durationInFrames - 6);
  const exitProgress =
    sceneFrame >= exitStart ? Math.min(1, (sceneFrame - exitStart) / 6) : 0;

  const opacity = exitProgress > 0 ? interpolate(exitProgress, [0, 1], [1, 0.85]) : 1;
  const cx = width / 2;
  const cy = Math.round(height * 0.48);
  const maxRadius = Math.round(Math.hypot(width, height) * 0.85);

  switch (transition) {
    case 'hard-cut':
      return { opacity: 1 };
    case 'zoom': {
      const scale = interpolate(enterProgress, [0, 1], [1.14, 1]);
      return {
        transform: `translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})`,
        opacity,
      };
    }
    case 'slide': {
      const tx = interpolate(enterProgress, [0, 1], [Math.round(width * 0.12), 0]);
      return {
        transform: `translate(${tx}, 0)`,
        opacity,
      };
    }
    case 'wipe': {
      const ty = interpolate(enterProgress, [0, 1], [Math.round(height * 0.045), 0]);
      return {
        transform: `translate(0, ${ty})`,
        opacity,
      };
    }
    case 'iris': {
      const r = interpolate(enterProgress, [0, 1], [Math.round(maxRadius * 0.25), maxRadius]);
      return {
        clipPath: enterProgress < 1 ? `circle(${r}px at ${cx}px ${cy}px)` : undefined,
        opacity,
      };
    }
    case 'fade': {
      return {
        opacity: interpolate(enterProgress, [0, 1], [0.15, opacity]),
      };
    }
  }
}

export interface ResolvedCharacterBeatState {
  emotion: Emotion;
  animation: AnimationType;
  bubbleText?: string;
  xOverride?: number;
  yOverride?: number;
}

export function resolveCharacterBeatState(
  scene: TimelineScene,
  charId: string,
  defaultEmotion: Emotion,
  defaultAnimation: AnimationType,
  sceneProgress: number
): ResolvedCharacterBeatState {
  let emotion = defaultEmotion;
  let animation = defaultAnimation;
  let bubbleText: string | undefined;
  let xOverride: number | undefined;
  let yOverride: number | undefined;

  for (const beat of scene.beats) {
    if (beat.targetId !== charId) continue;
    if (sceneProgress >= beat.atProgress && sceneProgress <= beat.atProgress + 0.34) {
      if (beat.emotion) emotion = beat.emotion;
      if (beat.animation) animation = beat.animation;
      if (beat.bubbleText) bubbleText = beat.bubbleText;
      if (beat.x !== undefined) xOverride = beat.x;
      if (beat.y !== undefined) yOverride = beat.y;
    }
  }

  return { emotion, animation, bubbleText, xOverride, yOverride };
}

/**
 * Computes all rendered text & UI bounding boxes for a given scene, aspect ratio, and frame.
 * Used by automated aspect-ratio tests to verify zero boxes leave the safe area.
 */
export function collectSceneBoundingBoxes(
  scene: TimelineScene,
  aspect: AspectRatio,
  sceneFrame: number
): { stageLayout: StageLayoutMetrics; safeArea: SafeAreaBox; boxes: BoundingBox[] } {
  const stageLayout = computeStageLayout(
    aspect,
    scene.characters,
    scene.props,
    scene.layoutOverrides?.[aspect]
  );
  const boxes: BoundingBox[] = [];

  // 1. Chapter Badge Box
  boxes.push(stageLayout.chapterBadge.box);

  // 2. Caption Box
  const captionInfo = computeCaptionLayout(scene.words, sceneFrame, stageLayout);
  if (captionInfo) {
    boxes.push(captionInfo.backdropBox);
  }

  // 3. Active Speech Bubbles & Nameplates
  const sceneProgress = sceneFrame / Math.max(1, scene.durationInFrames);

  scene.characters.forEach((char) => {
    const cLayout = stageLayout.characters.get(char.id);
    if (!cLayout) return;

    boxes.push(cLayout.nameTagBox);

    const beatState = resolveCharacterBeatState(
      scene,
      char.id,
      char.emotion,
      char.animation,
      sceneProgress
    );

    if (beatState.bubbleText) {
      const bubblePlacement = computeBubblePlacement(beatState.bubbleText, cLayout, stageLayout);
      boxes.push(bubblePlacement.box);
    }
  });

  // 4. Prop label boxes
  stageLayout.props.forEach((p) => {
    if (p.labelBox) {
      boxes.push(p.labelBox);
    }
  });

  return {
    stageLayout,
    safeArea: stageLayout.safeArea,
    boxes,
  };
}

export const SceneStage: React.FC<SceneStageProps> = ({
  scene,
  variation: rawVariation,
  sceneFrame,
  fps,
  aspect = '9:16',
  renderParams,
  showSafeZones = false,
  thumbnailBannerTitle,
}) => {
  const variation = resolveVariationWithColorPalette(rawVariation, renderParams?.colorPalette);
  const effectiveTransition = renderParams?.transitionType ?? scene.transition;
  const cameraShake = renderParams?.cameraShake ?? 'none';
  const zoomPunchOnPunchline = renderParams?.zoomPunchOnPunchline ?? false;
  const captionStyle = renderParams?.captionStyle ?? 'default';

  const stageLayout = computeStageLayout(
    aspect,
    scene.characters,
    scene.props,
    scene.layoutOverrides?.[aspect]
  );
  const { width, height, unit, safeArea, groundY, chapterBadge } = stageLayout;
  const u = unit / 1080;

  const sceneProgress = sceneFrame / Math.max(1, scene.durationInFrames);
  const voiceActiveFrames = Math.round(scene.voiceDurationSec * fps);
  const isVoiceActive = sceneFrame <= voiceActiveFrames;

  const isPunchlineMoment =
    zoomPunchOnPunchline &&
    (sceneProgress >= 0.58 || scene.beats.some((b) => Math.abs(sceneProgress - b.atProgress) <= 0.12));

  const trans = computeSceneTransitionStyle(
    effectiveTransition,
    sceneFrame,
    scene.durationInFrames,
    width,
    height
  );

  const shakeAmp =
    cameraShake === 'high'
      ? 14 * u
      : cameraShake === 'medium'
      ? 7.5 * u
      : cameraShake === 'low'
      ? 3.5 * u
      : 0;
  const shakeDx = shakeAmp ? Number((Math.sin(sceneFrame * 1.85) * shakeAmp).toFixed(2)) : 0;
  const shakeDy = shakeAmp ? Number((Math.cos(sceneFrame * 2.35) * shakeAmp * 0.75).toFixed(2)) : 0;
  const punchScale = isPunchlineMoment
    ? Number((1 + Math.sin(sceneFrame * 0.45) * 0.035 + 0.045).toFixed(3))
    : 1;

  const cx = width / 2;
  const cy = Math.round(height * 0.48);
  const skillCameraTransform =
    shakeDx !== 0 || shakeDy !== 0 || punchScale !== 1
      ? `translate(${cx + shakeDx}, ${cy + shakeDy}) scale(${punchScale}) translate(${-cx}, ${-cy})`
      : undefined;
  const combinedTransform =
    [trans.transform, skillCameraTransform].filter(Boolean).join(' ') || undefined;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      data-aspect={aspect}
      data-transition={effectiveTransition}
      data-camera-shake={cameraShake}
      data-caption-style={captionStyle}
      style={{
        display: 'block',
        backgroundColor: variation.skyTop,
        userSelect: 'none',
      }}
    >
      <g transform={combinedTransform} opacity={trans.opacity} clipPath={trans.clipPath}>
        {/* 1. Procedural Vector Environment Background */}
        <Background
          type={scene.background}
          variation={variation}
          frame={sceneFrame}
          width={width}
          height={height}
          unit={unit}
          groundY={groundY}
          cameraShake={cameraShake}
          zoomPunchActive={isPunchlineMoment}
          colorPalette={renderParams?.colorPalette}
          bgColors={scene.bgColors}
        />

        {/* 2. Scene Chapter Badge (Top Safe Area) */}
        {!thumbnailBannerTitle && (
          <g id="scene-label-badge">
            <rect
              x={chapterBadge.box.left}
              y={chapterBadge.box.top}
              width={chapterBadge.width}
              height={chapterBadge.height}
              rx={Math.round(chapterBadge.height / 2)}
              fill="rgba(2, 6, 23, 0.82)"
              stroke={variation.wallAccent}
              strokeWidth={Math.max(3, Math.round(4 * u))}
            />
            <circle
              cx={chapterBadge.box.left + Math.round(32 * u)}
              cy={chapterBadge.y}
              r={Math.round(8 * u)}
              fill="#f43f5e"
            />
            <text
              x={chapterBadge.x + Math.round(12 * u)}
              y={chapterBadge.y + Math.round(chapterBadge.fontSize * 0.34)}
              textAnchor="middle"
              fill="#f8fafc"
              fontSize={chapterBadge.fontSize}
              fontWeight="800"
              fontFamily="JetBrains Mono, monospace"
              letterSpacing={1.5}
            >
              {scene.label.slice(0, 14).toUpperCase()}
            </text>
          </g>
        )}

        {/* 3. Interactive Stage Props */}
        {scene.props.map((prop) => {
          const pLayout = stageLayout.props.get(prop.id);
          const px = pLayout ? pLayout.x : Math.round(prop.x * width);
          const py = pLayout ? pLayout.y : Math.round(prop.y * height);
          const pScale = pLayout ? pLayout.scale : prop.scale;

          return (
            <Prop
              key={prop.id}
              id={prop.id}
              type={prop.type}
              x={px}
              y={py}
              scale={pScale}
              rotation={prop.rotation}
              animation={prop.animation}
              label={prop.label}
              frame={sceneFrame}
              fps={fps}
              unit={unit}
            />
          );
        })}

        {/* 4. Plug-in Characters (Blob, Robot, or any registered character) + Speech Bubbles */}
        {scene.characters.map((char, idx) => {
          const cLayout = stageLayout.characters.get(char.id);
          const charDef = getCharacterDefinition(char.type || 'blob') ?? BlobCharacterDef;
          const CharComponent = charDef.Component;
          // cLayout.size already includes (unit / 1080) scaling, while CharComponent multiplies by (unit / 1080) * scale
          const cScale = cLayout ? Number((cLayout.size / (unit / 1080)).toFixed(3)) : char.size;
          const anchors = charDef.anchors(unit, cScale);

          const beatState = resolveCharacterBeatState(
            scene,
            char.id,
            char.emotion,
            char.animation,
            sceneProgress
          );

          const px =
            beatState.xOverride !== undefined
              ? Math.max(
                  safeArea.left + Math.round(100 * u),
                  Math.min(safeArea.right - Math.round(100 * u), Math.round(beatState.xOverride * width))
                )
              : cLayout
              ? cLayout.x
              : Math.round(char.x * width);
          const py =
            beatState.yOverride !== undefined
              ? Math.max(
                  safeArea.top + Math.round(120 * u),
                  Math.min(safeArea.bottom - Math.round(120 * u), Math.round(beatState.yOverride * height))
                )
              : cLayout
              ? cLayout.y
              : Math.round(char.y * height);

          const npHalfW = Math.round(84 * u);
          const npLeft = Math.max(safeArea.left, Math.min(safeArea.right - npHalfW * 2, px - npHalfW));
          const npCenterX = npLeft + npHalfW;
          const npTop = Math.min(
            safeArea.bottom - Math.round(44 * u),
            py + anchors.feet.y + Math.round(20 * u)
          );

          const bubblePlacement =
            beatState.bubbleText && cLayout
              ? computeBubblePlacement(
                  beatState.bubbleText,
                  { ...cLayout, x: px, y: py },
                  stageLayout
                )
              : undefined;

          return (
            <g key={char.id}>
              <g id={`character-${char.id}`} data-char-type={charDef.id} transform={`translate(${px}, ${py})`}>
                <CharComponent
                  frame={sceneFrame}
                  fps={fps}
                  unit={unit}
                  emotion={beatState.emotion}
                  anim={beatState.animation}
                  speaking={char.speaking}
                  facing={char.flipX ? 'left' : 'right'}
                  color={char.color}
                  accentColor={char.accentColor ?? char.hoodieColor ?? variation.wallAccent}
                  scale={cScale}
                  accessory={char.accessory}
                  seed={idx * 11}
                  voiceActive={isVoiceActive}
                />
              </g>

              {/* Character Nameplate anchored via feet anchor */}
              <g transform={`translate(${npCenterX}, ${npTop + Math.round(20 * u)})`}>
                <rect
                  x={-npHalfW}
                  y={-Math.round(20 * u)}
                  width={npHalfW * 2}
                  height={Math.round(40 * u)}
                  rx={Math.round(12 * u)}
                  fill="rgba(2, 6, 23, 0.78)"
                  stroke="rgba(255, 255, 255, 0.16)"
                  strokeWidth={Math.max(2, Math.round(2 * u))}
                />
                <text
                  x={0}
                  y={Math.round(7 * u)}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize={Math.round(23 * u)}
                  fontWeight="800"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  {char.name.slice(0, 12)}
                </text>
              </g>

              {/* Comic Speech Bubble */}
              {bubblePlacement && !thumbnailBannerTitle ? (
                <SpeechBubble
                  text={beatState.bubbleText!}
                  placement={bubblePlacement}
                  frame={sceneFrame}
                  fps={fps}
                  unit={unit}
                />
              ) : null}
            </g>
          );
        })}

        {/* 5. Burned-In Word-by-Word Highlighted Caption OR Thumbnail Hook Banner */}
        {thumbnailBannerTitle ? (
          <g id="thumbnail-title-banner">
            <rect
              x={safeArea.left}
              y={safeArea.top + Math.round(10 * u)}
              width={safeArea.width}
              height={Math.round(230 * u)}
              rx={Math.round(32 * u)}
              fill="rgba(2, 6, 23, 0.94)"
              stroke={variation.captionHighlight}
              strokeWidth={Math.round(10 * u)}
            />
            <text
              x={width / 2}
              y={safeArea.top + Math.round(92 * u)}
              textAnchor="middle"
              fill={variation.captionHighlight}
              fontSize={Math.round(38 * u)}
              fontWeight="900"
              fontFamily="Plus Jakarta Sans, sans-serif"
              letterSpacing={2}
            >
              WHAT IF...
            </text>
            <text
              x={width / 2}
              y={safeArea.top + Math.round(156 * u)}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={Math.round(42 * u)}
              fontWeight="900"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              {thumbnailBannerTitle.slice(0, 32).toUpperCase()}
            </text>
            {thumbnailBannerTitle.length > 32 && (
              <text
                x={width / 2}
                y={safeArea.top + Math.round(208 * u)}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={Math.round(40 * u)}
                fontWeight="900"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                {thumbnailBannerTitle.slice(32, 64).toUpperCase()}
              </text>
            )}
          </g>
        ) : (
          <Caption
            words={scene.words}
            sceneFrame={sceneFrame}
            layout={stageLayout}
            highlightColor={variation.captionHighlight}
            captionStyle={captionStyle}
            fontFamily={renderParams?.fontFamily}
          />
        )}

        {/* Optional Safe-Area Overlay for Developer Inspection */}
        {showSafeZones && (
          <g id="safe-zone-guides" opacity={0.55}>
            <rect
              x={safeArea.left}
              y={safeArea.top}
              width={safeArea.width}
              height={safeArea.height}
              fill="none"
              stroke="#22c55e"
              strokeWidth={Math.max(2, Math.round(4 * u))}
              strokeDasharray="16 12"
            />
          </g>
        )}
      </g>
    </svg>
  );
};
