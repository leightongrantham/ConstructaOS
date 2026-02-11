import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  optimizeDeps: {
    exclude: ['vtracer', '/vtracer.js'] // Exclude VTracer from dependency optimization
  },
  resolve: {
    // Prevent Vite from trying to resolve public assets as modules
    alias: {}
  },
  // Plugin to ignore blob:// URLs and public assets in import analysis
  plugins: [
    {
      name: 'ignore-vtracer-imports',
      resolveId(id) {
        // Ignore blob URLs and VTracer public files
        if (id.startsWith('blob:') || id === '/vtracer.js' || id.startsWith('/vtracer')) {
          return id; // Return as-is, don't process
        }
        return null; // Let Vite handle other imports
      },
      load(id) {
        // Don't process blob URLs or VTracer files
        if (id.startsWith('blob:') || id === '/vtracer.js' || id.startsWith('/vtracer')) {
          return null; // Skip processing
        }
        return null;
      }
    }
  ]
});
