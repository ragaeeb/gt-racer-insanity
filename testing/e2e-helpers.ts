import { expect, type Page } from '@playwright/test';

export const STARTUP_TIMEOUT_MS = 90_000;

export type GTDebugState = {
    connectionStatus: string;
    isRunning: boolean;
    localCarX: number | null;
    localCarZ: number | null;
    opponentCount: number;
    roomId?: string | null;
};

const isClosedPageError = (error: unknown) => {
    return error instanceof Error && /Target page, context or browser has been closed/i.test(error.message);
};

export const readDebugState = async (page: Page) => {
    if (page.isClosed()) {
        return null;
    }

    try {
        return await page.evaluate(() => {
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

export const joinRace = async (page: Page, roomId: string, name: string) => {
    await page.goto(`/lobby?room=${roomId}`, {
        timeout: STARTUP_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
    });
    await page.bringToFront();
    await page.focus('body');
    await page.locator('#player-name-input').fill(name);
    await page.locator('#player-name-confirm').click();
    await page.waitForURL(new RegExp(`/race\\?room=${roomId}$`), { timeout: STARTUP_TIMEOUT_MS });
    await page.locator('canvas').waitFor({ timeout: STARTUP_TIMEOUT_MS });
    await page.locator('#speed').waitFor({ timeout: STARTUP_TIMEOUT_MS });
};

export const setDrivingKeyState = async (page: Page, code: string, pressed: boolean) => {
    const keyByCode: Record<string, string> = {
        ArrowDown: 'ArrowDown',
        ArrowLeft: 'ArrowLeft',
        ArrowRight: 'ArrowRight',
        ArrowUp: 'ArrowUp',
        KeyA: 'a',
        KeyD: 'd',
        KeyS: 's',
        KeyW: 'w',
    };

    const key = keyByCode[code] ?? code;
    await page.evaluate(
        ({ code: eventCode, key: eventKey, pressed: isPressed }) => {
            window.dispatchEvent(
                new KeyboardEvent(isPressed ? 'keydown' : 'keyup', {
                    bubbles: true,
                    code: eventCode,
                    key: eventKey,
                }),
            );
        },
        { code, key, pressed },
    );
};

export const enableDiagnostics = async (page: Page) => {
    await page.addInitScript(() => {
        window.localStorage.setItem('gt-diag', 'true');
    });
};

export const enableDiagnosticsRuntime = async (page: Page) => {
    if (page.isClosed()) {
        return;
    }

    await page.evaluate(() => {
        const debugWindow = window as Window & {
            __GT_DIAG__?: {
                enable?: () => void;
                setVerbose?: (verbose: boolean) => void;
            };
        };

        window.localStorage.setItem('gt-diag', 'true');
        debugWindow.__GT_DIAG__?.enable?.();
        debugWindow.__GT_DIAG__?.setVerbose?.(false);
    });
};

export const waitForMultiplayerReady = async (pageA: Page, pageB: Page, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    let lastStateA: GTDebugState | null = null;
    let lastStateB: GTDebugState | null = null;

    while (Date.now() < deadline) {
        const [stateA, stateB] = await Promise.all([readDebugState(pageA), readDebugState(pageB)]);
        lastStateA = stateA;
        lastStateB = stateB;

        const bothRunning = Boolean(stateA?.isRunning) && Boolean(stateB?.isRunning);
        const bothConnected = stateA?.connectionStatus === 'connected' && stateB?.connectionStatus === 'connected';
        const bothSpawned = stateA?.localCarZ !== null && stateB?.localCarZ !== null;
        const sawAnyOpponent = (stateA?.opponentCount ?? 0) >= 1 || (stateB?.opponentCount ?? 0) >= 1;

        if (bothRunning && bothConnected && bothSpawned && sawAnyOpponent) {
            return { stateA, stateB };
        }

        await pageA.waitForTimeout(200);
    }

    throw new Error(
        `Timed out waiting for multiplayer readiness. Last stateA=${JSON.stringify(lastStateA)} lastStateB=${JSON.stringify(lastStateB)}`
    );
};

export const waitForCarsToMoveForward = async (
    pageA: Page,
    pageB: Page,
    initialStateA: GTDebugState,
    initialStateB: GTDebugState,
    timeoutMs: number,
) => {
    const initialZA = initialStateA.localCarZ ?? 0;
    const initialZB = initialStateB.localCarZ ?? 0;
    const deadline = Date.now() + timeoutMs;
    let lastStateA: GTDebugState | null = initialStateA;
    let lastStateB: GTDebugState | null = initialStateB;

    while (Date.now() < deadline) {
        const [stateA, stateB] = await Promise.all([readDebugState(pageA), readDebugState(pageB)]);
        lastStateA = stateA;
        lastStateB = stateB;

        if ((stateA?.localCarZ ?? initialZA) > initialZA && (stateB?.localCarZ ?? initialZB) > initialZB) {
            return { stateA, stateB };
        }

        await pageA.waitForTimeout(200);
    }

    throw new Error(
        `Timed out waiting for both cars to move forward. Last stateA=${JSON.stringify(lastStateA)} lastStateB=${JSON.stringify(lastStateB)}`
    );
};

export const expectHidden = async (page: Page, selector: string) => {
    const className = (await page.getAttribute(selector, 'class')) ?? '';
    expect(className.includes('hidden')).toBeTruthy();
};
