import { describe, expect, it } from 'bun:test';
import type { ServerSnapshotPayload, SnapshotPlayerState } from '@/shared/network/types';
import { buildSpikeShotFxPayload } from '@/client/game/hooks/useNetworkConnection';

const createSnapshotPlayer = (id: string, x: number, z: number): SnapshotPlayerState => ({
    activeEffects: [],
    colorId: 'red',
    id,
    lastProcessedInputSeq: 0,
    name: id,
    progress: {
        checkpointIndex: 0,
        completedCheckpoints: [],
        distanceMeters: 0,
        finishedAtMs: null,
        lap: 0,
    },
    rotationY: 0,
    speed: 0,
    vehicleId: 'sport',
    x,
    y: 0,
    z,
});

const createSnapshot = (players: SnapshotPlayerState[]): ServerSnapshotPayload => ({
    hazards: [],
    players,
    powerups: [],
    raceState: {
        endedAtMs: null,
        playerOrder: [],
        startedAtMs: 0,
        status: 'running',
        totalLaps: 3,
        trackId: 'sunset-loop',
        winnerPlayerId: null,
    },
    roomId: 'ROOM',
    seq: 1,
    serverTimeMs: 1000,
});

describe('buildSpikeShotFxPayload', () => {
    it('should return null when snapshot is unavailable', () => {
        const payload = buildSpikeShotFxPayload(null, 'source', 'target', 1234);
        expect(payload).toBeNull();
    });

    it('should return null when source or target ids are unavailable', () => {
        const snapshot = createSnapshot([createSnapshotPlayer('source', 1, 2), createSnapshotPlayer('target', 3, 4)]);
        expect(buildSpikeShotFxPayload(snapshot, null, 'target', 1234)).toBeNull();
        expect(buildSpikeShotFxPayload(snapshot, 'source', null, 1234)).toBeNull();
    });

    it('should return null when source or target players are missing from snapshot', () => {
        const snapshot = createSnapshot([createSnapshotPlayer('source', 1, 2)]);
        const payload = buildSpikeShotFxPayload(snapshot, 'source', 'target', 1234);
        expect(payload).toBeNull();
    });

    it('should build a pending spike-shot payload when both players exist', () => {
        const snapshot = createSnapshot([createSnapshotPlayer('source', 4.5, 8.75), createSnapshotPlayer('target', -2, 16)]);
        const payload = buildSpikeShotFxPayload(snapshot, 'source', 'target', 4321);

        expect(payload).toEqual({
            sourceX: 4.5,
            sourceZ: 8.75,
            targetX: -2,
            targetZ: 16,
            triggeredAtMs: 4321,
        });
    });
});
