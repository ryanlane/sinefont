import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // served from https://ryanlane.github.io/sinefont/ via GitHub Pages (see .github/workflows/deploy.yml)
  base: process.env.GITHUB_PAGES ? '/sinefont/' : '/',
})
