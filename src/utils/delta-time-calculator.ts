import { appConfig } from '../config';
import { clamp } from './math';

export class DeltaTimeCalculator {
  private previousTime: DOMHighResTimeStamp | null = null;
  private readonly visibilityChangeListener = () => this.handleVisibilityChange();

  constructor() {
    document.addEventListener('visibilitychange', this.visibilityChangeListener);
  }

  public calculateDeltaTimeInSeconds(currentTime: DOMHighResTimeStamp): number {
    if (this.previousTime === null) {
      this.previousTime = currentTime;
    }

    const delta = currentTime - this.previousTime;
    this.previousTime = currentTime;
    return clamp(
      delta / 1000,
      appConfig.deltaTime.minDeltaTimeSeconds,
      appConfig.deltaTime.maxDeltaTimeSeconds
    );
  }

  private handleVisibilityChange() {
    if (!document.hidden) {
      this.previousTime = null;
    }
  }

  public destroy(): void {
    document.removeEventListener('visibilitychange', this.visibilityChangeListener);
  }
}
