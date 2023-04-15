import { vec2 } from 'gl-matrix';

export interface Agent {
  position: vec2;
  angle: number;
}

export const AGENT_SIZE = 4;
