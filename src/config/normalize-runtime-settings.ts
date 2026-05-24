import type {
  GardenAppConfig,
  GardenRuntimeSettings,
  NumberControlConfig,
} from './types';

type RuntimeSettingControls = GardenAppConfig['runtimeSettings']['controls'];

export const normalizeNumberControlValue = (
  value: number,
  config: NumberControlConfig
): number => {
  if (config.options) {
    const optionValues = Object.values(config.options);
    if (optionValues.includes(value)) {
      return value;
    }
    return optionValues.includes(0) ? 0 : (optionValues[0] ?? config.min ?? 0);
  }

  const min = config.min ?? Number.NEGATIVE_INFINITY;
  const max = config.max ?? Number.POSITIVE_INFINITY;
  const fallbackValue = config.min ?? 0;
  const finiteValue = Number.isFinite(value) ? value : fallbackValue;
  const clampedValue = Math.min(max, Math.max(min, finiteValue));
  return config.integer ? Math.round(clampedValue) : clampedValue;
};

export const normalizeRuntimeSettings = (
  settings: GardenRuntimeSettings,
  controls: RuntimeSettingControls
): GardenRuntimeSettings => {
  const normalized = { ...settings };

  (
    Object.entries(controls) as Array<
      [keyof GardenRuntimeSettings, NumberControlConfig | undefined]
    >
  ).forEach(([key, config]) => {
    if (config) {
      normalized[key] = normalizeNumberControlValue(normalized[key], config);
    }
  });

  return normalized;
};
