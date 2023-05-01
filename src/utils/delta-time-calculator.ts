export class DeltaTimeCalculator {
  private previousTime: DOMHighResTimeStamp | null = null;

  constructor(private readonly maxDeltaTimeInSeconds: number = 1 / 30) {
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
    return 1 / 60;
    return Math.min(delta / 1000, this.maxDeltaTimeInSeconds);
  }

  private handleVisibilityChange() {
    if (!document.hidden) {
      this.previousTime = null;
    }
  }
}
