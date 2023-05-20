import { vec3 } from 'gl-matrix';

export interface RenderSettings {
  brushColor: vec3;
  speciesColorA: vec3;
  speciesColorB: vec3;
  clarity: number;
}
