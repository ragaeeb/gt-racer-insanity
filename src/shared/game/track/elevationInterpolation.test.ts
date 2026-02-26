import { describe, expect, it } from 'bun:test';
import {
    getBankAngleAtZ,
    getElevationAtZ,
    getSegmentSurfaceNormal,
    interpolateBankAngle,
    interpolateElevation,
} from './elevationHelpers';
import type { TrackSegmentManifest } from './trackManifest';

describe('interpolateElevation', () => {
    it('should interpolate elevation linearly within segment', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-ramp',
            lengthMeters: 100,
            elevationStartM: 0,
            elevationEndM: 10,
        };

        const elevation = interpolateElevation(segment, 50, 0);
        expect(elevation).toBeCloseTo(5, 1);
    });

    it('should return elevationStartM at segment start', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-ramp',
            lengthMeters: 100,
            elevationStartM: 5,
            elevationEndM: 15,
        };

        const elevation = interpolateElevation(segment, 0, 0);
        expect(elevation).toBe(5);
    });

    it('should return elevationEndM at segment end', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-ramp',
            lengthMeters: 100,
            elevationStartM: 5,
            elevationEndM: 15,
        };

        const elevation = interpolateElevation(segment, 100, 0);
        expect(elevation).toBe(15);
    });

    it('should handle flat segment (no elevation change)', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-flat',
            lengthMeters: 100,
            elevationStartM: 0,
            elevationEndM: 0,
        };

        const elevation = interpolateElevation(segment, 50, 0);
        expect(elevation).toBe(0);
    });

    it('should handle elevated flat segment (constant elevation)', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-high',
            lengthMeters: 100,
            elevationStartM: 8,
            elevationEndM: 8,
        };

        const elevation = interpolateElevation(segment, 50, 0);
        expect(elevation).toBe(8);
    });

    it('should default to 0 elevation if fields are undefined', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-plain',
            lengthMeters: 100,
        };

        const elevation = interpolateElevation(segment, 50, 0);
        expect(elevation).toBe(0);
    });

    it('should interpolate correctly with non-zero segment start position', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-ramp',
            lengthMeters: 200,
            elevationStartM: 0,
            elevationEndM: 8,
        };

        // Segment starts at Z=300, position at Z=400 (halfway through)
        const elevation = interpolateElevation(segment, 400, 300);
        expect(elevation).toBeCloseTo(4, 1);
    });

    it('should handle descending ramp', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-down',
            lengthMeters: 200,
            elevationStartM: 8,
            elevationEndM: 0,
        };

        const elevation = interpolateElevation(segment, 100, 0);
        expect(elevation).toBeCloseTo(4, 1);
    });

    it('should clamp interpolation parameter to [0, 1]', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-ramp',
            lengthMeters: 100,
            elevationStartM: 0,
            elevationEndM: 10,
        };

        // Z beyond segment end
        const elevBeyond = interpolateElevation(segment, 200, 0);
        expect(elevBeyond).toBe(10);

        // Z before segment start
        const elevBefore = interpolateElevation(segment, -50, 0);
        expect(elevBefore).toBe(0);
    });
});

describe('interpolateBankAngle', () => {
    it('should return bank angle for banked segment', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-banked',
            lengthMeters: 100,
            bankAngleDeg: 15,
        };

        const angle = interpolateBankAngle(segment);
        expect(angle).toBe(15);
    });

    it('should return 0 for segment without bankAngleDeg', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-flat',
            lengthMeters: 100,
        };

        const angle = interpolateBankAngle(segment);
        expect(angle).toBe(0);
    });

    it('should handle negative bank angle (left bank)', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-left-bank',
            lengthMeters: 100,
            bankAngleDeg: -10,
        };

        const angle = interpolateBankAngle(segment);
        expect(angle).toBe(-10);
    });
});

