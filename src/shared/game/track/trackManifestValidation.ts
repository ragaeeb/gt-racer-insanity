import type { TrackManifest } from '@/shared/game/track/trackManifest';

type TrackManifestValidationResult = {
    isValid: boolean;
    issues: string[];
};

const isFinitePositive = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
};

export const validateTrackManifests = (manifests: TrackManifest[]): TrackManifestValidationResult => {
    const ids = new Set<string>();
    const issues: string[] = [];

    for (const manifest of manifests) {
        if (ids.has(manifest.id)) {
            issues.push(`Duplicate track id: ${manifest.id}`);
        }
        ids.add(manifest.id);

        if (!isFinitePositive(manifest.lengthMeters)) {
            issues.push(`Track ${manifest.id} has invalid length`);
        }

        if (!isFinitePositive(manifest.totalLaps)) {
            issues.push(`Track ${manifest.id} has invalid lap count`);
        }

        if (manifest.checkpoints.length < 2) {
            issues.push(`Track ${manifest.id} requires at least 2 checkpoints`);
        }

        const segmentLength = manifest.segments.reduce((sum, segment) => sum + segment.lengthMeters, 0);
        if (Math.abs(segmentLength - manifest.lengthMeters) > 0.001) {
            issues.push(`Track ${manifest.id} segment lengths must sum to track length`);
        }
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
};
