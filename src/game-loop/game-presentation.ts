import { vec3 } from 'gl-matrix';

import { settings } from '../settings';
import { hsl } from '../utils/hsl';
import { last } from '../utils/last';
import { Random } from '../utils/random';

const hues = [settings.startColorHue];

for (let i = 0; i < 100; i++) {
  hues.push((last(hues) + Random.randomBetween(90, 240)) % 360);
}

const colors = hues.map((hue) =>
  hsl(hue, Random.randomBetween(90, 100), Random.randomBetween(20, 30))
);

export class GamePresentation {
  public static getGenerationColor(generation: number): vec3 {
    return colors[generation % colors.length];
  }
}
