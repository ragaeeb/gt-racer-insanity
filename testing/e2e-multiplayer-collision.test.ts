import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, chromium, type Page } from 'playwright';

const CLIENT_PORT = 4173;
const SERVER_PORT = 3001;
const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`;
const SERVER_HEALTH_URL = `http://127.0.0.1:${SERVER_PORT}/health`;
const STARTUP_TIMEOUT_MS = 90_000;
const shouldRunE2E = Bun.env.RUN_E2E === 'true' || process.env.RUN_E2E === 'true';
const e2eDescribe = shouldRunE2E ? describe : describe.skip;

type GTDebugState = {
    isRunning: boolean;
    localCarX: number | null;
    localCarZ: number | null;
    opponentCount: number;
};

const waitForHttpOk = async (url: string, timeoutMs: number) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return;
            }
        } catch {
            // Retry until timeout.
        }
        await Bun.sleep(250);
    }

    throw new Error(`Timed out waiting for ${url}`);
};

const startProcess = (command: string[]) => {
    return Bun.spawn(command, {
        cwd: process.cwd(),
        stderr: 'inherit',
        stdin: 'ignore',
        stdout: 'inherit',
    });
};

const stopProcess = async (processHandle: Bun.Subprocess | null) => {
    if (!processHandle) return;
    if (processHandle.exitCode === null) {
        processHandle.kill('SIGTERM');
        await Promise.race([processHandle.exited, Bun.sleep(2_000)]);
    }
    if (processHandle.exitCode === null) {
        processHandle.kill('SIGKILL');
    }
    await processHandle.exited;
};

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

const waitForDebugState = async (
    page: Page,
    predicate: (state: GTDebugState | null) => boolean,
    timeoutMs: number
) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const state = await readDebugState(page);
        if (predicate(state)) {
            return state;
        }
        await page.waitForTimeout(200);
    }
    throw new Error('Timed out waiting for debug state predicate');
};

const joinRace = async (page: Page, roomId: string, name: string) => {
    await page.goto(`${CLIENT_URL}/lobby?room=${roomId}`, {
        timeout: STARTUP_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('#player-name-input', { timeout: STARTUP_TIMEOUT_MS });
    await page.fill('#player-name-input', name);
    await page.click('#player-name-confirm');
    await page.waitForURL(new RegExp(`/race\\?room=${roomId}$`), { timeout: STARTUP_TIMEOUT_MS });
    await page.waitForSelector('canvas', { timeout: STARTUP_TIMEOUT_MS });
};

const pressW = async (page: Page) => {
    await page.evaluate(() => {
        window.dispatchEvent(
            new KeyboardEvent('keydown', {
                bubbles: true,
                code: 'KeyW',
                key: 'w',
            }),
        );
    });
};

const releaseW = async (page: Page) => {
    await page.evaluate(() => {
        window.dispatchEvent(
            new KeyboardEvent('keyup', {
                bubbles: true,
                code: 'KeyW',
                key: 'w',
            }),
        );
    });
};

e2eDescribe('e2e multiplayer collision', () => {
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
            String(CLIENT_PORT),
            '--strictPort',
        ]);

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
        await Promise.all([
            stopProcess(clientProcess),
            stopProcess(serverProcess),
        ]);
    }, { timeout: 30_000 });

    it('should keep two multiplayer cars separated while both are active', async () => {
        if (!browser) {
            throw new Error('Browser is not initialized');
        }

        const roomId = `MC${Date.now().toString().slice(-10)}`;
        const pageA = await browser.newPage();
        const pageB = await browser.newPage();

        await joinRace(pageA, roomId, 'Driver A');
        await joinRace(pageB, roomId, 'Driver B');

        const stateA = await waitForDebugState(
            pageA,
            (state) => Boolean(state?.isRunning),
            STARTUP_TIMEOUT_MS
        );
        const stateB = await waitForDebugState(
            pageB,
            (state) => Boolean(state?.isRunning),
            STARTUP_TIMEOUT_MS
        );

        await waitForDebugState(
            pageA,
            (state) => (state?.opponentCount ?? 0) >= 1,
            STARTUP_TIMEOUT_MS
        );
        await waitForDebugState(
            pageB,
            (state) => (state?.opponentCount ?? 0) >= 1,
            STARTUP_TIMEOUT_MS
        );

        expect(stateA?.isRunning).toEqual(true);
        expect(stateB?.isRunning).toEqual(true);

        await Promise.all([pressW(pageA), pressW(pageB)]);
        await Bun.sleep(2_000);
        await Promise.all([releaseW(pageA), releaseW(pageB)]);

        const movedA = await readDebugState(pageA);
        const movedB = await readDebugState(pageB);

        expect(movedA?.localCarZ ?? 0).toBeGreaterThan(stateA?.localCarZ ?? 0);
        expect(movedB?.localCarZ ?? 0).toBeGreaterThan(stateB?.localCarZ ?? 0);
        expect(Math.abs((movedA?.localCarX ?? 0) - (movedB?.localCarX ?? 0))).toBeGreaterThan(0.25);

        await Promise.all([pageA.close(), pageB.close()]);
    }, STARTUP_TIMEOUT_MS);
});
