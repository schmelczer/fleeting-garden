import { activeVibe, applyVibeSettings, rememberActiveVibeSelection } from '../settings';
import { queryRequiredElement } from '../utils/dom';
import { getCurrentUriVibeId, writeCurrentVibeUri } from '../vibe-uri';
import { getVibeById, VIBE_PRESETS, type VibeId } from '../vibes';

interface VibeSelection {
  source: string;
  userGesture: boolean;
  vibeId: VibeId;
  vibeName: string;
}

interface VibeNavigatorOptions {
  onChange: (selection: VibeSelection) => void;
}

export class VibeNavigator {
  private readonly abortController = new AbortController();
  private readonly previousButton = queryRequiredElement(
    '.previous-vibe',
    HTMLButtonElement
  );
  private readonly nextButton = queryRequiredElement('.next-vibe', HTMLButtonElement);

  public constructor(private readonly options: VibeNavigatorOptions) {
    rememberActiveVibeSelection();
    writeCurrentVibeUri(activeVibe.id, 'replace');

    const { signal } = this.abortController;
    this.previousButton.addEventListener(
      'click',
      () => this.select(-1, 'previous-button'),
      { signal }
    );
    this.nextButton.addEventListener('click', () => this.select(1, 'next-button'), {
      signal,
    });
    window.addEventListener('popstate', this.selectFromCurrentUri, { signal });
  }

  public destroy(): void {
    this.abortController.abort();
  }

  private select(offset: number, source: string): void {
    const current = VIBE_PRESETS.findIndex((vibe) => vibe.id === activeVibe.id);
    const currentIndex = current >= 0 ? current : 0;
    const vibe =
      VIBE_PRESETS[(currentIndex + VIBE_PRESETS.length + offset) % VIBE_PRESETS.length];
    const activePreset = applyVibeSettings(vibe);
    writeCurrentVibeUri(activePreset.id, 'push');
    this.notifyChange(activePreset, source, true);
  }

  private readonly selectFromCurrentUri = (): void => {
    const vibeId = getCurrentUriVibeId();
    if (!vibeId || vibeId === activeVibe.id) {
      writeCurrentVibeUri(activeVibe.id, 'replace');
      return;
    }

    const vibe = getVibeById(vibeId);
    if (!vibe) {
      writeCurrentVibeUri(activeVibe.id, 'replace');
      return;
    }

    const activePreset = applyVibeSettings(vibe);
    writeCurrentVibeUri(activePreset.id, 'replace');
    this.notifyChange(activePreset, 'uri-popstate', false);
  };

  private notifyChange(
    activePreset: typeof activeVibe,
    source: string,
    userGesture: boolean
  ): void {
    this.options.onChange({
      userGesture,
      vibeId: activePreset.id,
      vibeName: activePreset.name,
      source,
    });
  }
}
