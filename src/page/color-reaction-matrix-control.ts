import type { FolderApi } from '@tweakpane/core';

import { normalizeNumberControlValue, runtimeControls } from '../config';
import { activeVibe, settings } from '../settings';
import { rgbColorToCss } from '../utils/rgb-color';

type PaneContainer = Pick<FolderApi, 'addFolder'>;
type ColorReactionKey = (typeof colorReactionRows)[number]['keys'][number];

const COLOR_REACTION_LABELS = ['Color 1', 'Color 2', 'Color 3'] as const;
const COLOR_REACTION_STATES = [
  { id: 'follow', label: 'Move Toward', value: 1 },
  { id: 'ignore', label: 'Ignore', value: 0 },
  { id: 'avoid', label: 'Move Away', value: -1 },
] as const;

const colorReactionRows = [
  {
    colorIndex: 0,
    label: COLOR_REACTION_LABELS[0],
    keys: ['color1ToColor1', 'color1ToColor2', 'color1ToColor3'],
  },
  {
    colorIndex: 1,
    label: COLOR_REACTION_LABELS[1],
    keys: ['color2ToColor1', 'color2ToColor2', 'color2ToColor3'],
  },
  {
    colorIndex: 2,
    label: COLOR_REACTION_LABELS[2],
    keys: ['color3ToColor1', 'color3ToColor2', 'color3ToColor3'],
  },
] as const;

const getColorReactionStateIndex = (value: number): number =>
  COLOR_REACTION_STATES.findIndex((state) => state.value === value);

const getColorReactionState = (value: number): (typeof COLOR_REACTION_STATES)[number] =>
  COLOR_REACTION_STATES[getColorReactionStateIndex(value)] ?? COLOR_REACTION_STATES[1];

const getNextColorReactionState = (
  value: number
): (typeof COLOR_REACTION_STATES)[number] => {
  const index = getColorReactionStateIndex(value);
  return COLOR_REACTION_STATES[
    ((index < 0 ? 1 : index) + 1) % COLOR_REACTION_STATES.length
  ];
};

export class ColorReactionMatrixControl {
  private readonly buttons = new Map<
    ColorReactionKey,
    {
      element: HTMLButtonElement;
      sourceColorIndex: number;
      targetColorIndex: number;
    }
  >();
  private readonly swatches: Array<{
    colorIndex: number;
    element: HTMLElement;
  }> = [];

  public constructor(private readonly onRuntimeChange: () => void) {}

  public addTo(container: PaneContainer): void {
    const folder = container.addFolder({
      title: 'Color Behavior',
      expanded: true,
    });

    const matrix = document.createElement('div');
    matrix.className = 'color-reaction-matrix';

    matrix.appendChild(this.createCorner());
    colorReactionRows.forEach((row) => {
      matrix.appendChild(this.createHeader(row.colorIndex, row.label));
    });

    colorReactionRows.forEach((row) => {
      matrix.appendChild(this.createHeader(row.colorIndex, row.label));
      row.keys.forEach((key, columnIndex) => {
        matrix.appendChild(this.createCell(key, row.colorIndex, columnIndex));
      });
    });

    const matrixBlade = folder.addBlade({ view: 'separator' });
    matrixBlade.element.classList.add('color-reaction-matrix-blade');
    matrixBlade.element.replaceChildren(matrix);
    this.sync();
  }

  public sync(): void {
    this.buttons.forEach(({ element, sourceColorIndex, targetColorIndex }, key) => {
      this.syncButton(element, key, sourceColorIndex, targetColorIndex);
    });

    this.swatches.forEach(({ colorIndex, element }) => {
      element.style.backgroundColor = rgbColorToCss(activeVibe.colors[colorIndex]);
    });
  }

  private createCorner(): HTMLDivElement {
    const corner = document.createElement('div');
    corner.className = 'color-reaction-matrix__corner';
    return corner;
  }

  private createHeader(colorIndex: number, label: string): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'color-reaction-matrix__header';
    header.setAttribute('aria-label', label);
    header.title = label;

    const swatch = document.createElement('span');
    swatch.className = 'color-reaction-matrix__swatch';
    this.swatches.push({ colorIndex, element: swatch });
    header.appendChild(swatch);

    return header;
  }

  private createCell(
    key: ColorReactionKey,
    sourceColorIndex: number,
    targetColorIndex: number
  ): HTMLDivElement {
    const cell = document.createElement('div');
    cell.className = 'color-reaction-matrix__cell';

    const config = runtimeControls[key];
    if (!config) {
      return cell;
    }

    const button = document.createElement('button');
    button.className = 'color-reaction-matrix__button';
    button.type = 'button';

    const icon = document.createElement('span');
    icon.className = 'color-reaction-matrix__icon';
    button.appendChild(icon);

    button.addEventListener('click', () => {
      const currentValue = normalizeNumberControlValue(settings[key], config);
      const nextState = getNextColorReactionState(currentValue);
      settings[key] = nextState.value;
      this.syncButton(button, key, sourceColorIndex, targetColorIndex);
      this.onRuntimeChange();
    });

    this.buttons.set(key, {
      element: button,
      sourceColorIndex,
      targetColorIndex,
    });
    cell.appendChild(button);

    return cell;
  }

  private syncButton(
    button: HTMLButtonElement,
    key: ColorReactionKey,
    sourceColorIndex: number,
    targetColorIndex: number
  ): void {
    const config = runtimeControls[key];
    if (!config) {
      return;
    }

    settings[key] = normalizeNumberControlValue(settings[key], config);

    const state = getColorReactionState(settings[key]);
    const nextState = getNextColorReactionState(settings[key]);
    const sourceLabel = COLOR_REACTION_LABELS[sourceColorIndex];
    const targetLabel = COLOR_REACTION_LABELS[targetColorIndex];

    button.dataset.reaction = state.id;
    button.setAttribute(
      'aria-label',
      `${sourceLabel} ${state.label.toLowerCase()} ${targetLabel.toLowerCase()} trails; click to switch to ${nextState.label.toLowerCase()}`
    );
    button.title = `${sourceLabel}: ${state.label} ${targetLabel} trails`;
  }
}
