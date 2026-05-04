import { isProduction } from '../constants';
import { settings } from '../settings';
import { SettingsSlider, ValueScaling } from './settings-slider';

export const setUpSettingsPage = (
  settingsPage: HTMLDivElement,
  maxAgentCount: number
): Array<SettingsSlider<any>> => {
  const sliders: Array<SettingsSlider<any>> = [
    ...(isProduction
      ? []
      : [
          new SettingsSlider(settings, 'renderSpeed', {
            min: 1,
            max: 10,
            rounding: Math.round,
          }),
        ]),

    new SettingsSlider(settings, 'agentCount', {
      min: 1,
      max: maxAgentCount,
      scaling: ValueScaling.Quadratic,
      rounding: Math.round,
    }),

    new SettingsSlider(settings, 'currentGenerationAggression', {
      min: -5,
      max: 5,
    }),

    new SettingsSlider(settings, 'nextGenerationAggression', {
      min: -5,
      max: 5,
    }),

    new SettingsSlider(settings, 'moveSpeed', {
      min: 10,
      max: 500,
      scaling: ValueScaling.Quadratic,
      rounding: Math.round,
    }),

    new SettingsSlider(settings, 'turnSpeed', {
      min: 1,
      max: 200,
      scaling: ValueScaling.Quadratic,
      rounding: Math.round,
    }),

    new SettingsSlider(settings, 'sensorOffsetAngle', {
      min: 0,
      max: 90,
      step: 1,
    }),

    new SettingsSlider(settings, 'sensorOffsetDistance', {
      min: 0,
      max: 200,
      scaling: ValueScaling.Quadratic,
      rounding: Math.round,
    }),

    new SettingsSlider(settings, 'turnWhenLost', {
      min: 0,
      max: 1,
    }),

    new SettingsSlider(settings, 'individualTrailWeight', {
      min: 0,
      max: 1,
    }),

    new SettingsSlider(settings, 'diffusionRateTrails', {
      min: 0,
      max: 2,
    }),

    new SettingsSlider(settings, 'decayRateTrails', {
      min: 0.1,
      max: 5000,
      scaling: ValueScaling.Quadratic,
    }),

    new SettingsSlider(settings, 'diffusionRateBrush', {
      min: 0.001,
      max: 1,
    }),

    new SettingsSlider(settings, 'decayRateBrush', {
      min: 0.1,
      max: 100,
    }),

    new SettingsSlider(settings, 'brushSize', {
      min: 1,
      max: 30,
    }),

    new SettingsSlider(settings, 'clarity', {
      min: 0.00001,
      max: 1,
    }),
  ];

  const sliderContainerElement = document.createElement('div');

  sliders.forEach((slider) => {
    sliderContainerElement.appendChild(slider.element);
  });

  settingsPage.appendChild(sliderContainerElement);

  return sliders;
};
