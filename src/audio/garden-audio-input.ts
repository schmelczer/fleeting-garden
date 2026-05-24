import type { GardenAudioStroke } from './garden-audio-types';

const minElapsedSeconds = 0.001;

export interface GardenAudioStrokeMetrics {
  elapsedSeconds: number;
  normalizedDistance: number;
  normalizedSpeed: number;
}

export const getStrokeMetrics = (stroke: GardenAudioStroke): GardenAudioStrokeMetrics => {
  const dx = stroke.to[0] - stroke.from[0];
  const dy = stroke.to[1] - stroke.from[1];
  const distancePixels = Math.hypot(dx, dy);
  const elapsedSeconds = Math.max(minElapsedSeconds, stroke.elapsedSeconds ?? 0);
  const normalizationPixels = Math.max(
    1,
    Math.min(stroke.canvasSize[0], stroke.canvasSize[1])
  );
  const normalizedDistance = distancePixels / normalizationPixels;

  return {
    elapsedSeconds,
    normalizedDistance,
    normalizedSpeed: normalizedDistance / elapsedSeconds,
  };
};
