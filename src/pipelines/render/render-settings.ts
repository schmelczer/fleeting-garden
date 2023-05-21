import { vec3 } from 'gl-matrix';

export interface RenderSettings {
  brushColor: vec3;
  evenGenerationColor: vec3;
  oddGenerationColor: vec3;
  clarity: number;
}
