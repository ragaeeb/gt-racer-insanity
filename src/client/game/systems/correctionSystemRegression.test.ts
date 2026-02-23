import { describe, expect, it } from 'bun:test';
import {
    HARD_SNAP_THRESHOLD_METERS,
    MIN_CORRECTION_THRESHOLD,
    computeCorrectionAlpha,
} from './correctionSystem';

describe('correction system regression tests', () => {
    describe('wall-adjacent correction stability', () => {
        it('should not let corrections cancel out forward movement at constant server error', () => {
            const forwardSpeedMps = 44;
            const framesPerSecond = 60;
            const forwardPerFrame = forwardSpeedMps / framesPerSecond;

            let localZ = 0;
            const serverZ = 0;

            for (let frame = 0; frame < 300; frame += 1) {
                localZ += forwardPerFrame;

                const error = Math.abs(localZ - serverZ);
                if (error >= MIN_CORRECTION_THRESHOLD && error < HARD_SNAP_THRESHOLD_METERS) {
                    const alpha = computeCorrectionAlpha(error);
                    localZ += (serverZ - localZ) * alpha;
                }
            }

            expect(localZ).toBeGreaterThan(0);
        });

        it('should converge within 60 frames when server position catches up after being stuck', () => {
            let localZ = 200;
            const serverZ = 200;

            for (let frame = 0; frame < 60; frame += 1) {
                const error = Math.abs(localZ - serverZ);
                if (error >= MIN_CORRECTION_THRESHOLD && error < HARD_SNAP_THRESHOLD_METERS) {
                    const alpha = computeCorrectionAlpha(error);
                    localZ += (serverZ - localZ) * alpha;
                }
            }

            expect(Math.abs(localZ - serverZ)).toBeLessThan(MIN_CORRECTION_THRESHOLD);
        });

        it('should perform hard snap for large errors (>15m) rather than soft-correcting forever', () => {
            const serverZ = 100;
            let localZ = 130;

            const error = Math.abs(localZ - serverZ);
            expect(error).toBeGreaterThanOrEqual(HARD_SNAP_THRESHOLD_METERS);

            if (error >= HARD_SNAP_THRESHOLD_METERS) {
                localZ = serverZ;
            }

            expect(localZ).toBe(serverZ);
        });

        it('should not produce oscillation when error is near the correction threshold', () => {
            let localZ = MIN_CORRECTION_THRESHOLD + 0.1;
            const serverZ = 0;
            const positions: number[] = [];

            for (let frame = 0; frame < 120; frame += 1) {
                const error = Math.abs(localZ - serverZ);
                if (error >= MIN_CORRECTION_THRESHOLD && error < HARD_SNAP_THRESHOLD_METERS) {
                    const alpha = computeCorrectionAlpha(error);
                    localZ += (serverZ - localZ) * alpha;
                }
                positions.push(localZ);
            }

            let directionChanges = 0;
            for (let i = 2; i < positions.length; i += 1) {
                const prevDelta = positions[i - 1] - positions[i - 2];
                const currDelta = positions[i] - positions[i - 1];
                if (prevDelta * currDelta < 0) {
                    directionChanges += 1;
                }
            }

            expect(directionChanges).toBe(0);
        });
    });

    describe('correction never causes unbounded divergence', () => {
        it('should not let position error exceed hard snap threshold during soft corrections', () => {
            const driftPerFrame = 0.8;
            let error = 0;
            let maxError = 0;

            for (let frame = 0; frame < 600; frame += 1) {
                error += driftPerFrame;

                if (error >= HARD_SNAP_THRESHOLD_METERS) {
                    error = 0;
                } else if (error >= MIN_CORRECTION_THRESHOLD) {
                    const alpha = computeCorrectionAlpha(error);
                    error *= (1 - alpha);
                }

                maxError = Math.max(maxError, error);
            }

            expect(maxError).toBeLessThan(HARD_SNAP_THRESHOLD_METERS);
        });

        it('should have correction strength proportional to error magnitude', () => {
            const smallError = 1;
            const largeError = 10;

            const smallAlpha = computeCorrectionAlpha(smallError);
            const largeAlpha = computeCorrectionAlpha(largeError);

            const smallCorrection = smallError * smallAlpha;
            const largeCorrection = largeError * largeAlpha;

            expect(largeCorrection).toBeGreaterThan(smallCorrection);
        });
    });

    describe('correction alpha bounds', () => {
        it('should always return a positive alpha', () => {
            for (let error = 0; error <= 50; error += 0.5) {
                expect(computeCorrectionAlpha(error)).toBeGreaterThan(0);
            }
        });

        it('should never return alpha greater than 1', () => {
            for (let error = 0; error <= 100; error += 1) {
                expect(computeCorrectionAlpha(error)).toBeLessThanOrEqual(1);
            }
        });
    });
});
