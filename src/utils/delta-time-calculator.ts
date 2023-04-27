export class DeltaTimeCalculator {
  private previousTime: DOMHighResTimeStamp | null = null;

  constructor() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
  }

  public calculateDeltaTimeInSeconds(
    currentTime: DOMHighResTimeStamp
  ): DOMHighResTimeStamp {
    if (this.previousTime === null) {
      this.previousTime = currentTime;
    }

    const delta = currentTime - this.previousTime;
    this.previousTime = currentTime;
    return delta / 1000;
  }

  private handleVisibilityChange() {
    if (!document.hidden) {
      this.previousTime = null;
    }
  }
}
