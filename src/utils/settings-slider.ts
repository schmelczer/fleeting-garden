import { formatNumber } from './format-number';

export enum ValueScaling {
  Linear,
  Quadratic,
  Logarithmic,
}

export interface SliderConfiguration {
  min: number;
  max: number;
  unit?: string;
  step?: number;
  onChangeCallback?: (value: number) => unknown;
  scaling: ValueScaling;
  rounding: (value: number) => number;
}

export class SettingsSlider<T extends Record<string, number>> {
  private static readonly DEFAULT_STEP_COUNT = 20000;

  private readonly slider: HTMLInputElement;
  private readonly valueDisplay: HTMLSpanElement;
  private readonly sliderWrapper: HTMLDivElement;
  private readonly config: SliderConfiguration = {
    min: 0,
    max: 1,
    scaling: ValueScaling.Linear,
    rounding: (value) => value,
  };

  public constructor(
    private readonly settings: T,
    private readonly settingName: keyof T & string,
    config: Partial<SliderConfiguration> = {}
  ) {
    this.slider = SettingsSlider.createSlider();
    this.valueDisplay = SettingsSlider.createValueDisplay();
    this.sliderWrapper = SettingsSlider.createSliderWrapper(
      this.settingName,
      this.slider,
      this.valueDisplay
    );

    this.slider.addEventListener('input', this.onChange.bind(this));

    this.updateConfig(config);
  }

  private static createSlider() {
    const input = document.createElement('input');
    input.type = 'range';
    return input;
  }

  private static createValueDisplay() {
    return document.createElement('span');
  }

  private static createSliderWrapper(
    name: string,
    slider: HTMLInputElement,
    valueDisplay: HTMLSpanElement
  ) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('slider');
    const label = document.createElement('label');

    const title = document.createElement('p');
    title.innerText = SettingsSlider.formatLabel(name);
    title.appendChild(valueDisplay);

    label.appendChild(title);
    label.appendChild(slider);
    wrapper.appendChild(label);

    return wrapper;
  }

  private static formatLabel(value: string): string {
    const formatted = value.replace(/([A-Z])/g, ' $1');

    return (
      formatted.charAt(0).toLocaleUpperCase() + formatted.slice(1).toLocaleLowerCase()
    );
  }

  private onChange() {
    this.settings[this.settingName] = this.config.rounding(
      this.inverseScaling(Number(this.slider.value))
    ) as any;

    this.config.onChangeCallback?.(this.settings[this.settingName]);
    this.valueDisplay.innerText = formatNumber(
      this.settings[this.settingName],
      this.config.unit
    );
  }

  public updateConfig(config: Partial<SliderConfiguration>) {
    Object.assign(this.config, config);

    if (this.config.step === undefined) {
      this.config.step =
        (this.scaling(this.config.max) - this.scaling(this.config.min)) /
        SettingsSlider.DEFAULT_STEP_COUNT;
    }

    this.slider.min = this.scaling(this.config.min).toString();
    this.slider.max = this.scaling(this.config.max).toString();
    this.slider.step = this.config.step.toString();
    this.slider.value = this.scaling(this.settings[this.settingName]).toString();
    this.onChange();
  }

  public get element(): HTMLElement {
    return this.sliderWrapper;
  }

  private get scaling(): (value: number) => number {
    switch (this.config.scaling) {
      case ValueScaling.Linear:
        return (value) => value;
      case ValueScaling.Quadratic:
        return (value) => Math.sqrt(value);
      case ValueScaling.Logarithmic:
        return (value) => Math.log10(value);
    }
  }

  private get inverseScaling(): (value: number) => number {
    switch (this.config.scaling) {
      case ValueScaling.Linear:
        return (value) => value;
      case ValueScaling.Quadratic:
        return (value) => Math.pow(value, 2);
      case ValueScaling.Logarithmic:
        return (value) => Math.pow(10, value);
    }
  }
}
