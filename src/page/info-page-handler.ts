export class InfoPageHandler {
  public constructor(
    private readonly infoButton: HTMLButtonElement,
    private readonly infoPage: HTMLElement
  ) {
    infoButton.addEventListener('click', () => {
      infoPage.classList.toggle('hidden');
    });
  }
}
