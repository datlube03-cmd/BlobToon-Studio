import React from 'react';
import { z } from 'zod';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { AspectRatio, AspectRatioSchema } from '../aspect';
import { Timeline, TimelineSchema } from '../timeline/schema';
import { SceneStage } from '../scenes/SceneStage';

export const BlobToonCompositionPropsSchema = z.object({
  aspect: AspectRatioSchema.default('9:16'),
  timeline: TimelineSchema,
  overrideFrame: z.number().optional(),
  showSafeZones: z.boolean().default(false),
  thumbnailMode: z.boolean().default(false),
});

export interface BlobToonCompositionProps {
  aspect?: AspectRatio;
  timeline: Timeline;
  overrideFrame?: number;
  showSafeZones?: boolean;
  thumbnailMode?: boolean;
}

export const BlobToonComposition: React.FC<BlobToonCompositionProps> = ({
  aspect,
  timeline,
  overrideFrame,
  showSafeZones = false,
  thumbnailMode = false,
}) => {
  const remotionFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = overrideFrame !== undefined ? overrideFrame : remotionFrame;

  if (!timeline || !timeline.scenes || timeline.scenes.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: '#0f172a' }} />;
  }

  const effectiveAspect: AspectRatio = aspect ?? timeline.aspect ?? '9:16';

  if (thumbnailMode) {
    const hookScene = timeline.scenes[0];
    const peakFrame = Math.min(hookScene.durationInFrames - 1, Math.round(fps * 0.8));
    return (
      <AbsoluteFill>
        <SceneStage
          scene={hookScene}
          variation={timeline.variation}
          sceneFrame={peakFrame}
          fps={fps}
          aspect={effectiveAspect}
          renderParams={timeline.renderParams}
          showSafeZones={false}
          thumbnailBannerTitle={timeline.title}
        />
      </AbsoluteFill>
    );
  }

  const activeScene =
    timeline.scenes.find((s) => frame >= s.startFrame && frame < s.endFrame) ??
    timeline.scenes[timeline.scenes.length - 1];

  const sceneFrame = Math.max(0, frame - activeScene.startFrame);

  return (
    <AbsoluteFill>
      <SceneStage
        scene={activeScene}
        variation={timeline.variation}
        sceneFrame={sceneFrame}
        fps={fps}
        aspect={effectiveAspect}
        renderParams={timeline.renderParams}
        showSafeZones={showSafeZones}
      />
    </AbsoluteFill>
  );
};
