import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // Pre-bundle the dock's dependencies. Left to discovery, Vite optimises them
    // partway through the first load and the in-flight `client:only` import for
    // the dock island gets a 504, so the dock silently fails to hydrate.
    optimizeDeps: {
      include: [
        'framer-motion',
        '@highlighters/core',
        '@lisse/core',
        '@lisse/react',
        'gsap',
        '@react-three/fiber',
        '@react-three/drei',
        'three',
      ],
    },
  },
});
