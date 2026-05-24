import { vec2 } from 'gl-matrix';

import type { RgbColor } from '../utils/rgb-color';

export interface GardenUi {
  eraserPreview: HTMLElement;
  exportStatus: HTMLElement;
  grainOverlay: HTMLElement;
  prompt: HTMLElement;
  toolbar: HTMLElement;
}

export interface RenderInputs {
  channelColors: [RgbColor, RgbColor, RgbColor];
  backgroundColor: RgbColor;
}

export interface StrokeSegment {
  from: vec2;
  to: vec2;
}

export interface CanvasReadbackRequest {
  encode(commandEncoder: GPUCommandEncoder, texture: GPUTexture): void;
  afterSubmit(): void;
}
