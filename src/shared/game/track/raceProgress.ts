import type { PlayerRaceProgress } from '@/shared/network/snapshot';
import type { TrackManifest } from '@/shared/game/track/trackManifest';

export type RaceProgressUpdate = {
    progress: PlayerRaceProgress;
    shouldFinish: boolean;
};

export const createInitialRaceProgress = (): PlayerRaceProgress => {
    return {
        checkpointIndex: -1,
        completedCheckpoints: [],
        distanceMeters: 0,
        finishedAtMs: null,
        lap: 0,
    };
};

const normalizeLapDistance = (distanceMeters: number, trackLengthMeters: number) => {
    const wrapped = distanceMeters % trackLengthMeters;
    return wrapped < 0 ? wrapped + trackLengthMeters : wrapped;
};

export const advanceRaceProgress = (
    progress: PlayerRaceProgress,
    previousDistanceMeters: number,
    nextDistanceMeters: number,
    trackManifest: TrackManifest,
    nowMs: number
): RaceProgressUpdate => {
    const nextProgress: PlayerRaceProgress = {
        ...progress,
        distanceMeters: nextDistanceMeters,
    };

    const totalCheckpoints = trackManifest.checkpoints.length;
    const lastCheckpointIndex = totalCheckpoints - 1;
    const previousLapDistance = normalizeLapDistance(previousDistanceMeters, trackManifest.lengthMeters);
    const nextLapDistance = normalizeLapDistance(nextDistanceMeters, trackManifest.lengthMeters);

    const expectedNextCheckpointIndex = nextProgress.checkpointIndex + 1;
    const expectedCheckpoint = trackManifest.checkpoints[expectedNextCheckpointIndex];

    if (expectedCheckpoint && nextLapDistance >= expectedCheckpoint.z) {
        nextProgress.checkpointIndex = expectedNextCheckpointIndex;
        nextProgress.completedCheckpoints = [
            ...nextProgress.completedCheckpoints,
            {
                checkpointIndex: expectedNextCheckpointIndex,
                completedAtMs: nowMs,
            },
        ];
    }

    const wrappedLap = nextLapDistance < previousLapDistance;
    if (wrappedLap && nextProgress.checkpointIndex >= lastCheckpointIndex) {
        nextProgress.lap += 1;
        nextProgress.checkpointIndex = -1;
        nextProgress.completedCheckpoints = [];
    }

    const shouldFinish = nextProgress.lap >= trackManifest.totalLaps;
    return {
        progress: nextProgress,
        shouldFinish,
    };
};
