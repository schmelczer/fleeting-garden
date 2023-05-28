export const formatNumber = (value: number, unit = ''): string => {
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(1)} million ${unit}`;
  }

  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(1)} thousand ${unit}`;
  }

  return `${value === Math.floor(value) ? value : value.toFixed(2)} ${unit}`;
};
