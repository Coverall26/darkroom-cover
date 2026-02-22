import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

// ESM packages that must be transformed by Jest's SWC transformer.
// next/jest adds default patterns that only except 'geist', which blocks
// our ESM dependencies. We override transformIgnorePatterns on the resolved
// config to include all necessary exceptions in a single pattern.
const esmPackages = [
  '@sindresorhus/slugify',
  'escape-string-regexp',
  '@teamhanko/passkeys-next-auth-provider',
  'jose',
  '@auth/prisma-adapter',
  '@auth/core',
  'geist',
  'nanoid',
  '@vercel/blob',
  'notion-utils',
  'notion-client',
  'mupdf',
  '@vercel/edge-config',
  '@vercel/edge-config-fs',
].join('|');

const customJestConfig: Config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/__tests__/phase1/', // Legacy design-time tests — use @ts-nocheck, not integration-grade
  ],
  collectCoverageFrom: [
    'pages/api/**/*.ts',
    'lib/**/*.ts',
    'components/**/*.tsx',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
    'lib/auth/rbac.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    'pages/api/admin/wire/confirm.ts': {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    'pages/api/admin/investors/*/review.ts': {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    'pages/api/lp/register.ts': {
      branches: 70,
      functions: 80,
      lines: 75,
      statements: 75,
    },
    'pages/api/lp/staged-commitment.ts': {
      branches: 70,
      functions: 80,
      lines: 75,
      statements: 75,
    },
  },
  testTimeout: 30000,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};

// Resolve the Next.js Jest config then override transformIgnorePatterns
// to prevent the default next/jest patterns from blocking ESM packages.
const jestConfig = async () => {
  const nextConfig = await createJestConfig(customJestConfig)();
  nextConfig.transformIgnorePatterns = [
    `/node_modules/(?!.pnpm)(?!(${esmPackages})/)`,
    `/node_modules/.pnpm/(?!(${esmPackages})@)`,
    '^.+\\.module\\.(css|sass|scss)$',
  ];
  return nextConfig;
};

export default jestConfig;
