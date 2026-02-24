import type { SimPlayerState } from '@/server/sim/types';
import { advanceRaceProgress } from '@/shared/game/track/raceProgress';
import type { getTrackManifestById } from '@/shared/game/track/trackManifest';
import type { RaceEventPayload } from '@/shared/network/types';

type TrackManifest = ReturnType<typeof getTrackManifestById>;

/** Minimal slice of race state that updateProgress reads and may mutate. */
export type MutableRaceState = {
    endedAtMs: number | null;
    status: 'running' | 'finished';
    totalLaps: number;
    winnerPlayerId: string | null;
};

const PLAYER_PROGRESS_FORWARD_OFFSET_METERS = 2.2;

/**
 * Advances a single player's lap/distance progress each simulation tick and
 * emits lap_completed, player_finished, and race_finished events as appropriate.
 * Mutates both `player.progress` and `raceState` in-place.
 */
export class RaceProgressTracker {
    constructor(
        private readonly roomId: string,
        private readonly trackManifest: TrackManifest,
        private readonly totalTrackLengthMeters: number,
    ) {}

    updateProgress(
        player: SimPlayerState,
        raceState: MutableRaceState,
        nowMs: number,
        emitEvent: (event: RaceEventPayload) => void,
    ): void {
        const previousProgress = player.progress;
        const previousLap = previousProgress.lap;
        const previousDistance = previousProgress.distanceMeters;

        const clampedDistance = Math.max(0, Math.min(this.totalTrackLengthMeters, player.motion.positionZ));
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
            player.motion.positionZ + PLAYER_PROGRESS_FORWARD_OFFSET_METERS >= this.totalTrackLengthMeters;
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
