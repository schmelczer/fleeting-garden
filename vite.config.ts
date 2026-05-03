import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  define: {
    __BUILD_DATE__: Date.now(),
  },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  server: {
    open: true,
  },
});
