export class CollapsiblePanelAnimator {
  private _isOpen = false;
  private focusBeforeOpen: HTMLElement | null = null;
  private readonly abortController = new AbortController();
  public onOpen?: () => void;

  public constructor(
    private readonly toggleButton: HTMLButtonElement,
    private readonly collapsibleContent: HTMLElement,
    ignoreForCloseOnClick: HTMLElement
  ) {
    const { signal } = this.abortController;
    toggleButton.addEventListener('click', this.toggle, { signal });
    window.addEventListener(
      'click',
      (event) => !ignoreForCloseOnClick.contains(event.target as Node) && this.close(),
      { signal }
    );
    window.addEventListener(
      'keydown',
      (event) => {
        if (this._isOpen && event.key === 'Escape') {
          event.preventDefault();
          this.close();
        }
      },
      { signal }
    );
    this.syncAccessibility();
  }

  public open() {
    if (this._isOpen) {
      return;
    }

    this.focusBeforeOpen =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this._isOpen = true;
    this.onOpen?.();
    this.syncAccessibility();
    this.focusPanel();
  }

  public close() {
    if (!this._isOpen) {
      return;
    }

    const focusWasInside = this.collapsibleContent.contains(document.activeElement);
    this._isOpen = false;
    this.syncAccessibility();

    if (focusWasInside) {
      (this.focusBeforeOpen ?? this.toggleButton).focus({ preventScroll: true });
    }
  }

  public readonly toggle = () => {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  };

  public destroy(): void {
    this.abortController.abort();
  }

  public get isOpen() {
    return this._isOpen;
  }

  private syncAccessibility() {
    this.collapsibleContent.classList.toggle('hidden', !this._isOpen);
    this.toggleButton.classList.toggle('active', this._isOpen);
    this.toggleButton.setAttribute('aria-expanded', String(this._isOpen));
    this.collapsibleContent.setAttribute('aria-hidden', String(!this._isOpen));
    this.collapsibleContent.inert = !this._isOpen;
  }

  private focusPanel() {
    requestAnimationFrame(() => {
      if (this._isOpen) {
        this.collapsibleContent.focus({ preventScroll: true });
      }
    });
  }
}
