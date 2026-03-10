import { describe, expect, it } from 'bun:test';
import { buildHazards } from '@/server/sim/simStateBuilder';
import { getTrackManifestById, getTrackManifestIds } from '@/shared/game/track/trackManifest';

describe('buildHazards', () => {
    it('should increase opening-section hazard count on every later track', () => {
        const trackIds = getTrackManifestIds();
        const openingHazardCounts = trackIds.map((trackId) => {
            const manifest = getTrackManifestById(trackId);
            return buildHazards(1, manifest).filter((hazard) => hazard.position.z <= manifest.lengthMeters / 3).length;
        });

        expect(openingHazardCounts[1]).toBeGreaterThan(openingHazardCounts[0]);
        expect(openingHazardCounts[2]).toBeGreaterThan(openingHazardCounts[1]);
        expect(openingHazardCounts[3]).toBeGreaterThan(openingHazardCounts[2]);
    });

    it('should increase hazard count on every later track for the same lap count', () => {
        const trackIds = getTrackManifestIds();
        const hazardCounts = trackIds.map((trackId) => buildHazards(1, getTrackManifestById(trackId)).length);

        expect(hazardCounts[1]).toBeGreaterThan(hazardCounts[0]);
        expect(hazardCounts[2]).toBeGreaterThan(hazardCounts[1]);
        expect(hazardCounts[3]).toBeGreaterThan(hazardCounts[2]);
    });

    it('should preserve the base hazard count on the first track', () => {
        const hazards = buildHazards(1, getTrackManifestById('sunset-loop'));

        expect(hazards).toHaveLength(3);
        expect(hazards.every((hazard) => !hazard.id.startsWith('progressive-hz-'))).toBeTrue();
    });
});
