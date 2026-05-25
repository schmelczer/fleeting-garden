import { vec2 } from 'gl-matrix';

import { type StrokeSegment } from './game-loop-types';

export const MIN_MIRROR_SEGMENT_COUNT = 1;
export const MAX_MIRROR_SEGMENT_COUNT = 12;

export const getMirroredStrokeSegments = (
  from: vec2,
  to: vec2,
  canvasSize: vec2,
  segmentCount: number
): Array<StrokeSegment> => {
  if (segmentCount <= 1) {
    return [{ from, to }];
  }

  const center = vec2.fromValues(canvasSize[0] / 2, canvasSize[1] / 2);
  const angleStep = (Math.PI * 2) / segmentCount;
  const segments: Array<StrokeSegment> = [];
  for (let i = 0; i < segmentCount; i++) {
    const angle = angleStep * i;
    segments.push({
      from: rotatePointAround(from, center, angle),
      to: rotatePointAround(to, center, angle),
    });
  }

  return segments;
};

const rotatePointAround = (point: vec2, center: vec2, angle: number): vec2 => {
  if (angle === 0) {
    return point;
  }

  const offsetX = point[0] - center[0];
  const offsetY = point[1] - center[1];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return vec2.fromValues(
    center[0] + offsetX * cos - offsetY * sin,
    center[1] + offsetX * sin + offsetY * cos
  );
};
