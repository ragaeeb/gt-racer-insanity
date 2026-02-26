import { expect, test } from '@playwright/test';

import { joinRace, readDebugState, STARTUP_TIMEOUT_MS, setDrivingKeyState, waitForCarSpawn } from './e2e-helpers';

/**
 * Accelerate with KeyW for the given duration.
 * When keepHeld is true, KeyW remains pressed after returning (avoids a
 * deceleration gap before the drift phase that immediately re-presses KeyW).
 */
const buildUpSpeed = async (page: Parameters<typeof readDebugState>[0], durationMs: number, keepHeld = false) => {
    await setDrivingKeyState(page, 'KeyW', true);
    await page.waitForTimeout(durationMs);
    if (!keepHeld) {
        await setDrivingKeyState(page, 'KeyW', false);
    }
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

        // Accelerate past the 10 m/s drift entry threshold (~3s at full throttle).
        // keepHeld=true avoids a deceleration gap before the drift phase.
        await buildUpSpeed(page, 3_000, true);

        // Drift: ShiftLeft (handbrake) + KeyD (right steer) — KeyW is already held
        await setDrivingKeyState(page, 'ShiftLeft', true);
        await setDrivingKeyState(page, 'KeyD', true);

        // Hold for 1.5s — enough for GRIPPING → INITIATING → DRIFTING → tier 1 (1000ms accumulated)
        await page.waitForTimeout(1_500);

        // Poll for tier >= 1 while still in DRIFTING state (before releasing handbrake).
        // Releasing first would transition to RECOVERING which immediately consumes boostTier.
        const peakTier = await waitForDriftBoostTier(page, 1, 3_000);
        expect(peakTier).toBeGreaterThanOrEqual(1);

        // DOM indicator: #drift-tier-indicator is rendered only when driftBoostTier > 0
        const indicator = page.locator('#drift-tier-indicator');
        await expect(indicator).toBeVisible({ timeout: 2_000 });
        const tier = await indicator.getAttribute('data-tier');
        expect(Number(tier)).toBeGreaterThanOrEqual(1);

        // Release all drift keys
        await setDrivingKeyState(page, 'ShiftLeft', false);
        await setDrivingKeyState(page, 'KeyD', false);
        await setDrivingKeyState(page, 'KeyW', false);
    });

    test('should show drift tier 3 (ultra) after ~3s of sustained drifting', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `DB3${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Ultra Driver');
        await waitForCarSpawn(page);

        // Build speed past the 10 m/s entry threshold, keeping KeyW held
        await buildUpSpeed(page, 3_500, true);

        // Drift: ShiftLeft + KeyA — sustained drift at high throttle (KeyW already held)
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
