import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { joinRace, readDebugState, STARTUP_TIMEOUT_MS, waitForCarSpawn } from './e2e-helpers';

const forceFinishRace = async (request: APIRequestContext, roomId: string) => {
    const response = await request.post('http://127.0.0.1:3001/__e2e__/force-finish', {
        data: { roomId },
    });

    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as {
        ok: boolean;
        raceState?: { status?: string };
    };
    expect(payload.ok).toBe(true);
    expect(payload.raceState?.status).toBe('finished');
};

const waitForTrackLabel = async (page: Page, expectedTrackLabel: string) => {
    await expect(page.locator('#track-name')).toHaveText(expectedTrackLabel, { timeout: 15_000 });
};

const driveForwardAndAssertMovement = async (page: Page) => {
    const before = await readDebugState(page);
    expect(before?.isRunning).toBe(true);
    const startX = before?.localCarX ?? 0;
    const startZ = before?.localCarZ ?? 0;

    await page.bringToFront();
    await page.focus('body');
    await page.keyboard.down('w');
    await expect.poll(async () => (await readDebugState(page))?.isRunning ?? false).toBe(true);
    await expect
        .poll(async () => (await readDebugState(page))?.speedKph ?? 0, { timeout: 8_000 })
        .toBeGreaterThan(1);
    await page.keyboard.up('w');
    await page.waitForTimeout(300);

    const after = await readDebugState(page);
    const endX = after?.localCarX ?? startX;
    const endZ = after?.localCarZ ?? startZ;
    const displacement = Math.hypot(endX - startX, endZ - startZ);
    expect(displacement).toBeGreaterThan(0.2);
};

test.describe('e2e level progression', () => {
    test('should advance to a new track on every finished-race restart', async ({ page, request }) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `LPR${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Progress Driver', { trackId: 'sunset-loop' });
        await waitForCarSpawn(page);

        await waitForTrackLabel(page, 'Sunset Loop');

        const expectedTrackOrder = ['Canyon Sprint', 'Neon City', 'Desert Oasis'];

        for (const expectedTrackLabel of expectedTrackOrder) {
            await forceFinishRace(request, roomId);
            await expect(page.locator('#game-over')).toBeVisible({ timeout: 15_000 });
            await expect(page.locator('#restart-btn')).toHaveText('NEXT LEVEL', { timeout: 15_000 });

            await page.locator('#restart-btn').click();

            await expect(page.locator('#game-over')).toHaveClass(/hidden/, { timeout: 15_000 });
            await waitForTrackLabel(page, expectedTrackLabel);
            await driveForwardAndAssertMovement(page);
        }
    });
});
