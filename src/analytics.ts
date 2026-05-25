import {
  init as plausibleInit,
  track as plausibleTrack,
  type PlausibleEventOptions,
} from '@plausible-analytics/tracker';

import type { VibeId } from './vibes';

const ANALYTICS_AUTO_CAPTURE_PAGEVIEWS = true;
const ANALYTICS_DOMAIN = 'schmelczer.dev/fleeting';
const ANALYTICS_ENDPOINT = 'https://stats.schmelczer.dev/status';
const ANALYTICS_LOGGING = import.meta.env.DEV;

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
      domain: ANALYTICS_DOMAIN,
      endpoint: ANALYTICS_ENDPOINT,
      autoCapturePageviews: ANALYTICS_AUTO_CAPTURE_PAGEVIEWS,
      logging: ANALYTICS_LOGGING,
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
