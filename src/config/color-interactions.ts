import type { NumberControlConfig } from './types';

export const colorInteractionControl = (label: string): NumberControlConfig => ({
  folder: 'Color Reactions',
  label,
  min: -1,
  max: 1,
  step: 1,
  options: {
    'Move Toward': 1,
    Ignore: 0,
    'Move Away': -1,
  },
});
