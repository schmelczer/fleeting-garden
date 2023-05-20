export class MenuHider {
  private static readonly DEFAULT_TIME_TO_LIVE = 3500;
  private static readonly INTERVAL = 50;
  private timeToLive = MenuHider.DEFAULT_TIME_TO_LIVE;

  public constructor(element: HTMLElement, shouldBeHidden: () => boolean) {
    setInterval(() => {
      this.timeToLive = Math.max(0, this.timeToLive - MenuHider.INTERVAL);
      element.style.opacity = this.timeToLive == 0 && shouldBeHidden() ? '0' : '1';
    }, MenuHider.INTERVAL);

    element.addEventListener(
      'mouseover',
      () => (this.timeToLive = MenuHider.DEFAULT_TIME_TO_LIVE)
    );
  }
}
