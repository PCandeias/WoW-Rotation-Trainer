import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

function resolveGitHubPagesBase(): string {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return '/';
  }

  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repositoryName || repositoryName.endsWith('.github.io')) {
    return '/';
  }

  return `/${repositoryName}/`;
}

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
  base: resolveGitHubPagesBase(),
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
