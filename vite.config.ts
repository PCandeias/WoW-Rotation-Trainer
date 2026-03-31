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
  base: '/wow_trainer/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk — React ecosystem (rarely changes, highly cacheable)
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    watch: {
      // Prevent chokidar from traversing multi-GB directories that are not
      // part of the module graph.  Without this, Vite can OOM on startup.
      ignored: [
        resolve(__dirname, 'reports') + '/**',
        resolve(__dirname, 'tools') + '/**',
        resolve(__dirname, 'coverage') + '/**',
      ],
    },
  },
});
