import { settings } from '../settings';
import { SettingsSlider, ValueScaling } from '../utils/settings-slider';

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

      new SettingsSlider(settings, 'moveSpeed', {
        min: 10,
        max: 500,
        scaling: ValueScaling.Quadratic,
        rounding: Math.round,
      }),

      new SettingsSlider(settings, 'aggressionFactor', {
        min: 0,
        max: 10,
      }),

      new SettingsSlider(settings, 'spawnRadius', {
        min: 1,
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

      new SettingsSlider(settings, 'brushWidth', {
        min: 1,
        max: 60,
      }),

      new SettingsSlider(settings, 'brushWidthVariation', {
        min: 0,
        max: 1,
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
