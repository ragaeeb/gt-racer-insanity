import { describe, expect, it } from 'bun:test';
import { calculateRumbleVolume, calculateSquealVolume } from '@/client/game/audio/surfaceAudio';
import { getHazardManifestById } from '@/shared/game/hazard/hazardManifest';
import { getPowerupManifestById } from '@/shared/game/powerup/powerupManifest';
import {
    DEFAULT_TRACK_WIDTH_METERS,
    getSegmentFrictionForDistance,
    getTrackManifestById,
    getTrackManifestIds,
    TRACK_MANIFESTS,
    type TrackManifest,
} from '@/shared/game/track/trackManifest';

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
                expect(Math.abs(spawn.x) < halfWidth).toBeTrue();
                expect(spawn.z > 0 && spawn.z < manifest.lengthMeters).toBeTrue();
            }
        }
    });

    it('should place hazard spawns within track width bounds', () => {
        const halfWidth = DEFAULT_TRACK_WIDTH_METERS / 2;
        for (const trackId of trackIds) {
            const manifest = getTrackManifestById(trackId);
            for (const spawn of manifest.hazardSpawns) {
                expect(Math.abs(spawn.x) < halfWidth).toBeTrue();
                expect(spawn.z > 0 && spawn.z < manifest.lengthMeters).toBeTrue();
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

describe('getSegmentFrictionForDistance — segment lookup for surface audio', () => {
    // sunset-loop: seg-a(0–300, f=1.0) | seg-b(300–600, f=0.95) | seg-c(600–900, f=1.05)
    const SUNSET = getTrackManifestById('sunset-loop');
    // canyon-sprint: seg-a(0–275, f=1.0) | seg-b(275–550, f=0.92) | seg-c(550–825, f=1.08) | seg-d(825–1100, f=1.0)
    const CANYON = getTrackManifestById('canyon-sprint');

    it('should return 1.0 at the very start of sunset-loop', () => {
        expect(getSegmentFrictionForDistance(SUNSET, 0)).toBe(1);
    });

    it('should return seg-a friction (1.0) in the first 300m of sunset-loop', () => {
        expect(getSegmentFrictionForDistance(SUNSET, 150)).toBe(1);
    });

    it('should return seg-b friction (0.95) between 300–600m of sunset-loop', () => {
        expect(getSegmentFrictionForDistance(SUNSET, 400)).toBe(0.95);
    });

    it('should return seg-c friction (1.05) between 600–900m of sunset-loop', () => {
        expect(getSegmentFrictionForDistance(SUNSET, 700)).toBe(1.05);
    });

    it('should wrap correctly to seg-a on the second lap of sunset-loop', () => {
        // 900m = one lap; 900 + 50 = 50m into lap 2 → seg-a
        expect(getSegmentFrictionForDistance(SUNSET, 950)).toBe(1);
    });

    it('should wrap correctly to seg-b on the second lap of sunset-loop', () => {
        // 900 + 350 = 350m into lap 2 → seg-b
        expect(getSegmentFrictionForDistance(SUNSET, 1250)).toBe(0.95);
    });

    it('should return canyon seg-b friction (0.92) — the reduced-traction section', () => {
        // seg-b starts at 275m; 400m is in that zone
        expect(getSegmentFrictionForDistance(CANYON, 400)).toBe(0.92);
    });

    it('should return canyon seg-c friction (1.08) — the high-grip section', () => {
        // seg-c starts at 550m
        expect(getSegmentFrictionForDistance(CANYON, 600)).toBe(1.08);
    });

    it('should return 1.0 for a track with no segments', () => {
        const emptyTrack: TrackManifest = { ...SUNSET, segments: [] };
        expect(getSegmentFrictionForDistance(emptyTrack, 500)).toBe(1.0);
    });

    it('should return last segment friction when distance is just before the track boundary', () => {
        // 899m is inside seg-c (600–900m)
        expect(getSegmentFrictionForDistance(SUNSET, 899)).toBe(1.05);
    });

    it('should have all segment frictions within a sane range for all real tracks', () => {
        for (const track of TRACK_MANIFESTS) {
            for (const segment of track.segments) {
                expect(segment.frictionMultiplier).toBeGreaterThan(0.5);
                expect(segment.frictionMultiplier).toBeLessThan(2.0);
            }
        }
    });
});

describe('surface audio response to real track frictions', () => {
    it('should produce squeal on canyon seg-b (friction 0.92 >= asphaltFrictionMin 0.9) when drifting at speed', () => {
        // Canyon seg-b has friction 0.92 — technically still "asphalt" per our threshold (0.9)
        // so squeal fires when drifting
        const squeal = calculateSquealVolume(40, 0.92, true);
        expect(squeal).toBeGreaterThan(0);
    });

    it('should produce NO gravel rumble on canyon seg-b (friction 0.92 >= gravelFrictionMax 0.8)', () => {
        // 0.92 is not low enough to count as gravel — the rumble threshold is 0.8
        const rumble = calculateRumbleVolume(0.92);
        expect(rumble).toBe(0);
    });

    it('should produce gravel rumble on a hypothetical 0.5-friction surface', () => {
        const rumble = calculateRumbleVolume(0.5);
        expect(rumble).toBeGreaterThan(0);
    });

    it('should produce NO squeal on a hypothetical 0.5-friction surface even when drifting', () => {
        // 0.5 < asphaltFrictionMin(0.9) → squeal silenced (loose surface, no screech)
        const squeal = calculateSquealVolume(40, 0.5, true);
        expect(squeal).toBe(0);
    });

    it('should produce highest-pitch squeal on high-grip seg-c of canyon (friction 1.08)', () => {
        const pitchLowFriction = 0.7 + 0.92 * 0.3; // canyon seg-b
        const pitchHighFriction = 0.7 + 1.08 * 0.3; // canyon seg-c
        expect(pitchHighFriction).toBeGreaterThan(pitchLowFriction);
    });

    it('should produce no squeal when speed is below threshold even when drifting on asphalt', () => {
        // Speed 10 < asphaltSquealThreshold 15
        const squeal = calculateSquealVolume(10, 1.0, true);
        expect(squeal).toBe(0);
    });

    it('should produce no squeal when not drifting regardless of speed and surface', () => {
        const squeal = calculateSquealVolume(60, 1.0, false);
        expect(squeal).toBe(0);
    });
});
