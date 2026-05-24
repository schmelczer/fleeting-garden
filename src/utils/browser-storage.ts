export const readBrowserStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeBrowserStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(
      'Storage can be unavailable in private browsing or embedded contexts.',
      error
    );
  }
};
