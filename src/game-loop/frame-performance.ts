import { settings } from '../settings';

const ADAPTIVE_REFRESH_TARGET_FPS = 60;
const ADAPTIVE_CAP_DECREASE_AGENTS_PER_SECOND = 200_000;
const FRAME_GAP_RESET_SECONDS = 1;
const FPS_HEADROOM = 0.9;
const FPS_SMOOTHING_NEW = 0.06;
const FPS_SMOOTHING_RETAIN = 1 - FPS_SMOOTHING_NEW;

export class FramePerformance {
  public smoothedFps = ADAPTIVE_REFRESH_TARGET_FPS;
  public measuredFps = 0;
  public frameDeltaSeconds = 0;
  public measuredFrameTimeMs = 0;

  private previousFrameTime: DOMHighResTimeStamp | null = null;

  public get adaptiveCapInitial(): number {
    return settings.adaptiveCapInitial;
  }

  public get adaptiveCapMin(): number {
    return settings.adaptiveCapMin;
  }

  public get hasAdaptiveCapHeadroom(): boolean {
    return this.smoothedFps >= ADAPTIVE_REFRESH_TARGET_FPS * FPS_HEADROOM;
  }

  public get adaptiveCapDecreaseAgents(): number {
    return Math.max(
      1,
      Math.ceil(ADAPTIVE_CAP_DECREASE_AGENTS_PER_SECOND * this.frameDeltaSeconds)
    );
  }

  public update(time: DOMHighResTimeStamp): void {
    const previous = this.previousFrameTime;
    this.previousFrameTime = time;
    if (previous === null) {
      return;
    }

    const deltaSeconds = (time - previous) / 1000;
    if (deltaSeconds <= 0) {
      return;
    }

    this.measuredFrameTimeMs = deltaSeconds * 1000;
    const fps = 1 / deltaSeconds;
    this.measuredFps = fps;
    if (deltaSeconds > FRAME_GAP_RESET_SECONDS) {
      this.frameDeltaSeconds = 0;
      this.smoothedFps = ADAPTIVE_REFRESH_TARGET_FPS;
      return;
    }

    this.frameDeltaSeconds = deltaSeconds;
    this.smoothedFps = this.smoothedFps * FPS_SMOOTHING_RETAIN + fps * FPS_SMOOTHING_NEW;
  }
}
