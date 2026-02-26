/**
 * M6-D: Full Race E2E Tests
 *
 * Comprehensive integration tests verifying that all game features
 * (drift, combat, elevation, scenery) work together across all tracks.
 *
 * Tests cover:
 *   1. Loading and playing on every track without errors
 *   2. Driving forward and maintaining stable physics on each track
 *   3. Drift system working in a full race scenario
 *   4. Combat features (oil slick, EMP) available during a race
 *   5. Elevation tracks rendering without physics explosions
 */
import { expect, test } from '@playwright/test';

import { joinRace, readDebugState, STARTUP_TIMEOUT_MS, setDrivingKeyState, waitForCarSpawn } from './e2e-helpers';

const ALL_TRACK_IDS = ['sunset-loop', 'canyon-sprint', 'neon-city', 'desert-oasis'] as const;

test.describe('e2e full race — all tracks load', () => {
    for (const trackId of ALL_TRACK_IDS) {
        test(`should load and drive on ${trackId} without errors`, async ({ page }) => {
            test.setTimeout(STARTUP_TIMEOUT_MS);

            const pageErrors: string[] = [];
            const consoleErrors: string[] = [];

            page.on('pageerror', (error) => {
                pageErrors.push(error.message);
            });
            page.on('console', (message) => {
                if (message.type() === 'error') {
                    consoleErrors.push(message.text());
                }
            });

            const roomId = `FR${trackId.slice(0, 4)}${Date.now().toString().slice(-6)}`;
            await joinRace(page, roomId, `Driver ${trackId}`, { trackId });
            const initialState = await waitForCarSpawn(page);
            const initialCarZ = initialState.localCarZ ?? 0;

            // Drive forward for 4 seconds
            await setDrivingKeyState(page, 'KeyW', true);
            await page.waitForTimeout(4_000);
            await setDrivingKeyState(page, 'KeyW', false);

            // Wait for physics to settle
            await page.waitForTimeout(500);

            const finalState = await readDebugState(page);

            // Car should have moved forward
            expect(finalState?.localCarZ ?? 0).toBeGreaterThan(initialCarZ);

            // Speed should be positive (car was moving)
            expect(finalState?.speedKph ?? 0).toBeGreaterThan(0);

            // Game should still be running and connected
            expect(finalState?.connectionStatus).toBe('connected');
            expect(finalState?.isRunning).toBe(true);

            // No runtime errors
            expect(pageErrors).toHaveLength(0);
            expect(consoleErrors).toHaveLength(0);
        });
    }
});

