export type TrackCheckpointManifest = {
    id: string;
    x: number;
    z: number;
};

export type TrackSegmentManifest = {
    frictionMultiplier: number;
    id: string;
    lengthMeters: number;
};

export type TrackManifest = {
    checkpoints: TrackCheckpointManifest[];
    id: string;
    label: string;
    lengthMeters: number;
    segments: TrackSegmentManifest[];
    themeId: string;
    totalLaps: number;
};

export const TRACK_MANIFESTS: TrackManifest[] = [
    {
        checkpoints: [
            { id: 'cp-1', x: 0, z: 250 },
            { id: 'cp-2', x: 20, z: 520 },
            { id: 'cp-3', x: -10, z: 760 },
        ],
        id: 'sunset-loop',
        label: 'Sunset Loop',
        lengthMeters: 900,
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
        id: 'canyon-sprint',
        label: 'Canyon Sprint',
        lengthMeters: 1_100,
        segments: [
            { frictionMultiplier: 1, id: 'seg-a', lengthMeters: 275 },
            { frictionMultiplier: 0.92, id: 'seg-b', lengthMeters: 275 },
            { frictionMultiplier: 1.08, id: 'seg-c', lengthMeters: 275 },
            { frictionMultiplier: 1, id: 'seg-d', lengthMeters: 275 },
        ],
        themeId: 'sunny-day',
        totalLaps: 3,
    },
];

export const getTrackManifestById = (trackId: string): TrackManifest => {
    return TRACK_MANIFESTS.find((track) => track.id === trackId) ?? TRACK_MANIFESTS[0];
};
