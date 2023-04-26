export const sleep = (ms: number): Promise<void> => {
  return new Promise<void>((resolve, _) => setTimeout(resolve, ms));
};
