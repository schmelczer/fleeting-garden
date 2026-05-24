import { approach, clamp, clamp01, smoothstep } from '../utils/math';
import type { GardenAudioConfig } from './garden-audio-config';
import type { GardenAudioStrokeMetrics } from './garden-audio-input';

interface GardenAudioGestureFrame {
  activity: number;
  maniaAmount: number;
}

export class GardenAudioGestureState {
  private activity = 0;
  private maniaAmount = 0;
  private isManic = false;

  public constructor(private readonly inputConfig: GardenAudioConfig['input']) {}

  public recordStroke({
    metrics,
  }: {
    metrics: GardenAudioStrokeMetrics;
  }): GardenAudioGestureFrame {
    const targetActivity = this.getTargetActivity(metrics);
    const activityTimeConstant =
      targetActivity > this.activity
        ? this.inputConfig.activityAttackSeconds
        : this.inputConfig.activityReleaseSeconds;
    this.activity = approach(
      this.activity,
      targetActivity,
      metrics.elapsedSeconds,
      activityTimeConstant
    );

    if (this.activity >= this.inputConfig.manicActivityThreshold) {
      this.isManic = true;
    } else if (this.activity <= this.inputConfig.manicReleaseThreshold) {
      this.isManic = false;
    }

    const maniaTarget = this.isManic
      ? smoothstep(this.inputConfig.manicReleaseThreshold, 1, this.activity)
      : 0;
    this.maniaAmount = approach(
      this.maniaAmount,
      maniaTarget,
      metrics.elapsedSeconds,
      this.inputConfig.maniaSmoothingSeconds
    );

    return {
      activity: this.activity,
      maniaAmount: this.maniaAmount,
    };
  }

  public reset(): void {
    this.activity = 0;
    this.maniaAmount = 0;
    this.isManic = false;
  }

  private getTargetActivity(metrics: GardenAudioStrokeMetrics): number {
    const speedRange =
      this.inputConfig.fullActivitySpeed - this.inputConfig.activityNoiseFloorSpeed;
    const speedAmount = clamp01(
      (metrics.normalizedSpeed - this.inputConfig.activityNoiseFloorSpeed) / speedRange
    );
    const distanceAmount = clamp01(
      metrics.normalizedDistance / this.inputConfig.minAudibleDistance
    );
    const activity = Math.pow(speedAmount, this.inputConfig.activityCurve);

    return clamp(activity * distanceAmount, 0, this.inputConfig.activitySoftCeiling);
  }
}
