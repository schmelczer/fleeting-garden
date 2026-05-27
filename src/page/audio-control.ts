import { DEFAULT_AUDIO_VOLUME, MAX_AUDIO_VOLUME } from '../audio/garden-audio-config';
import type GameLoop from '../game-loop/game-loop';
import { readBrowserStorage, writeBrowserStorage } from '../utils/browser-storage';
import { queryRequiredElement } from '../utils/dom';

const AUDIO_MUTED_STORAGE_KEY = 'fleeting-garden:audio-muted';
const AUDIO_VOLUME_STORAGE_KEY = 'fleeting-garden:audio-volume';
const AUDIO_VOLUME_MIN = 0;
const AUDIO_VOLUME_MAX = MAX_AUDIO_VOLUME;
const AUDIO_VOLUME_STEP = 0.01;

const clampAudioVolume = (value: number): number => {
  const safeValue = Number.isFinite(value) ? value : DEFAULT_AUDIO_VOLUME;
  return Math.min(AUDIO_VOLUME_MAX, Math.max(AUDIO_VOLUME_MIN, safeValue));
};

const readInitialAudioVolume = (): number => {
  const storedVolume = readBrowserStorage(AUDIO_VOLUME_STORAGE_KEY);
  return storedVolume === null
    ? DEFAULT_AUDIO_VOLUME
    : clampAudioVolume(Number(storedVolume));
};

const formatStoredAudioVolume = (volume: number): string =>
  clampAudioVolume(volume).toFixed(2);

const STORED_MUTED_TRUE = '1';
const STORED_MUTED_FALSE = '0';

interface AudioControlOptions {
  getGame: () => GameLoop | null;
  hasStarted: () => boolean;
  startButton: HTMLElement;
}

export class AudioControl {
  private readonly soundButton = queryRequiredElement(
    '[data-control="sound"]',
    HTMLButtonElement
  );
  private readonly volumeControl = queryRequiredElement(
    '.volume-control',
    HTMLLabelElement
  );
  private readonly volumeSlider = queryRequiredElement(
    '.volume-slider',
    HTMLInputElement
  );

  private audioVolume = readInitialAudioVolume();
  private isMutedState =
    readBrowserStorage(AUDIO_MUTED_STORAGE_KEY) === STORED_MUTED_TRUE ||
    this.audioVolume <= 0;

  public constructor(private readonly options: AudioControlOptions) {
    this.soundButton.addEventListener('click', this.onToggleMute);
    this.volumeSlider.addEventListener('input', this.onVolumeInput);

    const passiveCaptureOptions = { capture: true, passive: true } as const;
    const captureOptions = { capture: true } as const;
    (
      [
        ['touchstart', passiveCaptureOptions],
        ['pointerdown', passiveCaptureOptions],
        ['touchend', passiveCaptureOptions],
        ['pointerup', passiveCaptureOptions],
        ['click', captureOptions],
        ['keydown', captureOptions],
      ] satisfies Array<[keyof WindowEventMap, AddEventListenerOptions]>
    ).forEach(([event, opts]) => {
      window.addEventListener(event, this.onUserGesture, opts);
    });

    this.render();
  }

  public get isMuted(): boolean {
    return this.isMutedState || this.audioVolume <= 0;
  }

  public render(): void {
    this.audioVolume = clampAudioVolume(this.audioVolume);
    const isEffectivelyMuted = this.isMuted;
    const volumePercent = Math.round(this.audioVolume * 100);
    const volumeProgressPercent = Math.round((this.audioVolume / AUDIO_VOLUME_MAX) * 100);

    this.soundButton.classList.toggle('muted', isEffectivelyMuted);
    this.soundButton.setAttribute('aria-pressed', String(isEffectivelyMuted));
    const muteLabel = isEffectivelyMuted ? 'Unmute audio' : 'Mute audio';
    this.soundButton.setAttribute('aria-label', muteLabel);
    this.soundButton.title = muteLabel;

    this.volumeSlider.min = AUDIO_VOLUME_MIN.toString();
    this.volumeSlider.max = AUDIO_VOLUME_MAX.toString();
    this.volumeSlider.step = AUDIO_VOLUME_STEP.toString();
    this.volumeSlider.value = formatStoredAudioVolume(this.audioVolume);
    this.volumeSlider.setAttribute(
      'aria-valuetext',
      isEffectivelyMuted ? `Muted, ${volumePercent}%` : `${volumePercent}%`
    );
    this.volumeControl.classList.toggle('muted', isEffectivelyMuted);
    this.volumeControl.title = isEffectivelyMuted
      ? `Muted, ${volumePercent}% volume`
      : `${volumePercent}% volume`;
    this.volumeControl.style.setProperty(
      '--volume-progress',
      `${volumeProgressPercent}%`
    );

    const game = this.options.getGame();
    game?.setAudioVolume(this.audioVolume);
    game?.setAudioMuted(isEffectivelyMuted);
  }

  private readonly onToggleMute = () => {
    const shouldUnmute = this.isMutedState || this.audioVolume <= 0;
    if (shouldUnmute && this.audioVolume <= 0) {
      this.audioVolume = DEFAULT_AUDIO_VOLUME;
    }
    this.isMutedState = !shouldUnmute;
    this.persist();
    this.render();
    if (!this.isMutedState) {
      this.options.getGame()?.startAudio(true);
    }
  };

  private readonly onVolumeInput = () => {
    this.audioVolume = clampAudioVolume(Number(this.volumeSlider.value));
    this.isMutedState = this.audioVolume <= 0;
    this.persist();
    this.render();
    if (!this.isMutedState) {
      this.options.getGame()?.startAudio(true);
    }
  };

  private readonly onUserGesture = (event: Event) => {
    if (
      !this.options.hasStarted() ||
      this.isMutedState ||
      (event.target instanceof Node && this.options.startButton.contains(event.target)) ||
      (event.target instanceof Node && this.soundButton.contains(event.target))
    ) {
      return;
    }
    this.options.getGame()?.startAudio(true);
  };

  private persist(): void {
    writeBrowserStorage(
      AUDIO_MUTED_STORAGE_KEY,
      this.isMutedState ? STORED_MUTED_TRUE : STORED_MUTED_FALSE
    );
    writeBrowserStorage(
      AUDIO_VOLUME_STORAGE_KEY,
      formatStoredAudioVolume(this.audioVolume)
    );
  }
}
