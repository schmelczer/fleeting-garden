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

      new SettingsSlider(settings, 'aggressionFactor', {
        min: 0,
        max: 10,
      }),

      new SettingsSlider(settings, 'nextGenerationSpawnRadius', {
        min: 1,
        max: 1000,
      }),

      new SettingsSlider(settings, 'nextGenerationSpawnInterval', {
        min: 0.1,
        max: 600,
      }),

      new SettingsSlider(settings, 'moveSpeed', {
        min: 10,
        max: 500,
      }),
    ],
    [
      new SettingsSlider(settings, 'brushWidth', {
        min: 1,
        max: 60,
      }),

      new SettingsSlider(settings, 'brushWidthRandomness', {
        min: 0,
        max: 1,
      }),
    ],
    [
      new SettingsSlider(settings, 'clarity', {
        min: 0.1,
        max: 8,
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
