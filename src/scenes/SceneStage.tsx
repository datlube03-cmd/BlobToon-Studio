import React from 'react';
import { interpolate } from 'remotion';
import {
  AspectRatio,
  BoundingBox,
  computeBubblePlacement,
  computeStageLayout,
  measureTextWidth,
} from '../aspect';
import { PaletteVariation } from '../script/schema';
import { SkillRenderParams } from '../skills/schema';
import { TimelineScene } from '../timeline/schema';
import { Blob } from '../characters/Blob';
import { Caption, computeCaptionLayout } from '../characters/Caption';
import { Prop } from '../characters/Prop';
import { SpeechBubble } from '../characters/SpeechBubble';
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

/**
 * Computes all active text/UI bounding boxes in a scene at `sceneFrame` for `aspect`.
 * Used by unit tests to guarantee that no text box or bubble ever leaves `safeArea`.
 */
export function collectSceneBoundingBoxes(
  scene: TimelineScene,
  aspect: AspectRatio,
  sceneFrame: number,
  thumbnailBannerTitle?: string
): {
  boxes: BoundingBox[];
  safeArea: ReturnType<typeof computeStageLayout>['safeArea'];
} {
  const override = scene.layoutOverrides?.[aspect];
  const layout = computeStageLayout(aspect, scene.characters, scene.props, override);
  const boxes: BoundingBox[] = [];

  if (!thumbnailBannerTitle) {
    boxes.push(layout.chapterBadge.box);
    const cap = computeCaptionLayout(scene.words, sceneFrame, layout);
    if (cap) {
      boxes.push(cap.backdropBox);
      for (const item of cap.items) {
        boxes.push(item.box);
      }
    }
  } else {
    const thumbBox = computeThumbnailBannerBox(layout);
    boxes.push(thumbBox);
  }

  // Character nameplates & active speech bubbles
  const progress = Math.max(0, Math.min(1, sceneFrame / Math.max(1, scene.durationInFrames)));
  for (const char of scene.characters) {
    const placement = layout.characters.get(char.id);
    if (!placement) continue;
    boxes.push(placement.nameTagBox);

    for (const beat of scene.beats) {
      if (
        beat.targetId === char.id &&
        beat.bubbleText &&
        progress >= beat.atProgress &&
        progress <= beat.atProgress + 0.42
      ) {
        const bubble = computeBubblePlacement(beat.bubbleText, placement, layout);
        boxes.push(bubble.box);
      }
    }
  }

  for (const prop of scene.props) {
    const prPlacement = layout.props.get(prop.id);
    if (prPlacement?.labelBox) {
      boxes.push(prPlacement.labelBox);
    }
  }

  return { boxes, safeArea: layout.safeArea };
}

function computeThumbnailBannerBox(layout: ReturnType<typeof computeStageLayout>): BoundingBox {
  const { safeArea, unit } = layout;
  const u = unit / 1080;
  const bannerW = Math.min(Math.round(safeArea.width * 0.92), Math.round(920 * u));
  const bannerH = Math.round(240 * u);
  const cx = safeArea.centerX;
  const topY = Math.round(safeArea.top + 38 * u);
  return {
    id: 'thumbnail-banner',
    kind: 'thumbnail-title',
    left: Math.round(cx - bannerW / 2),
    top: Math.round(topY - 28 * u),
    right: Math.round(cx + bannerW / 2),
    bottom: Math.round(topY + bannerH),
  };
}

