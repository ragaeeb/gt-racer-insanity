import { expect, test, type APIRequestContext } from '@playwright/test';
import {
    driveForwardAndAssertMovement,
    joinRace,
    STARTUP_TIMEOUT_MS,
    waitForCarSpawn,
    waitForTrackLabel,
} from './e2e-helpers';

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
