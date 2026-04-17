import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                // Browser
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                localStorage: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                navigator: 'readonly',
                performance: 'readonly',
                crypto: 'readonly',
                fetch: 'readonly',
                PointerEvent: 'readonly',
                KeyboardEvent: 'readonly',
                HTMLElement: 'readonly',
                // Vite
                __APP_VERSION__: 'readonly',
                __BUILD_DATE__: 'readonly',
            },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
    {
        files: ['src/__tests__/**'],
        languageOptions: {
            globals: {
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                vi: 'readonly',
            },
        },
    },
    {
        files: ['*.config.js', '*.config.mjs'],
        languageOptions: {
            globals: { process: 'readonly' },
        },
    },
    {
        ignores: ['dist/**', 'node_modules/**', 'src-tauri/**'],
    },
];
