import { vec2 } from 'gl-matrix';

import { GardenAudio } from '../audio/garden-audio';
import { getSafePixelRatio } from '../pipelines/brush/brush-pipeline';
import { activeVibe } from '../settings';
import { MIN_DELTA_TIME_SECONDS } from '../utils/delta-time-calculator';
import { BrushStrokeSmoother } from './brush-stroke-smoother';
import { type StrokeSegment } from './game-loop-types';
import { getMirroredStrokeSegments } from './stroke-mirroring';
import { type StrokeOutput } from './stroke-output';

interface GardenPointerInputOptions {
  canvas: HTMLCanvasElement;
  audio: GardenAudio;
  strokeOutput: StrokeOutput;
  getCanvasPixelRatio: () => number;
  getMirrorSegmentCount: () => number;
  onStartDrawing: () => void;
  onEraseGestureEnded: () => void;
  spawnStrokeAgents: (from: vec2, to: vec2) => void;
}

interface PointerSample {
  position: vec2;
  previousPosition: vec2;
  elapsedSeconds: number;
  timeStamp: number;
}

export class GardenPointerInput {
  private readonly brushSmoother: BrushStrokeSmoother;
  private activePointerId: number | null = null;
  private lastPointerPosition: vec2 | null = null;
  private lastPointerEventTimeMs: number | null = null;
  private isErasing = false;

  public constructor(private readonly options: GardenPointerInputOptions) {
    this.brushSmoother = new BrushStrokeSmoother({
      getCanvasPixelRatio: options.getCanvasPixelRatio,
      getMirrorSegmentCount: options.getMirrorSegmentCount,
    });
  }

  public attach(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  public detach(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  public setEraseMode(isErasing: boolean): void {
    this.isErasing = isErasing;
  }

  public clearSwipesIfIdle(): void {
    if (this.isSwipeActive) {
      return;
    }

    this.options.strokeOutput.clearSwipes();
  }

  public scaleLastPointerPosition(scale: vec2): void {
    if (this.lastPointerPosition !== null) {
      vec2.mul(this.lastPointerPosition, this.lastPointerPosition, scale);
    }

    this.brushSmoother.scale(scale);
  }

  public get isSwipeActive(): boolean {
    return this.activePointerId !== null;
  }

  public get isEraseMode(): boolean {
    return this.isErasing;
  }

  private get canvas(): HTMLCanvasElement {
    return this.options.canvas;
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.activePointerId !== null) {
      return;
    }

    this.options.audio.beginGesture();
    this.options.onStartDrawing();
    this.activePointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.lastPointerPosition = null;
    this.lastPointerEventTimeMs = null;
    this.brushSmoother.clear();
    this.addSwipeAt(event, { emitAudio: false });
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    this.getCoalescedPointerEvents(event).forEach((coalescedEvent) => {
      this.addSwipeAt(coalescedEvent);
    });
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    this.addSwipeAt(event, { emitAudio: false });
    this.finishBrushStroke();
    this.options.audio.endGesture();
    if (this.isErasing) {
      this.options.onEraseGestureEnded();
    }
    try {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    } finally {
      this.activePointerId = null;
      this.lastPointerPosition = null;
      this.lastPointerEventTimeMs = null;
      this.brushSmoother.clear();
    }
  };

  private addSwipeAt(event: PointerEvent, options: { emitAudio?: boolean } = {}): void {
    const sample = this.getPointerSample(event);

    if (this.isErasing) {
      this.addEraseSample(sample);
    } else {
      this.addBrushSample(sample);
    }

    if (options.emitAudio !== false) {
      this.emitStrokeAudio(sample);
    }

    this.lastPointerPosition = sample.position;
    this.lastPointerEventTimeMs = sample.timeStamp;
  }

  private getPointerSample(event: PointerEvent): PointerSample {
    const position = this.getCanvasPointerPosition(event);
    const previousPosition = this.lastPointerPosition ?? position;
    const previousTimeMs = this.lastPointerEventTimeMs ?? event.timeStamp;
    const elapsedSeconds = Math.max(
      MIN_DELTA_TIME_SECONDS,
      (event.timeStamp - previousTimeMs) / 1000
    );

    return {
      position,
      previousPosition,
      elapsedSeconds,
      timeStamp: event.timeStamp,
    };
  }

  private addBrushSample(sample: PointerSample): void {
    this.emitBrushSegments(this.brushSmoother.addSample(sample.position));
  }

  private addEraseSample(sample: PointerSample): void {
    this.options.strokeOutput.addEraseSegment(sample.previousPosition, sample.position);
  }

  private emitStrokeAudio(sample: PointerSample): void {
    this.options.audio.stroke({
      vibe: activeVibe,
      from: sample.previousPosition,
      to: sample.position,
      canvasSize: [this.canvas.width, this.canvas.height],
      isErasing: this.isErasing,
      elapsedSeconds: sample.elapsedSeconds,
    });
  }

  private getCanvasPointerPosition(event: PointerEvent): vec2 {
    const rect = this.canvas.getBoundingClientRect();
    const xScale = getSafePixelRatio(this.canvas.width / rect.width);
    const yScale = getSafePixelRatio(this.canvas.height / rect.height);
    return vec2.fromValues(
      (event.clientX - rect.left) * xScale,
      (event.clientY - rect.top) * yScale
    );
  }

  private emitBrushSegments(segments: Array<StrokeSegment>): void {
    segments.forEach((segment) => {
      this.getMirroredSegments(segment.from, segment.to).forEach((mirroredSegment) => {
        this.options.strokeOutput.addBrushSegment(
          mirroredSegment.from,
          mirroredSegment.to
        );
        this.options.spawnStrokeAgents(mirroredSegment.from, mirroredSegment.to);
      });
    });
  }

  private finishBrushStroke(): void {
    if (this.isErasing) {
      return;
    }

    this.emitBrushSegments(this.brushSmoother.finish());
  }

  private getCoalescedPointerEvents(event: PointerEvent): Array<PointerEvent> {
    const getCoalescedEvents = (
      event as PointerEvent & { getCoalescedEvents?: () => Array<PointerEvent> }
    ).getCoalescedEvents;
    const coalescedEvents =
      typeof getCoalescedEvents === 'function' ? getCoalescedEvents.call(event) : [];

    if (coalescedEvents.length === 0) {
      return [event];
    }

    const lastEvent = coalescedEvents[coalescedEvents.length - 1];
    return isSamePointerSample(lastEvent, event)
      ? coalescedEvents
      : [...coalescedEvents, event];
  }

  private getMirroredSegments(from: vec2, to: vec2): Array<StrokeSegment> {
    return getMirroredStrokeSegments(
      from,
      to,
      vec2.fromValues(this.canvas.width, this.canvas.height),
      this.options.getMirrorSegmentCount()
    );
  }
}

const isSamePointerSample = (left: PointerEvent, right: PointerEvent): boolean =>
  left.clientX === right.clientX &&
  left.clientY === right.clientY &&
  left.buttons === right.buttons;
