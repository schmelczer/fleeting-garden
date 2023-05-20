import { vec2 } from 'gl-matrix';

export interface Agent {
  position: vec2;
  angle: number;
  species: number;
  timeToLive: number;
}

export const AGENT_SIZE_IN_BYTES = 5 * Float32Array.BYTES_PER_ELEMENT;
