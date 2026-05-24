import { appConfig } from '../config';
import type GameLoop from '../game-loop/game-loop';
import { settings } from '../settings';
import { queryRequiredElement } from '../utils/dom';

const clampEraserSize = (value: number): number => {
  const { default: defaultSize, max, min } = appConfig.toolbar.eraser;
  const safeValue = Number.isFinite(value) ? value : defaultSize;
  return Math.min(max, Math.max(min, Math.round(safeValue)));
};

const getEraserSizeRatio = (size: number): number => {
  const { max, min } = appConfig.toolbar.eraser;
  return (size - min) / (max - min);
};

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
      settings.eraserSize = clampEraserSize(Number(this.slider.value));
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

    this.slider.min = appConfig.toolbar.eraser.min.toString();
    this.slider.max = appConfig.toolbar.eraser.max.toString();
    this.slider.step = appConfig.toolbar.eraser.step.toString();
    this.slider.value = size.toString();
    this.slider.setAttribute('aria-valuetext', `${size}px`);

    const ratio = getEraserSizeRatio(size);
    const scale =
      appConfig.toolbar.eraser.controlScaleMin +
      (appConfig.toolbar.eraser.controlScaleMax -
        appConfig.toolbar.eraser.controlScaleMin) *
        ratio;
    this.control.style.setProperty('--eraser-progress', `${ratio * 100}%`);
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
