import type { TrackSegmentManifest } from './trackManifest';

/**
 * Linearly interpolates the elevation within a single segment.
 *
 * @param segment - The track segment manifest
 * @param z - The Z-position to evaluate
 * @param segmentStartZ - The Z-position where this segment begins on the track
 * @returns Interpolated elevation (Y) in meters
 */
export const interpolateElevation = (segment: TrackSegmentManifest, z: number, segmentStartZ: number): number => {
    const elevStart = segment.elevationStartM ?? 0;
    const elevEnd = segment.elevationEndM ?? 0;

    if (elevStart === elevEnd) {
        return elevStart;
    }

    // Parametric t clamped to [0, 1]
    const t = Math.max(0, Math.min(1, (z - segmentStartZ) / segment.lengthMeters));
    return elevStart + (elevEnd - elevStart) * t;
};

/**
 * Returns the bank angle for a segment. Currently constant across the segment
 * (no per-position interpolation). Returns degrees.
 *
 * @param segment - The track segment manifest
 * @returns Bank angle in degrees (positive = right bank)
 */
export const interpolateBankAngle = (segment: TrackSegmentManifest): number => {
    return segment.bankAngleDeg ?? 0;
};

/**
 * Walks all segments and returns the elevation (Y) at the given global Z position.
 * Used by multiple systems (collider builder, rendering, race progress).
 *
 * @param segments - Ordered array of track segments
 * @param zPosition - Global Z-position on the track
 * @returns Elevation in meters at the given Z
 */
export const getElevationAtZ = (segments: TrackSegmentManifest[], zPosition: number): number => {
    let accumulated = 0;

    for (const segment of segments) {
        const segmentEnd = accumulated + segment.lengthMeters;

        if (zPosition <= segmentEnd) {
            return interpolateElevation(segment, zPosition, accumulated);
        }

        accumulated = segmentEnd;
    }

    // Past end of all segments — default to 0
    return 0;
};

/**
 * Walks all segments and returns the bank angle (in radians) at the given Z position.
 * Converts from degrees (stored in manifest) to radians for physics/rendering use.
 *
 * @param segments - Ordered array of track segments
 * @param zPosition - Global Z-position on the track
 * @returns Bank angle in radians at the given Z
 */
export const getBankAngleAtZ = (segments: TrackSegmentManifest[], zPosition: number): number => {
    let accumulated = 0;

    for (const segment of segments) {
        const segmentEnd = accumulated + segment.lengthMeters;

        if (zPosition <= segmentEnd) {
            const angleDeg = interpolateBankAngle(segment);
            return (angleDeg * Math.PI) / 180;
        }

        accumulated = segmentEnd;
    }

    return 0;
};

/**
 * Computes the surface normal vector for a track segment.
 * Accounts for both slope (elevation change) and banking.
 * Returns a unit-length normal vector.
 *
 * @param segment - The track segment manifest
 * @returns Normalized surface normal { x, y, z }
 */
export const getSegmentSurfaceNormal = (segment: TrackSegmentManifest): { x: number; y: number; z: number } => {
    const elevStart = segment.elevationStartM ?? 0;
    const elevEnd = segment.elevationEndM ?? 0;
    const slope = (elevEnd - elevStart) / segment.lengthMeters;
    const bankRad = ((segment.bankAngleDeg ?? 0) * Math.PI) / 180;

    // Surface normal: perpendicular to slope and bank
    const nx = Math.sin(bankRad);
    const ny = Math.cos(bankRad) * Math.cos(Math.atan(slope));
    const nz = -Math.sin(Math.atan(slope));

    // Normalize to unit length
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return { x: nx / len, y: ny / len, z: nz / len };
};
