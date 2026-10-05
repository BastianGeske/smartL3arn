import { defineConfig } from 'vitest/config'
export default defineConfig({ test: {
  environment: 'jsdom',
  include: ['design-audit/ios-security-2026-10-05/security-reproduction.test.ts'],
} })
