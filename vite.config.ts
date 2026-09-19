import basicSsl from '@vitejs/plugin-basic-ssl';
import browserslist from 'browserslist';
import browserslistToEsbuild from 'browserslist-to-esbuild';
import { browserslistToTargets } from 'lightningcss';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig } from 'vitest/config';

const cssTargets = browserslistToTargets(browserslist());
const esbuildTargets = browserslistToEsbuild();

export default defineConfig(({ command, isPreview }) => ({
  plugins: [viteSingleFile(), ...(command === 'serve' && !isPreview ? [basicSsl()] : [])],
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: cssTargets,
    },
  },
  build: {
    target: esbuildTargets,
    cssMinify: 'lightningcss',
  },
  server: {
    host: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
