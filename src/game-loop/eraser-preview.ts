import { settings } from '../settings';

export class EraserPreview {
  private previewClientPosition: { x: number; y: number } | null = null;
  private isErasing = false;
  private isPointerHoveringCanvas = false;
  private isSwipeActive = false;
  private previousSize: number | null = null;
  private previousLeft = '';
  private previousTop = '';
  private isVisible = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly element: HTMLElement,
    private readonly getIsSwipeActive: () => boolean
  ) {}

  public attach(): void {
    this.canvas.addEventListener('pointerenter', this.onPointerEnter);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  public detach(): void {
    this.canvas.removeEventListener('pointerenter', this.onPointerEnter);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  public setEraseMode(isErasing: boolean): void {
    this.isErasing = isErasing;
    this.update();
  }

  public update(event?: PointerEvent): void {
    this.isSwipeActive = this.getIsSwipeActive();

    if (event) {
      this.previewClientPosition = {
        x: event.clientX,
        y: event.clientY,
      };
    }

    if (this.previousSize !== settings.eraserSize) {
      this.element.style.setProperty('--eraser-preview-size', `${settings.eraserSize}px`);
      this.previousSize = settings.eraserSize;
    }

    if (
      !this.isErasing ||
      this.previewClientPosition === null ||
      (!this.isPointerHoveringCanvas && !this.isSwipeActive)
    ) {
      this.setVisible(false);
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const left = `${this.previewClientPosition.x - rect.left}px`;
    const top = `${this.previewClientPosition.y - rect.top}px`;
    if (this.previousLeft !== left) {
      this.element.style.left = left;
      this.previousLeft = left;
    }
    if (this.previousTop !== top) {
      this.element.style.top = top;
      this.previousTop = top;
    }
    this.setVisible(true);
  }

  private setVisible(isVisible: boolean): void {
    if (this.isVisible === isVisible) {
      return;
    }

    this.isVisible = isVisible;
    this.element.classList.toggle('visible', isVisible);
  }

  private isPointerInsideCanvas(event: PointerEvent): boolean {
    const rect = this.canvas.getBoundingClientRect();
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.isPointerHoveringCanvas = true;
    this.update(event);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    this.update(event);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    this.isPointerHoveringCanvas = this.isPointerInsideCanvas(event);
    this.update(event);
  };

  private readonly onPointerEnter = (event: PointerEvent) => {
    this.isPointerHoveringCanvas = true;
    this.update(event);
  };

  private readonly onPointerLeave = () => {
    this.isPointerHoveringCanvas = false;
    this.update();
  };
}
