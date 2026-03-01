import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        setupFiles: ['./src/__tests__/setup.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/core/**'],
        },
    },
});
