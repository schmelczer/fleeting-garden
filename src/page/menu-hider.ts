const DESKTOP_AUTO_HIDE_MEDIA_QUERY =
  '(min-width: 600px) and (hover: hover) and (pointer: fine)';
const HIDE_DELAY_MS = 3000;
const BOTTOM_REVEAL_DISTANCE_PX = 96;

export class MenuHider {
  private readonly desktopMediaQuery = window.matchMedia(DESKTOP_AUTO_HIDE_MEDIA_QUERY);
  private hideTimeout: number | undefined;
  private isHidden = false;
  private pointerInside = false;

  public constructor(
    private readonly element: HTMLElement,
    private readonly shouldBeHidden: () => boolean
  ) {
    element.addEventListener('pointerenter', this.onPointerEnter);
    element.addEventListener('pointerleave', this.onPointerLeave);
    element.addEventListener('focusin', this.onFocusIn);
    element.addEventListener('focusout', this.onFocusOut);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    document.addEventListener('fullscreenchange', this.onVisibilityContextChange);
    this.desktopMediaQuery.addEventListener('change', this.onVisibilityContextChange);

    this.reveal();
  }

  private get canAutoHide(): boolean {
    return (
      this.desktopMediaQuery.matches &&
      this.shouldBeHidden() &&
      !this.pointerInside &&
      !this.element.contains(document.activeElement)
    );
  }

  private readonly onPointerEnter = () => {
    this.pointerInside = true;
    this.reveal();
  };

  private readonly onPointerLeave = () => {
    this.pointerInside = false;
    this.scheduleHide();
  };

  private readonly onFocusIn = () => {
    this.reveal();
  };

  private readonly onFocusOut = () => {
    window.setTimeout(() => this.scheduleHide(), 0);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.desktopMediaQuery.matches || !this.shouldBeHidden()) {
      this.reveal();
      return;
    }

    if (this.isPointerOverDock(event.clientX, event.clientY)) {
      this.pointerInside = true;
      this.reveal();
      return;
    }

    this.pointerInside = false;

    if (this.isHidden) {
      if (this.isNearViewportBottom(event.clientY)) {
        this.reveal();
        this.scheduleHide();
      }
      return;
    }

    this.scheduleHide();
  };

  private readonly onVisibilityContextChange = () => {
    this.scheduleHide();
  };

  private scheduleHide(): void {
    if (!this.canAutoHide) {
      this.clearHideTimeout();
      this.reveal();
      return;
    }

    if (this.hideTimeout !== undefined) {
      return;
    }

    this.hideTimeout = window.setTimeout(() => {
      this.hideTimeout = undefined;
      if (this.canAutoHide) {
        this.hide();
      }
    }, HIDE_DELAY_MS);
  }

  private reveal(): void {
    if (!this.isHidden && this.hideTimeout === undefined) {
      return;
    }

    this.clearHideTimeout();
    this.isHidden = false;
    this.element.classList.remove('menu-hidden');
  }

  private hide(): void {
    this.isHidden = true;
    this.element.classList.add('menu-hidden');
  }

  private clearHideTimeout(): void {
    if (this.hideTimeout === undefined) {
      return;
    }

    window.clearTimeout(this.hideTimeout);
    this.hideTimeout = undefined;
  }

  private isPointerOverDock(clientX: number, clientY: number): boolean {
    const rect = this.element.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  private isNearViewportBottom(clientY: number): boolean {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    return clientY >= viewportHeight - BOTTOM_REVEAL_DISTANCE_PX;
  }
}
