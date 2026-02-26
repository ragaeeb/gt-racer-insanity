import { expect, test } from '@playwright/test';
import { DEFAULT_GAMEPLAY_TUNING } from '../src/shared/game/tuning/gameplayTuning';
import {
    type GTDebugState,
    joinRace,
    readDebugState,
    STARTUP_TIMEOUT_MS,
    setDrivingKeyState,
    waitForCarsToMoveForward,
    waitForMultiplayerReady,
} from './e2e-helpers';

const OIL_SLICK_LIFETIME_MS = Math.round((DEFAULT_GAMEPLAY_TUNING.combat.deployableOilSlickLifetimeTicks / 60) * 1000);
const OIL_SLICK_LIFETIME_TOLERANCE_MS = 3_000;

const waitForCarSpawn = async (page: Parameters<typeof readDebugState>[0]) => {
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

const waitForDebugState = async (
    page: Parameters<typeof readDebugState>[0],
    predicate: (state: GTDebugState) => boolean,
    timeoutMs: number,
    description: string,
): Promise<GTDebugState> => {
    const deadline = Date.now() + timeoutMs;
    let lastState: GTDebugState | null = null;

    while (Date.now() < deadline) {
        const state = await readDebugState(page);
        if (state) {
            lastState = state;
        }

        if (state && predicate(state)) {
            return state;
        }
        await page.waitForTimeout(100);
    }

    throw new Error(`Timed out waiting for ${description}. Last state: ${JSON.stringify(lastState)}`);
};

test.describe('e2e combat - oil slick', () => {
    test('should spawn oil slick deployable when boost is pressed', async ({ browser }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `OS${Date.now().toString().slice(-10)}`;
        const pageA = await browser.newPage();
        const pageB = await browser.newPage();

        try {
            await joinRace(pageA, roomId, 'Oil Slicker');
            await joinRace(pageB, roomId, 'Oil Rival');
            await Promise.all([waitForCarSpawn(pageA), waitForCarSpawn(pageB)]);
            await waitForMultiplayerReady(pageA, pageB, 10_000);

            const before = await readDebugState(pageA);
            const initialDeployableCount = before?.deployableCount ?? 0;

            await pageA.bringToFront();
            await setDrivingKeyState(pageA, 'Space', false);
            await pageA.waitForTimeout(50);
            await setDrivingKeyState(pageA, 'Space', true);
            await pageA.waitForTimeout(450);
            await setDrivingKeyState(pageA, 'Space', false);

            const state = await waitForDebugState(
                pageA,
                (s) => s.deployableCount > initialDeployableCount,
                4_000,
                'oil slick deployable to spawn',
            );
            expect(state.deployableCount).toBeGreaterThan(initialDeployableCount);
        } finally {
            await Promise.allSettled([pageA.close(), pageB.close()]);
        }
    });

    test('should despawn oil slick after lifetime expires', async ({ browser }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `OS${Date.now().toString().slice(-10)}`;
        const pageA = await browser.newPage();
        const pageB = await browser.newPage();

        try {
            await joinRace(pageA, roomId, 'Oil Slicker');
            await joinRace(pageB, roomId, 'Oil Rival');
            await Promise.all([waitForCarSpawn(pageA), waitForCarSpawn(pageB)]);
            await waitForMultiplayerReady(pageA, pageB, 10_000);

            // Deploy oil slick (boost input edge).
            await pageA.bringToFront();
            await setDrivingKeyState(pageA, 'Space', false);
            await pageA.waitForTimeout(50);
            await setDrivingKeyState(pageA, 'Space', true);
            await pageA.waitForTimeout(450);
            await setDrivingKeyState(pageA, 'Space', false);

            await waitForDebugState(pageA, (s) => s.deployableCount > 0, 4_000, 'oil slick deployable to appear');
            const appearedAtMs = Date.now();
            const state = await waitForDebugState(
                pageA,
                (s) => s.deployableCount === 0,
                13_000,
                'oil slick deployable to despawn',
            );
            const despawnedAtMs = Date.now();
            const observedLifetimeMs = despawnedAtMs - appearedAtMs;
            expect(state?.isRunning).toBe(true);
            expect(state.deployableCount).toBe(0);
            expect(observedLifetimeMs).toBeGreaterThanOrEqual(OIL_SLICK_LIFETIME_MS - OIL_SLICK_LIFETIME_TOLERANCE_MS);
            expect(observedLifetimeMs).toBeLessThanOrEqual(OIL_SLICK_LIFETIME_MS + OIL_SLICK_LIFETIME_TOLERANCE_MS);
        } finally {
            await Promise.allSettled([pageA.close(), pageB.close()]);
        }
    });
});

test.describe('e2e combat - EMP projectile', () => {
    test('should spawn EMP projectile when ability is triggered with an opponent', async ({ browser }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `EM${Date.now().toString().slice(-10)}`;
        const pageA = await browser.newPage();
        const pageB = await browser.newPage();

        try {
            // Shooter must use patrol to get spike-shot (projectile delivery).
            await joinRace(pageA, roomId, 'EMP Shooter', { vehicleLabel: 'Patrol' });
            await joinRace(pageB, roomId, 'EMP Target');

            // Wait for both to be ready
            const [stateA, stateB] = await Promise.all([waitForCarSpawn(pageA), waitForCarSpawn(pageB)]);
            await waitForMultiplayerReady(pageA, pageB, 10_000);

            await waitForDebugState(pageA, (s) => s.vehicleId === 'patrol', 5_000, 'patrol vehicle selection');

            await pageA.bringToFront();
            await setDrivingKeyState(pageA, 'KeyW', true);
            await pageB.bringToFront();
            await setDrivingKeyState(pageB, 'KeyW', true);
            await waitForCarsToMoveForward(pageA, pageB, stateA, stateB, 5_000);

            await pageA.bringToFront();
            await setDrivingKeyState(pageA, 'KeyW', false);
            await pageB.bringToFront();
            await setDrivingKeyState(pageB, 'KeyW', false);

            await pageA.bringToFront();
            const initialState = await readDebugState(pageA);
            const initialProjectileCount = initialState?.projectileCount ?? 0;
            const initialTargetState = await readDebugState(pageB);
            const initialTargetStunned = initialTargetState?.activeEffectIds.includes('stunned') ?? false;

            await pageA.bringToFront();
            await setDrivingKeyState(pageA, 'KeyE', true);
            await pageA.waitForTimeout(450);
            await setDrivingKeyState(pageA, 'KeyE', false);

            const deadline = Date.now() + 4_000;
            let sawProjectileInFlight = false;
            let sawProjectileHit = false;
            let lastShooterState: GTDebugState | null = null;
            let lastTargetState: GTDebugState | null = null;

            while (Date.now() < deadline) {
                const [shooterState, targetState] = await Promise.all([readDebugState(pageA), readDebugState(pageB)]);
                if (shooterState) {
                    lastShooterState = shooterState;
                    if (shooterState.projectileCount > initialProjectileCount) {
                        sawProjectileInFlight = true;
                    }
                }
                if (targetState) {
                    lastTargetState = targetState;
                    const targetStunned = targetState.activeEffectIds.includes('stunned');
                    if (!initialTargetStunned && targetStunned) {
                        sawProjectileHit = true;
                    }
                }

                if (sawProjectileInFlight || sawProjectileHit) {
                    break;
                }
                await pageA.waitForTimeout(100);
            }

            expect(
                sawProjectileInFlight || sawProjectileHit,
                `Timed out waiting for EMP projectile evidence. shooter=${JSON.stringify(lastShooterState)} target=${JSON.stringify(lastTargetState)}`,
            ).toBe(true);
        } finally {
            await Promise.allSettled([pageA.close(), pageB.close()]);
        }
    });

    test('should handle firing EMP with no opponents gracefully', async ({ browser }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `EM${Date.now().toString().slice(-10)}`;
        const page = await browser.newPage();

        try {
            await joinRace(page, roomId, 'Solo Player', { vehicleLabel: 'Patrol' });
            await waitForCarSpawn(page);
            await waitForDebugState(page, (s) => s.vehicleId === 'patrol', 5_000, 'patrol vehicle selection');

            const before = await readDebugState(page);
            await setDrivingKeyState(page, 'KeyE', true);
            await page.waitForTimeout(450);
            await setDrivingKeyState(page, 'KeyE', false);

            const baselineProjectileCount = before?.projectileCount ?? 0;
            const deadline = Date.now() + 2_000;
            let state: GTDebugState | null = null;
            while (Date.now() < deadline) {
                state = await readDebugState(page);
                expect(state?.isRunning).toBe(true);
                expect(state?.projectileCount ?? 0).toBeLessThanOrEqual(baselineProjectileCount);
                await page.waitForTimeout(100);
            }
        } finally {
            await page.close();
        }
    });
});
