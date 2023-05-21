import { vec3 } from 'gl-matrix';

export interface RenderSettings {
  brushColor: vec3;
  speciesAColor: vec3;
  speciesBColor: vec3;
  clarity: number;
}
