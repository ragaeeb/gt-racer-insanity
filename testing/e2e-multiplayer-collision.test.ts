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
    connectionStatus: string;
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

const assertProcessRunning = (processHandle: Bun.Subprocess | null, label: string) => {
    if (!processHandle) {
        throw new Error(`${label} process was not started`);
    }

    if (processHandle.exitCode !== null) {
        throw new Error(`${label} process exited early with code ${processHandle.exitCode}`);
    }
};

const listListeningPidsForPort = (port: number) => {
    const result = Bun.spawnSync(['lsof', '-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], {
        stderr: 'ignore',
        stdout: 'pipe',
    });

    if (result.exitCode !== 0) {
        return [] as number[];
    }

    return result.stdout
        .toString()
        .split('\n')
        .map((line) => Number(line.trim()))
        .filter((pid) => Number.isInteger(pid) && pid > 0);
};

const killPidIfAlive = (pid: number, signal: 'TERM' | 'KILL') => {
    Bun.spawnSync(['kill', `-${signal}`, String(pid)], {
        stderr: 'ignore',
        stdout: 'ignore',
    });
};

const terminateProcessTree = (pid: number, signal: 'TERM' | 'KILL') => {
    Bun.spawnSync(['pkill', `-${signal}`, '-P', String(pid)], {
        stderr: 'ignore',
        stdout: 'ignore',
    });
    killPidIfAlive(pid, signal);
};

const cleanupListeningPort = async (port: number) => {
    const initialPids = listListeningPidsForPort(port);
    for (const pid of initialPids) {
        terminateProcessTree(pid, 'TERM');
    }

    if (initialPids.length > 0) {
        await Bun.sleep(250);
    }

    const remainingPids = listListeningPidsForPort(port);
    for (const pid of remainingPids) {
        terminateProcessTree(pid, 'KILL');
    }
};

const stopProcess = async (processHandle: Bun.Subprocess | null) => {
    if (!processHandle) {
        return;
    }

    const pid = processHandle.pid;

    if (processHandle.exitCode === null && pid) {
        terminateProcessTree(pid, 'TERM');
    }

    await Promise.race([processHandle.exited, Bun.sleep(2_000)]);

    if (processHandle.exitCode === null && pid) {
        terminateProcessTree(pid, 'KILL');
    }

    await processHandle.exited;
};

const isClosedPageError = (error: unknown) => {
    return error instanceof Error && /Target page, context or browser has been closed/i.test(error.message);
};

const readDebugState = async (targetPage: Page) => {
    if (targetPage.isClosed()) {
        return null;
    }

    try {
        return await targetPage.evaluate(() => {
            const debugWindow = window as Window & {
                __GT_DEBUG__?: {
                    getState: () => GTDebugState;
                };
            };

            return debugWindow.__GT_DEBUG__?.getState() ?? null;
        });
    } catch (error) {
        if (isClosedPageError(error)) {
            return null;
        }
        throw error;
    }
};

