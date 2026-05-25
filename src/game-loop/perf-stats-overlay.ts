const PERF_STATS_REFRESH_MS = 200;
const UNAVAILABLE_STAT_TEXT = 'n/a';
const ZERO_STAT_TEXT = '0';
const ZERO_FRAME_TIME_TEXT = '0ms';
const ZERO_RESOLUTION_TEXT = '0x0';

export const perfStatsOverlayState = {
  isVisible: import.meta.env.DEV,
};

interface PerfStatsSnapshot {
  time: DOMHighResTimeStamp;
  fps: number;
  agentCount: number;
  frameTimeMs: number;
  gpuPassTimeMs?: number;
  renderWidth: number;
  renderHeight: number;
}

export class PerfStatsOverlay {
  private readonly element: HTMLDivElement;
  private previousUpdateTime = Number.NEGATIVE_INFINITY;
  private previousText = '';

  public constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'perf-stats-overlay';
    this.element.setAttribute('aria-hidden', 'true');
    parent.append(this.element);
  }

  public update({
    time,
    fps,
    agentCount,
    frameTimeMs,
    gpuPassTimeMs,
    renderWidth,
    renderHeight,
  }: PerfStatsSnapshot): void {
    if (time - this.previousUpdateTime < PERF_STATS_REFRESH_MS) {
      return;
    }

    this.previousUpdateTime = time;
    const text = `FPS ${formatFps(fps)}\nAgents ${formatAgentCount(agentCount)}\nFrame ${formatFrameTime(frameTimeMs)}\nGPU passes ${formatOptionalFrameTime(gpuPassTimeMs)}\nResolution ${formatResolution(renderWidth, renderHeight)}`;
    if (text !== this.previousText) {
      this.element.textContent = text;
      this.previousText = text;
    }
  }

  public destroy(): void {
    this.element.remove();
  }
}

const formatFps = (fps: number): string =>
  Number.isFinite(fps) ? Math.max(0, Math.round(fps)).toString() : ZERO_STAT_TEXT;

const formatAgentCount = (agentCount: number): string =>
  Number.isFinite(agentCount)
    ? Math.max(0, Math.round(agentCount)).toLocaleString('en-US')
    : ZERO_STAT_TEXT;

const formatFrameTime = (frameTimeMs: number | undefined): string => {
  if (typeof frameTimeMs !== 'number' || !Number.isFinite(frameTimeMs)) {
    return ZERO_FRAME_TIME_TEXT;
  }

  const safeFrameTimeMs = Math.max(0, frameTimeMs);
  return `${safeFrameTimeMs.toFixed(safeFrameTimeMs < 10 ? 1 : 0)}ms`;
};

const formatOptionalFrameTime = (frameTimeMs: number | undefined): string =>
  typeof frameTimeMs === 'number' && Number.isFinite(frameTimeMs)
    ? formatFrameTime(frameTimeMs)
    : UNAVAILABLE_STAT_TEXT;

const formatResolution = (width: number, height: number): string =>
  Number.isFinite(width) && Number.isFinite(height)
    ? `${Math.max(0, Math.round(width))}x${Math.max(0, Math.round(height))}`
    : ZERO_RESOLUTION_TEXT;