test.describe('e2e full race — integrated features', () => {
    test('should drive and drift on sunset-loop without issues', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const pageErrors: string[] = [];
        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        const roomId = `FRDR${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Drift Racer', { trackId: 'sunset-loop' });
        await waitForCarSpawn(page);

        // Build speed (3.5s at full throttle, keep held for drift phase)
        await setDrivingKeyState(page, 'KeyW', true);
        await page.waitForTimeout(3_500);

        // Initiate drift: handbrake + steer
        await setDrivingKeyState(page, 'ShiftLeft', true);
        await setDrivingKeyState(page, 'KeyD', true);

        // Hold drift for 1.5s to reach at least tier 1
        await page.waitForTimeout(1_500);

        // Check drift state — should have entered drifting
        const deadline = Date.now() + 3_000;
        let driftTier = 0;

        while (Date.now() < deadline) {
            const state = await readDebugState(page);
            driftTier = state?.driftBoostTier ?? 0;
            if (driftTier >= 1) {
                break;
            }
            await page.waitForTimeout(100);
        }

        expect(driftTier).toBeGreaterThanOrEqual(1);

        // Release drift, continue driving
        await setDrivingKeyState(page, 'ShiftLeft', false);
        await setDrivingKeyState(page, 'KeyD', false);

        // Continue driving straight for 2 more seconds
        await page.waitForTimeout(2_000);
        await setDrivingKeyState(page, 'KeyW', false);

        // Verify game is still stable
        const state = await readDebugState(page);
        expect(state?.isRunning).toBe(true);
        expect(state?.connectionStatus).toBe('connected');
        expect(pageErrors).toHaveLength(0);
    });

    test('should progress and remain connected on neon-city elevation segments', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const pageErrors: string[] = [];
        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        const roomId = `FREL${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Elevation Racer', { trackId: 'neon-city' });
        await waitForCarSpawn(page);

        // Drive forward for 6 seconds to cover multiple segments including elevation
        await setDrivingKeyState(page, 'KeyW', true);
        await page.waitForTimeout(6_000);
        await setDrivingKeyState(page, 'KeyW', false);

        await page.waitForTimeout(500);

        const state = await readDebugState(page);

        // Game should still be running
        expect(state?.isRunning).toBe(true);
        expect(state?.connectionStatus).toBe('connected');
        expect(pageErrors).toHaveLength(0);

        // Car should have moved forward substantially
        expect(state?.localCarZ ?? 0).toBeGreaterThan(10);

        // Speed should be reasonable — not stuck or exploded
        expect(state?.speedKph ?? 0).toBeGreaterThan(0);
        expect(state?.speedKph ?? Infinity).toBeLessThan(500);
    });

    test('should handle aggressive maneuvers on desert-oasis without crash', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const pageErrors: string[] = [];
        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        const roomId = `FRAG${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Aggressive Racer', { trackId: 'desert-oasis' });
        await waitForCarSpawn(page);

        // Build speed
        await setDrivingKeyState(page, 'KeyW', true);
        await page.waitForTimeout(2_000);

        // Aggressive swerving + brake cycles
        for (let cycle = 0; cycle < 3; cycle += 1) {
            await setDrivingKeyState(page, 'KeyA', true);
            await page.waitForTimeout(600);
            await setDrivingKeyState(page, 'KeyA', false);

            await setDrivingKeyState(page, 'KeyD', true);
            await page.waitForTimeout(600);
            await setDrivingKeyState(page, 'KeyD', false);

            // Handbrake tap
            await setDrivingKeyState(page, 'ShiftLeft', true);
            await page.waitForTimeout(300);
            await setDrivingKeyState(page, 'ShiftLeft', false);
        }

        await setDrivingKeyState(page, 'KeyW', false);

        const state = await readDebugState(page);
        expect(state?.isRunning).toBe(true);
        expect(state?.connectionStatus).toBe('connected');
        expect(pageErrors).toHaveLength(0);

        // Car should have advanced
        expect(state?.localCarZ ?? 0).toBeGreaterThan(5);
    });

    test('should exercise combat features without crashing (single player)', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const pageErrors: string[] = [];
        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        const roomId = `FRCB${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Combat Solo');
        await waitForCarSpawn(page);

        // Drive forward
        await setDrivingKeyState(page, 'KeyW', true);
        await page.waitForTimeout(2_000);

        // Attempt oil slick deploy (boost/Space)
        await setDrivingKeyState(page, 'Space', true);
        await page.waitForTimeout(300);
        await setDrivingKeyState(page, 'Space', false);
        await page.waitForTimeout(500);

        // Attempt EMP fire (KeyE) — should be graceful with no opponents
        await setDrivingKeyState(page, 'KeyE', true);
        await page.waitForTimeout(300);
        await setDrivingKeyState(page, 'KeyE', false);
        await page.waitForTimeout(500);

        await setDrivingKeyState(page, 'KeyW', false);

        const state = await readDebugState(page);
        expect(state?.isRunning).toBe(true);
        expect(state?.connectionStatus).toBe('connected');
        expect(pageErrors).toHaveLength(0);
    });

    test('should survive rapid accelerate-brake-drift cycle on canyon-sprint', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const pageErrors: string[] = [];
        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        const roomId = `FRCY${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Canyon Racer', { trackId: 'canyon-sprint' });
        await waitForCarSpawn(page);

        // Rapid cycles: accelerate → drift → brake → repeat
        for (let cycle = 0; cycle < 3; cycle += 1) {
            // Accelerate
            await setDrivingKeyState(page, 'KeyW', true);
            await page.waitForTimeout(1_500);

            // Short drift
            await setDrivingKeyState(page, 'ShiftLeft', true);
            await setDrivingKeyState(page, 'KeyA', true);
            await page.waitForTimeout(800);
            await setDrivingKeyState(page, 'ShiftLeft', false);
            await setDrivingKeyState(page, 'KeyA', false);

            // Brake
            await setDrivingKeyState(page, 'KeyW', false);
            await setDrivingKeyState(page, 'KeyS', true);
            await page.waitForTimeout(500);
            await setDrivingKeyState(page, 'KeyS', false);

            await page.waitForTimeout(300);
        }

        const state = await readDebugState(page);
        expect(state?.isRunning).toBe(true);
        expect(state?.connectionStatus).toBe('connected');
        expect(pageErrors).toHaveLength(0);
    });
});
