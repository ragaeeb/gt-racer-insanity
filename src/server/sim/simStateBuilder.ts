import type { getTrackManifestById } from '@/shared/game/track/trackManifest';
import type { ActiveHazard, ActivePowerup, SimRoomState } from './types';

type TrackManifest = ReturnType<typeof getTrackManifestById>;

type RoomOptions = {
    roomId: string;
    seed: number;
    tickHz: number;
    totalLaps: number;
    trackId: string;
};

export const buildActivePowerups = (totalLaps: number, trackManifest: TrackManifest): ActivePowerup[] => {
    const powerups: ActivePowerup[] = [];
    const lapLength = trackManifest.lengthMeters;
    for (let lap = 0; lap < totalLaps; lap++) {
        const zOffset = lap * lapLength;
        for (const spawn of trackManifest.powerupSpawns) {
            powerups.push({
                collectedAtMs: null,
                id: `${spawn.id}-lap${lap}`,
                position: { x: spawn.x, z: spawn.z + zOffset },
                powerupId: spawn.powerupId,
                respawnAtMs: null,
            });
        }
    }
    return powerups;
};

export const buildHazards = (totalLaps: number, trackManifest: TrackManifest): ActiveHazard[] => {
    const hazards: ActiveHazard[] = [];
    const lapLength = trackManifest.lengthMeters;
    for (let lap = 0; lap < totalLaps; lap++) {
        const zOffset = lap * lapLength;
        for (const spawn of trackManifest.hazardSpawns) {
            hazards.push({
                hazardId: spawn.hazardId,
                id: `${spawn.id}-lap${lap}`,
                position: { x: spawn.x, z: spawn.z + zOffset },
            });
        }
    }
    return hazards;
};

export const buildInitialRaceState = (options: RoomOptions): SimRoomState['raceState'] => ({
    endedAtMs: null,
    playerOrder: [],
    startedAtMs: Date.now(),
    status: 'running',
    totalLaps: options.totalLaps,
    trackId: options.trackId,
    winnerPlayerId: null,
});
