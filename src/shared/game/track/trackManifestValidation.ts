import type { TrackManifest, TrackSegmentManifest } from '@/shared/game/track/trackManifest';

type TrackManifestValidationResult = {
    isValid: boolean;
    issues: string[];
};

const isFinitePositive = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
};

const isFiniteNumber = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value);
};

const validateSegmentElevation = (trackId: string, segment: TrackSegmentManifest, issues: string[]): void => {
    if (segment.elevationStartM !== undefined && !isFiniteNumber(segment.elevationStartM)) {
        issues.push(`Track ${trackId} segment ${segment.id} has invalid elevationStartM`);
    }
    if (segment.elevationEndM !== undefined && !isFiniteNumber(segment.elevationEndM)) {
        issues.push(`Track ${trackId} segment ${segment.id} has invalid elevationEndM`);
    }
    if (segment.bankAngleDeg !== undefined) {
        if (!isFiniteNumber(segment.bankAngleDeg)) {
            issues.push(`Track ${trackId} segment ${segment.id} has invalid bankAngleDeg`);
        } else if (Math.abs(segment.bankAngleDeg) > 45) {
            issues.push(`Track ${trackId} segment ${segment.id} bankAngleDeg exceeds ±45° limit`);
        }
    }
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

        for (const segment of manifest.segments) {
            validateSegmentElevation(manifest.id, segment, issues);
        }
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
};
