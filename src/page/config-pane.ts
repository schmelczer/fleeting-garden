import type { BindingParams, FolderApi } from '@tweakpane/core';
import { Pane } from 'tweakpane';

import type { GardenAudioVibeSettings } from '../audio/garden-audio-config';
import {
  normalizeNumberControlValue,
  runtimeControls,
  type GardenRuntimeSettings,
  type NumberControlConfig,
} from '../config';
import { perfStatsOverlayState } from '../game-loop/perf-stats-overlay';
import { activeVibe, settings } from '../settings';
import { hexColorToRgbColor, rgbColorToHex, type RgbColor } from '../utils/rgb-color';
import { ColorReactionMatrixControl } from './color-reaction-matrix-control';

type PaneContainer = Pick<FolderApi, 'addBinding' | 'addButton' | 'addFolder'>;
type RuntimeControlKey = keyof GardenRuntimeSettings & string;
type VibeColorKey = 'color1' | 'color2' | 'color3' | 'backgroundColor';
type NumberPropertyKey<T> = {
  [Key in keyof T]-?: T[Key] extends number ? Key : never;
}[keyof T] &
  string;
type VibeNumberKey = NumberPropertyKey<GardenAudioVibeSettings>;

interface PaneState extends GardenAudioVibeSettings {
  backgroundColor: string;
  color1: string;
  color2: string;
  color3: string;
}

const runtimeFolderOrder = ['Brush', 'Movement', 'Look', 'Performance'] as const;
const CONFIG_PANE_TITLE = 'Garden Settings';
const CONFIG_PANE_START_HIDDEN = true;

const MUSIC_CONTROLS: ReadonlyArray<{
  key: VibeNumberKey;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'idleIntensity', label: 'Ambient Notes', min: 0, max: 1, step: 0.01 },
  { key: 'bpm', label: 'Tempo', min: 48, max: 150, step: 1 },
  { key: 'rampUpIntensity', label: 'Touch Energy', min: 0, max: 2, step: 0.01 },
  { key: 'rampUpTime', label: 'Response Time', min: 0.01, max: 0.4, step: 0.01 },
  { key: 'noteLength', label: 'Note Length', min: 0.1, max: 1.8, step: 0.01 },
  { key: 'notePitchOffset', label: 'Pitch Shift', min: -12, max: 12, step: 1 },
  { key: 'brightness', label: 'Tone Brightness', min: 0.5, max: 1.5, step: 0.01 },
];

interface ConfigPaneOptions {
  maxSupportedAgentCount: number;
  onConfigChange: () => void;
  onOpen?: () => void;
  onRuntimeChange: () => void;
  settingsButton: HTMLButtonElement;
}

const getRuntimeControlKeys = (folder: string): Array<RuntimeControlKey> =>
  (
    Object.entries(runtimeControls) as Array<
      [RuntimeControlKey, NumberControlConfig | undefined]
    >
  )
    .filter(([, config]) => config?.folder === folder)
    .map(([key]) => key);

const getNumberBindingParams = (config: NumberControlConfig): BindingParams => {
  const params: BindingParams = {
    label: config.label,
    options: config.options,
    step: config.step,
  };
  if (config.format !== undefined) {
    params.format = config.format;
  }
  if (config.min !== undefined) {
    params.min = config.min;
  }
  if (config.max !== undefined) {
    params.max = config.max;
  }
  return params;
};

const getInvertedNumberControlValue = (
  value: number,
  config: NumberControlConfig
): number => {
  if (!config.inverted || config.min === undefined || config.max === undefined) {
    return value;
  }
  return config.min + config.max - value;
};

export class ConfigPane {
  private readonly container: HTMLDivElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly colorReactionMatrix: ColorReactionMatrixControl;
  private readonly pane: Pane;
  private readonly state: PaneState = {
    backgroundColor: rgbColorToHex(activeVibe.backgroundColor),
    color1: rgbColorToHex(activeVibe.colors[0]),
    color2: rgbColorToHex(activeVibe.colors[1]),
    color3: rgbColorToHex(activeVibe.colors[2]),
    ...activeVibe.audio,
  };

