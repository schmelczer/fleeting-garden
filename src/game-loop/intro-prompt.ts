import { appConfig } from '../config';

const DRAW_HINT_CLASS = 'draw-hint';

export class IntroPrompt {
  private introComplete = false;
  private introElapsedSeconds = 0;
  private introCompletedAt: number | null = null;
  private hasStartedDrawing = false;

  public constructor(private readonly prompt: HTMLElement) {}

  public get progress(): number {
    return this.introComplete
      ? 1
      : Math.min(
          1,
          this.introElapsedSeconds / appConfig.simulation.intro.durationSeconds
        );
  }

  public get shouldRegenerateTitleOnResize(): boolean {
    return !this.introComplete && !this.hasStartedDrawing;
  }

  public rewindToLeaveRemainingTime(remainingSeconds: number): void {
    if (this.introComplete) {
      return;
    }

    const safeRemainingSeconds = Number.isFinite(remainingSeconds)
      ? Math.max(0, remainingSeconds)
      : 0;
    this.introElapsedSeconds = Math.min(
      this.introElapsedSeconds,
      Math.max(0, appConfig.simulation.intro.durationSeconds - safeRemainingSeconds)
    );
  }

  public update(deltaTime: number): void {
    const now = performance.now();

    if (!this.introComplete) {
      const safeDeltaTime = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
      this.introElapsedSeconds += safeDeltaTime;
    }

    if (
      !this.introComplete &&
      this.introElapsedSeconds >= appConfig.simulation.intro.durationSeconds
    ) {
      this.complete(now);
    }

    if (
      !this.introComplete ||
      this.hasStartedDrawing ||
      this.introCompletedAt === null ||
      now - this.introCompletedAt < appConfig.simulation.intro.drawHintDelayMs
    ) {
      return;
    }

    this.showDrawHint();
  }

  public complete(completedAt = performance.now()): void {
    if (this.introComplete) {
      return;
    }
    this.introComplete = true;
    this.introCompletedAt = completedAt;
    this.hideDrawHint();
  }

  public markStartedDrawing(): void {
    this.hasStartedDrawing = true;
    this.hideDrawHint();
  }

  public destroy(): void {
    this.hideDrawHint();
  }

  private showDrawHint(): void {
    if (this.prompt.classList.contains(DRAW_HINT_CLASS)) {
      return;
    }

    this.prompt.classList.add(DRAW_HINT_CLASS);
    this.prompt.innerHTML = `
      <svg class="draw-hint-mark" viewBox="0 0 128 72" aria-hidden="true" focusable="false">
        <path class="draw-hint-shadow" d="M12 50 C34 18 52 62 70 36 S102 18 116 42" />
        <path class="draw-hint-stroke" d="M12 50 C34 18 52 62 70 36 S102 18 116 42" />
        <circle class="draw-hint-start" cx="12" cy="50" r="4" />
        <circle class="draw-hint-end" cx="116" cy="42" r="7" />
      </svg>
      <span>Draw on the screen</span>
    `;
  }

  private hideDrawHint(): void {
    this.prompt.classList.remove(DRAW_HINT_CLASS);
    this.prompt.replaceChildren();
  }
}
