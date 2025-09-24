/**
 * Vitest Configuration for ChittyRouter AI Tests
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment configuration
    environment: 'node',

    // Global test settings
    globals: true,

    // Test file patterns
    include: [
      'tests/**/*.test.js',
      'tests/**/*.spec.js'
    ],

    // Exclude patterns
    exclude: [
      'node_modules/**',
      'dist/**',
      '.wrangler/**'
    ],

    // Test timeout (30 seconds for AI operations)
    testTimeout: 30000,

    // Setup files
    setupFiles: ['./tests/setup/test-setup.js'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'tests/**',
        'node_modules/**',
        'dist/**',
        '.wrangler/**',
        '**/*.config.js'
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    },

    // Reporter configuration
    reporter: ['verbose', 'json'],

    // Parallel test execution
    threads: true,
    maxThreads: 4,
    minThreads: 1,

    // Mock configuration
    clearMocks: true,
    restoreMocks: true,

    // Retry configuration for flaky tests
    retry: 2,

    // Test categorization
    testNamePattern: undefined,

    // Watch options
    watch: {
      clearScreen: false
    }
  },

  // Define for environment variables
  define: {
    'process.env.NODE_ENV': '"test"',
    'process.env.ENVIRONMENT': '"test"'
  },

  // Resolve configuration
  resolve: {
    alias: {
      '@': '/src',
      '@tests': '/tests'
    }
  }
});