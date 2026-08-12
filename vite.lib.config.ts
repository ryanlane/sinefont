import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds just the reusable sinefont component library (src/lib/sinefont) for publishing to npm --
// separate from the default `vite build`, which builds the demo app + glyph editor tool.
// TypeScript declaration files are generated separately by `tsc -p tsconfig.lib.json` (see the
// `build:lib` script in package.json) since bundling them here proved unreliable.
export default defineConfig({
  plugins: [react()],
  // this app's public/ (favicon etc.) has nothing to do with the library -- don't copy it in
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/lib/sinefont/index.ts'),
      name: 'Sinefont',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'sinefont.mjs' : 'sinefont.cjs'),
    },
    rollupOptions: {
      // don't bundle React -- the consuming app supplies it
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
});
