import { clamp } from './clamp';
import { exponentialDecay } from './exponential-decay';

export class DeltaTimeCalculator {
  private static FPS_EXPONENTIAL_DECAY_STRENGTH = 0.01;

  private previousTime: DOMHighResTimeStamp | null = null;
  private deltaTimeAccumulator: number | null = null;

  constructor(
    private readonly maxDeltaTimeInSeconds: number = 1 / 30,
    private readonly minDeltaTimeInSeconds: number = 1 / 240
  ) {
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
    const deltaInSeconds = delta / 1000;

    this.deltaTimeAccumulator = exponentialDecay({
      accumulator: this.deltaTimeAccumulator ?? deltaInSeconds,
      nextValue: deltaInSeconds,
      biasOfNextValue: DeltaTimeCalculator.FPS_EXPONENTIAL_DECAY_STRENGTH,
    });

    return clamp(delta / 1000, this.minDeltaTimeInSeconds, this.maxDeltaTimeInSeconds);
  }

  private handleVisibilityChange() {
    if (!document.hidden) {
      this.previousTime = null;
    }
  }

  public get fps() {
    return 1 / this.deltaTimeAccumulator;
  }
}
