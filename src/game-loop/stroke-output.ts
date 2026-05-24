import { vec2 } from 'gl-matrix';

import { type BrushPipeline } from '../pipelines/brush/brush-pipeline';
import { type EraserAgentPipeline } from '../pipelines/eraser/eraser-agent-pipeline';
import { type EraserTexturePipeline } from '../pipelines/eraser/eraser-texture-pipeline';

export interface StrokeOutput {
  addBrushSegment(from: vec2, to: vec2): void;
  addEraseSegment(from: vec2, to: vec2): void;
  clearSwipes(): void;
}

export class PipelineStrokeOutput implements StrokeOutput {
  public constructor(
    private readonly brushPipeline: BrushPipeline,
    private readonly eraserAgentPipeline: EraserAgentPipeline,
    private readonly eraserTexturePipeline: EraserTexturePipeline
  ) {}

  public addBrushSegment(from: vec2, to: vec2): void {
    this.brushPipeline.addSwipeSegment(from, to);
  }

  public addEraseSegment(from: vec2, to: vec2): void {
    this.eraserAgentPipeline.addSwipeSegment(from, to);
    this.eraserTexturePipeline.addSwipeSegment(from, to);
  }

  public clearSwipes(): void {
    this.brushPipeline.clearSwipes();
    this.eraserAgentPipeline.clearSwipes();
    this.eraserTexturePipeline.clearSwipes();
  }
}
