/**
 * M6-D: Performance Regression E2E Tests
 *
 * Enforces performance budgets in E2E:
 *   1. Draw calls stay within budget after InstancedMesh + LOD work
 *   2. No long tasks (main-thread stalls) during gameplay
 *   3. Frame gaps stay reasonable (no sustained jank)
 *   4. All tracks render without performance degradation
 *   5. Heavy input sequences (drift + combat) don't cause spikes
 *
 * These tests use the diagnostics subsystem (__GT_DIAG__) to capture
 * performance telemetry during real gameplay, then assert budgets.
 */
import { expect, test } from '@playwright/test';

import {
    enableDiagnostics,
    joinRace,
    readDebugState,
    STARTUP_TIMEOUT_MS,
    setDrivingKeyState,
    waitForCarSpawn,
} from './e2e-helpers';

type DiagSummary = {
    collisionFrameSampleCount: number;
    drawCallsAvg: number;
    drawCallsMax: number;
    longFrameGapCount: number;
    longTaskCount: number;
    longTaskMaxMs: number;
    maxFrameGapMs: number;
};

const DRAW_CALLS_MAX_BUDGET = 500;
const LONG_TASK_MAX_MS_BUDGET = 2_000;
const LONG_FRAME_GAP_MAX_COUNT = 80;

const getDiagSummary = async (page: Parameters<typeof readDebugState>[0]): Promise<DiagSummary | null> => {
    try {
        return await page.evaluate(() => {
            const debugWindow = window as Window & {
                __GT_DIAG__?: {
                    getSummary: () => DiagSummary;
                };
            };
            return debugWindow.__GT_DIAG__?.getSummary() ?? null;
        });
    } catch {
        return null;
    }
};

