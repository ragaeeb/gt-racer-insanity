import { expect, test } from '@playwright/test';
import {
    driveForwardAndAssertMovement,
    forceFinishRaceViaDebug,
    joinRace,
    readDebugState,
    waitForCarSpawn,
    waitForTrackLabel,
} from './e2e-helpers';

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
