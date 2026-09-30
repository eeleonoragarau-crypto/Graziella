import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5218, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5218, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  worker: { format: 'es' },
  // keep the BVH worker URLs (new URL(..., import.meta.url)) intact
  optimizeDeps: { exclude: ['three-mesh-bvh', 'three-gpu-pathtracer'] },
})
