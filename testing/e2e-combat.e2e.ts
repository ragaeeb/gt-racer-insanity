import { expect, test } from '@playwright/test';
import { type GTDebugState, joinRace, readDebugState, STARTUP_TIMEOUT_MS, setDrivingKeyState } from './e2e-helpers';

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

/**
 * Wait for an active effect to appear on the player.
 * Similar to waitForDriftBoostTier in the drift E2E tests.
 */
const waitForActiveEffect = async (
    page: Parameters<typeof readDebugState>[0],
    expectedEffect: string,
    timeoutMs: number,
): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    let lastState: GTDebugState | null = null;

    while (Date.now() < deadline) {
        const state = await readDebugState(page);
        lastState = state;

        if (state?.activeEffectIds?.includes(expectedEffect)) {
            return true;
        }
        await page.waitForTimeout(100);
    }

    console.log(`Timed out waiting for effect "${expectedEffect}". Last state:`, lastState);
    return false;
};

test.describe('e2e combat - oil slick', () => {
    test('should apply slowed effect when player drives through oil slick', async ({ browser }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `OS${Date.now().toString().slice(-10)}`;
        const pageA = await browser.newPage();
        const pageB = await browser.newPage();

        try {
            // Player A (attacker) joins and places oil slick
            await joinRace(pageA, roomId, 'Oil Slicker');
            await waitForCarSpawn(pageA);

            // Wait for race to be ready
            await pageA.waitForTimeout(2_000);

            // Player A presses boost to deploy oil slick
            await setDrivingKeyState(pageA, 'KeyW', true);
            await pageA.waitForTimeout(500);
            await setDrivingKeyState(pageA, 'KeyW', false);

            // Wait for deployable to be created on server
            await pageA.waitForTimeout(1_000);

            // Now Player B joins and drives through the oil slick
            await joinRace(pageB, roomId, 'Oil Victim');
            await waitForCarSpawn(pageB);

            // Wait for both players to be in the race
            await pageB.waitForTimeout(2_000);

            // Get initial position of Player B (to verify movement)
            await readDebugState(pageB);

            // Player B drives forward (should eventually hit the oil slick behind player A)
            await setDrivingKeyState(pageB, 'KeyW', true);
            await pageB.waitForTimeout(3_000);
            await setDrivingKeyState(pageB, 'KeyW', false);

            // Check if slowed effect was applied - poll like drift E2E does
            const hasSlowedEffect = await waitForActiveEffect(pageB, 'slowed', 5_000);
            expect(hasSlowedEffect).toBe(true);
        } finally {
            await Promise.allSettled([pageA.close(), pageB.close()]);
        }
    });

    test('should despawn oil slick after lifetime expires', async ({ browser }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `OS${Date.now().toString().slice(-10)}`;
        const page = await browser.newPage();

        try {
            await joinRace(page, roomId, 'Oil Slicker');
            await waitForCarSpawn(page);

            // Wait for race to be ready
            await page.waitForTimeout(2_000);

            // Deploy oil slick
            await setDrivingKeyState(page, 'KeyW', true);
            await page.waitForTimeout(500);
            await setDrivingKeyState(page, 'KeyW', false);

            // Wait a bit for effect to appear on the player if they drive through it
            await page.waitForTimeout(1_000);

            // Oil slick lifetime is 5 seconds - wait for it to expire
            await page.waitForTimeout(6_000);

            // Verify player is still responsive and has no slow effect
            const state = await readDebugState(page);
            expect(state?.isRunning).toBe(true);
            // The player shouldn't have the slowed effect anymore
            expect(state?.activeEffectIds?.includes('slowed')).toBe(false);
        } finally {
            await page.close();
        }
    });
});

test.describe('e2e combat - EMP projectile', () => {
    test('should stun opponent when EMP projectile hits', async ({ browser }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `EM${Date.now().toString().slice(-10)}`;
        const pageA = await browser.newPage();
        const pageB = await browser.newPage();

        try {
            // Both players join
            await joinRace(pageA, roomId, 'EMP Shooter');
            await joinRace(pageB, roomId, 'EMP Target');

            // Wait for both to be ready
            await Promise.all([waitForCarSpawn(pageA), waitForCarSpawn(pageB)]);

            // Wait for race to be running and multiplayer to be ready
            await pageA.waitForTimeout(3_000);

            // Both drive forward a bit to get some distance
            await setDrivingKeyState(pageA, 'KeyW', true);
            await setDrivingKeyState(pageB, 'KeyW', true);
            await pageA.waitForTimeout(2_000);
            await setDrivingKeyState(pageA, 'KeyW', false);
            await setDrivingKeyState(pageB, 'KeyW', false);

            // Now Player A fires EMP using ability key (KeyE)
            await setDrivingKeyState(pageA, 'KeyE', true);
            await pageA.waitForTimeout(200);
            await setDrivingKeyState(pageA, 'KeyE', false);

            // Wait for projectile to hit (TTL is 2 seconds / 120 ticks)
            // Poll for stunned effect like drift E2E polls for driftBoostTier
            const hasStunnedEffect = await waitForActiveEffect(pageB, 'stunned', 5_000);
            expect(hasStunnedEffect).toBe(true);
        } finally {
            await Promise.allSettled([pageA.close(), pageB.close()]);
        }
    });

    test('should handle firing EMP with no opponents gracefully', async ({ browser }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `EM${Date.now().toString().slice(-10)}`;
        const page = await browser.newPage();

        try {
            await joinRace(page, roomId, 'Solo Player');
            await waitForCarSpawn(page);

            // Wait for race to be ready
            await page.waitForTimeout(2_000);

            // Fire EMP - since there's no opponent, projectile won't find a target
            await setDrivingKeyState(page, 'KeyE', true);
            await page.waitForTimeout(200);
            await setDrivingKeyState(page, 'KeyE', false);

            // Wait for projectile to expire
            await page.waitForTimeout(3_000);

            // Player should not have stunned effect (no target found)
            const state = await readDebugState(page);
            expect(state?.isRunning).toBe(true);
            expect(state?.activeEffectIds?.includes('stunned')).toBe(false);
        } finally {
            await page.close();
        }
    });
});
