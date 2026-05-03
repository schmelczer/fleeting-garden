export class FullScreenHandler {
  public constructor(
    private readonly minimizeButton: HTMLElement,
    private readonly maximizeButton: HTMLElement,
    target: HTMLElement
  ) {
    if (!document.fullscreenEnabled) {
      minimizeButton.style.display = 'none';
      maximizeButton.style.display = 'none';
      return;
    }

    this.updateButtons();

    addEventListener('keydown', (e) => {
      // on full screen request, only apply it to the target
      if (e.key === 'F11') {
        e.preventDefault();
        if (FullScreenHandler.isInFullScreenMode()) {
          document.exitFullscreen();
        } else {
          target.requestFullscreen();
        }
      }
    });
    addEventListener('fullscreenchange', this.updateButtons.bind(this));
    maximizeButton.addEventListener('click', () => target.requestFullscreen());
    minimizeButton.addEventListener('click', () => document.exitFullscreen());
  }

  public static isInFullScreenMode(): boolean {
    return document.fullscreenElement !== null;
  }

  private updateButtons() {
    this.minimizeButton.style.display = FullScreenHandler.isInFullScreenMode()
      ? 'block'
      : 'none';
    this.maximizeButton.style.display = FullScreenHandler.isInFullScreenMode()
      ? 'none'
      : 'block';
  }
}