export const SceneStage: React.FC<SceneStageProps> = ({
  scene,
  variation,
  sceneFrame,
  fps,
  aspect = '9:16',
  renderParams,
  showSafeZones = false,
  thumbnailBannerTitle,
}) => {
  const override = scene.layoutOverrides?.[aspect];
  const layout = computeStageLayout(aspect, scene.characters, scene.props, override);
  const { width, height, unit, groundY, safeArea, chapterBadge } = layout;
  const u = unit / 1080;

  const progress = Math.max(0, Math.min(1, sceneFrame / Math.max(1, scene.durationInFrames)));
  const isVoiceActive = sceneFrame <= scene.voiceDurationSec * fps;

  const effectiveTransition = renderParams?.transitionType ?? scene.transition;
  const cameraShake = renderParams?.cameraShake ?? 'none';
  const zoomPunchOnPunchline = renderParams?.zoomPunchOnPunchline ?? false;
  const captionStyle = renderParams?.captionStyle ?? 'default';

  // Aspect-aware transition entrance during first 10 frames (skipped when transitionType is 'hard-cut')
  const transitionFrames = effectiveTransition === 'hard-cut' ? 0 : 10;
  const inTransition = sceneFrame < transitionFrames && !thumbnailBannerTitle;
  const transT = transitionFrames > 0 ? Math.min(1, sceneFrame / transitionFrames) : 1;

  // Punchline zoom-punch effect when zoomPunchOnPunchline is enabled
  const lastBeatProgress =
    scene.beats.length > 0 ? scene.beats[scene.beats.length - 1].atProgress : 0.6;
  const punchStart = Math.max(0.45, lastBeatProgress);
  const zoomPunchActive =
    zoomPunchOnPunchline && !thumbnailBannerTitle && progress >= punchStart;
  const zoomPunchScale = zoomPunchActive
    ? interpolate(
        Math.min(1, (progress - punchStart) / Math.max(0.08, 1 - punchStart)),
        [0, 0.35, 1],
        [1.0, 1.11, 1.07]
      )
    : 1.0;

  // Deterministic camera shake from renderParams.cameraShake
  const shakeAmplitude =
    cameraShake === 'high'
      ? 14 * u
      : cameraShake === 'medium'
      ? 7.5 * u
      : cameraShake === 'low'
      ? 3.2 * u
      : 0;
  const shakeDx =
    shakeAmplitude && !thumbnailBannerTitle
      ? Number((Math.sin(sceneFrame * 1.85) * shakeAmplitude).toFixed(2))
      : 0;
  const shakeDy =
    shakeAmplitude && !thumbnailBannerTitle
      ? Number((Math.cos(sceneFrame * 2.35) * shakeAmplitude * 0.75).toFixed(2))
      : 0;

  const transformParts: string[] = [];
  if (inTransition) {
    if (effectiveTransition === 'zoom') {
      const s = interpolate(transT, [0, 1], [1.14, 1.0]);
      transformParts.push(
        `translate(${(width / 2) * (1 - s)}, ${(height / 2) * (1 - s)}) scale(${s})`
      );
    } else if (effectiveTransition === 'slide') {
      const tx = interpolate(transT, [0, 1], [width, 0]);
      transformParts.push(`translate(${tx}, 0)`);
    }
  }
  if (zoomPunchScale > 1.001) {
    transformParts.push(
      `translate(${((width / 2) * (1 - zoomPunchScale)).toFixed(2)}, ${(
        groundY *
        0.85 *
        (1 - zoomPunchScale)
      ).toFixed(2)}) scale(${zoomPunchScale.toFixed(4)})`
    );
  }
  if (shakeDx !== 0 || shakeDy !== 0) {
    transformParts.push(`translate(${shakeDx}, ${shakeDy})`);
  }
  const stageTransform = transformParts.join(' ');
  const stageOpacity =
    inTransition && effectiveTransition === 'fade'
      ? interpolate(transT, [0, 1], [0.25, 1.0])
      : 1.0;

  // Evaluate active beats up to current progress
  const activeBeatsByChar = new Map<
    string,
    {
      emotion?: TimelineScene['characters'][0]['emotion'];
      animation?: TimelineScene['characters'][0]['animation'];
      bubbleText?: string;
      beatFrameStart: number;
    }
  >();

  for (const beat of scene.beats) {
    if (progress >= beat.atProgress) {
      const beatFrameStart = Math.round(beat.atProgress * scene.durationInFrames);
      activeBeatsByChar.set(beat.targetId, {
        emotion: beat.emotion,
        animation: beat.animation,
        bubbleText: progress <= beat.atProgress + 0.42 ? beat.bubbleText : undefined,
        beatFrameStart,
      });
    }
  }

  const thumbBox = computeThumbnailBannerBox(layout);
  const thumbW = thumbBox.right - thumbBox.left;
  const thumbH = thumbBox.bottom - thumbBox.top - Math.round(28 * u);
  const thumbCenterY = Math.round(thumbBox.top + 28 * u + thumbH / 2);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', display: 'block', background: variation.floorColor }}
      data-transition={effectiveTransition}
      data-camera-shake={cameraShake}
      data-caption-style={captionStyle}
    >
      <g transform={stageTransform || undefined} opacity={stageOpacity < 1 ? stageOpacity : undefined}>
        {/* 1. Aspect-Adaptive Background Environment */}
        <Background
          type={scene.background}
          variation={variation}
          frame={sceneFrame}
          width={width}
          height={height}
          unit={unit}
          groundY={groundY}
          cameraShake={cameraShake}
          zoomPunchActive={zoomPunchActive}
        />

        {/* 2. Top Chapter Label Badge */}
        {!thumbnailBannerTitle && (
          <g transform={`translate(${chapterBadge.x}, ${chapterBadge.y})`}>
            <rect
              x={-chapterBadge.width / 2}
              y={-chapterBadge.height / 2}
              width={chapterBadge.width}
              height={chapterBadge.height}
              rx={Math.round(18 * u)}
              fill="#0f172a"
              stroke={variation.wallAccent}
              strokeWidth={Math.max(4, Math.round(6 * u))}
            />
            <text
              x={0}
              y={Math.round(chapterBadge.fontSize * 0.34)}
              textAnchor="middle"
              fill={variation.captionHighlight}
              fontSize={chapterBadge.fontSize}
              fontWeight="800"
              fontFamily="Bricolage Grotesque, sans-serif"
              letterSpacing="1.5"
            >
              {scene.label.toUpperCase()}
            </text>
          </g>
        )}

        {/* 3. Scene Props */}
        {scene.props.map((prop) => {
          const prPlacement = layout.props.get(prop.id);
          if (!prPlacement) return null;
          return (
            <Prop
              key={prop.id}
              type={prop.type}
              x={prPlacement.x}
              y={prPlacement.y}
              scale={prPlacement.scale}
              rotation={prop.rotation}
              animation={prop.animation}
              label={prop.label}
              frame={sceneFrame}
              fps={fps}
            />
          );
        })}

        {/* 4. Blob Characters & Clamped Speech Bubbles */}
        {scene.characters.map((char) => {
          const placement = layout.characters.get(char.id);
          if (!placement) return null;
          const beatOverride = activeBeatsByChar.get(char.id);
          const emotion = beatOverride?.emotion ?? char.emotion;
          const animation = beatOverride?.animation ?? char.animation;
          const bubblePlacement = beatOverride?.bubbleText
            ? computeBubblePlacement(beatOverride.bubbleText, placement, layout)
            : null;

          return (
            <React.Fragment key={char.id}>
              <Blob
                id={char.id}
                name={char.name}
                color={char.color}
                accessory={char.accessory}
                hoodieColor={char.hoodieColor ?? variation.wallAccent}
                size={placement.size}
                x={placement.x}
                y={placement.y}
                emotion={emotion}
                animation={animation}
                speaking={char.speaking}
                isVoiceActive={isVoiceActive}
                flipX={char.flipX}
                frame={sceneFrame}
                fps={fps}
              />
              {beatOverride?.bubbleText && bubblePlacement && (
                <SpeechBubble
                  text={beatOverride.bubbleText}
                  placement={bubblePlacement}
                  frame={Math.max(0, sceneFrame - beatOverride.beatFrameStart)}
                  fps={fps}
                  unit={unit}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* 5. Word-by-word Highlighted Burned-in Captions (Wrapped by Measured Width) */}
        {!thumbnailBannerTitle && (
          <Caption
            words={scene.words}
            sceneFrame={sceneFrame}
            layout={layout}
            highlightColor={variation.captionHighlight}
            captionStyle={captionStyle}
          />
        )}

        {/* 6. Thumbnail Title Poster Overlay */}
        {thumbnailBannerTitle && (
          <g transform={`translate(${safeArea.centerX}, ${thumbCenterY})`}>
            <rect
              x={-thumbW / 2}
              y={-thumbH / 2}
              width={thumbW}
              height={thumbH}
              rx={Math.round(28 * u)}
              fill="#0f172a"
              stroke={variation.captionHighlight}
              strokeWidth={Math.max(6, Math.round(10 * u))}
            />
            <rect
              x={-Math.round(150 * u)}
              y={-thumbH / 2 - Math.round(28 * u)}
              width={Math.round(300 * u)}
              height={Math.round(54 * u)}
              rx={Math.round(16 * u)}
              fill="#ef4444"
              stroke="#0f172a"
              strokeWidth={Math.max(4, Math.round(7 * u))}
            />
            <text
              x={0}
              y={-thumbH / 2 + Math.round(8 * u)}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={Math.round(28 * u)}
              fontWeight="800"
              fontFamily="Bricolage Grotesque, sans-serif"
            >
              WHAT IF...
            </text>
            {wrapTitleByMeasuredWidth(
              thumbnailBannerTitle,
              thumbW - Math.round(64 * u),
              Math.round(46 * u)
            ).map((line, i, arr) => {
              const lineFontSize = Math.round(46 * u);
              const lineGap = Math.round(56 * u);
              const startY = Math.round(12 * u - ((arr.length - 1) * lineGap) / 2);
              return (
                <text
                  key={i}
                  x={0}
                  y={startY + i * lineGap}
                  textAnchor="middle"
                  fill="#ffffff"
                  stroke="#0f172a"
                  strokeWidth={Math.max(5, Math.round(8 * u))}
                  paintOrder="stroke fill"
                  fontSize={lineFontSize}
                  fontWeight="800"
                  fontFamily="Bricolage Grotesque, sans-serif"
                >
                  {line.toUpperCase()}
                </text>
              );
            })}
          </g>
        )}

        {/* 7. Wipe Transition Curtain */}
        {inTransition && effectiveTransition === 'wipe' && (
          <rect
            x={interpolate(transT, [0, 1], [0, width])}
            y={0}
            width={width}
            height={height}
            fill="#0f172a"
          />
        )}

        {/* 8. Safe Zone Guide Overlay */}
        {showSafeZones && (
          <g opacity={0.85}>
            <rect
              x={safeArea.left}
              y={safeArea.top}
              width={safeArea.width}
              height={safeArea.height}
              fill="none"
              stroke="#22c55e"
              strokeWidth={Math.max(3, Math.round(4 * u))}
              strokeDasharray="16 12"
            />
            <text
              x={safeArea.centerX}
              y={safeArea.bottom - Math.round(16 * u)}
              textAnchor="middle"
              fill="#4ade80"
              fontSize={Math.round(24 * u)}
              fontWeight="700"
              fontFamily="JetBrains Mono, monospace"
            >
              SAFE AREA ({aspect}: {safeArea.width}x{safeArea.height})
            </text>
          </g>
        )}
      </g>
    </svg>
  );
};

function wrapTitleByMeasuredWidth(
  title: string,
  maxWidthPx: number,
  fontSize: number
): string[] {
  const words = title
    .replace(/^what if\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (measureTextWidth(candidate.toUpperCase(), fontSize) <= maxWidthPx || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}
