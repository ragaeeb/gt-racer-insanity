import { PUDDLE_TRAP_ID, SPIKE_STRIP_ID } from '@/shared/game/hazard/hazardManifest';
import {
    DEFAULT_TRACK_WIDTH_METERS,
    getTrackManifestById,
    getTrackSequenceIndex,
} from '@/shared/game/track/trackManifest';
import type { ActiveHazard, ActivePowerup, SimRoomState } from './types';

type TrackManifest = ReturnType<typeof getTrackManifestById>;

type RoomOptions = {
    roomId: string;
    seed: number;
    tickHz: number;
    totalLaps: number;
    trackId: string;
};

const EXTRA_HAZARDS_PER_LEVEL = 3;
const EXTRA_HAZARD_SAFE_START_BUFFER_METERS = 140;
const EXTRA_HAZARD_EDGE_MARGIN_METERS = 8;
const EXTRA_HAZARD_PATTERN = [PUDDLE_TRAP_ID, SPIKE_STRIP_ID] as const;

const buildProgressiveHazardsForLap = (trackManifest: TrackManifest, lap: number): ActiveHazard[] => {
    const trackSequenceIndex = getTrackSequenceIndex(trackManifest.id);
    const extraHazardsPerLap = trackSequenceIndex * EXTRA_HAZARDS_PER_LEVEL;
    if (extraHazardsPerLap === 0) {
        return [];
    }

    const lapLength = trackManifest.lengthMeters;
    const zOffset = lap * lapLength;
    const firstSegmentLength = trackManifest.segments[0]?.lengthMeters ?? 0;
    const safeStartZ = Math.min(Math.max(firstSegmentLength + 20, EXTRA_HAZARD_SAFE_START_BUFFER_METERS), lapLength * 0.24);
    const openingEndZ = Math.max(safeStartZ + 60, lapLength / 3);
    const usableZLength = Math.max(80, openingEndZ - safeStartZ);
    const zSpacing = usableZLength / (extraHazardsPerLap + 1);
    const maxTrackX = DEFAULT_TRACK_WIDTH_METERS * 0.5 - EXTRA_HAZARD_EDGE_MARGIN_METERS;

    return Array.from({ length: extraHazardsPerLap }, (_, index) => {
        const lateralSign = index % 2 === 0 ? -1 : 1;
        const laneBand = index % 3;
        const laneOffset = maxTrackX - laneBand * 10;
        return {
            hazardId: EXTRA_HAZARD_PATTERN[index % EXTRA_HAZARD_PATTERN.length],
            id: `progressive-hz-${trackManifest.id}-${lap}-${index}`,
            position: {
                x: lateralSign * laneOffset,
                z: zOffset + safeStartZ + zSpacing * (index + 1),
            },
        } satisfies ActiveHazard;
    });
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

        hazards.push(...buildProgressiveHazardsForLap(trackManifest, lap));
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
