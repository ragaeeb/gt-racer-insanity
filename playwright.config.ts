import { defineConfig } from '@playwright/test';

const CLIENT_PORT = 4173;
const SERVER_PORT = 3001;
const isSingleplayerOnly = process.env.E2E_SINGLEPLAYER_ONLY === 'true';

const previewServerConfig = {
    command: `bun x vite preview --host 127.0.0.1 --port ${CLIENT_PORT} --strictPort`,
    url: `http://127.0.0.1:${CLIENT_PORT}`,
    timeout: 90_000,
    // Always start a fresh preview so E2E exercises current production build output.
    reuseExistingServer: false,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
    gracefulShutdown: {
        signal: 'SIGTERM' as const,
        timeout: 5_000,
    },
};

const serverConfig = {
    command: 'RUN_E2E=true bun src/server/index.ts',
    url: `http://127.0.0.1:${SERVER_PORT}/health`,
    timeout: 90_000,
    // Always start a dedicated E2E server so test-only hooks are consistently available.
    reuseExistingServer: false,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
    gracefulShutdown: {
        signal: 'SIGTERM' as const,
        timeout: 5_000,
    },
};

export default defineConfig({
    testDir: './testing',
    testMatch: ['**/*.e2e.ts'],
    tsconfig: './tsconfig.e2e.json',
    reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
    fullyParallel: false,
    workers: 1,
    timeout: 90_000,
    expect: {
        timeout: 10_000,
    },
    use: {
        baseURL: `http://127.0.0.1:${CLIENT_PORT}`,
        headless: true,
        actionTimeout: 12_000,
        navigationTimeout: 30_000,
        trace: 'retain-on-failure',
        launchOptions: {
            args: [
                '--enable-webgl',
                '--ignore-gpu-blocklist',
                '--use-angle=swiftshader',
                '--use-gl=angle',
                '--enable-unsafe-swiftshader',
                '--disable-dev-shm-usage',
            ],
        },
    },
    webServer: isSingleplayerOnly ? [previewServerConfig] : [serverConfig, previewServerConfig],
});
