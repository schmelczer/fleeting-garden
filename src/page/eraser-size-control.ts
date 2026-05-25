import type GameLoop from '../game-loop/game-loop';
import { DEFAULT_ERASER_SIZE, settings } from '../settings';
import { queryRequiredElement } from '../utils/dom';

export const ERASER_SIZE_MIN = 24;
export const ERASER_SIZE_MAX = 480;

const ERASER_CONTROL_SCALE_MIN = 0.74;
const ERASER_CONTROL_SCALE_MAX = 1.34;

const clampEraserSize = (value: number): number => {
  const safeValue = Number.isFinite(value) ? value : DEFAULT_ERASER_SIZE;
  return Math.min(ERASER_SIZE_MAX, Math.max(ERASER_SIZE_MIN, Math.round(safeValue)));
};

const ERASER_SLIDER_MIN = 0;
const ERASER_SLIDER_MAX = 1;
const ERASER_SLIDER_STEP = 0.001;

const clampSliderRatio = (value: number): number => {
  const safeValue = Number.isFinite(value) ? value : ERASER_SLIDER_MIN;
  return Math.min(ERASER_SLIDER_MAX, Math.max(ERASER_SLIDER_MIN, safeValue));
};

const getEraserSizeRatio = (size: number): number => {
  return (clampEraserSize(size) - ERASER_SIZE_MIN) / (ERASER_SIZE_MAX - ERASER_SIZE_MIN);
};

export const getEraserSizeFromSliderRatio = (sliderRatio: number): number => {
  return clampEraserSize(
    ERASER_SIZE_MIN +
      (ERASER_SIZE_MAX - ERASER_SIZE_MIN) * clampSliderRatio(sliderRatio) ** 2
  );
};

export const getEraserSliderRatioFromSize = (size: number): number =>
  Math.sqrt(getEraserSizeRatio(size));

interface EraserSizeControlOptions {
  getGame: () => GameLoop | null;
  onActivate: () => void;
  onChange: () => void;
}

export class EraserSizeControl {
  private readonly control = queryRequiredElement(
    '.eraser-size-control',
    HTMLLabelElement
  );
  private readonly slider = queryRequiredElement('.eraser-size-slider', HTMLInputElement);
  private isActive = false;

  public constructor(private readonly options: EraserSizeControlOptions) {
    this.control.addEventListener('pointerdown', this.activate);
    this.control.addEventListener('click', this.activate);
    this.slider.addEventListener('focus', this.activate);
    this.slider.addEventListener('input', () => {
      settings.eraserSize = getEraserSizeFromSliderRatio(Number(this.slider.value));
      this.activate();
      this.render();
      this.options.onChange();
    });
  }

  public render(): void {
    const size = clampEraserSize(settings.eraserSize);
    if (settings.eraserSize !== size) {
      settings.eraserSize = size;
    }

    const sliderRatio = getEraserSliderRatioFromSize(size);
    this.slider.min = ERASER_SLIDER_MIN.toString();
    this.slider.max = ERASER_SLIDER_MAX.toString();
    this.slider.step = ERASER_SLIDER_STEP.toString();
    this.slider.value = sliderRatio.toString();
    this.slider.setAttribute('aria-valuetext', `${size}px`);

    const sizeRatio = getEraserSizeRatio(size);
    const scale =
      ERASER_CONTROL_SCALE_MIN +
      (ERASER_CONTROL_SCALE_MAX - ERASER_CONTROL_SCALE_MIN) * sizeRatio;
    this.control.style.setProperty('--eraser-progress', `${sliderRatio * 100}%`);
    this.control.style.setProperty('--eraser-control-scale', scale.toFixed(3));
    this.syncActiveState();
    this.options.getGame()?.updateEraserPreview();
  }

  public setActive(isActive: boolean): void {
    this.isActive = isActive;
    this.syncActiveState();
  }

  private readonly activate = () => {
    this.setActive(true);
    this.options.onActivate();
  };

  private syncActiveState(): void {
    this.control.classList.toggle('active', this.isActive);
    this.slider.setAttribute(
      'aria-label',
      this.isActive ? 'Eraser size, active' : 'Eraser size'
    );
  }
}
