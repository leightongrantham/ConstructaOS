import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  root: __dirname,
  build: {
    outDir: 'public',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'demo/site-lookup-mount.jsx'),
      name: 'ConstructaOS',
      formats: ['iife'],
      fileName: () => 'site-lookup-demo.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
  resolve: {
    alias: {
      '@constructaos/site-lookup': path.resolve(__dirname, '../site-lookup-component/src/index.tsx'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
};
