import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { joinRace, STARTUP_TIMEOUT_MS } from './e2e-helpers';

test.describe('render smoke', () => {
    test('should render non-white race scene after joining', async ({ browser }, testInfo) => {
        test.setTimeout(STARTUP_TIMEOUT_MS);

        const roomId = `RS${Date.now().toString().slice(-10)}`;
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });
        page.on('console', (message) => {
            if (message.type() === 'error' || message.type() === 'warning') {
                consoleErrors.push(`[${message.type()}] ${message.text()}`);
            }
        });

        try {
            await joinRace(page, roomId, 'Render Smoke');
            await page.waitForTimeout(3_000);

            const renderMetricsPeak = await page.evaluate(async () => {
                const renderWindow = window as Window & {
                    __GT_RENDER__?: {
                        getState?: () => {
                            drawCalls?: number;
                            frustumMeshCount?: number;
                            lightCount?: number;
                            sceneBackground?: string | null;
                        } | null;
                    };
                };

                const start = performance.now();
                const sampleDurationMs = 3_000;
                const sampleIntervalMs = 120;
                const peak = {
                    drawCalls: 0,
                    frustumMeshCount: 0,
                    lightCount: 0,
                    sceneBackground: null as string | null,
                };

                while (performance.now() - start < sampleDurationMs) {
                    const frame = renderWindow.__GT_RENDER__?.getState?.() ?? null;
                    if (frame) {
                        peak.drawCalls = Math.max(peak.drawCalls, frame.drawCalls ?? 0);
                        peak.frustumMeshCount = Math.max(peak.frustumMeshCount, frame.frustumMeshCount ?? 0);
                        peak.lightCount = Math.max(peak.lightCount, frame.lightCount ?? 0);
                        if (peak.sceneBackground === null && frame.sceneBackground) {
                            peak.sceneBackground = frame.sceneBackground;
                        }
                    }
                    await new Promise((resolve) => window.setTimeout(resolve, sampleIntervalMs));
                }

                return peak;
            });

            const renderState = await page.evaluate(() => {
                const renderWindow = window as Window & {
                    __GT_DEBUG__?: {
                        getState?: () => unknown;
                    };
                    __GT_RENDER__?: {
                        getLogs?: () => unknown;
                        getState?: () => unknown;
                    };
                };

                return {
                    gameplayState: renderWindow.__GT_DEBUG__?.getState?.() ?? null,
                    logs: renderWindow.__GT_RENDER__?.getLogs?.() ?? [],
                    state: renderWindow.__GT_RENDER__?.getState?.() ?? null,
                };
            });
            const domState = await page.evaluate(() => {
                const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
                if (!canvas) {
                    return null;
                }
                const style = window.getComputedStyle(canvas);
                const centerX = Math.floor(window.innerWidth / 2);
                const centerY = Math.floor(window.innerHeight / 2);
                const elementAtCenter = document.elementFromPoint(centerX, centerY);
                return {
                    canvasClientHeight: canvas.clientHeight,
                    canvasClientWidth: canvas.clientWidth,
                    canvasHeight: canvas.height,
                    canvasWidth: canvas.width,
                    centerElementTag: elementAtCenter?.tagName ?? null,
                    centerElementZIndex: elementAtCenter ? window.getComputedStyle(elementAtCenter).zIndex : null,
                    display: style.display,
                    filter: style.filter,
                    mixBlendMode: style.mixBlendMode,
                    opacity: style.opacity,
                    position: style.position,
                    visibility: style.visibility,
                    zIndex: style.zIndex,
                };
            });
            const screenshotPath = testInfo.outputPath('race-scene.png');
            const canvasScreenshotPath = testInfo.outputPath('race-canvas.png');
            const diagnosticsPath = testInfo.outputPath('render-diagnostics.json');

            await page.screenshot({ path: screenshotPath, fullPage: true });
            await page.locator('canvas').screenshot({ path: canvasScreenshotPath });
            await writeFile(
                diagnosticsPath,
                JSON.stringify(
                    {
                        consoleErrors,
                        domState,
                        pageErrors,
                        renderState,
                    },
                    null,
                    2,
                ),
                'utf8',
            );

            await testInfo.attach('race-scene', { contentType: 'image/png', path: screenshotPath });
            await testInfo.attach('race-canvas', { contentType: 'image/png', path: canvasScreenshotPath });
            await testInfo.attach('render-diagnostics', { contentType: 'application/json', path: diagnosticsPath });

            // Keep a latest copy for ad-hoc debugging when running locally.
            const localArtifactPath = join(process.cwd(), 'testing', 'artifacts', 'render-smoke-latest.png');
            await mkdir(dirname(localArtifactPath), { recursive: true });
            await page.screenshot({ path: localArtifactPath, fullPage: true });

            expect(domState?.canvasWidth ?? 0).toBeGreaterThan(0);
            expect(pageErrors).toEqual([]);

            const renderFrameState = renderState.state as
                | {
                      drawCalls?: number;
                      frustumMeshCount?: number;
                      lightCount?: number;
                      sceneBackground?: string | null;
                  }
                | null;

            // Regression guard: the race scene should be actively rendering geometry in-frame.
            expect(renderFrameState).not.toBeNull();
            expect(renderMetricsPeak.drawCalls).toBeGreaterThan(20);
            expect(renderMetricsPeak.frustumMeshCount).toBeGreaterThan(15);
            expect(renderMetricsPeak.lightCount).toBeGreaterThanOrEqual(2);
            expect(renderMetricsPeak.sceneBackground).not.toBeNull();
        } finally {
            await page.close();
        }
    });
});
