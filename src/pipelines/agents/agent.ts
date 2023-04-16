import { vec2 } from 'gl-matrix';

export interface Agent {
  position: vec2;
  angle: number;
}

export const AGENT_SIZE_IN_BYTES = 4 * 4;
