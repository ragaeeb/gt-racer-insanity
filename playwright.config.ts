import { defineConfig } from '@playwright/test';

const CLIENT_PORT = 4173;
const SERVER_PORT = 3001;
const isCI = Boolean(process.env.CI);

export default defineConfig({
    testDir: './testing',
    testMatch: ['**/*.e2e.ts'],
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
    webServer: [
        {
            command: 'bun src/server/index.ts',
            url: `http://127.0.0.1:${SERVER_PORT}/health`,
            timeout: 90_000,
            reuseExistingServer: !isCI,
            stdout: 'pipe',
            stderr: 'pipe',
            gracefulShutdown: {
                signal: 'SIGTERM',
                timeout: 5_000,
            },
        },
        {
            command: `bun x vite preview --host 127.0.0.1 --port ${CLIENT_PORT} --strictPort`,
            url: `http://127.0.0.1:${CLIENT_PORT}`,
            timeout: 90_000,
            reuseExistingServer: !isCI,
            stdout: 'pipe',
            stderr: 'pipe',
            gracefulShutdown: {
                signal: 'SIGTERM',
                timeout: 5_000,
            },
        },
    ],
});