test.describe('e2e performance regression', () => {
    test('should maintain draw call budget during gameplay on sunset-loop', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        await enableDiagnostics(page);

        const roomId = `PF1${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Perf Driver', { trackId: 'sunset-loop' });
        await waitForCarSpawn(page);

        // Drive for 5 seconds to let rendering stabilize
        await setDrivingKeyState(page, 'KeyW', true);
        await page.waitForTimeout(5_000);
        await setDrivingKeyState(page, 'KeyW', false);
        await page.waitForTimeout(1_000);

        const summary = await getDiagSummary(page);
        expect(summary).not.toBeNull();

        if (summary) {
            expect(summary.drawCallsMax).toBeLessThanOrEqual(DRAW_CALLS_MAX_BUDGET);
        }
    });

    test('should maintain draw call budget on canyon-sprint theme', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        await enableDiagnostics(page);

        const roomId = `PF2${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Canyon Perf', { trackId: 'canyon-sprint' });
        await waitForCarSpawn(page);

        await setDrivingKeyState(page, 'KeyW', true);
        await page.waitForTimeout(5_000);
        await setDrivingKeyState(page, 'KeyW', false);
        await page.waitForTimeout(1_000);

        const summary = await getDiagSummary(page);
        expect(summary).not.toBeNull();

        if (summary) {
            expect(summary.drawCallsMax).toBeLessThanOrEqual(DRAW_CALLS_MAX_BUDGET);
        }
    });

    test('should not produce excessive long tasks during drift sequence', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        await enableDiagnostics(page);

        const roomId = `PF3${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Drift Perf');
        await waitForCarSpawn(page);

        // Build speed
        await setDrivingKeyState(page, 'KeyW', true);
        await page.waitForTimeout(3_000);

        // Drift phase: handbrake + steer
        await setDrivingKeyState(page, 'ShiftLeft', true);
        await setDrivingKeyState(page, 'KeyD', true);
        await page.waitForTimeout(2_000);

        // Release drift
        await setDrivingKeyState(page, 'ShiftLeft', false);
        await setDrivingKeyState(page, 'KeyD', false);

        // Continue driving
        await page.waitForTimeout(2_000);
        await setDrivingKeyState(page, 'KeyW', false);

        await page.waitForTimeout(500);

        const summary = await getDiagSummary(page);
        expect(summary).not.toBeNull();

        if (summary) {
            // No single long task should exceed budget
            expect(summary.longTaskMaxMs).toBeLessThanOrEqual(LONG_TASK_MAX_MS_BUDGET);
        }
    });

    test('should not produce excessive frame gaps during combat inputs', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        await enableDiagnostics(page);

        const roomId = `PF4${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Combat Perf');
        await waitForCarSpawn(page);

        // Drive and rapidly exercise combat inputs
        await setDrivingKeyState(page, 'KeyW', true);
        await page.waitForTimeout(2_000);

        // Rapid combat input sequence
        for (let i = 0; i < 5; i += 1) {
            await setDrivingKeyState(page, 'Space', true);
            await page.waitForTimeout(200);
            await setDrivingKeyState(page, 'Space', false);
            await page.waitForTimeout(300);

            await setDrivingKeyState(page, 'KeyE', true);
            await page.waitForTimeout(200);
            await setDrivingKeyState(page, 'KeyE', false);
            await page.waitForTimeout(300);
        }

        await setDrivingKeyState(page, 'KeyW', false);
        await page.waitForTimeout(500);

        const summary = await getDiagSummary(page);
        expect(summary).not.toBeNull();

        if (summary) {
            // Frame gaps should stay within acceptable limits
            expect(summary.longFrameGapCount).toBeLessThanOrEqual(LONG_FRAME_GAP_MAX_COUNT);
        }
    });

    test('should maintain performance across all tracks', async ({ page }) => {
        const tracks = ['sunset-loop', 'canyon-sprint', 'neon-city', 'desert-oasis'] as const;
        test.setTimeout(STARTUP_TIMEOUT_MS * (tracks.length + 1));

        await enableDiagnostics(page);

        for (const trackId of tracks) {
            const roomId = `PFA${trackId.slice(0, 3)}${Date.now().toString().slice(-5)}`;
            await joinRace(page, roomId, `All Perf ${trackId.slice(0, 4)}`, { trackId });
            await waitForCarSpawn(page);

            // Drive for 3 seconds per track
            await setDrivingKeyState(page, 'KeyW', true);
            await page.waitForTimeout(3_000);
            await setDrivingKeyState(page, 'KeyW', false);
            await page.waitForTimeout(500);

            const state = await readDebugState(page);
            expect(state?.isRunning).toBe(true);
            expect(state?.connectionStatus).toBe('connected');
        }

        // Check final diagnostics summary — accumulated across all tracks
        const summary = await getDiagSummary(page);
        expect(summary).not.toBeNull();

        if (summary) {
            expect(summary.drawCallsMax).toBeLessThanOrEqual(DRAW_CALLS_MAX_BUDGET);
        }
    });

    test('should maintain stable game state during heavy input sequence', async ({ page }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        await enableDiagnostics(page);

        const pageErrors: string[] = [];
        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        const roomId = `PF5${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Heavy Input');
        await waitForCarSpawn(page);

        // Rapid multi-input stress test: throttle + steer + handbrake + combat
        await setDrivingKeyState(page, 'KeyW', true);

        for (let cycle = 0; cycle < 4; cycle += 1) {
            // Swerve left
            await setDrivingKeyState(page, 'KeyA', true);
            await page.waitForTimeout(300);
            await setDrivingKeyState(page, 'KeyA', false);

            // Handbrake tap
            await setDrivingKeyState(page, 'ShiftLeft', true);
            await page.waitForTimeout(200);
            await setDrivingKeyState(page, 'ShiftLeft', false);

            // Swerve right
            await setDrivingKeyState(page, 'KeyD', true);
            await page.waitForTimeout(300);
            await setDrivingKeyState(page, 'KeyD', false);

            // Combat input
            await setDrivingKeyState(page, 'Space', true);
            await page.waitForTimeout(150);
            await setDrivingKeyState(page, 'Space', false);

            await setDrivingKeyState(page, 'KeyE', true);
            await page.waitForTimeout(150);
            await setDrivingKeyState(page, 'KeyE', false);

            await page.waitForTimeout(200);
        }

        await setDrivingKeyState(page, 'KeyW', false);
        await page.waitForTimeout(500);

        // Verify no crashes
        const state = await readDebugState(page);
        expect(state?.isRunning).toBe(true);
        expect(state?.connectionStatus).toBe('connected');
        expect(pageErrors).toHaveLength(0);

        // Verify performance budgets
        const summary = await getDiagSummary(page);
        expect(summary).not.toBeNull();

        if (summary) {
            expect(summary.drawCallsMax).toBeLessThanOrEqual(DRAW_CALLS_MAX_BUDGET);
            expect(summary.longTaskMaxMs).toBeLessThanOrEqual(LONG_TASK_MAX_MS_BUDGET);
        }
    });
});
