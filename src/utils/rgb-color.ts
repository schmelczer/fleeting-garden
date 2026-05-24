export type RgbColor = [red: number, green: number, blue: number];

const RGB_CHANNEL_MAX = 255;

const toFiniteRgbChannel = (value: number): number =>
  Number.isFinite(value) ? value : 0;

const clampRgbChannel = (value: number): number =>
  Math.min(RGB_CHANNEL_MAX, Math.max(0, Math.round(toFiniteRgbChannel(value))));

export const rgbColorToCss = ([red, green, blue]: RgbColor): string =>
  `rgb(${clampRgbChannel(red)}, ${clampRgbChannel(green)}, ${clampRgbChannel(blue)})`;

export const rgbColorToHex = ([red, green, blue]: RgbColor): string =>
  `#${[red, green, blue]
    .map((channel) => clampRgbChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`;

export const hexColorToRgbColor = (value: string): RgbColor | null => {
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    return null;
  }

  const shorthandOrHex = match[1];
  const hex =
    shorthandOrHex.length === 3
      ? shorthandOrHex
          .split('')
          .map((channel) => `${channel}${channel}`)
          .join('')
      : shorthandOrHex;

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
};

export const rgbChannelToUnit = (value: number): number =>
  Math.min(1, Math.max(0, toFiniteRgbChannel(value) / RGB_CHANNEL_MAX));
