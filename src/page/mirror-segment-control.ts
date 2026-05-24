import { appConfig } from '../config';
import { settings } from '../settings';
import { queryRequiredElement } from '../utils/dom';

const clampMirrorSegmentCount = (value: number): number => {
  const { default: defaultCount, max, min } = appConfig.toolbar.mirror;
  const safeValue = Number.isFinite(value) ? value : defaultCount;
  return Math.min(max, Math.max(min, Math.round(safeValue)));
};

const getMirrorSegmentRatio = (count: number): number => {
  const { max, min } = appConfig.toolbar.mirror;
  return (count - min) / (max - min);
};

const formatMirrorSegmentCount = (count: number): string =>
  count <= 1
    ? appConfig.toolbar.mirror.offLabel
    : `${count} ${
        appConfig.toolbar.mirror.names[
          count as keyof typeof appConfig.toolbar.mirror.names
        ] ?? appConfig.toolbar.mirror.fallbackSegmentName
      }`;

interface MirrorSegmentControlOptions {
  onChange: () => void;
}

export class MirrorSegmentControl {
  private readonly control = queryRequiredElement(
    '.mirror-segment-control',
    HTMLLabelElement
  );
  private readonly slider = queryRequiredElement(
    '.mirror-segment-slider',
    HTMLInputElement
  );

  public constructor(private readonly options: MirrorSegmentControlOptions) {
    this.slider.addEventListener('input', () => {
      settings.mirrorSegmentCount = clampMirrorSegmentCount(Number(this.slider.value));
      this.render();
      this.options.onChange();
    });
  }

  public render(): void {
    const count = clampMirrorSegmentCount(settings.mirrorSegmentCount);
    if (settings.mirrorSegmentCount !== count) {
      settings.mirrorSegmentCount = count;
    }

    this.slider.min = appConfig.toolbar.mirror.min.toString();
    this.slider.max = appConfig.toolbar.mirror.max.toString();
    this.slider.step = appConfig.toolbar.mirror.step.toString();
    this.slider.value = count.toString();

    const label = formatMirrorSegmentCount(count);
    const ratio = getMirrorSegmentRatio(count);
    this.slider.setAttribute('aria-valuetext', label);
    this.control.title = label;
    this.control.classList.toggle('active', count > 1);
    this.control.style.setProperty('--mirror-progress', `${ratio * 100}%`);
    this.control.style.setProperty('--mirror-angle', `${(360 / count).toFixed(3)}deg`);
  }
}