  public constructor(private readonly options: ConfigPaneOptions) {
    this.colorReactionMatrix = new ColorReactionMatrixControl(
      this.options.onRuntimeChange
    );
    this.container = document.createElement('div');
    this.container.className = 'config-pane-container';

    this.closeButton = document.createElement('button');
    this.closeButton.className = 'config-pane-close';
    this.closeButton.type = 'button';
    this.closeButton.setAttribute('aria-label', 'Hide config overlay');
    this.closeButton.title = 'Hide config overlay';
    this.closeButton.addEventListener('click', () => this.setHidden(true));
    this.container.appendChild(this.closeButton);

    document.body.appendChild(this.container);

    this.pane = new Pane({
      container: this.container,
      title: CONFIG_PANE_TITLE,
      expanded: true,
    });
    this.pane.hidden = CONFIG_PANE_START_HIDDEN;
    this.pane.element.classList.add('config-pane');
    this.pane.element.id = 'config-pane';

    this.options.settingsButton.setAttribute('aria-controls', this.pane.element.id);
    this.options.settingsButton.addEventListener('click', this.toggle);
    document.addEventListener('pointerdown', this.dismissOnOutsidePointerDown, {
      passive: true,
    });
    document.addEventListener('keydown', this.dismissOnEscape);

    this.setUpTuningPane(this.pane);
    this.syncOpenState();
  }

  public get isOpen(): boolean {
    return !this.pane.hidden;
  }

  public refresh(): void {
    this.syncVibeState();
    this.pane.refresh();
    this.colorReactionMatrix.sync();
    this.syncOpenState();
  }

  public close(): void {
    this.setHidden(true);
  }

  private readonly toggle = () => {
    this.setHidden(!this.pane.hidden);
  };

  private readonly dismissOnOutsidePointerDown = (event: PointerEvent) => {
    if (!this.isOpen || !(event.target instanceof Node)) {
      return;
    }

    if (
      this.container.contains(event.target) ||
      this.options.settingsButton.contains(event.target)
    ) {
      return;
    }

    this.setHidden(true);
  };

