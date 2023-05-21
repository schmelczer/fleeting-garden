export const hash = (state: number): number => {
  state ^= 2747636419;
  state *= 2654435769;
  state ^= state >> 16;
  state *= 2654435769;
  state ^= state >> 16;
  state *= 2654435769;
  return state / 4294967295.0;
};
