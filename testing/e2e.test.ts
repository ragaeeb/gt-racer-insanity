import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type ConsoleMessage, chromium, type Page } from 'playwright';

const CLIENT_URL = 'http://127.0.0.1:4173';
const SERVER_HEALTH_URL = 'http://127.0.0.1:3001/health';
const STARTUP_TIMEOUT_MS = 90_000;
const shouldRunE2E = Bun.env.RUN_E2E === 'true' || process.env.RUN_E2E === 'true';
const e2eDescribe = shouldRunE2E ? describe : describe.skip;

type GTDebugState = {
    isRunning: boolean;
    localCarZ: number | null;
    roomId: string | null;
    score: number;
};

const waitForHttpOk = async (url: string, timeoutMs: number) => {
    const startedAt = Date.now();
    let lastError: string | null = null;

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return;
            }
            lastError = `Status ${response.status}`;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }

        await Bun.sleep(250);
    }

    throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}`);
};

const startProcess = (command: string[]) => {
    return Bun.spawn(command, {
        cwd: process.cwd(),
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: 'ignore',
    });
};

const assertProcessRunning = (processHandle: Bun.Subprocess | null, label: string) => {
    if (!processHandle) {
        throw new Error(`${label} process was not started`);
    }

    if (processHandle.exitCode !== null) {
        throw new Error(`${label} process exited early with code ${processHandle.exitCode}`);
    }
};

const stopProcess = async (processHandle: Bun.Subprocess | null) => {
    if (!processHandle) {
        return;
    }

    if (processHandle.exitCode === null) {
        processHandle.kill();
    }

    await processHandle.exited;
};

e2eDescribe('e2e smoke', () => {
    let browser: Browser | null = null;
    let serverProcess: Bun.Subprocess | null = null;
    let clientProcess: Bun.Subprocess | null = null;

    beforeAll(async () => {
        serverProcess = startProcess(['bun', 'src/server/index.ts']);
        clientProcess = startProcess([
            'bun',
            'run',
            'preview',
            '--',
            '--host',
            '127.0.0.1',
            '--port',
            '4173',
            '--strictPort',
        ]);

        await Bun.sleep(250);
        assertProcessRunning(serverProcess, 'Server');
        assertProcessRunning(clientProcess, 'Client preview');

        await waitForHttpOk(SERVER_HEALTH_URL, STARTUP_TIMEOUT_MS);
        await waitForHttpOk(CLIENT_URL, STARTUP_TIMEOUT_MS);

        browser = await chromium.launch({
            headless: true,
            args: [
                '--enable-webgl',
                '--ignore-gpu-blocklist',
                '--use-angle=swiftshader',
                '--use-gl=angle',
                '--enable-unsafe-swiftshader',
            ],
        });
    }, { timeout: STARTUP_TIMEOUT_MS });

    afterAll(async () => {
        await browser?.close();
        await stopProcess(clientProcess);
        await stopProcess(serverProcess);
    }, { timeout: 30_000 });

    it(
        'should load the game, move the local car, and avoid runtime errors',
        async () => {
            if (!browser) {
                throw new Error('Browser was not initialized');
            }

            const page = await browser.newPage();
            const pageErrors: string[] = [];
            const consoleErrors: string[] = [];

            page.on('pageerror', (error) => {
                pageErrors.push(error.message);
            });

            page.on('console', (message: ConsoleMessage) => {
                if (message.type() === 'error') {
                    consoleErrors.push(message.text());
                }
            });

            const roomId = `E2E${Date.now()}`;
            await page.goto(`${CLIENT_URL}/?room=${roomId}`, {
                timeout: STARTUP_TIMEOUT_MS,
                waitUntil: 'domcontentloaded',
            });
            await page.bringToFront();
            await page.focus('body');

            await page.waitForSelector('canvas', { timeout: STARTUP_TIMEOUT_MS });
            await page.waitForSelector('#score', { timeout: STARTUP_TIMEOUT_MS });
            await page.waitForTimeout(1200);

            const readDebugState = async (targetPage: Page) => {
                return targetPage.evaluate(() => {
                    const debugWindow = window as Window & {
                        __GT_DEBUG__?: {
                            getState: () => GTDebugState;
                        };
                    };

                    return debugWindow.__GT_DEBUG__?.getState() ?? null;
                });
            };

            const waitForCarSpawn = async () => {
                const deadline = Date.now() + STARTUP_TIMEOUT_MS;

                while (Date.now() < deadline) {
                    const state = await readDebugState(page);
                    if (state?.localCarZ !== null && state?.isRunning) {
                        return state;
                    }
                    await page.waitForTimeout(250);
                }

                throw new Error('Timed out waiting for local car spawn');
            };

            const initialState = await waitForCarSpawn();
            const initialCarZ = initialState.localCarZ ?? 0;

            await page.evaluate(() => {
                window.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'w',
                        code: 'KeyW',
                        bubbles: true,
                    }),
                );
            });

            await page.waitForTimeout(2200);

            await page.evaluate(() => {
                window.dispatchEvent(
                    new KeyboardEvent('keyup', {
                        key: 'w',
                        code: 'KeyW',
                        bubbles: true,
                    }),
                );
            });

            let updatedCarZ = initialCarZ;
            const movementDeadline = Date.now() + 8000;

            while (Date.now() < movementDeadline) {
                const state = await readDebugState(page);
                updatedCarZ = state?.localCarZ ?? initialCarZ;
                if (updatedCarZ > initialCarZ) {
                    break;
                }
                await page.waitForTimeout(250);
            }

            expect(updatedCarZ).toBeGreaterThan(initialCarZ);

            const gameOverClassName = await page.getAttribute('#game-over', 'class');
            expect(gameOverClassName?.includes('hidden')).toBe(true);

            expect(pageErrors).toHaveLength(0);
            expect(consoleErrors).toHaveLength(0);

            await page.close();
        },
        STARTUP_TIMEOUT_MS,
    );
});
