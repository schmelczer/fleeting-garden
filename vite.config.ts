import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

const cssTargets = browserslistToTargets(browserslist());

export default defineConfig({
  plugins: [viteSingleFile()],
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: cssTargets,
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    cssMinify: 'lightningcss',
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
