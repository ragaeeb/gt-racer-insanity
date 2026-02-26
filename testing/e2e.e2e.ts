import { expect, test } from '@playwright/test';

import { expectHidden, gotoLobby, readDebugState, sanitizeRoomIdForUrl, STARTUP_TIMEOUT_MS } from './e2e-helpers';

test.describe('e2e smoke', () => {
    test('should load the game, move the local car, and avoid runtime errors', async ({ page }) => {
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

        const roomId = sanitizeRoomIdForUrl(`E2E${Date.now()}`);
        await gotoLobby(page, roomId);
        await page.bringToFront();
        await page.focus('body');

        await page.locator('#player-name-input').fill('E2E Driver');
        await page.locator('#player-name-confirm').click();
        await page.waitForURL(
            (url) => url.pathname === '/race' && sanitizeRoomIdForUrl(url.searchParams.get('room') ?? '') === roomId,
            { timeout: STARTUP_TIMEOUT_MS },
        );

        await page.locator('canvas').waitFor({ timeout: STARTUP_TIMEOUT_MS });
        await page.locator('#speed').waitFor({ timeout: STARTUP_TIMEOUT_MS });
        await page.waitForTimeout(1200);

        const waitForCarSpawn = async () => {
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

        const initialState = await waitForCarSpawn();
        const initialCarZ = initialState.localCarZ ?? 0;
        await expectHidden(page, '#game-over');
        await page.waitForTimeout(1200);
        await expectHidden(page, '#game-over');

        await page.keyboard.down('w');
        await page.waitForTimeout(2200);
        await page.keyboard.up('w');

        const speedLabelText = await page.locator('#speed').textContent();
        const speedValue = parseFloat((speedLabelText ?? '').replace(/[^0-9.]/g, ''));
        expect(speedValue).toBeGreaterThan(0);

        let updatedCarZ = initialCarZ;
        const movementDeadline = Date.now() + 8_000;

        while (Date.now() < movementDeadline) {
            const state = await readDebugState(page);
            updatedCarZ = state?.localCarZ ?? initialCarZ;
            if (updatedCarZ > initialCarZ) {
                break;
            }
            await page.waitForTimeout(250);
        }

        expect(updatedCarZ).toBeGreaterThan(initialCarZ);
        await expectHidden(page, '#game-over');
        expect(pageErrors).toHaveLength(0);
        expect(consoleErrors).toHaveLength(0);
    });
});
