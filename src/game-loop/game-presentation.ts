import { hsl } from '../utils/colors/hsl';
import { hash } from '../utils/hash';

import { vec3 } from 'gl-matrix';

export class GamePresentation {
  public getGenerationColor(generation: number): vec3 {
    const hue = Math.round(hash(generation) * 360);
    return hsl(hue, 100, 50);
  }
}
