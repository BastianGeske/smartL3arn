import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  publicDir: 'build',
  plugins: [vue()],
  build: {
    target: 'safari15',
    outDir: 'web-dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // IndexedDB transactions need real event-loop turns (setImmediate in jsdom).
    fakeTimers: { toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] },
    include: ['src/**/*.test.ts'],
  },
})
