import {
  clampEraserSize,
  ERASER_SIZE_MAX,
  getElementCssPixelSize,
  getEraserSizeFromSliderRatio,
  getEraserSizeMaxForCssSize,
  getEraserSizeRatio,
  getEraserSliderRatioFromSize,
} from '../config/eraser-size';
import type GameLoop from '../game-loop/game-loop';
import { DEFAULT_ERASER_SIZE, settings } from '../settings';
import { queryRequiredElement } from '../utils/dom';

const ERASER_CONTROL_SCALE_MIN = 0.74;
const ERASER_CONTROL_SCALE_MAX = 1.34;

const ERASER_SLIDER_MIN = 0;
const ERASER_SLIDER_MAX = 1;
const ERASER_SLIDER_STEP = 0.001;

const clampStoredEraserSize = (value: number): number =>
  clampEraserSize(value, ERASER_SIZE_MAX, DEFAULT_ERASER_SIZE);

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
  private readonly canvas = queryRequiredElement('canvas', HTMLCanvasElement);
  private isActive = false;

  public constructor(private readonly options: EraserSizeControlOptions) {
    this.control.addEventListener('pointerdown', this.activate);
    this.control.addEventListener('click', this.activate);
    this.slider.addEventListener('focus', this.activate);
    this.slider.addEventListener('input', () => {
      settings.eraserSize = getEraserSizeFromSliderRatio(
        Number(this.slider.value),
        this.getResponsiveMaxSize()
      );
      this.activate();
      this.render();
      this.options.onChange();
    });
  }

  public render(): void {
    const maxSize = this.getResponsiveMaxSize();
    const storedSize = clampStoredEraserSize(settings.eraserSize);
    if (settings.eraserSize !== storedSize) {
      settings.eraserSize = storedSize;
    }

    const size = clampEraserSize(storedSize, maxSize, DEFAULT_ERASER_SIZE);
    const sliderRatio = getEraserSliderRatioFromSize(size, maxSize);
    this.slider.min = ERASER_SLIDER_MIN.toString();
    this.slider.max = ERASER_SLIDER_MAX.toString();
    this.slider.step = ERASER_SLIDER_STEP.toString();
    this.slider.value = sliderRatio.toString();
    this.slider.setAttribute('aria-valuetext', `${size}px`);

    const sizeRatio = getEraserSizeRatio(size, maxSize);
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

  private getResponsiveMaxSize(): number {
    return getEraserSizeMaxForCssSize(getElementCssPixelSize(this.canvas));
  }

  private syncActiveState(): void {
    this.control.classList.toggle('active', this.isActive);
    this.slider.setAttribute(
      'aria-label',
      this.isActive ? 'Eraser size, active' : 'Eraser size'
    );
  }
}
