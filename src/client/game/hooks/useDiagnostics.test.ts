import { describe, expect, it } from 'bun:test';
import {
    buildDiagnosticSamplingKey,
    getDiagnosticSpeedMetrics,
    shouldResetDiagnosticSamplingBaseline,
} from './useDiagnostics';

describe('useDiagnostics helpers', () => {
    it('should compute local speed from local physics and server speed from snapshot values', () => {
        const metrics = getDiagnosticSpeedMetrics(20, 10);

        expect(metrics.localSpeedKph).toEqual(72);
        expect(metrics.localSpeedKphExact).toEqual(72);
        expect(metrics.snapshotSpeedKphExact).toEqual(36);
        expect(metrics.speedDeltaKph).toEqual(36);
    });

    it('should clamp negative speed inputs to zero', () => {
        const metrics = getDiagnosticSpeedMetrics(-5, -2);

        expect(metrics.localSpeedKph).toEqual(0);
        expect(metrics.localSpeedKphExact).toEqual(0);
        expect(metrics.snapshotSpeedKphExact).toEqual(0);
        expect(metrics.speedDeltaKph).toEqual(0);
    });

    it('should reset the sampling baseline when room, track, or race start changes', () => {
        const baseline = buildDiagnosticSamplingKey('ROOM1', 'sunset-loop', 1_000);

        expect(shouldResetDiagnosticSamplingBaseline(null, baseline)).toBeFalse();
        expect(
            shouldResetDiagnosticSamplingBaseline(
                baseline,
                buildDiagnosticSamplingKey('ROOM2', 'sunset-loop', 1_000),
            ),
        ).toBeTrue();
        expect(
            shouldResetDiagnosticSamplingBaseline(
                baseline,
                buildDiagnosticSamplingKey('ROOM1', 'canyon-sprint', 1_000),
            ),
        ).toBeTrue();
        expect(
            shouldResetDiagnosticSamplingBaseline(
                baseline,
                buildDiagnosticSamplingKey('ROOM1', 'sunset-loop', 2_000),
            ),
        ).toBeTrue();
        expect(
            shouldResetDiagnosticSamplingBaseline(
                baseline,
                buildDiagnosticSamplingKey('ROOM1', 'sunset-loop', 1_000),
            ),
        ).toBeFalse();
    });
});
