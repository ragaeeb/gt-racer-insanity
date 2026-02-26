import type { SimPlayerState } from '@/server/sim/types';
import { advanceRaceProgress } from '@/shared/game/track/raceProgress';
import type { getTrackManifestById } from '@/shared/game/track/trackManifest';
import type { RaceState } from '@/shared/network/snapshot';
import type { RaceEventPayload } from '@/shared/network/types';
import { PLAYER_COLLIDER_HALF_LENGTH_METERS } from '@/shared/physics/constants';

type TrackManifest = ReturnType<typeof getTrackManifestById>;

/** Minimal slice of race state that updateProgress reads and may mutate. */
export type MutableRaceState = {
    endedAtMs: number | null;
    status: RaceState['status'];
    totalLaps: number;
    winnerPlayerId: string | null;
};

/**
 * Advances a single player's lap/distance progress each simulation tick and
 * emits lap_completed, player_finished, and race_finished events as appropriate.
 * Mutates both `player.progress` and `raceState` in-place.
 */
export class RaceProgressTracker {
    /** Pre-computed slope correction factor for the entire track.
     *  For flat tracks this is 1.0. For tracks with elevation, the actual
     *  driven distance is longer than the flat Z-projection by this factor. */
    private readonly slopeCorrectionFactor: number;

    constructor(
        private readonly roomId: string,
        private readonly trackManifest: TrackManifest,
        private readonly totalTrackLengthMeters: number,
    ) {
        // Compute an overall slope correction: sum of each segment's slope
        // distance vs. its flat projection length.
        let slopeDist = 0;
        let flatDist = 0;
        for (const seg of trackManifest.segments) {
            const rise = (seg.elevationEndM ?? 0) - (seg.elevationStartM ?? 0);
            const run = seg.lengthMeters;
            slopeDist += Math.sqrt(run * run + rise * rise);
            flatDist += run;
        }
        this.slopeCorrectionFactor = flatDist > 0 ? slopeDist / flatDist : 1;
    }

    updateProgress(
        player: SimPlayerState,
        raceState: MutableRaceState,
        nowMs: number,
        emitEvent: (event: RaceEventPayload) => void,
    ): void {
        const previousProgress = player.progress;
        const previousLap = previousProgress.lap;
        const previousDistance = previousProgress.distanceMeters;

        // Apply slope correction: on elevated tracks the actual driven distance
        // is longer than the flat Z-projection.
        const clampedZ = Math.max(0, Math.min(this.totalTrackLengthMeters, player.motion.positionZ));
        const clampedDistance = clampedZ * this.slopeCorrectionFactor;
        const nextDistance = Math.max(previousDistance, clampedDistance);
        const progressUpdate = advanceRaceProgress(
            previousProgress,
            previousDistance,
            nextDistance,
            this.trackManifest,
            nowMs,
        );

        player.progress = progressUpdate.progress;

        // Finish-line override: when front bumper clears the final checkpoint on the
        // last lap, snap progress to the track end so the finish triggers cleanly.
        const hasWrappedAllLaps = player.progress.lap >= raceState.totalLaps;
        const isOnFinalLap = player.progress.lap >= raceState.totalLaps - 1;
        const reachedRaceEndByFrontBumper =
            player.motion.positionZ + PLAYER_COLLIDER_HALF_LENGTH_METERS >= this.totalTrackLengthMeters;
        const hasClearedFinalCheckpoint = player.progress.checkpointIndex >= this.trackManifest.checkpoints.length - 1;

        if (!hasWrappedAllLaps && isOnFinalLap && hasClearedFinalCheckpoint && reachedRaceEndByFrontBumper) {
            player.progress.distanceMeters = this.totalTrackLengthMeters;
            player.progress.lap = raceState.totalLaps;
        }

        if (player.progress.lap > previousLap) {
            emitEvent({
                kind: 'lap_completed',
                metadata: { lap: player.progress.lap },
                playerId: player.id,
                roomId: this.roomId,
                serverTimeMs: nowMs,
            });
        }

        const hasFinishedRace = player.progress.lap >= raceState.totalLaps;
        if (hasFinishedRace && player.progress.finishedAtMs === null) {
            player.progress.finishedAtMs = nowMs;
            emitEvent({
                kind: 'player_finished',
                metadata: { lap: player.progress.lap },
                playerId: player.id,
                roomId: this.roomId,
                serverTimeMs: nowMs,
            });

            if (!raceState.winnerPlayerId) {
                raceState.winnerPlayerId = player.id;
                raceState.status = 'finished';
                raceState.endedAtMs = nowMs;
                emitEvent({
                    kind: 'race_finished',
                    metadata: undefined,
                    playerId: player.id,
                    roomId: this.roomId,
                    serverTimeMs: nowMs,
                });
            }
        }
    }
}
