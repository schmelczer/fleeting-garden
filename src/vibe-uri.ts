import type { VibeId } from './config/types';
import { getVibeById, VIBE_PRESETS } from './vibe-registry';

const VIBE_URI_QUERY_PARAM = 'vibe';
const FALLBACK_URL_ORIGIN = 'https://fleeting.garden';

const slugifyVibeName = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeVibeIdentifier = (value: string): string =>
  slugifyVibeName(safeDecodeURIComponent(value).replace(/^[#/\\?\s]+|[/\\?\s]+$/g, ''));

const vibeIdByIdentifier = new Map<string, VibeId>();

for (const vibe of VIBE_PRESETS) {
  vibeIdByIdentifier.set(normalizeVibeIdentifier(vibe.id), vibe.id);
  vibeIdByIdentifier.set(normalizeVibeIdentifier(vibe.name), vibe.id);
}

const toUrl = (url: string | URL): URL | null => {
  try {
    return new URL(url, FALLBACK_URL_ORIGIN);
  } catch {
    return null;
  }
};

const resolveVibeId = (value: string | null | undefined): VibeId | null => {
  if (!value) {
    return null;
  }

  return vibeIdByIdentifier.get(normalizeVibeIdentifier(value)) ?? null;
};

const getHashSearchParam = (hash: string): string | null => {
  const hashValue = hash.replace(/^#/, '');
  if (!hashValue.includes('=')) {
    return null;
  }

  const searchText = hashValue.startsWith('?') ? hashValue.slice(1) : hashValue;
  try {
    return new URLSearchParams(searchText).get(VIBE_URI_QUERY_PARAM);
  } catch {
    return null;
  }
};

const getPathVibeCandidates = (pathname: string): Array<string> => {
  const segments = pathname.split('/').map(safeDecodeURIComponent).filter(Boolean);
  const explicitVibeIndex = segments.findIndex((segment) =>
    ['vibe', 'vibes'].includes(segment.toLowerCase())
  );

  return [
    explicitVibeIndex >= 0 ? segments[explicitVibeIndex + 1] : undefined,
    segments.at(-1),
  ].filter((candidate): candidate is string => typeof candidate === 'string');
};

export const getVibeIdFromUri = (url: string | URL): VibeId | null => {
  const parsedUrl = toUrl(url);
  if (!parsedUrl) {
    return null;
  }

  const candidates = [
    parsedUrl.searchParams.get(VIBE_URI_QUERY_PARAM),
    getHashSearchParam(parsedUrl.hash),
    ...getPathVibeCandidates(parsedUrl.pathname),
    parsedUrl.hash.replace(/^#/, ''),
  ];

  for (const candidate of candidates) {
    const vibeId = resolveVibeId(candidate);
    if (vibeId) {
      return vibeId;
    }
  }

  return null;
};

export const getCurrentUriVibeId = (): VibeId | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return getVibeIdFromUri(window.location.href);
};

const getVibeSlug = (vibeId: VibeId): string => {
  const vibe = getVibeById(vibeId);
  return vibe ? vibe.id : vibeId;
};

export const createVibeUri = (url: string | URL, vibeId: VibeId): string => {
  const parsedUrl = toUrl(url);
  if (!parsedUrl) {
    return `?${VIBE_URI_QUERY_PARAM}=${encodeURIComponent(getVibeSlug(vibeId))}`;
  }

  parsedUrl.searchParams.set(VIBE_URI_QUERY_PARAM, getVibeSlug(vibeId));
  return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
};

export const writeCurrentVibeUri = (
  vibeId: VibeId,
  mode: 'push' | 'replace' = 'replace'
): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const nextUri = createVibeUri(window.location.href, vibeId);
  const currentUri = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUri === currentUri) {
    return;
  }

  const nextState =
    typeof window.history.state === 'object' && window.history.state !== null
      ? { ...window.history.state, vibeId }
      : { vibeId };

  if (mode === 'push') {
    window.history.pushState(nextState, '', nextUri);
    return;
  }

  window.history.replaceState(nextState, '', nextUri);
};
