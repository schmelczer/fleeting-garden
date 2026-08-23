import { describe, expect, it } from 'vitest';

import { VibeId } from './config/types';
import { createVibeUri, getVibeIdFromUri } from './vibe-uri';

describe('vibe URI handling', () => {
  it('loads vibes from slug IDs and display names', () => {
    expect(getVibeIdFromUri('https://example.test/?vibe=aurora-mycelium')).toBe(
      VibeId.AuroraMycelium
    );
    expect(getVibeIdFromUri('https://example.test/?vibe=Aurora%20Mycelium')).toBe(
      VibeId.AuroraMycelium
    );
    expect(getVibeIdFromUri('https://example.test/?vibe=Velvet%20Observatory')).toBe(
      VibeId.VelvetObservatory
    );
  });

  it('uses query values before path or hash fallbacks', () => {
    expect(
      getVibeIdFromUri(
        'https://example.test/chrome-pollen?vibe=lichen-signal#vibe=aurora-mycelium'
      )
    ).toBe(VibeId.LichenSignal);
  });

  it('accepts explicit path segments and hash fallbacks', () => {
    expect(getVibeIdFromUri('https://example.test/vibes/tidepool-lantern')).toBe(
      VibeId.TidepoolLantern
    );
    expect(getVibeIdFromUri('https://example.test/#paper-lantern-fog')).toBe(
      VibeId.PaperLanternFog
    );
  });

  it('ignores unknown or malformed vibe values', () => {
    expect(getVibeIdFromUri('https://example.test/?vibe=missing')).toBeNull();
    expect(getVibeIdFromUri('https://example.test/?vibe=%E0%A4%A')).toBeNull();
    expect(getVibeIdFromUri('not a url')).toBeNull();
  });

  it('creates a canonical query URI without dropping other URL parts', () => {
    expect(
      createVibeUri('https://example.test/garden?debug=1#panel', VibeId.ChromePollen)
    ).toBe('/garden?debug=1&vibe=chrome-pollen#panel');

    expect(
      createVibeUri(
        'https://example.test/garden?vibe=aurora-mycelium&debug=1',
        VibeId.LichenSignal
      )
    ).toBe('/garden?vibe=lichen-signal&debug=1');
  });
});
