// Server-Unit-Tests (reine Logik, keine DB). vitest kommt aus dem Root-Projekt:
//   npm run test:server   (im Repo-Root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
