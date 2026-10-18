import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
    watch: {
      // The app writes to vault/ on every save; without this Vite's dev
      // server treats those writes as unrecognized file changes and does a
      // full page reload, wiping unsaved navigation state mid-edit.
      ignored: ['**/vault/**'],
    },
  },
})
