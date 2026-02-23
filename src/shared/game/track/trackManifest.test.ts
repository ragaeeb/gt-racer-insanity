import { describe, expect, it } from 'bun:test';
import { getHazardManifestById } from '@/shared/game/hazard/hazardManifest';
import { getPowerupManifestById } from '@/shared/game/powerup/powerupManifest';
import { DEFAULT_TRACK_WIDTH_METERS, getTrackManifestIds, getTrackManifestById } from '@/shared/game/track/trackManifest';

describe('track manifest spawn validation', () => {
    const trackIds = getTrackManifestIds();

    it('should have powerup spawns for every track', () => {
        for (const trackId of trackIds) {
            const manifest = getTrackManifestById(trackId);
            expect(manifest.powerupSpawns.length).toBeGreaterThan(0);
        }
    });

    it('should have hazard spawns for every track', () => {
        for (const trackId of trackIds) {
            const manifest = getTrackManifestById(trackId);
            expect(manifest.hazardSpawns.length).toBeGreaterThan(0);
        }
    });

    it('should reference valid powerup manifest IDs', () => {
        for (const trackId of trackIds) {
            const manifest = getTrackManifestById(trackId);
            for (const spawn of manifest.powerupSpawns) {
                const powerupManifest = getPowerupManifestById(spawn.powerupId);
                expect(powerupManifest).not.toBeNull();
            }
        }
    });

    it('should reference valid hazard manifest IDs', () => {
        for (const trackId of trackIds) {
            const manifest = getTrackManifestById(trackId);
            for (const spawn of manifest.hazardSpawns) {
                const hazardManifest = getHazardManifestById(spawn.hazardId);
                expect(hazardManifest).not.toBeNull();
            }
        }
    });

    it('should place powerup spawns within track width bounds', () => {
        const halfWidth = DEFAULT_TRACK_WIDTH_METERS / 2;
        for (const trackId of trackIds) {
            const manifest = getTrackManifestById(trackId);
            for (const spawn of manifest.powerupSpawns) {
                expect(Math.abs(spawn.x) < halfWidth).toBe(true);
                expect(spawn.z > 0 && spawn.z < manifest.lengthMeters).toBe(true);
            }
        }
    });

    it('should place hazard spawns within track width bounds', () => {
        const halfWidth = DEFAULT_TRACK_WIDTH_METERS / 2;
        for (const trackId of trackIds) {
            const manifest = getTrackManifestById(trackId);
            for (const spawn of manifest.hazardSpawns) {
                expect(Math.abs(spawn.x) < halfWidth).toBe(true);
                expect(spawn.z > 0 && spawn.z < manifest.lengthMeters).toBe(true);
            }
        }
    });

    it('should have unique IDs across powerup spawns per track', () => {
        for (const trackId of trackIds) {
            const manifest = getTrackManifestById(trackId);
            const ids = manifest.powerupSpawns.map((s) => s.id);
            expect(new Set(ids).size).toBe(ids.length);
        }
    });

    it('should have unique IDs across hazard spawns per track', () => {
        for (const trackId of trackIds) {
            const manifest = getTrackManifestById(trackId);
            const ids = manifest.hazardSpawns.map((s) => s.id);
            expect(new Set(ids).size).toBe(ids.length);
        }
    });
});