  private readonly dismissOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.isOpen) {
      this.setHidden(true);
    }
  };

  private setHidden(isHidden: boolean): void {
    const wasOpen = this.isOpen;
    this.pane.hidden = isHidden;
    this.syncOpenState();
    if (!wasOpen && this.isOpen) {
      this.options.onOpen?.();
    }
  }

  private setUpTuningPane(container: PaneContainer): void {
    this.setUpVibeSection(container);
    this.addRuntimeSection(container, runtimeFolderOrder[0], true);
    this.addRuntimeSection(container, runtimeFolderOrder[1], true);
    this.colorReactionMatrix.addTo(container);
    this.addRuntimeSection(container, runtimeFolderOrder[2], true);
    const performanceFolder = this.addRuntimeSection(
      container,
      runtimeFolderOrder[3],
      true
    );
    this.addFpsOverlayBinding(performanceFolder);
    this.setUpMusicSection(container);
    this.colorReactionMatrix.sync();
  }

  private setUpVibeSection(container: PaneContainer): void {
    const folder = container.addFolder({
      title: 'Colors',
      expanded: true,
    });

    this.addColorBinding(folder, 'color1', '', (color) => {
      activeVibe.colors[0] = color;
    });
    this.addColorBinding(folder, 'color2', '', (color) => {
      activeVibe.colors[1] = color;
    });
    this.addColorBinding(folder, 'color3', '', (color) => {
      activeVibe.colors[2] = color;
    });
    this.addColorBinding(folder, 'backgroundColor', 'Background Color', (color) => {
      activeVibe.backgroundColor = color;
    });

    if (import.meta.env.DEV) {
      folder
        .addButton({ title: 'Copy Vibe Preset' })
        .on('click', () => void this.copyVibePresetToClipboard());
    }
  }

  private addColorBinding(
    container: PaneContainer,
    key: VibeColorKey,
    label: string,
    updateColor: (color: RgbColor) => void
  ): void {
    container
      .addBinding(this.state, key, {
        label,
        view: 'color',
      } as BindingParams)
      .on('change', ({ value }) => {
        const color = hexColorToRgbColor(String(value));
        if (!color) {
          this.syncVibeState();
          this.pane.refresh();
          return;
        }

        updateColor(color);
        this.colorReactionMatrix.sync();
        this.options.onConfigChange();
      });
  }

  private addRuntimeSection(
    container: PaneContainer,
    title: string,
    expanded: boolean
  ): PaneContainer {
    const folder = container.addFolder({ title, expanded });
    getRuntimeControlKeys(title).forEach((key) => this.addRuntimeBinding(folder, key));
    return folder;
  }

  private addRuntimeBinding(container: PaneContainer, key: RuntimeControlKey): void {
    const config = this.getRuntimeControlConfig(key);
    if (!config) {
      return;
    }

    settings[key] = normalizeNumberControlValue(settings[key], config);
    const bindingTarget = this.getRuntimeBindingTarget(key, config);

    container
      .addBinding(bindingTarget, key, getNumberBindingParams(config))
      .on('change', () => {
        const nextValue = normalizeNumberControlValue(settings[key], config);
        if (nextValue !== settings[key]) {
          settings[key] = nextValue;
          this.pane.refresh();
        }
        this.options.onRuntimeChange();
      });
  }

  private getRuntimeBindingTarget(
    key: RuntimeControlKey,
    config: NumberControlConfig
  ): typeof settings | Record<RuntimeControlKey, number> {
    if (!config.inverted) {
      return settings;
    }

    const bindingTarget = {} as Record<RuntimeControlKey, number>;
    Object.defineProperty(bindingTarget, key, {
      enumerable: true,
      get: () => getInvertedNumberControlValue(settings[key], config),
      set: (value: number) => {
        settings[key] = getInvertedNumberControlValue(value, config);
      },
    });
    return bindingTarget;
  }

  private getRuntimeControlConfig(
    key: RuntimeControlKey
  ): NumberControlConfig | undefined {
    const config = runtimeControls[key];
    if (!config || key !== 'maxAgentCount') {
      return config;
    }

    return {
      ...config,
      max: Math.max(config.min ?? 0, Math.floor(this.options.maxSupportedAgentCount)),
    };
  }

  private addFpsOverlayBinding(container: PaneContainer): void {
    container
      .addBinding(perfStatsOverlayState, 'isVisible', {
        label: 'Show FPS',
      })
      .on('change', () => this.options.onConfigChange());
  }

  private setUpMusicSection(container: PaneContainer): void {
    const folder = container.addFolder({ title: 'Music', expanded: true });
    MUSIC_CONTROLS.forEach(({ key, label, min, max, step }) => {
      this.addVibeNumberBinding(folder, key, { folder: 'Music', label, min, max, step });
    });
  }

  private addVibeNumberBinding(
    container: PaneContainer,
    key: VibeNumberKey,
    config: NumberControlConfig
  ): void {
    this.state[key] = normalizeNumberControlValue(this.state[key], config);

    container
      .addBinding(this.state, key, getNumberBindingParams(config))
      .on('change', () => {
        const nextValue = normalizeNumberControlValue(this.state[key], config);
        if (nextValue !== this.state[key]) {
          this.state[key] = nextValue;
          this.pane.refresh();
        }
        activeVibe.audio[key] = nextValue;
        this.options.onConfigChange();
      });
  }

  private async copyVibePresetToClipboard(): Promise<void> {
    const settingKeys = Object.keys(activeVibe.settings) as Array<
      keyof typeof activeVibe.settings
    >;
    const preset = {
      name: `${activeVibe.name} Copy`,
      colors: activeVibe.colors,
      backgroundColor: activeVibe.backgroundColor,
      settings: Object.fromEntries(settingKeys.map((key) => [key, settings[key]])),
      audio: activeVibe.audio,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(preset, null, 2));
    } catch (error) {
      console.warn('Could not copy vibe preset to clipboard.', error);
    }
  }

  private syncVibeState(): void {
    this.state.color1 = rgbColorToHex(activeVibe.colors[0]);
    this.state.color2 = rgbColorToHex(activeVibe.colors[1]);
    this.state.color3 = rgbColorToHex(activeVibe.colors[2]);
    this.state.backgroundColor = rgbColorToHex(activeVibe.backgroundColor);
    Object.assign(this.state, activeVibe.audio);
  }

  private syncOpenState(): void {
    const { settingsButton } = this.options;
    const label = this.isOpen ? 'Hide config overlay' : 'Show config overlay';
    settingsButton.classList.toggle('active', this.isOpen);
    settingsButton.setAttribute('aria-expanded', String(this.isOpen));
    settingsButton.setAttribute('aria-label', label);
    settingsButton.title = label;
    this.container.classList.toggle('config-pane-container--open', this.isOpen);
    this.closeButton.hidden = !this.isOpen;
  }
}
