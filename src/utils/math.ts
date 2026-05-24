export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export const mix = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;

export const mixAngle = (from: number, to: number, amount: number): number => {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
};

export const approach = (
  current: number,
  target: number,
  elapsedSeconds: number,
  timeConstantSeconds: number
): number => {
  const amount = 1 - Math.exp(-elapsedSeconds / Math.max(0.001, timeConstantSeconds));
  return mix(current, target, amount);
};

export const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
};

export const easeOutQuad = (value: number): number => value * (2 - value);
