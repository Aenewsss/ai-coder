import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    isolate: true,
    fileParallelism: false, // Run test files sequentially to avoid Redis conflicts
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      ANTHROPIC_API_KEY: 'test-api-key',
      CLAUDE_MODEL: 'claude-sonnet-4-20250514',
      GITHUB_APP_ID: '12345',
      GITHUB_APP_PRIVATE_KEY: 'test-private-key',
      REDIS_URL: 'redis://localhost:6379',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
    include: ['test/e2e/**/*.test.ts', 'test/unit/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