const joinRace = async (page: Page, roomId: string, name: string) => {
    await page.goto(`${CLIENT_URL}/lobby?room=${roomId}`, {
        timeout: STARTUP_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
    });
    await page.bringToFront();
    await page.focus('body');
    await page.waitForSelector('#player-name-input', { timeout: STARTUP_TIMEOUT_MS });
    await page.fill('#player-name-input', name);
    await page.click('#player-name-confirm');
    await page.waitForURL(new RegExp(`/race\\?room=${roomId}$`), { timeout: STARTUP_TIMEOUT_MS });
    await page.waitForSelector('canvas', { timeout: STARTUP_TIMEOUT_MS });
    await page.waitForSelector('#speed', { timeout: STARTUP_TIMEOUT_MS });
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

const waitForMultiplayerReady = async (
    pageA: Page,
    pageB: Page,
    timeoutMs: number
) => {
    const deadline = Date.now() + timeoutMs;
    let lastStateA: GTDebugState | null = null;
    let lastStateB: GTDebugState | null = null;

    while (Date.now() < deadline) {
        if (pageA.isClosed() || pageB.isClosed()) {
            throw new Error('A page closed before multiplayer state became ready');
        }

        const [stateA, stateB] = await Promise.all([readDebugState(pageA), readDebugState(pageB)]);
        lastStateA = stateA;
        lastStateB = stateB;

        const bothRunning = Boolean(stateA?.isRunning) && Boolean(stateB?.isRunning);
        const bothConnected = stateA?.connectionStatus === 'connected' && stateB?.connectionStatus === 'connected';
        const bothSpawned = stateA?.localCarZ !== null && stateB?.localCarZ !== null;
        const sawAnyOpponent = (stateA?.opponentCount ?? 0) >= 1 || (stateB?.opponentCount ?? 0) >= 1;

        if (bothRunning && bothConnected && bothSpawned && sawAnyOpponent) {
            return {
                stateA,
                stateB,
            };
        }

        await pageA.waitForTimeout(200);
    }

    throw new Error(
        `Timed out waiting for multiplayer readiness. Last stateA=${JSON.stringify(lastStateA)} lastStateB=${JSON.stringify(lastStateB)}`
    );
};

const waitForCarsToMoveForward = async (
    pageA: Page,
    pageB: Page,
    initialStateA: GTDebugState,
    initialStateB: GTDebugState,
    timeoutMs: number
) => {
    const initialZA = initialStateA.localCarZ ?? 0;
    const initialZB = initialStateB.localCarZ ?? 0;
    const deadline = Date.now() + timeoutMs;
    let lastStateA: GTDebugState | null = initialStateA;
    let lastStateB: GTDebugState | null = initialStateB;

    while (Date.now() < deadline) {
        if (pageA.isClosed() || pageB.isClosed()) {
            throw new Error('A page closed while waiting for forward movement');
        }

        const [stateA, stateB] = await Promise.all([readDebugState(pageA), readDebugState(pageB)]);
        lastStateA = stateA;
        lastStateB = stateB;

        if ((stateA?.localCarZ ?? initialZA) > initialZA && (stateB?.localCarZ ?? initialZB) > initialZB) {
            return {
                stateA,
                stateB,
            };
        }

        await pageA.waitForTimeout(200);
    }

    throw new Error(
        `Timed out waiting for both cars to move forward. Last stateA=${JSON.stringify(lastStateA)} lastStateB=${JSON.stringify(lastStateB)}`
    );
};

e2eDescribe('e2e multiplayer collision', () => {
    let browser: Browser | null = null;
    let serverProcess: Bun.Subprocess | null = null;
    let clientProcess: Bun.Subprocess | null = null;

    beforeAll(async () => {
        await cleanupListeningPort(CLIENT_PORT);
        await cleanupListeningPort(SERVER_PORT);

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
                '--disable-dev-shm-usage',
            ],
        });
    }, { timeout: STARTUP_TIMEOUT_MS });

    afterAll(async () => {
        await browser?.close();
        await Promise.all([
            stopProcess(clientProcess),
            stopProcess(serverProcess),
        ]);
        await cleanupListeningPort(CLIENT_PORT);
        await cleanupListeningPort(SERVER_PORT);
    }, { timeout: 30_000 });

    it('should keep two multiplayer cars separated while both are active', async () => {
        if (!browser) {
            throw new Error('Browser is not initialized');
        }

        const roomId = `MC${Date.now().toString().slice(-10)}`;
        const pageA = await browser.newPage();
        const pageB = await browser.newPage();

        try {
            await joinRace(pageA, roomId, 'Driver A');
            await joinRace(pageB, roomId, 'Driver B');

            const { stateA, stateB } = await waitForMultiplayerReady(pageA, pageB, 30_000);

            expect(stateA?.isRunning).toEqual(true);
            expect(stateB?.isRunning).toEqual(true);

            await pageA.bringToFront();
            await pressW(pageA);
            await pageB.bringToFront();
            await pressW(pageB);

            await pageA.waitForTimeout(2_200);

            await pageA.bringToFront();
            await releaseW(pageA);
            await pageB.bringToFront();
            await releaseW(pageB);

            const { stateA: movedA, stateB: movedB } = await waitForCarsToMoveForward(
                pageA,
                pageB,
                stateA,
                stateB,
                20_000
            );

            expect(movedA?.localCarZ ?? 0).toBeGreaterThan(stateA?.localCarZ ?? 0);
            expect(movedB?.localCarZ ?? 0).toBeGreaterThan(stateB?.localCarZ ?? 0);
            expect(Math.abs((movedA?.localCarX ?? 0) - (movedB?.localCarX ?? 0))).toBeGreaterThan(0.25);
        } finally {
            await Promise.allSettled([pageA.close(), pageB.close()]);
        }
    }, STARTUP_TIMEOUT_MS);
});
