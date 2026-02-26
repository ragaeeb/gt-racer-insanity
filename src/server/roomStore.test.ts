import { describe, expect, it } from 'bun:test';
import { RoomStore } from '@/server/roomStore';
import { getTrackManifestIds } from '@/shared/game/track/trackManifest';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';

const createInputFrame = (
    roomId: string,
    seq: number,
    timestampMs: number,
    throttle = 1,
    steering = 0
) => {
    return {
        ackSnapshotSeq: null,
        controls: {
            boost: false,
            brake: false,
            handbrake: false,
            steering,
            throttle,
        },
        cruiseControlEnabled: true,
        precisionOverrideActive: false,
        protocolVersion: PROTOCOL_V2,
        roomId,
        seq,
        timestampMs,
    };
};

const advanceSimulation = (
    store: RoomStore,
    roomId: string,
    playerId: string,
    stepCount: number,
    startMs: number
) => {
    for (let step = 0; step < stepCount; step += 1) {
        const nowMs = startMs + (step + 1) * 16;
        store.queueInputFrame(roomId, playerId, createInputFrame(roomId, step + 1, nowMs));
        store.stepSimulations(nowMs);
    }
};

describe('RoomStore', () => {
    it('should create a room and join the first player', () => {
        const store = new RoomStore(() => 101);
        const result = store.joinRoom('ABCD', 'player-1', 'Alice');

        expect(result.created).toEqual(true);
        expect(result.room.seed).toEqual(101);
        expect(result.room.players.size).toEqual(1);
        expect(result.player.x).toEqual(-6);
        expect(result.player.z).toBeCloseTo(0, 6);
    });

    it('should keep the same room seed when other players join', () => {
        const store = new RoomStore(() => 777);

        const first = store.joinRoom('ROOM1', 'player-1', 'Alice');
        const second = store.joinRoom('ROOM1', 'player-2', 'Bob');

        expect(first.room.seed).toEqual(777);
        expect(second.room.seed).toEqual(777);
        expect(second.room.players.size).toEqual(2);
    });

    it('should sanitize blank player names to a default', () => {
        const store = new RoomStore(() => 1);

        const result = store.joinRoom('ROOM1', 'player-1', '   ');

        expect(result.player.name).toEqual('Player');
    });

    it('should rotate room tracks deterministically when default track mode is rotation', () => {
        const firstStore = new RoomStore(() => 1, {
            defaultTrackId: 'rotation',
        });
        const secondStore = new RoomStore(() => 2, {
            defaultTrackId: 'rotation',
        });

        firstStore.joinRoom('ROOM1', 'player-1', 'Alice');
        secondStore.joinRoom('ROOM2', 'player-1', 'Alice');

        const firstTrack = firstStore.buildRoomSnapshot('ROOM1', 1_000)?.raceState.trackId;
        const secondTrack = secondStore.buildRoomSnapshot('ROOM2', 1_000)?.raceState.trackId;
        const trackIds = getTrackManifestIds();

        expect(firstTrack).toEqual(trackIds[Math.abs(1) % trackIds.length]);
        expect(secondTrack).toEqual(trackIds[Math.abs(2) % trackIds.length]);
    });

    it('should honor explicitly configured default track ids', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'canyon-sprint',
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice');
        const snapshot = store.buildRoomSnapshot('ROOM1', 1_000);

        expect(snapshot?.raceState.trackId).toEqual('canyon-sprint');
    });

    it('should honor selectedTrackId from join options when creating a room', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'rotation',
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice', {
            selectedTrackId: 'neon-city',
        });
        const snapshot = store.buildRoomSnapshot('ROOM1', 1_000);

        expect(snapshot?.raceState.trackId).toEqual('neon-city');
    });

    it('should return false when queueing input for an unknown room', () => {
        const store = new RoomStore(() => 5);

        const enqueued = store.queueInputFrame(
            'ROOM1',
            'player-1',
            createInputFrame('ROOM1', 1, 1_000)
        );

        expect(enqueued).toEqual(false);
    });

    it('should provide late-join snapshots with authoritative positions', () => {
        const store = new RoomStore(() => 42, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 60,
            totalLaps: 3,
        });
        store.joinRoom('ROOM1', 'player-1', 'Alice');
        advanceSimulation(store, 'ROOM1', 'player-1', 40, 1_000);

        const preJoinSnapshot = store.buildRoomSnapshot('ROOM1', 1_700);
        const preJoinPlayer = preJoinSnapshot?.players.find((player) => player.id === 'player-1');

        expect(preJoinPlayer).not.toBeNull();
        expect(preJoinPlayer?.z ?? 0).toBeGreaterThan(2);

        const secondJoin = store.joinRoom('ROOM1', 'player-2', 'Bob');
        const postJoinSnapshot = store.buildRoomSnapshot('ROOM1', 1_701);
        const firstPlayerFromPostJoin = postJoinSnapshot?.players.find((player) => player.id === 'player-1');

        expect(secondJoin.created).toEqual(false);
        expect(postJoinSnapshot?.players).toHaveLength(2);
        expect(firstPlayerFromPostJoin?.z ?? 0).toBeGreaterThan(2);
    });

    it('should remove the room when the last player leaves', () => {
        const store = new RoomStore(() => 9);
        store.joinRoom('ROOM1', 'player-1', 'Alice');

        const result = store.removePlayerFromRoom('ROOM1', 'player-1');

        expect(result.removed).toEqual(true);
        expect(result.roomDeleted).toEqual(true);
        expect(store.getRoomCount()).toEqual(0);
    });

    it('should keep the room when at least one player remains', () => {
        const store = new RoomStore(() => 9);
        store.joinRoom('ROOM1', 'player-1', 'Alice');
        store.joinRoom('ROOM1', 'player-2', 'Bob');

        const result = store.removePlayerFromRoom('ROOM1', 'player-1');

        expect(result.removed).toEqual(true);
        expect(result.roomDeleted).toEqual(false);
        expect(store.getRoomCount()).toEqual(1);
        expect(store.getRoom('ROOM1')?.players.size).toEqual(1);
    });

    it('should emit simulation snapshots with processed v2 input frames', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 60,
            totalLaps: 3,
        });

        const joined = store.joinRoom('ROOM1', 'player-1', 'Alice', {
            selectedColorId: 'red',
            selectedVehicleId: 'sport',
        });

        expect(joined.room.simulation).not.toBeNull();

        const enqueued = store.queueInputFrame('ROOM1', 'player-1', {
            ackSnapshotSeq: null,
            controls: {
                boost: false,
                brake: false,
                handbrake: false,
                steering: 0,
                throttle: 1,
            },
            cruiseControlEnabled: false,
            precisionOverrideActive: false,
            protocolVersion: PROTOCOL_V2,
            roomId: 'ROOM1',
            seq: 1,
            timestampMs: 1_000,
        });

        expect(enqueued).toEqual(true);

        store.stepSimulations(1_016);
        const snapshots = store.buildSimulationSnapshots(1_016);
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]?.snapshot.players[0]?.lastProcessedInputSeq).toEqual(1);
        expect(snapshots[0]?.snapshot.players[0]?.z ?? 0).toBeGreaterThan(0);
    });

    it('should reset room race state and player position when restarting the room race', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 20,
            totalLaps: 3,
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice');
        advanceSimulation(store, 'ROOM1', 'player-1', 80, 1_000);
        const beforeRestartSnapshot = store.buildRoomSnapshot('ROOM1', 5_000);
        const beforeRestartPlayer = beforeRestartSnapshot?.players.find((player) => player.id === 'player-1');

        expect(beforeRestartPlayer).toBeDefined();
        expect(beforeRestartPlayer?.z ?? 0).toBeGreaterThan(5);

        const restarted = store.restartRoomRace('ROOM1', 6_000);
        expect(restarted).toEqual(true);

        const afterRestartSnapshot = store.buildRoomSnapshot('ROOM1', 6_000);
        const afterRestartPlayer = afterRestartSnapshot?.players.find((player) => player.id === 'player-1');
        expect(afterRestartSnapshot?.raceState.status).toEqual('running');
        expect(afterRestartSnapshot?.raceState.winnerPlayerId).toEqual(null);
        expect(afterRestartSnapshot?.raceState.endedAtMs).toEqual(null);
        expect(afterRestartSnapshot?.raceState.startedAtMs).toEqual(6_000);
        expect(afterRestartPlayer).toBeDefined();
        expect(afterRestartPlayer?.x ?? 0).toBeCloseTo(-6, 1);
        expect(afterRestartPlayer?.z ?? 0).toBeCloseTo(0, 1);
        expect(afterRestartPlayer?.speed ?? 1).toBeCloseTo(0, 3);
        expect(afterRestartPlayer?.lastProcessedInputSeq).toEqual(-1);
    });
});
