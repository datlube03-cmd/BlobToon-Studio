import React from 'react';
import { z } from 'zod';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { AspectRatio, AspectRatioSchema } from '../aspect';
import { useLoadBundledFontInRemotion } from '../fonts/bundledFont';
import { collectSfxEvents } from '../sfx/events';
import { Timeline, TimelineSchema } from '../timeline/schema';
import { SceneStage } from '../scenes/SceneStage';

export const BlobToonCompositionPropsSchema = z.object({
  aspect: AspectRatioSchema.default('9:16'),
  sfx: z.boolean().default(true),
  sfxVolume: z.number().min(0).max(1).default(0.35),
  timeline: TimelineSchema,
  overrideFrame: z.number().optional(),
  showSafeZones: z.boolean().default(false),
  thumbnailMode: z.boolean().default(false),
});

export interface BlobToonCompositionProps {
  aspect?: AspectRatio;
  sfx?: boolean;
  sfxVolume?: number;
  timeline: Timeline;
  overrideFrame?: number;
  showSafeZones?: boolean;
  thumbnailMode?: boolean;
}

export const BlobToonComposition: React.FC<BlobToonCompositionProps> = ({
  aspect,
  sfx,
  sfxVolume,
  timeline,
  overrideFrame,
  showSafeZones = false,
  thumbnailMode = false,
}) => {
  useLoadBundledFontInRemotion();
  const remotionFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = overrideFrame !== undefined ? overrideFrame : remotionFrame;

  if (!timeline || !timeline.scenes || timeline.scenes.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: '#0f172a' }} />;
  }

  const effectiveAspect: AspectRatio = aspect ?? timeline.aspect ?? '9:16';
  const effectiveTimeline: Timeline = {
    ...timeline,
    audio: {
      sfx: sfx ?? timeline.audio?.sfx ?? true,
      sfxVolume: sfxVolume ?? timeline.audio?.sfxVolume ?? 0.35,
      ...(timeline.audio?.music ? { music: timeline.audio.music } : {}),
    },
  };

  if (thumbnailMode) {
    const hookScene = effectiveTimeline.scenes[0];
    const peakFrame = Math.min(hookScene.durationInFrames - 1, Math.round(fps * 0.8));
    return (
      <AbsoluteFill>
        <SceneStage
          scene={hookScene}
          variation={effectiveTimeline.variation}
          sceneFrame={peakFrame}
          fps={fps}
          aspect={effectiveAspect}
          renderParams={effectiveTimeline.renderParams}
          showSafeZones={false}
          thumbnailBannerTitle={effectiveTimeline.title}
        />
      </AbsoluteFill>
    );
  }

  const activeScene =
    effectiveTimeline.scenes.find((s) => frame >= s.startFrame && frame < s.endFrame) ??
    effectiveTimeline.scenes[effectiveTimeline.scenes.length - 1];

  const sceneFrame = Math.max(0, frame - activeScene.startFrame);
  const sfxEvents = collectSfxEvents(effectiveTimeline, fps);

  return (
    <AbsoluteFill>
      <SceneStage
        scene={activeScene}
        variation={effectiveTimeline.variation}
        sceneFrame={sceneFrame}
        fps={fps}
        aspect={effectiveAspect}
        renderParams={effectiveTimeline.renderParams}
        showSafeZones={showSafeZones}
      />
      {sfxEvents.map((ev, idx) => (
        <Sequence
          key={`sfx-${ev.frame}-${ev.type}-${idx}`}
          from={ev.frame}
          durationInFrames={ev.durationFrames}
          name={`SFX: ${ev.type} (${ev.volume})`}
        >
          <span
            data-sfx-type={ev.type}
            data-sfx-frame={ev.frame}
            data-sfx-volume={ev.volume}
            style={{ display: 'none' }}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
