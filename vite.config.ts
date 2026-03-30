import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@ui': resolve(__dirname, 'src/ui'),
      // @data is a convenience alias for src/core/data/ — intentionally a sub-path of @core, for shorter imports from UI
      '@data': resolve(__dirname, 'src/core/data'),
    },
  },
  base: './',
});
