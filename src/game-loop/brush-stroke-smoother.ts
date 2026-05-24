import { vec2 } from 'gl-matrix';

import { appConfig } from '../config';
import { getRenderQualityBrushSize } from '../config/brush-size';
import { getSafePixelRatio } from '../pipelines/brush/brush-pipeline';
import { settings } from '../settings';
import { type StrokeSegment } from './game-loop-types';

interface BrushStrokeSmootherOptions {
  getCanvasPixelRatio: () => number;
  getMirrorSegmentCount: () => number;
}

export class BrushStrokeSmoother {
  private readonly strokePoints: Array<vec2> = [];
  private lastBrushPosition: vec2 | null = null;

  public constructor(private readonly options: BrushStrokeSmootherOptions) {}

  public addSample(position: vec2): Array<StrokeSegment> {
    const previousSample = this.strokePoints[this.strokePoints.length - 1];
    if (
      previousSample !== undefined &&
      vec2.squaredDistance(previousSample, position) <=
        getBrushSmoothingDistanceSquared(this.options.getCanvasPixelRatio())
    ) {
      return [];
    }

    this.strokePoints.push(vec2.clone(position));

    if (this.strokePoints.length > 3) {
      this.strokePoints.shift();
    }

    if (this.strokePoints.length === 1) {
      this.lastBrushPosition = vec2.clone(position);
      return [{ from: position, to: position }];
    }

    if (this.strokePoints.length === 2) {
      const [start, end] = this.strokePoints;
      const midpoint = getMidpoint(start, end);
      this.lastBrushPosition = midpoint;
      return [{ from: start, to: midpoint }];
    }

    const [start, control, end] = this.strokePoints;
    const curveStart = getMidpoint(start, control);
    const curveEnd = getMidpoint(control, end);
    this.lastBrushPosition = curveEnd;
    return this.getQuadraticSegments(curveStart, control, curveEnd);
  }

  public finish(): Array<StrokeSegment> {
    if (this.strokePoints.length === 0) {
      return [];
    }

    const finalSample = this.strokePoints[this.strokePoints.length - 1];
    if (
      this.lastBrushPosition !== null &&
      vec2.squaredDistance(this.lastBrushPosition, finalSample) >
        getBrushSmoothingDistanceSquared(this.options.getCanvasPixelRatio())
    ) {
      return [{ from: this.lastBrushPosition, to: finalSample }];
    }

    return [];
  }

  public clear(): void {
    this.strokePoints.length = 0;
    this.lastBrushPosition = null;
  }

  public scale(scale: vec2): void {
    this.strokePoints.forEach((point) => {
      vec2.mul(point, point, scale);
    });

    if (this.lastBrushPosition !== null) {
      vec2.mul(this.lastBrushPosition, this.lastBrushPosition, scale);
    }
  }

  private getQuadraticSegments(
    start: vec2,
    control: vec2,
    end: vec2
  ): Array<StrokeSegment> {
    const curveLength = vec2.distance(start, control) + vec2.distance(control, end);
    const canvasPixelRatio = getSafePixelRatio(this.options.getCanvasPixelRatio());
    const brushSize = getRenderQualityBrushSize(
      settings.brushSize,
      settings.internalRenderAreaMegapixels
    );
    const brushRadius = Math.max(
      settings.brushCurveMinBrushRadius * canvasPixelRatio,
      (brushSize * canvasPixelRatio) / 2
    );
    const segmentSpacing = Math.max(
      settings.brushCurveMinSegmentSpacing * canvasPixelRatio,
      brushRadius * settings.brushCurveSegmentBrushRadiusRatio
    );
    const mirrorSegmentCount = Math.max(1, this.options.getMirrorSegmentCount());
    const curveResolution = getBrushCurveResolution();
    const maxCurveSegments = Math.max(
      1,
      Math.floor(
        curveResolution /
          Math.max(1, mirrorSegmentCount ** settings.brushCurveMirrorResolutionExponent)
      )
    );
    const segmentCount = Math.min(
      maxCurveSegments,
      Math.max(1, Math.ceil(curveLength / segmentSpacing))
    );

    let previousPoint = start;
    const segments: Array<StrokeSegment> = [];
    for (let i = 1; i <= segmentCount; i++) {
      const point = getQuadraticPoint(start, control, end, i / segmentCount);
      segments.push({ from: previousPoint, to: point });
      previousPoint = point;
    }

    return segments;
  }
}

const getMidpoint = (from: vec2, to: vec2): vec2 =>
  vec2.fromValues((from[0] + to[0]) / 2, (from[1] + to[1]) / 2);

const getQuadraticPoint = (start: vec2, control: vec2, end: vec2, t: number): vec2 => {
  const inverseT = 1 - t;
  return vec2.fromValues(
    inverseT * inverseT * start[0] + 2 * inverseT * t * control[0] + t * t * end[0],
    inverseT * inverseT * start[1] + 2 * inverseT * t * control[1] + t * t * end[1]
  );
};

const getBrushCurveResolution = (): number => {
  const resolution = Number.isFinite(settings.brushCurveResolution)
    ? settings.brushCurveResolution
    : appConfig.defaultSettings.brushCurveResolution;
  return Math.max(1, Math.floor(resolution));
};

const getBrushSmoothingDistanceSquared = (pixelRatio?: number): number => {
  const distance = Number.isFinite(settings.brushSmoothingMinSampleDistance)
    ? settings.brushSmoothingMinSampleDistance
    : appConfig.defaultSettings.brushSmoothingMinSampleDistance;
  return Math.max(0, distance * getSafePixelRatio(pixelRatio)) ** 2;
};
