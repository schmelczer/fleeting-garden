import {
  init as plausibleInit,
  track as plausibleTrack,
  type PlausibleEventOptions,
} from '@plausible-analytics/tracker';

import { appConfig } from './config';
import type { VibeId } from './vibes';

let isInitialized = false;

const track = (eventName: string, options: PlausibleEventOptions = {}) => {
  try {
    plausibleTrack(eventName, options);
  } catch (error) {
    console.warn(`Could not track analytics event "${eventName}".`, error);
  }
};

export const initAnalytics = () => {
  if (isInitialized) {
    return;
  }

  try {
    plausibleInit({
      domain: appConfig.analytics.domain,
      endpoint: appConfig.analytics.endpoint,
      autoCapturePageviews: appConfig.analytics.autoCapturePageviews,
      logging: appConfig.analytics.logging,
    });
    isInitialized = true;
  } catch (error) {
    console.warn('Could not initialize analytics.', error);
  }
};

export const trackVibeChange = ({
  vibeId,
  vibeName,
  source,
}: {
  vibeId: VibeId;
  vibeName: string;
  source: string;
}) => {
  track('Vibe Change', {
    props: {
      vibeId,
      vibeName,
      source,
    },
  });
};

export const trackStart = () => {
  track('Start');
};

export const trackExport = ({ vibeId }: { vibeId: VibeId }) => {
  track('Export', {
    props: {
      format: 'png',
      resolution: 'internal-buffer',
      vibeId,
    },
  });
};
