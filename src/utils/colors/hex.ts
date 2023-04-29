import { rgb255 } from './rgb255';

import { vec3 } from 'gl-matrix';

export const hex = (hex: string): vec3 => {
  if (hex[0] === '#') {
    hex = hex.slice(1);
  }

  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return rgb255(r, g, b);
};
