import {
  MAX_MIRROR_SEGMENT_COUNT,
  MIN_MIRROR_SEGMENT_COUNT,
} from '../game-loop/stroke-mirroring';
import { DEFAULT_MIRROR_SEGMENT_COUNT, settings } from '../settings';
import { queryRequiredElement } from '../utils/dom';

const MIRROR_SEGMENT_STEP = 1;
const MIRROR_SEGMENT_OFF_LABEL = 'Mirror off';
const MIRROR_SEGMENT_FALLBACK_NAME = 'slices';
const MIRROR_SEGMENT_NAMES = {
  2: 'halves',
  3: 'thirds',
  4: 'quarters',
  5: 'fifths',
  6: 'sixths',
  7: 'sevenths',
  8: 'eighths',
  9: 'ninths',
  10: 'tenths',
  11: 'elevenths',
  12: 'twelfths',
} satisfies Record<number, string>;

const clampMirrorSegmentCount = (value: number): number => {
  const safeValue = Number.isFinite(value) ? value : DEFAULT_MIRROR_SEGMENT_COUNT;
  return Math.min(
    MAX_MIRROR_SEGMENT_COUNT,
    Math.max(MIN_MIRROR_SEGMENT_COUNT, Math.round(safeValue))
  );
};

const getMirrorSegmentRatio = (count: number): number => {
  return (
    (count - MIN_MIRROR_SEGMENT_COUNT) /
    (MAX_MIRROR_SEGMENT_COUNT - MIN_MIRROR_SEGMENT_COUNT)
  );
};

const formatMirrorSegmentCount = (count: number): string =>
  count <= 1
    ? MIRROR_SEGMENT_OFF_LABEL
    : `${count} ${
        MIRROR_SEGMENT_NAMES[count as keyof typeof MIRROR_SEGMENT_NAMES] ??
        MIRROR_SEGMENT_FALLBACK_NAME
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

    this.slider.min = MIN_MIRROR_SEGMENT_COUNT.toString();
    this.slider.max = MAX_MIRROR_SEGMENT_COUNT.toString();
    this.slider.step = MIRROR_SEGMENT_STEP.toString();
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
