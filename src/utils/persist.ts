export const persist = <T extends Record<string, number>>(wrapee: T): T => {
  const keys = Object.keys(wrapee);

  const keysToShortKeys = Object.fromEntries(
    keys.map((key, i) => [key, String.fromCharCode(97 + i)])
  );

  const params = new URLSearchParams(window.location.search);
  const newParams = new URLSearchParams();
  keys.forEach((key) => {
    if (params.has(keysToShortKeys[key])) {
      (wrapee as any)[key] = Number(params.get(keysToShortKeys[key]));
      newParams.set(keysToShortKeys[key], params.get(keysToShortKeys[key])!);
    }
  });

  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}?${newParams.toString()}`
  );

  return new Proxy(wrapee, {
    set: (target, key: string, value: number) => {
      const params = new URLSearchParams(window.location.search);

      params.set(keysToShortKeys[key], value.toString());

      (target as any)[key] = value;

      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}?${params.toString()}`
      );

      return true;
    },
  });
};
