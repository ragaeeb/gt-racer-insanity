import { expect, test } from '@playwright/test';

import {
    enableDiagnostics,
    enableDiagnosticsRuntime,
    joinRace,
    readDebugState,
    setDrivingKeyState,
    STARTUP_TIMEOUT_MS,
    waitForCarsToMoveForward,
    waitForMultiplayerReady,
} from './e2e-helpers';

test.describe('e2e multiplayer collision', () => {
    test('should keep two multiplayer cars separated while both are active', async ({ browser }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `MC${Date.now().toString().slice(-10)}`;
        const pageA = await browser.newPage();
        const pageB = await browser.newPage();

        try {
            await joinRace(pageA, roomId, 'Driver A');
            await joinRace(pageB, roomId, 'Driver B');

            const { stateA, stateB } = await waitForMultiplayerReady(pageA, pageB, 30_000);

            expect(stateA?.isRunning).toBe(true);
            expect(stateB?.isRunning).toBe(true);

            await pageA.bringToFront();
            await setDrivingKeyState(pageA, 'KeyW', true);
            await pageB.bringToFront();
            await setDrivingKeyState(pageB, 'KeyW', true);

            await pageA.waitForTimeout(2_200);

            await pageA.bringToFront();
            await setDrivingKeyState(pageA, 'KeyW', false);
            await pageB.bringToFront();
            await setDrivingKeyState(pageB, 'KeyW', false);

            const { stateA: movedA, stateB: movedB } = await waitForCarsToMoveForward(
                pageA,
                pageB,
                stateA,
                stateB,
                20_000,
            );

            expect(movedA?.localCarZ ?? 0).toBeGreaterThan(stateA?.localCarZ ?? 0);
            expect(movedB?.localCarZ ?? 0).toBeGreaterThan(stateB?.localCarZ ?? 0);
            expect(movedA?.nearestOpponentDistanceMeters ?? 0).toBeGreaterThan(0.25);
            expect(movedB?.nearestOpponentDistanceMeters ?? 0).toBeGreaterThan(0.25);
        } finally {
            await Promise.allSettled([pageA.close(), pageB.close()]);
        }
    });

    test('should remain connected and responsive during aggressive multiplayer steering updates', async ({ browser }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `MC${Date.now().toString().slice(-10)}`;
        const pageA = await browser.newPage();
        const pageB = await browser.newPage();

        try {
            await Promise.all([enableDiagnostics(pageA), enableDiagnostics(pageB)]);
            await joinRace(pageA, roomId, 'Driver A');
            await joinRace(pageB, roomId, 'Driver B');
            await Promise.all([enableDiagnosticsRuntime(pageA), enableDiagnosticsRuntime(pageB)]);

            const { stateA, stateB } = await waitForMultiplayerReady(pageA, pageB, 30_000);
            expect(stateA?.isRunning).toBe(true);
            expect(stateB?.isRunning).toBe(true);

            for (let attempt = 0; attempt < 6; attempt += 1) {
                const latestA = await readDebugState(pageA);
                const latestB = await readDebugState(pageB);
                const steerCode = (latestA?.localCarX ?? -6) < (latestB?.localCarX ?? -2) ? 'KeyD' : 'KeyA';

                await pageA.bringToFront();
                await setDrivingKeyState(pageA, 'KeyW', true);
                await setDrivingKeyState(pageA, steerCode, true);
                await pageA.waitForTimeout(1_300);
                await setDrivingKeyState(pageA, steerCode, false);
                await pageA.waitForTimeout(900);
                await setDrivingKeyState(pageA, 'KeyW', false);
                await pageA.waitForTimeout(250);
            }

            const [finalStateA, finalStateB] = await Promise.all([readDebugState(pageA), readDebugState(pageB)]);
            expect(finalStateA?.isRunning).toBe(true);
            expect(finalStateB?.isRunning).toBe(true);
            expect(finalStateA?.connectionStatus).toBe('connected');
            expect(finalStateB?.connectionStatus).toBe('connected');
            expect(finalStateA?.localCarZ).not.toBeNull();
            expect(finalStateB?.localCarZ).not.toBeNull();
            expect(finalStateA?.opponentCount ?? 0).toBeGreaterThanOrEqual(1);
            expect(finalStateB?.opponentCount ?? 0).toBeGreaterThanOrEqual(1);
        } finally {
            await Promise.allSettled([pageA.close(), pageB.close()]);
        }
    });
});
