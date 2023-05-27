export class CollapsiblePanelAnimator {
  private _isOpen = false;

  public onOpen: () => unknown = () => {};
  public onClose: () => unknown = () => {};

  public constructor(
    private readonly toggleButton: HTMLButtonElement,
    private readonly collapsibleContent: HTMLElement,
    ignoreForCloseOnClick: HTMLElement
  ) {
    toggleButton.addEventListener('click', this.toggle.bind(this));
    window.addEventListener(
      'click',
      (event) => !ignoreForCloseOnClick.contains(event.target as Node) && this.close()
    );
  }

  public open() {
    this._isOpen = true;
    this.collapsibleContent.classList.remove('hidden');
    this.toggleButton.classList.add('active');
    this.onOpen();
  }

  public close() {
    this._isOpen = false;
    this.collapsibleContent.classList.add('hidden');
    this.toggleButton.classList.remove('active');
    this.onClose();
  }

  public toggle() {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public get isOpen() {
    return this._isOpen;
  }
}
