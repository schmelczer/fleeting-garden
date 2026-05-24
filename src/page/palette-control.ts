import type GameLoop from '../game-loop/game-loop';
import { activeVibe, settings } from '../settings';
import { ErrorCode, RuntimeError } from '../utils/error-handler';
import { rgbColorToCss } from '../utils/rgb-color';

interface PaletteControlOptions {
  getGame: () => GameLoop | null;
  onChange: () => void;
  onModeChange?: (isEraserActive: boolean) => void;
}

export class PaletteControl {
  private readonly swatches = queryRequiredColorSwatches();
  private isEraserActiveState = false;

  public constructor(private readonly options: PaletteControlOptions) {
    this.swatches.forEach((swatch, index) => {
      swatch.addEventListener('click', () => {
        settings.selectedColorIndex = index;
        this.isEraserActiveState = false;
        this.render();
        this.options.onModeChange?.(false);
        this.options.onChange();
      });
    });
  }

  public get isEraserActive(): boolean {
    return this.isEraserActiveState;
  }

  public setEraserActive(active: boolean): void {
    this.isEraserActiveState = active;
    this.render();
    this.options.onModeChange?.(active);
  }

  public render(): void {
    this.swatches.forEach((swatch, index) => {
      swatch.style.backgroundColor = rgbColorToCss(activeVibe.colors[index]);
      const isActive = settings.selectedColorIndex === index && !this.isEraserActiveState;
      swatch.classList.toggle('active', isActive);
      swatch.setAttribute('aria-pressed', String(isActive));
    });
    this.options.getGame()?.setEraseMode(this.isEraserActiveState);
    document.documentElement.style.setProperty(
      '--garden-background',
      rgbColorToCss(activeVibe.backgroundColor)
    );
  }
}

const queryRequiredColorSwatches = (): Array<HTMLButtonElement> => {
  const selector = '.color-swatch';
  const swatches = Array.from(document.querySelectorAll(selector));
  const expectedCount = activeVibe.colors.length;
  const hasExpectedSwatches =
    swatches.length === expectedCount &&
    swatches.every((swatch) => swatch instanceof HTMLButtonElement);

  if (!hasExpectedSwatches) {
    throw new RuntimeError(
      ErrorCode.DOM_ELEMENT_MISSING,
      `Expected ${expectedCount} color swatches.`,
      {
        details: {
          actualCount: swatches.length,
          expectedCount,
          selector,
        },
      }
    );
  }

  return swatches as Array<HTMLButtonElement>;
};
