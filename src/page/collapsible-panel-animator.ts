export class CollapsiblePanelAnimator {
  private isOpen = false;

  public onOpen: () => unknown = () => {};
  public onClose: () => unknown = () => {};

  public constructor(
    infoButton: HTMLButtonElement,
    private readonly infoPage: HTMLElement
  ) {
    infoButton.addEventListener('click', this.toggle.bind(this));
    window.addEventListener('click', (event) => {
      if ([infoButton, this.infoPage].includes(event.target as HTMLElement)) {
        return;
      }

      if (this.infoPage.contains(event.target as Node)) {
        return;
      }

      this.close();
    });
  }

  public open() {
    this.isOpen = true;
    this.infoPage.classList.remove('hidden');
    this.onOpen();
  }

  public close() {
    this.isOpen = false;
    this.infoPage.classList.add('hidden');
    this.onClose();
  }

  public toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
}
