import { appConfig } from '../config';
import type GameLoop from '../game-loop/game-loop';
import { settings } from '../settings';
import { queryRequiredElement } from '../utils/dom';

const clampEraserSize = (value: number): number => {
  const { default: defaultSize, max, min } = appConfig.toolbar.eraser;
  const safeValue = Number.isFinite(value) ? value : defaultSize;
  return Math.min(max, Math.max(min, Math.round(safeValue)));
};

const ERASER_SLIDER_MIN = 0;
const ERASER_SLIDER_MAX = 1;
const ERASER_SLIDER_STEP = 0.001;

const clampSliderRatio = (value: number): number => {
  const safeValue = Number.isFinite(value) ? value : ERASER_SLIDER_MIN;
  return Math.min(ERASER_SLIDER_MAX, Math.max(ERASER_SLIDER_MIN, safeValue));
};

const getEraserSizeRatio = (size: number): number => {
  const { max, min } = appConfig.toolbar.eraser;
  return (clampEraserSize(size) - min) / (max - min);
};

export const getEraserSizeFromSliderRatio = (sliderRatio: number): number => {
  const { max, min } = appConfig.toolbar.eraser;
  return clampEraserSize(min + (max - min) * clampSliderRatio(sliderRatio) ** 2);
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
      appConfig.toolbar.eraser.controlScaleMin +
      (appConfig.toolbar.eraser.controlScaleMax -
        appConfig.toolbar.eraser.controlScaleMin) *
        sizeRatio;
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
