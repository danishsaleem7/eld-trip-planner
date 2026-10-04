import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// VITE_BASE lets static hosts that serve from a sub-path (e.g. GitHub Pages) work; defaults to "/".
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
})
