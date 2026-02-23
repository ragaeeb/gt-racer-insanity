import { describe, expect, it } from 'bun:test';
import {
    HARD_SNAP_THRESHOLD_METERS,
    MIN_CORRECTION_THRESHOLD,
    PER_FRAME_BASE_ALPHA,
    classifyCorrection,
    computeCameraLerpAlpha,
    computeCorrectionAlpha,
    lerpAngle,
} from './correctionSystem';

describe('correctionSystem', () => {
    describe('classifyCorrection', () => {
        it('should return none for errors below threshold', () => {
            expect(classifyCorrection(0)).toBe('none');
            expect(classifyCorrection(0.49)).toBe('none');
        });

        it('should return soft for errors at or above threshold but below hard snap', () => {
            expect(classifyCorrection(MIN_CORRECTION_THRESHOLD)).toBe('soft');
            expect(classifyCorrection(5)).toBe('soft');
            expect(classifyCorrection(HARD_SNAP_THRESHOLD_METERS - 0.01)).toBe('soft');
        });

        it('should return hard for errors at or above hard snap threshold', () => {
            expect(classifyCorrection(HARD_SNAP_THRESHOLD_METERS)).toBe('hard');
            expect(classifyCorrection(100)).toBe('hard');
        });
    });

    describe('computeCorrectionAlpha', () => {
        it('should return base alpha at zero error', () => {
            expect(computeCorrectionAlpha(0)).toBeCloseTo(PER_FRAME_BASE_ALPHA, 5);
        });

        it('should increase alpha as error grows', () => {
            const alphaLow = computeCorrectionAlpha(1);
            const alphaMid = computeCorrectionAlpha(5);
            const alphaHigh = computeCorrectionAlpha(10);
            expect(alphaMid).toBeGreaterThan(alphaLow);
            expect(alphaHigh).toBeGreaterThan(alphaMid);
        });

        it('should reach maximum alpha at hard snap threshold', () => {
            const maxAlpha = PER_FRAME_BASE_ALPHA * 5;
            expect(computeCorrectionAlpha(HARD_SNAP_THRESHOLD_METERS)).toBeCloseTo(maxAlpha, 5);
        });

        it('should clamp alpha for errors beyond the hard snap threshold', () => {
            const atThreshold = computeCorrectionAlpha(HARD_SNAP_THRESHOLD_METERS);
            const beyondThreshold = computeCorrectionAlpha(HARD_SNAP_THRESHOLD_METERS * 2);
            expect(beyondThreshold).toBeCloseTo(atThreshold, 5);
        });
    });

    describe('soft correction convergence', () => {
        it('should converge a 3m error to below threshold within 120 frames without hard snap', () => {
            let error = 3;
            for (let frame = 0; frame < 120; frame++) {
                expect(error).toBeLessThan(HARD_SNAP_THRESHOLD_METERS);
                const alpha = computeCorrectionAlpha(error);
                error *= (1 - alpha);
            }
            expect(error).toBeLessThan(MIN_CORRECTION_THRESHOLD);
        });

        it('should converge a 10m error to below threshold within 180 frames without hard snap', () => {
            let error = 10;
            for (let frame = 0; frame < 180; frame++) {
                expect(error).toBeLessThan(HARD_SNAP_THRESHOLD_METERS);
                const alpha = computeCorrectionAlpha(error);
                error *= (1 - alpha);
            }
            expect(error).toBeLessThan(MIN_CORRECTION_THRESHOLD);
        });

        it('should never let error grow when applying corrections', () => {
            let error = 5;
            for (let frame = 0; frame < 300; frame++) {
                const alpha = computeCorrectionAlpha(error);
                const newError = error * (1 - alpha);
                expect(newError).toBeLessThanOrEqual(error);
                error = newError;
            }
        });
    });

    describe('correction under continuous divergence', () => {
        it('should keep error bounded when server and client drift by 0.3m per snapshot at 20Hz', () => {
            const snapshotIntervalFrames = 3;
            const driftPerSnapshot = 0.3;
            let error = 0;
            let maxError = 0;

            for (let frame = 0; frame < 600; frame++) {
                if (frame % snapshotIntervalFrames === 0) {
                    error += driftPerSnapshot;
                }
                if (error >= MIN_CORRECTION_THRESHOLD) {
                    const alpha = computeCorrectionAlpha(error);
                    error *= (1 - alpha);
                }
                maxError = Math.max(maxError, error);
            }

            expect(maxError).toBeLessThan(HARD_SNAP_THRESHOLD_METERS);
            expect(maxError).toBeLessThan(8);
        });

        it('should keep error bounded during deceleration with 0.5m drift per snapshot', () => {
            const snapshotIntervalFrames = 3;
            const driftPerSnapshot = 0.5;
            let error = 0;
            let maxError = 0;

            for (let frame = 0; frame < 600; frame++) {
                if (frame % snapshotIntervalFrames === 0) {
                    error += driftPerSnapshot;
                }
                if (error >= MIN_CORRECTION_THRESHOLD) {
                    const alpha = computeCorrectionAlpha(error);
                    error *= (1 - alpha);
                }
                maxError = Math.max(maxError, error);
            }

            expect(maxError).toBeLessThan(HARD_SNAP_THRESHOLD_METERS);
            expect(maxError).toBeLessThan(10);
        });
    });

    describe('lerpAngle', () => {
        it('should interpolate between two angles', () => {
            const result = lerpAngle(0, Math.PI / 2, 0.5);
            expect(result).toBeCloseTo(Math.PI / 4, 5);
        });

        it('should handle wrapping around PI/-PI boundary', () => {
            const result = lerpAngle(Math.PI * 0.9, -Math.PI * 0.9, 0.5);
            expect(Math.abs(result)).toBeGreaterThan(Math.PI * 0.8);
        });

        it('should return from when alpha is zero', () => {
            expect(lerpAngle(1, 2, 0)).toBeCloseTo(1, 10);
        });

        it('should return to when alpha is one', () => {
            expect(lerpAngle(1, 2, 1)).toBeCloseTo(2, 5);
        });
    });

    describe('computeCameraLerpAlpha', () => {
        it('should return max alpha at zero speed', () => {
            expect(computeCameraLerpAlpha(0)).toBeCloseTo(0.1, 5);
        });

        it('should return min alpha at max speed', () => {
            expect(computeCameraLerpAlpha(40)).toBeCloseTo(0.045, 5);
        });

        it('should decrease monotonically as speed increases', () => {
            const alphas = [0, 10, 20, 30, 40].map((s) => computeCameraLerpAlpha(s));
            for (let i = 1; i < alphas.length; i++) {
                expect(alphas[i] <= alphas[i - 1]).toBe(true);
            }
        });

        it('should clamp at min alpha for speeds beyond max', () => {
            const atMax = computeCameraLerpAlpha(40);
            const beyondMax = computeCameraLerpAlpha(100);
            expect(beyondMax).toBeCloseTo(atMax, 5);
        });

        it('should produce a smooth transition (no large jumps between 1mps steps)', () => {
            for (let speed = 0; speed < 40; speed++) {
                const curr = computeCameraLerpAlpha(speed);
                const next = computeCameraLerpAlpha(speed + 1);
                expect(Math.abs(next - curr)).toBeLessThan(0.005);
            }
        });
    });
});
