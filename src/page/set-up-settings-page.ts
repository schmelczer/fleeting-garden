import { settings } from '../settings';
import { SettingsSlider, ValueScaling } from './settings-slider';

export const setUpSettingsPage = (
  settingsPage: HTMLDivElement,
  maxAgentCount: number
) => {
  const sliders = [
    [
      new SettingsSlider(settings, 'agentCount', {
        min: 1,
        max: maxAgentCount,
        scaling: ValueScaling.Logarithmic,
        rounding: Math.round,
      }),

      new SettingsSlider(settings, 'currentGenerationAggression', {
        min: -20,
        max: 20,
      }),

      new SettingsSlider(settings, 'nextGenerationAggression', {
        min: -20,
        max: 20,
      }),

      new SettingsSlider(settings, 'moveSpeed', {
        min: 10,
        max: 500,
        scaling: ValueScaling.Quadratic,
        rounding: Math.round,
      }),

      new SettingsSlider(settings, 'turnSpeed', {
        min: 10,
        max: 1000,
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

      new SettingsSlider(settings, 'turnWhenGoingInTheRightDirection', {
        min: 0,
        max: 1,
      }),

      new SettingsSlider(settings, 'deinfectionProbability', {
        min: 0,
        max: 1,
        scaling: ValueScaling.Quadratic,
      }),

      new SettingsSlider(settings, 'brushTrailWeight', {
        min: 0,
        max: 10,
      }),

      new SettingsSlider(settings, 'individualTrailWeight', {
        min: 0,
        max: 1,
      }),

      new SettingsSlider(settings, 'diffusionRateTrails', {
        min: 0,
        max: 10,
      }),

      new SettingsSlider(settings, 'decayRateTrails', {
        min: 0,
        max: 10,
      }),

      new SettingsSlider(settings, 'diffusionRateBrush', {
        min: 0,
        max: 10,
      }),

      new SettingsSlider(settings, 'decayRateBrush', {
        min: 0,
        max: 10,
      }),

      new SettingsSlider(settings, 'spawnRadius', {
        min: 0,
        max: 1000,
      }),

      new SettingsSlider(settings, 'spawnInterval', {
        min: 0.1,
        max: 600,
      }),

      new SettingsSlider(settings, 'clarity', {
        min: 0.5,
        max: 8,
        step: 0.1,
      }),

      new SettingsSlider(settings, 'brushSize', {
        min: 1,
        max: 60,
      }),
    ],
  ];

  sliders.forEach((sliderContainer) => {
    const sliderContainerElement = document.createElement('div');

    sliderContainer.forEach((slider) => {
      sliderContainerElement.appendChild(slider.element);
    });

    settingsPage.querySelector('section').appendChild(sliderContainerElement);
  });
};
