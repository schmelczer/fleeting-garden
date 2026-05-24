import { approach, clamp01 } from '../utils/math';
import type { GardenAudioConfig, GardenAudioVibeProfile } from './garden-audio-config';

export class GardenAudioEnergy {
  private isGestureActive = false;
  private energy = 0;
  private targetEnergy = 0;
  private lastEnergyUpdateAt = 0;

  public constructor(private readonly config: GardenAudioConfig) {}

  public beginGesture(now: number): void {
    this.isGestureActive = true;
    this.lastEnergyUpdateAt = now;
  }

  public endGesture(): void {
    this.isGestureActive = false;
    this.targetEnergy = 0;
  }

  public recordStroke(strokeEnergy: number, profile: GardenAudioVibeProfile): void {
    this.targetEnergy = Math.max(this.targetEnergy, strokeEnergy);
    if (this.isGestureActive) {
      this.energy = Math.max(this.energy, strokeEnergy * profile.rampUpIntensity);
    }
  }

  public silence(): void {
    this.targetEnergy = 0;
    this.energy = 0;
  }

  public update(now: number, profile: GardenAudioVibeProfile): void {
    if (this.lastEnergyUpdateAt <= 0) {
      this.lastEnergyUpdateAt = now;
      return;
    }

    const elapsedSeconds = now - this.lastEnergyUpdateAt;
    this.lastEnergyUpdateAt = now;
    this.targetEnergy *= Math.exp(
      -elapsedSeconds / this.config.energy.strokeDecaySeconds
    );

    const target = this.isGestureActive ? this.targetEnergy : 0;
    let timeConstant = this.config.energy.decaySeconds;
    if (!this.isGestureActive) {
      timeConstant = this.config.energy.releaseSeconds;
    } else if (target > this.energy) {
      timeConstant = profile.rampUpTime;
    }
    this.energy = approach(this.energy, target, elapsedSeconds, timeConstant);
  }

  public getLevel(): number {
    return clamp01(this.energy);
  }

  public reset(): void {
    this.isGestureActive = false;
    this.energy = 0;
    this.targetEnergy = 0;
    this.lastEnergyUpdateAt = 0;
  }
}
