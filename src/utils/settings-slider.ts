export interface SliderConfiguration {
  min: number;
  max: number;
  unit?: string;
  step?: number;
  onChangeCallback?: (value: number) => unknown;
}

export class SettingsSlider<T extends Record<string, number>> {
  private static readonly DEFAULT_STEP_COUNT = 200;

  private readonly slider: HTMLInputElement;
  private readonly valueDisplay: HTMLSpanElement;
  private readonly sliderWrapper: HTMLDivElement;
  private readonly config: SliderConfiguration = {
    min: 0,
    max: 1,
  };

  public constructor(
    private readonly settings: T,
    private readonly settingName: keyof T & string,
    config: Partial<SliderConfiguration> = {}
  ) {
    this.slider = SettingsSlider.createSlider(this.settings[this.settingName]);
    this.valueDisplay = SettingsSlider.createValueDisplay();
    this.sliderWrapper = SettingsSlider.createSliderWrapper(
      this.settingName,
      this.slider,
      this.valueDisplay
    );

    this.slider.addEventListener('input', this.onChange.bind(this));

    this.updateConfig(config);
  }

  private static createSlider(initialValue: any) {
    const input = document.createElement('input');

    input.type = 'range';
    input.value = initialValue.toString();

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
    const label = document.createElement('label');

    label.innerText = SettingsSlider.formatLabel(name);
    label.appendChild(slider);
    label.appendChild(valueDisplay);
    wrapper.appendChild(label);

    return wrapper;
  }

  private static formatLabel(value: string): string {
    const formatted = value.replace(/([A-Z])/g, ' $1');

    return (
      formatted.charAt(0).toLocaleUpperCase() + formatted.slice(1).toLocaleLowerCase()
    );
  }

  private get formattedValue(): string {
    const value = this.settings[this.settingName];
    const unit = this.config.unit ?? '';

    return `${value === Math.floor(value) ? value : value.toFixed(2)}${unit}`;
  }

  private onChange() {
    this.settings[this.settingName] = Number(this.slider.value) as any;
    this.config.onChangeCallback?.(this.settings[this.settingName]);
    this.valueDisplay.innerText = this.formattedValue;
  }

  public updateConfig(config: Partial<SliderConfiguration>) {
    Object.assign(this.config, config);

    if (this.config.step === undefined) {
      this.config.step =
        (this.config.max - this.config.min) / SettingsSlider.DEFAULT_STEP_COUNT;
    }

    this.slider.min = this.config.min.toString();
    this.slider.max = this.config.max.toString();
    this.slider.step = this.config.step.toString();

    this.onChange();
  }

  public get element(): HTMLElement {
    return this.sliderWrapper;
  }
}
