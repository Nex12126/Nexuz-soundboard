import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'copy-soundboard-logo',
      closeBundle() {
        const logoPath = resolve(process.cwd(), 'Sound.png')
        if (existsSync(logoPath)) copyFileSync(logoPath, resolve(process.cwd(), 'dist/Sound.png'))
      },
    },
  ],
})
