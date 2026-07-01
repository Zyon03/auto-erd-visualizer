import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: { DATABASE_PATH: ':memory:' },
    exclude: ['**/node_modules/**', '**/dist/**', '.worktrees/**', '.superpowers/**'],
  },
})
