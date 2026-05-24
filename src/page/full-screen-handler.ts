export class FullScreenHandler {
  private readonly abortController = new AbortController();

  public constructor(
    private readonly toggleButton: HTMLElement,
    target: HTMLElement
  ) {
    if (!document.fullscreenEnabled || typeof target.requestFullscreen !== 'function') {
      toggleButton.hidden = true;
      return;
    }

    this.updateButtons();

    const { signal } = this.abortController;
    addEventListener('fullscreenchange', this.updateButtons, { signal });
    toggleButton.addEventListener(
      'click',
      () => {
        if (FullScreenHandler.isInFullScreenMode()) {
          void document.exitFullscreen();
          return;
        }

        void target.requestFullscreen().catch(() => undefined);
      },
      { signal }
    );
  }

  public static isInFullScreenMode(): boolean {
    return document.fullscreenElement !== null;
  }

  public destroy(): void {
    this.abortController.abort();
  }

  private readonly updateButtons = (): void => {
    const isInFullScreenMode = FullScreenHandler.isInFullScreenMode();
    const label = isInFullScreenMode ? 'Exit fullscreen' : 'Enter fullscreen';
    this.toggleButton.classList.toggle('active', isInFullScreenMode);
    this.toggleButton.setAttribute('aria-label', label);
    this.toggleButton.title = label;
  };
}
