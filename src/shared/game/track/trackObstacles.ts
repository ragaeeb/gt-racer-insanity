import {
    DEFAULT_TRACK_WIDTH_METERS,
    getTrackManifestById,
    getTrackSequenceIndex,
} from '@/shared/game/track/trackManifest';
import { seededRandom } from '@/shared/utils/prng';

export type ObstacleDescriptor = {
    halfSize: number;
    positionX: number;
    positionZ: number;
};

export type TrackObstacleLayout = {
    obstacles: ObstacleDescriptor[];
    trackWidthMeters: number;
    totalTrackLengthMeters: number;
};

const BASE_OBSTACLES_PER_SEGMENT = 2;
const OBSTACLE_DIFFICULTY_STEP_PER_LEVEL = 3;
const OBSTACLE_RANDOM_VARIATION_PER_SEGMENT = 2;
const OPENING_CLUSTER_OBSTACLE_STEP_PER_LEVEL = 5;
const OPENING_CLUSTER_SIZE_STEP_PER_LEVEL = 0.35;

const getTrackObstaclesPerSegmentBase = (trackId: string) => {
    return BASE_OBSTACLES_PER_SEGMENT + getTrackSequenceIndex(trackId) * OBSTACLE_DIFFICULTY_STEP_PER_LEVEL;
};

const buildOpeningObstacleCluster = (
    trackId: string,
    random: () => number,
    lapLength: number,
    lapIndex: number,
    trackWidthMeters: number,
    firstSegmentLength: number,
) => {
    const trackSequenceIndex = getTrackSequenceIndex(trackId);
    const openingClusterCount = trackSequenceIndex * OPENING_CLUSTER_OBSTACLE_STEP_PER_LEVEL;
    if (openingClusterCount === 0) {
        return [];
    }

    const lapOffset = lapIndex * lapLength;
    const safeStartZ = Math.min(Math.max(firstSegmentLength + 24, 140), lapLength * 0.26);
    const openingEndZ = Math.max(safeStartZ + 60, lapLength / 3);
    const zSpacing = (openingEndZ - safeStartZ) / (openingClusterCount + 1);

    return Array.from({ length: openingClusterCount }, (_, index) => {
        const obsSize = random() * 2 + 2 + trackSequenceIndex * OPENING_CLUSTER_SIZE_STEP_PER_LEVEL;
        const halfSize = obsSize / 2;
        const laneCount = 4;
        const laneIndex = index % laneCount;
        const laneRatio = laneIndex / (laneCount - 1);
        const horizontalPadding = obsSize * 1.6;
        const usableWidth = Math.max(4, trackWidthMeters - horizontalPadding * 2);
        const positionX = -usableWidth / 2 + usableWidth * laneRatio + (random() - 0.5) * 1.2;

        return {
            halfSize,
            positionX,
            positionZ: lapOffset + safeStartZ + zSpacing * (index + 1),
        } satisfies ObstacleDescriptor;
    });
};

export const generateTrackObstacles = (
    trackId: string,
    seed: number,
    totalLaps: number,
    trackWidthMeters = DEFAULT_TRACK_WIDTH_METERS,
): TrackObstacleLayout => {
    const safeTotalLaps = Math.max(1, totalLaps);
    const random = seededRandom(seed);
    const trackManifest = getTrackManifestById(trackId);
    const obstacles: ObstacleDescriptor[] = [];
    const obstaclesPerSegmentBase = getTrackObstaclesPerSegmentBase(trackManifest.id);
    const firstSegmentLength = trackManifest.segments[0]?.lengthMeters ?? 0;

    let zCursor = 0;

    for (let lapIndex = 0; lapIndex < safeTotalLaps; lapIndex += 1) {
        for (let segmentIndex = 0; segmentIndex < trackManifest.segments.length; segmentIndex += 1) {
            const segment = trackManifest.segments[segmentIndex];
            const segmentLength = segment.lengthMeters;
            const isSafe = lapIndex === 0 && segmentIndex === 0;

            if (isSafe) {
                zCursor += segmentLength;
                continue;
            }

            const numObstacles =
                obstaclesPerSegmentBase + Math.floor(random() * OBSTACLE_RANDOM_VARIATION_PER_SEGMENT);
            for (let i = 0; i < numObstacles; i += 1) {
                const obsSize = random() * 3 + 2;
                const halfSize = obsSize / 2;
                const posX = (random() - 0.5) * (trackWidthMeters - obsSize * 2);
                const posZ = zCursor + segmentLength / 2 + (random() - 0.5) * segmentLength;

                obstacles.push({ halfSize, positionX: posX, positionZ: posZ });
            }

            zCursor += segmentLength;
        }

        obstacles.push(
            ...buildOpeningObstacleCluster(
                trackManifest.id,
                random,
                trackManifest.lengthMeters,
                lapIndex,
                trackWidthMeters,
                firstSegmentLength,
            ),
        );
    }

    obstacles.sort((a, b) => a.positionZ - b.positionZ);

    return {
        obstacles,
        totalTrackLengthMeters: trackManifest.lengthMeters * safeTotalLaps,
        trackWidthMeters,
    };
};
