import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: './',
  build: {
    outDir: 'html'
  },
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: 'oo-offline/react',
        replacement: path.resolve(
          root,
          'packages/oo-offline/src/react/OnlyOfficeEditor.tsx'
        )
      },
      {
        find: /^oo-offline$/,
        replacement: path.resolve(root, 'packages/oo-offline/src/index.ts')
      }
    ]
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  }
})
