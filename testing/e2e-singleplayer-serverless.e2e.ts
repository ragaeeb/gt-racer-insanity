import { expect, test, type Page } from '@playwright/test';
import { forceFinishRaceViaDebug, joinRace, readDebugState, waitForCarSpawn } from './e2e-helpers';

const waitForTrackLabel = async (page: Page, expectedTrackLabel: string) => {
    await expect(page.locator('#track-name')).toHaveText(expectedTrackLabel, { timeout: 15_000 });
};

const driveForwardAndAssertMovement = async (page: Page) => {
    const before = await readDebugState(page);
    const startX = before?.localCarX ?? 0;
    const startZ = before?.localCarZ ?? 0;

    await page.bringToFront();
    await page.focus('body');
    await page.keyboard.down('w');
    await expect.poll(async () => (await readDebugState(page))?.speedKph ?? 0, { timeout: 8_000 }).toBeGreaterThan(1);
    await page.keyboard.up('w');
    await page.waitForTimeout(300);

    const after = await readDebugState(page);
    const endX = after?.localCarX ?? startX;
    const endZ = after?.localCarZ ?? startZ;
    const displacement = Math.hypot(endX - startX, endZ - startZ);
    expect(displacement).toBeGreaterThan(0.2);
};

test.describe('e2e singleplayer serverless', () => {
    test('should run fully local, advance level, and remain stable while driving', async ({ page }) => {
        test.setTimeout(120_000);

        const pageErrors: string[] = [];
        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        const roomId = `SP${Date.now().toString().slice(-8)}`;
        await joinRace(page, roomId, 'Solo Driver', { gameMode: 'singleplayer', trackId: 'sunset-loop' });
        await waitForCarSpawn(page);

        const initialState = await readDebugState(page);
        expect(initialState).not.toBeNull();
        expect(initialState?.connectionStatus).toBe('connected');
        await waitForTrackLabel(page, 'Sunset Loop');
        await driveForwardAndAssertMovement(page);

        await forceFinishRaceViaDebug(page);
        await expect(page.locator('#game-over')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#restart-btn')).toHaveText('NEXT LEVEL', { timeout: 15_000 });
        await page.locator('#restart-btn').click();
        await expect(page.locator('#game-over')).toHaveClass(/hidden/, { timeout: 15_000 });

        await waitForTrackLabel(page, 'Canyon Sprint');
        await driveForwardAndAssertMovement(page);

        await page.keyboard.down('w');
        for (let iteration = 0; iteration < 10; iteration += 1) {
            await page.waitForTimeout(2_000);
            const state = await readDebugState(page);
            expect(state).not.toBeNull();
            expect(state?.localCarX).not.toBeNull();
            expect(state?.localCarZ).not.toBeNull();
        }
        await page.keyboard.up('w');

        expect(pageErrors).toEqual([]);
    });
});