describe('getElevationAtZ', () => {
    const segments: TrackSegmentManifest[] = [
        { frictionMultiplier: 1, id: 'seg-flat', lengthMeters: 300 },
        { frictionMultiplier: 1, id: 'seg-ramp', lengthMeters: 200, elevationStartM: 0, elevationEndM: 8 },
        { frictionMultiplier: 1, id: 'seg-high', lengthMeters: 100, elevationStartM: 8, elevationEndM: 8 },
        { frictionMultiplier: 1, id: 'seg-down', lengthMeters: 200, elevationStartM: 8, elevationEndM: 0 },
        { frictionMultiplier: 1, id: 'seg-end', lengthMeters: 100 },
    ];

    it('should return 0 elevation for flat segments', () => {
        expect(getElevationAtZ(segments, 150)).toBe(0);
    });

    it('should interpolate elevation linearly within a ramp segment', () => {
        // seg-ramp starts at Z=300, ends at Z=500, elevates from 0 to 8
        // At Z=400 (halfway): elevation = 4
        expect(getElevationAtZ(segments, 400)).toBeCloseTo(4, 1);
    });

    it('should return segment elevation at segment boundaries', () => {
        // Start of ramp (Z=300): elevation = 0
        expect(getElevationAtZ(segments, 300)).toBeCloseTo(0, 1);
        // End of ramp (Z=500): elevation = 8
        expect(getElevationAtZ(segments, 500)).toBeCloseTo(8, 1);
    });

    it('should return constant elevation on flat elevated segment', () => {
        // seg-high: Z=500 to Z=600, elevation = 8 throughout
        expect(getElevationAtZ(segments, 550)).toBe(8);
    });

    it('should interpolate descending ramp correctly', () => {
        // seg-down: Z=600 to Z=800, elevation from 8 to 0
        // At Z=700 (halfway): elevation = 4
        expect(getElevationAtZ(segments, 700)).toBeCloseTo(4, 1);
    });

    it('should return 0 for position at Z=0', () => {
        expect(getElevationAtZ(segments, 0)).toBe(0);
    });

    it('should return 0 for position past end of all segments', () => {
        // Total length = 300 + 200 + 100 + 200 + 100 = 900
        expect(getElevationAtZ(segments, 950)).toBe(0);
    });

    it('should return 0 for empty segments array', () => {
        expect(getElevationAtZ([], 100)).toBe(0);
    });
});

describe('getBankAngleAtZ', () => {
    const segments: TrackSegmentManifest[] = [
        { frictionMultiplier: 1, id: 'seg-flat', lengthMeters: 300 },
        { frictionMultiplier: 1, id: 'seg-banked', lengthMeters: 200, bankAngleDeg: 15 },
        { frictionMultiplier: 1, id: 'seg-end', lengthMeters: 300 },
    ];

    it('should return 0 bank angle for flat segments', () => {
        expect(getBankAngleAtZ(segments, 150)).toBe(0);
    });

    it('should return correct bank angle in radians within banked segment', () => {
        // seg-banked starts at Z=300, bank angle = 15 degrees → radians
        const bankRad = getBankAngleAtZ(segments, 400);
        expect(bankRad).toBeCloseTo((15 * Math.PI) / 180, 5);
    });

    it('should return 0 for empty segments array', () => {
        expect(getBankAngleAtZ([], 100)).toBe(0);
    });
});

describe('getSegmentSurfaceNormal', () => {
    it('should return straight up normal for flat segment', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-flat',
            lengthMeters: 100,
        };

        const normal = getSegmentSurfaceNormal(segment);
        expect(normal.x).toBeCloseTo(0, 5);
        expect(normal.y).toBeCloseTo(1, 5);
        expect(normal.z).toBeCloseTo(0, 5);
    });

    it('should tilt normal for segment with elevation change', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-ramp',
            lengthMeters: 100,
            elevationStartM: 0,
            elevationEndM: 10,
        };

        const normal = getSegmentSurfaceNormal(segment);
        // Ramp tilts forward, so normal should have negative Z component
        expect(normal.z).toBeLessThan(0);
        // Y should still be dominant
        expect(normal.y).toBeGreaterThan(0.9);
        // Normal should be unit length
        const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
        expect(len).toBeCloseTo(1, 5);
    });

    it('should tilt normal for banked segment', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-banked',
            lengthMeters: 100,
            bankAngleDeg: 15,
        };

        const normal = getSegmentSurfaceNormal(segment);
        // Banking tilts in X direction
        expect(normal.x).toBeGreaterThan(0);
        // Normal should be unit length
        const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
        expect(len).toBeCloseTo(1, 5);
    });

    it('should produce unit-length normal for combined slope and bank', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-combo',
            lengthMeters: 200,
            elevationStartM: 0,
            elevationEndM: 8,
            bankAngleDeg: 10,
        };

        const normal = getSegmentSurfaceNormal(segment);
        const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
        expect(len).toBeCloseTo(1, 5);
    });
});
