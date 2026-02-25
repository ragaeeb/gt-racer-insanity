import { expect, test } from '@playwright/test';

import { joinRace, readDebugState, setDrivingKeyState, STARTUP_TIMEOUT_MS } from './e2e-helpers';

const waitForCarSpawn = async (page: Parameters<typeof readDebugState>[0]) => {
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

const buildUpSpeed = async (page: Parameters<typeof readDebugState>[0], durationMs: number) => {
    await setDrivingKeyState(page, 'KeyW', true);
    await page.waitForTimeout(durationMs);
    await setDrivingKeyState(page, 'KeyW', false);
};

const waitForDriftBoostTier = async (
    page: Parameters<typeof readDebugState>[0],
    minTier: number,
    timeoutMs: number,
): Promise<number> => {
    const deadline = Date.now() + timeoutMs;
    let lastTier = 0;

    while (Date.now() < deadline) {
        const state = await readDebugState(page);
        lastTier = state?.driftBoostTier ?? 0;
        if (lastTier >= minTier) {
            return lastTier;
        }
        await page.waitForTimeout(100);
    }

    throw new Error(`Timed out waiting for driftBoostTier >= ${minTier}. Last value: ${lastTier}`);
};

test.describe('e2e drift boost', () => {
    test('should show drift tier 1 after ~1s of drifting then release', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `DB1${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Drift Driver');
        await waitForCarSpawn(page);

        // Accelerate past the 10 m/s drift entry threshold (~3s at full throttle)
        await buildUpSpeed(page, 3_000);

        // Drift: W (throttle) + ShiftLeft (handbrake) + KeyD (right steer)
        await setDrivingKeyState(page, 'KeyW', true);
        await setDrivingKeyState(page, 'ShiftLeft', true);
        await setDrivingKeyState(page, 'KeyD', true);

        // Hold for 1.5s — enough for GRIPPING → INITIATING → DRIFTING → tier 1 (1000ms accumulated)
        await page.waitForTimeout(1_500);

        // Release handbrake to trigger RECOVERING state and emit the boost
        await setDrivingKeyState(page, 'ShiftLeft', false);
        await setDrivingKeyState(page, 'KeyD', false);
        await setDrivingKeyState(page, 'KeyW', false);

        // Tier 1 should have been reached and the DOM indicator should be visible
        // (the indicator appears while tier > 0, disappears after RECOVERING completes)
        // Poll __GT_DEBUG__ for the peak tier observed at the end of the drift window
        const peakTier = await waitForDriftBoostTier(page, 1, 3_000);
        expect(peakTier).toBeGreaterThanOrEqual(1);

        // DOM indicator: #drift-tier-indicator is rendered only when driftBoostTier > 0
        // It may briefly appear and disappear — check data-tier attribute captures tier 1
        const indicator = page.locator('#drift-tier-indicator');
        await expect(indicator).toBeVisible({ timeout: 2_000 });
        const tier = await indicator.getAttribute('data-tier');
        expect(Number(tier)).toBeGreaterThanOrEqual(1);
    });

    test('should show drift tier 3 (ultra) after ~3s of sustained drifting', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `DB3${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Ultra Driver');
        await waitForCarSpawn(page);

        // Build speed past the 10 m/s entry threshold
        await buildUpSpeed(page, 3_500);

        // Drift: W + ShiftLeft + KeyA — sustained drift at high throttle
        await setDrivingKeyState(page, 'KeyW', true);
        await setDrivingKeyState(page, 'ShiftLeft', true);
        await setDrivingKeyState(page, 'KeyA', true);

        // Hold for 3.5s — enough to pass tier 3 (3000ms accumulated DRIFTING)
        await page.waitForTimeout(3_500);

        // Poll for tier 3 while still holding drift
        const peakTier = await waitForDriftBoostTier(page, 3, 2_000);
        expect(peakTier).toBe(3);

        // The DOM indicator should show tier 3 (ultra)
        const indicator = page.locator('#drift-tier-indicator');
        await expect(indicator).toBeVisible({ timeout: 1_000 });
        const tier = await indicator.getAttribute('data-tier');
        expect(Number(tier)).toBe(3);

        // Release drift
        await setDrivingKeyState(page, 'ShiftLeft', false);
        await setDrivingKeyState(page, 'KeyA', false);
        await setDrivingKeyState(page, 'KeyW', false);
    });
});
