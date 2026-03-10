import { describe, expect, it } from 'bun:test';
import { RoomStore } from '@/server/roomStore';
import { getTrackManifestIds } from '@/shared/game/track/trackManifest';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';

const createInputFrame = (roomId: string, seq: number, timestampMs: number, throttle = 1, steering = 0) => {
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

const advanceSimulation = (store: RoomStore, roomId: string, playerId: string, stepCount: number, startMs: number) => {
    for (let step = 0; step < stepCount; step += 1) {
        const nowMs = startMs + (step + 1) * 16;
        store.queueInputFrame(roomId, playerId, createInputFrame(roomId, step + 1, nowMs));
        store.stepSimulations(nowMs);
    }
};

const finishSinglePlayerRace = (store: RoomStore, roomId: string, playerId: string, startMs: number) => {
    const warmupMs = startMs + 50;
    store.queueInputFrame(roomId, playerId, createInputFrame(roomId, 1, warmupMs));
    store.stepSimulations(warmupMs);

    const nowMs = warmupMs + 50;
    expect(store.forceFinishRoomRaceForTesting(roomId, nowMs, playerId)).toBeTrue();

    const snapshot = store.buildRoomSnapshot(roomId, nowMs);
    if (!snapshot || snapshot.raceState.status !== 'finished') {
        throw new Error(`Race ${roomId} did not enter finished state.`);
    }

    return { nowMs, snapshot };
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

    it('should default new rooms to sunset-loop when no track is selected', () => {
        const store = new RoomStore(() => 101);

        store.joinRoom('ROOM1', 'player-1', 'Alice');
        const snapshot = store.buildRoomSnapshot('ROOM1', 1_000);

        expect(snapshot?.raceState.trackId).toEqual('sunset-loop');
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

    it('should honor selectedTrackId rotation from join options when creating a room', () => {
        const store = new RoomStore(() => 2, {
            defaultTrackId: 'sunset-loop',
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice', {
            selectedTrackId: 'rotation',
        });
        const snapshot = store.buildRoomSnapshot('ROOM1', 1_000);

        expect(snapshot?.raceState.trackId).toEqual(getTrackManifestIds()[2]);
    });

    it('should apply debug speed multiplier from join options', () => {
        const normalStore = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 20,
            totalLaps: 3,
        });
        const debugStore = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 20,
            totalLaps: 3,
        });

        normalStore.joinRoom('ROOM1', 'player-1', 'Alice');
        debugStore.joinRoom('ROOM1', 'player-1', 'Alice', {
            debugSpeedMultiplier: 9,
        });

        advanceSimulation(normalStore, 'ROOM1', 'player-1', 30, 1_000);
        advanceSimulation(debugStore, 'ROOM1', 'player-1', 30, 1_000);

        const normalSnapshot = normalStore.buildRoomSnapshot('ROOM1', 1_600);
        const debugSnapshot = debugStore.buildRoomSnapshot('ROOM1', 1_600);
        const normalPlayer = normalSnapshot?.players.find((player) => player.id === 'player-1');
        const debugPlayer = debugSnapshot?.players.find((player) => player.id === 'player-1');

        expect(debugPlayer?.z ?? 0).toBeGreaterThan((normalPlayer?.z ?? 0) * 2);
    });

    it('should return false when queueing input for an unknown room', () => {
        const store = new RoomStore(() => 5);

        const enqueued = store.queueInputFrame('ROOM1', 'player-1', createInputFrame('ROOM1', 1, 1_000));

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
        expect(afterRestartSnapshot?.raceState.winnerPlayerId).toBeNull();
        expect(afterRestartSnapshot?.raceState.endedAtMs).toBeNull();
        expect(afterRestartSnapshot?.raceState.startedAtMs).toBeNull();
        expect(afterRestartPlayer).toBeDefined();
        expect(afterRestartPlayer?.x ?? 0).toBeCloseTo(-6, 1);
        expect(afterRestartPlayer?.z ?? 0).toBeCloseTo(0, 1);
        expect(afterRestartPlayer?.speed ?? 1).toBeCloseTo(0, 3);
        expect(afterRestartPlayer?.lastProcessedInputSeq).toEqual(-1);
    });

    it('should return false from restartRoomRace for an unknown room', () => {
        const store = new RoomStore(() => 1);
        const result = store.restartRoomRace('NONEXISTENT', 1_000);
        expect(result).toEqual(false);
    });

    it('should return false from restartFinishedRoomRace when race is not finished', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 20,
            totalLaps: 1,
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice', {
            selectedTrackId: 'sunset-loop',
        });

        const restarted = store.restartFinishedRoomRace('ROOM1', 1_100);
        expect(restarted).toEqual(false);

        const snapshot = store.buildRoomSnapshot('ROOM1', 1_100);
        expect(snapshot?.raceState.trackId).toEqual('sunset-loop');
        expect(snapshot?.raceState.status).toEqual('running');
    });

    it('should force-finish a room race for e2e hooks', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 20,
            totalLaps: 1,
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice', {
            selectedTrackId: 'sunset-loop',
        });

        const forced = store.forceFinishRoomRaceForTesting('ROOM1', 2_000);
        expect(forced).toEqual(true);

        const snapshot = store.buildRoomSnapshot('ROOM1', 2_000);
        expect(snapshot?.raceState.status).toEqual('finished');
        expect(snapshot?.raceState.winnerPlayerId).toEqual('player-1');
        expect(snapshot?.raceState.trackId).toEqual('sunset-loop');
    });

    it('should advance the room to the next track after finishing a level', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 20,
            totalLaps: 1,
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice', {
            selectedColorId: 'blue',
            selectedTrackId: 'sunset-loop',
            selectedVehicleId: 'sport',
        });

        const advanced = store.advanceRoomToNextTrack('ROOM1', 6_000);
        expect(advanced).toEqual(true);

        const snapshot = store.buildRoomSnapshot('ROOM1', 6_000);
        const player = snapshot?.players.find((candidate) => candidate.id === 'player-1');

        expect(snapshot?.raceState.trackId).toEqual('canyon-sprint');
        expect(snapshot?.raceState.winnerPlayerId).toBeNull();
        expect(snapshot?.raceState.endedAtMs).toBeNull();
        expect(snapshot?.players).toHaveLength(1);
        expect(player?.vehicleId).toEqual('sport');
        expect(player?.colorId).toEqual('blue');
        expect(player?.x).toEqual(-6);
        expect(player?.z ?? 1).toBeCloseTo(0, 6);
    });

    it('should advance to the next track when restarting a finished race', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 20,
            totalLaps: 1,
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice', {
            debugSpeedMultiplier: 9,
            selectedTrackId: 'sunset-loop',
        });

        const finished = finishSinglePlayerRace(store, 'ROOM1', 'player-1', 1_000);
        expect(finished.snapshot.raceState.status).toEqual('finished');
        expect(finished.snapshot.raceState.trackId).toEqual('sunset-loop');

        const restarted = store.restartFinishedRoomRace('ROOM1', finished.nowMs + 50);
        expect(restarted).toEqual(true);

        const restartedSnapshot = store.buildRoomSnapshot('ROOM1', finished.nowMs + 50);

        expect(restartedSnapshot?.raceState.status).toEqual('running');
        expect(restartedSnapshot?.raceState.trackId).toEqual('canyon-sprint');
        expect(restartedSnapshot?.raceState.winnerPlayerId).toBeNull();
        expect(restartedSnapshot?.raceState.endedAtMs).toBeNull();
    });

    it('should replay the same track when restarting a finished race without advancing levels', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 20,
            totalLaps: 1,
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice', {
            debugSpeedMultiplier: 9,
            selectedTrackId: 'sunset-loop',
        });

        const finished = finishSinglePlayerRace(store, 'ROOM1', 'player-1', 1_000);
        expect(finished.snapshot.raceState.status).toEqual('finished');
        expect(finished.snapshot.raceState.trackId).toEqual('sunset-loop');

        const restarted = store.restartFinishedRoomRace('ROOM1', finished.nowMs + 50, false);
        expect(restarted).toEqual(true);

        const restartedSnapshot = store.buildRoomSnapshot('ROOM1', finished.nowMs + 50);

        expect(restartedSnapshot?.raceState.status).toEqual('running');
        expect(restartedSnapshot?.raceState.trackId).toEqual('sunset-loop');
        expect(restartedSnapshot?.raceState.winnerPlayerId).toBeNull();
        expect(restartedSnapshot?.raceState.endedAtMs).toBeNull();
    });

    it('should keep advancing tracks across repeated finished-race restarts', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 20,
            totalLaps: 1,
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice', {
            debugSpeedMultiplier: 9,
            selectedTrackId: 'sunset-loop',
        });

        const expectedTrackOrder = ['sunset-loop', 'canyon-sprint', 'neon-city', 'desert-oasis'];
        let baseMs = 1_000;

        for (let index = 0; index < expectedTrackOrder.length - 1; index += 1) {
            const finished = finishSinglePlayerRace(store, 'ROOM1', 'player-1', baseMs);
            expect(finished.snapshot.raceState.trackId).toEqual(expectedTrackOrder[index]);
            expect(finished.snapshot.raceState.status).toEqual('finished');

            const restartMs = finished.nowMs + 50;
            const restarted = store.restartFinishedRoomRace('ROOM1', restartMs);
            expect(restarted).toEqual(true);

            const restartedSnapshot = store.buildRoomSnapshot('ROOM1', restartMs);
            expect(restartedSnapshot?.raceState.status).toEqual('running');
            expect(restartedSnapshot?.raceState.trackId).toEqual(expectedTrackOrder[index + 1]);

            baseMs = restartMs + 50;
        }
    });

    it('should derive next track from authoritative race snapshot even if room track cache drifts', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 20,
            totalLaps: 1,
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice', {
            debugSpeedMultiplier: 9,
            selectedTrackId: 'sunset-loop',
        });

        const finished = finishSinglePlayerRace(store, 'ROOM1', 'player-1', 1_000);
        expect(finished.snapshot.raceState.trackId).toEqual('sunset-loop');
        expect(finished.snapshot.raceState.status).toEqual('finished');

        // Simulate stale cached room track id; progression should still follow snapshot.raceState.trackId.
        const room = store.getRoom('ROOM1');
        expect(room).not.toBeNull();
        if (room) {
            room.trackId = 'desert-oasis';
        }

        const restarted = store.restartFinishedRoomRace('ROOM1', finished.nowMs + 50);
        expect(restarted).toEqual(true);

        const restartedSnapshot = store.buildRoomSnapshot('ROOM1', finished.nowMs + 50);
        expect(restartedSnapshot?.raceState.trackId).toEqual('canyon-sprint');
    });

    it('should keep increasing hazard density as the room advances through multiple levels', () => {
        const store = new RoomStore(() => 1, {
            defaultTrackId: 'sunset-loop',
            simulationTickHz: 20,
            totalLaps: 1,
        });

        store.joinRoom('ROOM1', 'player-1', 'Alice', {
            selectedTrackId: 'sunset-loop',
        });

        const level1 = store.buildRoomSnapshot('ROOM1', 1_000);
        store.advanceRoomToNextTrack('ROOM1', 2_000);
        const level2 = store.buildRoomSnapshot('ROOM1', 2_000);
        store.advanceRoomToNextTrack('ROOM1', 3_000);
        const level3 = store.buildRoomSnapshot('ROOM1', 3_000);

        expect(level1?.raceState.trackId).toEqual('sunset-loop');
        expect(level2?.raceState.trackId).toEqual('canyon-sprint');
        expect(level3?.raceState.trackId).toEqual('neon-city');
        expect(level2?.hazards.length ?? 0).toBeGreaterThan(level1?.hazards.length ?? 0);
        expect(level3?.hazards.length ?? 0).toBeGreaterThan(level2?.hazards.length ?? 0);
    });

    it('should return false from queueAbilityActivation for an unknown room', () => {
        const store = new RoomStore(() => 1);
        const result = store.queueAbilityActivation('NONEXISTENT', 'player-1', {
            abilityId: 'turbo-boost',
            seq: 1,
            targetPlayerId: null,
        });
        expect(result).toEqual(false);
    });

    it('should return true from queueAbilityActivation for a known room', () => {
        const store = new RoomStore(() => 1);
        store.joinRoom('ROOM1', 'player-1', 'Alice');
        const result = store.queueAbilityActivation('ROOM1', 'player-1', {
            abilityId: 'turbo-boost',
            seq: 1,
            targetPlayerId: null,
        });
        expect(result).toEqual(true);
    });

    it('should return false from queueHazardTrigger for an unknown room', () => {
        const store = new RoomStore(() => 1);
        const result = store.queueHazardTrigger('NONEXISTENT', {
            hazardId: 'spike-strip',
            triggeredBy: 'player-1',
            id: 'hz-1',
        } as any);
        expect(result).toEqual(false);
    });

    it('should return true from queueHazardTrigger for a known room', () => {
        const store = new RoomStore(() => 1);
        store.joinRoom('ROOM1', 'player-1', 'Alice');
        const result = store.queueHazardTrigger('ROOM1', {
            hazardId: 'spike-strip',
            triggeredBy: 'player-1',
            id: 'hz-1',
        } as any);
        expect(result).toEqual(true);
    });

    it('should return false from queuePowerupTrigger for an unknown room', () => {
        const store = new RoomStore(() => 1);
        const result = store.queuePowerupTrigger('NONEXISTENT', {
            powerupId: 'speed-boost',
            playerId: 'player-1',
            powerupInstanceId: 'pu-1',
        } as any);
        expect(result).toEqual(false);
    });

    it('should return true from queuePowerupTrigger for a known room', () => {
        const store = new RoomStore(() => 1);
        store.joinRoom('ROOM1', 'player-1', 'Alice');
        const result = store.queuePowerupTrigger('ROOM1', {
            powerupId: 'speed-boost',
            playerId: 'player-1',
            powerupInstanceId: 'pu-1',
        } as any);
        expect(result).toEqual(true);
    });
});
