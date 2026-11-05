import React from 'react';
import { Composition } from 'remotion';
import { getAspectPreset } from '../aspect';
import { createDefaultTimeline } from '../timeline/builder';
import {
  BlobToonComposition,
  BlobToonCompositionPropsSchema,
} from './BlobToonComposition';
import { createGalleryTimeline } from './gallery';

export const RemotionRoot: React.FC = () => {
  const defaultTimeline = createDefaultTimeline();
  const galleryTimeline = createGalleryTimeline();

  return (
    <>
      <Composition
        id="BlobToonShort"
        component={BlobToonComposition as unknown as React.FC<Record<string, unknown>>}
        schema={BlobToonCompositionPropsSchema}
        durationInFrames={defaultTimeline.totalFrames}
        fps={defaultTimeline.fps}
        width={defaultTimeline.width}
        height={defaultTimeline.height}
        defaultProps={{
          aspect: defaultTimeline.aspect,
          timeline: defaultTimeline,
          showSafeZones: false,
          thumbnailMode: false,
        }}
        calculateMetadata={({ props }) => {
          const preset = getAspectPreset(props.aspect ?? props.timeline.aspect ?? '9:16');
          return {
            width: preset.width,
            height: preset.height,
            fps: props.timeline.fps,
            durationInFrames: props.timeline.totalFrames,
          };
        }}
      />
      <Composition
        id="BlobToonGallery"
        component={BlobToonComposition as unknown as React.FC<Record<string, unknown>>}
        schema={BlobToonCompositionPropsSchema}
        durationInFrames={galleryTimeline.totalFrames}
        fps={galleryTimeline.fps}
        width={galleryTimeline.width}
        height={galleryTimeline.height}
        defaultProps={{
          aspect: galleryTimeline.aspect,
          timeline: galleryTimeline,
          showSafeZones: false,
          thumbnailMode: false,
        }}
        calculateMetadata={({ props }) => {
          const preset = getAspectPreset(props.aspect ?? props.timeline.aspect ?? '9:16');
          return {
            width: preset.width,
            height: preset.height,
            fps: props.timeline.fps,
            durationInFrames: props.timeline.totalFrames,
          };
        }}
      />
    </>
  );
};
