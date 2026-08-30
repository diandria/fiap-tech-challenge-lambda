/**
 * Configuracao em JavaScript, e nao TypeScript: jest.config.ts exigiria
 * ts-node so para ler a propria configuracao.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
