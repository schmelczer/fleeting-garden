import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  server: {
    open: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
