import { describe, expect, it } from 'bun:test';
import { generateTrackObstacles } from './trackObstacles';
import { getTrackManifestById } from './trackManifest';

describe('generateTrackObstacles', () => {
    it('should clamp totalLaps = 0 to at least 1 lap', () => {
        const layout = generateTrackObstacles('sunset-loop', 42, 0);
        const manifest = getTrackManifestById('sunset-loop');

        expect(layout.totalTrackLengthMeters).toBe(manifest.lengthMeters);
        expect(layout.obstacles.length).toBeGreaterThan(0);
    });

    it('should clamp negative totalLaps to at least 1 lap', () => {
        const layout = generateTrackObstacles('sunset-loop', 42, -5);
        const manifest = getTrackManifestById('sunset-loop');

        expect(layout.totalTrackLengthMeters).toBe(manifest.lengthMeters);
        expect(layout.obstacles.length).toBeGreaterThan(0);
    });

    it('should produce deterministic obstacle layouts for the same seed', () => {
        const a = generateTrackObstacles('sunset-loop', 123, 2);
        const b = generateTrackObstacles('sunset-loop', 123, 2);

        expect(a.obstacles.length).toBe(b.obstacles.length);
        for (let i = 0; i < a.obstacles.length; i++) {
            expect(a.obstacles[i].positionX).toBe(b.obstacles[i].positionX);
            expect(a.obstacles[i].positionZ).toBe(b.obstacles[i].positionZ);
        }
    });

    it('should have all obstacles within the total track length', () => {
        const layout = generateTrackObstacles('sunset-loop', 99, 3);

        for (const obs of layout.obstacles) {
            expect(obs.positionZ).toBeGreaterThanOrEqual(0);
            expect(obs.positionZ).toBeLessThanOrEqual(layout.totalTrackLengthMeters);
        }
    });

    it('should scale total track length with totalLaps', () => {
        const manifest = getTrackManifestById('sunset-loop');
        const layout1 = generateTrackObstacles('sunset-loop', 42, 1);
        const layout3 = generateTrackObstacles('sunset-loop', 42, 3);

        expect(layout1.totalTrackLengthMeters).toBe(manifest.lengthMeters);
        expect(layout3.totalTrackLengthMeters).toBe(manifest.lengthMeters * 3);
    });
});
