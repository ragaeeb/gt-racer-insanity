import { expect, type Page } from '@playwright/test';
import type { GTDebugState as DiagnosticsGTDebugState } from '../src/client/game/hooks/diagnostics/types';

export const STARTUP_TIMEOUT_MS = 90_000;
const LOBBY_GOTO_RETRIES = 4;
const LOBBY_GOTO_RETRY_DELAY_MS = 750;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const sanitizeRoomIdForUrl = (value: string) =>
    value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .slice(0, 16);

export type GTDebugState = DiagnosticsGTDebugState;

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

export const joinRace = async (
    page: Page,
    roomId: string,
    name: string,
    options?: {
        trackId?: string;
        vehicleLabel?: string;
    },
) => {
    const normalizedRoomId = sanitizeRoomIdForUrl(roomId);
    const lobbyMode = options?.trackId ? 'create' : 'join';
    await page.addInitScript((mode) => {
        window.sessionStorage.setItem('gt-lobby-mode', mode);
    }, lobbyMode);

    await gotoLobby(page, normalizedRoomId);
    await page.bringToFront();
    await page.focus('body');
    await page.locator('#player-name-input').fill(name);
    if (options?.vehicleLabel) {
        const escapedVehicleLabel = escapeRegex(options.vehicleLabel);
        const vehicleClassFieldset = page.locator('fieldset').filter({ hasText: 'VEHICLE CLASS' }).first();
        await vehicleClassFieldset
            .getByRole('button', { name: new RegExp(`^\\s*${escapedVehicleLabel}\\b`, 'i') })
            .click();
    }
    if (options?.trackId) {
        const destinationFieldset = page.locator('fieldset').filter({ hasText: 'DESTINATION' }).first();
        await expect(destinationFieldset).toBeVisible();
        const trackLabel = options.trackId.replace(/-/g, ' ');
        const escapedTrackLabel = escapeRegex(trackLabel);
        await destinationFieldset
            .getByRole('button', { name: new RegExp(`^\\s*${escapedTrackLabel}\\b`, 'i') })
            .click();
    }
    await page.locator('#player-name-confirm').click();
    await page.waitForURL(
        (url) => {
            if (url.pathname !== '/race') {
                return false;
            }
            return sanitizeRoomIdForUrl(url.searchParams.get('room') ?? '') === normalizedRoomId;
        },
        { timeout: STARTUP_TIMEOUT_MS },
    );
    await page.locator('canvas').waitFor({ timeout: STARTUP_TIMEOUT_MS });
    await page.locator('#speed').waitFor({ timeout: STARTUP_TIMEOUT_MS });
};

const isRefusedNavigationError = (error: unknown) =>
    error instanceof Error &&
    (error.message.includes('net::ERR_CONNECTION_REFUSED') ||
        error.message.includes('net::ERR_CONNECTION_RESET') ||
        error.message.includes('net::ERR_CONNECTION_ABORTED'));

export const gotoLobby = async (page: Page, roomId: string) => {
    const normalizedRoomId = sanitizeRoomIdForUrl(roomId);
    if (!normalizedRoomId) {
        throw new Error(`Invalid roomId: "${roomId}" becomes empty after sanitization`);
    }
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= LOBBY_GOTO_RETRIES; attempt += 1) {
        try {
            await page.goto(`/lobby?room=${normalizedRoomId}`, {
                timeout: STARTUP_TIMEOUT_MS,
                waitUntil: 'domcontentloaded',
            });
            return;
        } catch (error) {
            lastError = error;
            if (!isRefusedNavigationError(error) || attempt === LOBBY_GOTO_RETRIES) {
                throw error;
            }
            await page.waitForTimeout(LOBBY_GOTO_RETRY_DELAY_MS * attempt);
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to navigate to lobby');
};

export const waitForCarSpawn = async (page: Page) => {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const state = await readDebugState(page);
        if (state && state.localCarZ !== null && state.isRunning) {
            return state;
        }
        await page.waitForTimeout(250);
    }

    throw new Error('Timed out waiting for local car spawn');
};

export const setDrivingKeyState = async (page: Page, code: string, pressed: boolean) => {
    const keyByCode: Record<string, string> = {
        ArrowDown: 'ArrowDown',
        ArrowLeft: 'ArrowLeft',
        ArrowRight: 'ArrowRight',
        ArrowUp: 'ArrowUp',
        KeyA: 'a',
        KeyD: 'd',
        KeyE: 'e',
        KeyS: 's',
        KeyW: 'w',
        Space: ' ',
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
        `Timed out waiting for multiplayer readiness. Last stateA=${JSON.stringify(lastStateA)} lastStateB=${JSON.stringify(lastStateB)}`,
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
        `Timed out waiting for both cars to move forward. Last stateA=${JSON.stringify(lastStateA)} lastStateB=${JSON.stringify(lastStateB)}`,
    );
};

export const expectHidden = async (page: Page, selector: string) => {
    const className = (await page.getAttribute(selector, 'class')) ?? '';
    const classTokens = className.trim().length > 0 ? className.trim().split(/\s+/) : [];
    expect(classTokens.includes('hidden')).toBeTruthy();
};
