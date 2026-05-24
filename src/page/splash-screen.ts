import { queryRequiredElement } from '../utils/dom';
import { clamp01 } from '../utils/math';

export class SplashScreen {
  public readonly startButton = queryRequiredElement('.start-button', HTMLButtonElement);
  private readonly splash = queryRequiredElement('.splash', HTMLDivElement);
  private readonly loadingBar = queryRequiredElement('.loading-bar', HTMLDivElement);
  private readonly loadingStatus = queryRequiredElement(
    '.loading-status',
    HTMLDivElement
  );
  private readonly loadingProgress = queryRequiredElement(
    '.loading-progress',
    HTMLDivElement
  );

  private setVisible(element: HTMLElement, isVisible: boolean): void {
    element.dataset.visible = String(isVisible);
    element.setAttribute('aria-hidden', String(!isVisible));
    element.inert = !isVisible;
  }

  public setLoadingStage(label: string, ratio: number): void {
    const percent = Math.round(clamp01(ratio) * 100);
    this.loadingStatus.textContent = label;
    this.loadingProgress.style.setProperty('--loading-progress', `${percent}%`);
    this.loadingProgress.setAttribute('aria-valuenow', String(percent));
  }

  public awaitStart(onStart: () => void): Promise<void> {
    this.startButton.disabled = false;
    return new Promise<void>((resolve) => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' || event.defaultPrevented) {
          return;
        }

        event.preventDefault();
        this.startButton.click();
      };
      const onClick = () => {
        this.startButton.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKeyDown);
        onStart();
        this.setVisible(this.splash, false);
        resolve();
      };

      this.startButton.addEventListener('click', onClick);
      document.addEventListener('keydown', onKeyDown);
    });
  }

  public showLoadingBar(): void {
    this.setVisible(this.loadingBar, true);
  }

  public hideLoadingBar(): void {
    this.setVisible(this.loadingBar, false);
  }
}
