import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  // Expose all VITE_ env vars to the browser
  envPrefix: 'VITE_',
  // Exclude 'mqtt' from being bundled as ESM (it's CJS)
  optimizeDeps: {
    include: ['mqtt'],
  },
  build: {
    commonjsOptions: {
      include: [/mqtt/, /node_modules/],
    },
  },
  server: { port: 5180 }
})
