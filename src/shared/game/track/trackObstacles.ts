import { DEFAULT_TRACK_WIDTH_METERS, getTrackManifestById } from '@/shared/game/track/trackManifest';
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

            const numObstacles = Math.floor(random() * 4) + 2;
            for (let i = 0; i < numObstacles; i += 1) {
                const obsSize = random() * 3 + 2;
                const halfSize = obsSize / 2;
                const posX = (random() - 0.5) * (trackWidthMeters - obsSize * 2);
                const posZ = zCursor + segmentLength / 2 + (random() - 0.5) * segmentLength;

                obstacles.push({ halfSize, positionX: posX, positionZ: posZ });
            }

            zCursor += segmentLength;
        }
    }

    return {
        obstacles,
        totalTrackLengthMeters: trackManifest.lengthMeters * safeTotalLaps,
        trackWidthMeters,
    };
};
