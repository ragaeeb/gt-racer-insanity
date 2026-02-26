import type { HazardManifest } from '@/shared/game/hazard/hazardManifest';

export type TrackId = 'sunset-loop' | 'canyon-sprint';

export type TrackThemeId = 'sunny-day' | 'canyon-dusk';

export type TrackCheckpointManifest = {
    id: string;
    x: number;
    z: number;
};

export type TrackSegmentManifest = {
    bankAngleDeg?: number;
    elevationEndM?: number;
    elevationStartM?: number;
    frictionMultiplier: number;
    id: string;
    lengthMeters: number;
};

export type TrackPowerupSpawn = {
    id: string;
    powerupId: string;
    x: number;
    z: number;
};

export type HazardId = HazardManifest['id'];

export type TrackHazardSpawn = {
    hazardId: HazardId;
    id: string;
    x: number;
    z: number;
};

export type TrackManifest = {
    checkpoints: TrackCheckpointManifest[];
    hazardSpawns: TrackHazardSpawn[];
    id: TrackId;
    label: string;
    lengthMeters: number;
    powerupSpawns: TrackPowerupSpawn[];
    segments: TrackSegmentManifest[];
    themeId: TrackThemeId;
    totalLaps: number;
};

export const TRACK_MANIFESTS: TrackManifest[] = [
    {
        checkpoints: [
            { id: 'cp-1', x: 0, z: 250 },
            { id: 'cp-2', x: 20, z: 520 },
            { id: 'cp-3', x: -10, z: 760 },
        ],
        hazardSpawns: [
            { hazardId: 'spike-strip', id: 'hz-1', x: -12, z: 280 },
            { hazardId: 'puddle-trap', id: 'hz-2', x: 8, z: 550 },
            { hazardId: 'spike-strip', id: 'hz-3', x: -5, z: 800 },
        ],
        id: 'sunset-loop',
        label: 'Sunset Loop',
        lengthMeters: 900,
        powerupSpawns: [
            { id: 'pu-1', powerupId: 'powerup-speed', x: -10, z: 150 },
            { id: 'pu-2', powerupId: 'powerup-speed', x: 15, z: 420 },
            { id: 'pu-3', powerupId: 'powerup-speed', x: -5, z: 680 },
        ],
        segments: [
            { frictionMultiplier: 1, id: 'seg-a', lengthMeters: 300 },
            { frictionMultiplier: 0.95, id: 'seg-b', lengthMeters: 300 },
            { frictionMultiplier: 1.05, id: 'seg-c', lengthMeters: 300 },
        ],
        themeId: 'sunny-day',
        totalLaps: 3,
    },
    {
        checkpoints: [
            { id: 'cp-1', x: -15, z: 220 },
            { id: 'cp-2', x: 18, z: 480 },
            { id: 'cp-3', x: 0, z: 740 },
            { id: 'cp-4', x: -12, z: 980 },
        ],
        hazardSpawns: [
            { hazardId: 'spike-strip', id: 'hz-1', x: 10, z: 260 },
            { hazardId: 'puddle-trap', id: 'hz-2', x: -8, z: 520 },
            { hazardId: 'spike-strip', id: 'hz-3', x: 5, z: 850 },
        ],
        id: 'canyon-sprint',
        label: 'Canyon Sprint',
        lengthMeters: 1_100,
        powerupSpawns: [
            { id: 'pu-1', powerupId: 'powerup-speed', x: 12, z: 200 },
            { id: 'pu-2', powerupId: 'powerup-speed', x: -10, z: 500 },
            { id: 'pu-3', powerupId: 'powerup-speed', x: 8, z: 780 },
        ],
        // NOTE: Elevation and banking data are commented out until the floor
        // collider system supports proper ramp geometry (trimesh / heightfield).
        // Rotated cuboids do not correctly model sloped surfaces — the car
        // falls through the floor on segments with non-zero elevation.
        segments: [
            { frictionMultiplier: 1, id: 'seg-a', lengthMeters: 275 },
            { frictionMultiplier: 0.92, id: 'seg-b', lengthMeters: 275 },
            { frictionMultiplier: 1.08, id: 'seg-c', lengthMeters: 275 },
            { frictionMultiplier: 1, id: 'seg-d', lengthMeters: 275 },
        ],
        themeId: 'canyon-dusk',
        totalLaps: 3,
    },
];

export const DEFAULT_TRACK_WIDTH_METERS = 76;

export const TRACK_DEFAULT_LABEL = TRACK_MANIFESTS[0]?.label ?? 'Track';

export const getTrackManifestById = (trackId: string): TrackManifest => {
    return TRACK_MANIFESTS.find((track) => track.id === trackId) ?? TRACK_MANIFESTS[0];
};

export const getTrackManifestIds = (): TrackId[] => {
    return TRACK_MANIFESTS.map((track) => track.id);
};

export const isTrackId = (trackId: string): trackId is TrackId => {
    return TRACK_MANIFESTS.some((track) => track.id === trackId);
};

/**
 * Returns the frictionMultiplier of the track segment the car is currently on,
 * based on how far it has travelled along the track.
 *
 * Distance is taken modulo the single-lap length so it wraps correctly across laps.
 * Falls back to 1.0 (standard asphalt) if the track has no segments.
 *
 * @param track - The active TrackManifest
 * @param distanceMeters - The car's total race distance from PlayerRaceProgress.distanceMeters
 * @returns frictionMultiplier in the range defined by the manifest (e.g. 0.92–1.08)
 */
export const getSegmentFrictionForDistance = (track: TrackManifest, distanceMeters: number): number => {
    if (track.segments.length === 0) {
        return 1.0;
    }

    // Wrap distance into a single lap
    const lapDistance = ((distanceMeters % track.lengthMeters) + track.lengthMeters) % track.lengthMeters;

    let accumulated = 0;
    for (const segment of track.segments) {
        accumulated += segment.lengthMeters;
        if (lapDistance < accumulated) {
            return segment.frictionMultiplier;
        }
    }

    // Past end of last segment (rounding) — use last segment's friction
    return track.segments[track.segments.length - 1]!.frictionMultiplier;
};
