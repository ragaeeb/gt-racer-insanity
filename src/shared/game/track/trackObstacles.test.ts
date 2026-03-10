import { describe, expect, it } from 'bun:test';
import { getTrackManifestById, getTrackManifestIds } from '@/shared/game/track/trackManifest';
import { generateTrackObstacles } from '@/shared/game/track/trackObstacles';

const getAverageObstaclesPerPlayableSegment = (trackId: string) => {
    const manifest = getTrackManifestById(trackId);
    const playableSegments = Math.max(1, manifest.segments.length - 1);
    const layout = generateTrackObstacles(trackId, 1337, 1);
    return layout.obstacles.length / playableSegments;
};

const getOpeningThirdObstacleCount = (trackId: string) => {
    const manifest = getTrackManifestById(trackId);
    return generateTrackObstacles(trackId, 1337, 1).obstacles.filter(
        (obstacle) => obstacle.positionZ <= manifest.lengthMeters / 3,
    ).length;
};

describe('generateTrackObstacles', () => {
    it('should deterministically generate the same obstacles for the same seed', () => {
        const first = generateTrackObstacles('canyon-sprint', 2026, 1);
        const second = generateTrackObstacles('canyon-sprint', 2026, 1);

        expect(second).toEqual(first);
    });

    it('should increase average obstacle density as tracks progress', () => {
        const trackIds = getTrackManifestIds();
        const averageDensities = trackIds.map((trackId) => getAverageObstaclesPerPlayableSegment(trackId));

        expect(averageDensities[1]).toBeGreaterThan(averageDensities[0]);
        expect(averageDensities[2]).toBeGreaterThan(averageDensities[1]);
        expect(averageDensities[3]).toBeGreaterThan(averageDensities[2]);
    });

    it('should increase total obstacle count on every later track for the same seed', () => {
        const trackIds = getTrackManifestIds();
        const totalCounts = trackIds.map((trackId) => generateTrackObstacles(trackId, 2026, 1).obstacles.length);

        expect(totalCounts[1]).toBeGreaterThan(totalCounts[0]);
        expect(totalCounts[2]).toBeGreaterThan(totalCounts[1]);
        expect(totalCounts[3]).toBeGreaterThan(totalCounts[2]);
    });

    it('should materially increase opening-section obstacle count on every later track', () => {
        const trackIds = getTrackManifestIds();
        const openingCounts = trackIds.map((trackId) => getOpeningThirdObstacleCount(trackId));

        expect(openingCounts[1]).toBeGreaterThanOrEqual(openingCounts[0] + 4);
        expect(openingCounts[2]).toBeGreaterThanOrEqual(openingCounts[1] + 4);
        expect(openingCounts[3]).toBeGreaterThanOrEqual(openingCounts[2] + 4);
    });
});
