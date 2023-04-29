import { vec2 } from 'gl-matrix';

export interface CommonParameters {
  canvasSize: vec2;
  deltaTime: number;
  time: number;
}
