import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/drivers': 'http://127.0.0.1:5000',
      '/export': 'http://127.0.0.1:5000',
      '/docs': 'http://127.0.0.1:5000',
      '/redoc': 'http://127.0.0.1:5000',
      '/openapi.json': 'http://127.0.0.1:5000',
    },
  },
})
