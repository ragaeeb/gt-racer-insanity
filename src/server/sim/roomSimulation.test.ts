import { describe, expect, it } from 'bun:test';
import { RoomSimulation } from '@/server/sim/roomSimulation';
import { getVehicleClassManifestById } from '@/shared/game/vehicle/vehicleClassManifest';
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
        cruiseControlEnabled: false,
        precisionOverrideActive: false,
        protocolVersion: PROTOCOL_V2,
        roomId,
        seq,
        timestampMs,
    };
};

describe('RoomSimulation', () => {
    it('should move player state from queued input frames', () => {
        const simulation = new RoomSimulation({
            roomId: 'ROOM1',
            seed: 1,
            tickHz: 60,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');
        simulation.queueInputFrame('player-1', createInputFrame('ROOM1', 1, 1_000, 1, 0));

        simulation.step(1_016);
        const snapshot = simulation.buildSnapshot(1_016);
        const player = snapshot.players[0];

        expect(player.z).toBeGreaterThan(0);
        expect(player.lastProcessedInputSeq).toEqual(1);
    });

    it('should rank players by race progress in snapshots', () => {
        const simulation = new RoomSimulation({
            roomId: 'ROOM1',
            seed: 1,
            tickHz: 60,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');
        simulation.joinPlayer('player-2', 'Bob', 'sport', 'blue');

        simulation.queueInputFrame('player-1', createInputFrame('ROOM1', 1, 1_000, 1, 0));
        simulation.queueInputFrame('player-2', createInputFrame('ROOM1', 1, 1_000, 0.2, 0));

        simulation.step(1_016);
        const snapshot = simulation.buildSnapshot(1_016);

        expect(snapshot.raceState.playerOrder[0]).toEqual('player-1');
    });

    it('should emit collision bump events while preserving car separation', () => {
        const simulation = new RoomSimulation({
            roomId: 'ROOM1',
            seed: 1,
            tickHz: 60,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');
        simulation.joinPlayer('player-2', 'Bob', 'sport', 'blue');

        let finalMs = 1_000;
        let hasCollisionBump = false;
        for (let step = 0; step < 240; step += 1) {
            finalMs = 1_000 + (step + 1) * 16;
            const seq = step + 1;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, finalMs, 1, 1));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, finalMs, 1, -1));
            simulation.step(finalMs);
            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'collision_bump')) {
                hasCollisionBump = true;
                break;
            }
        }

        const snapshot = simulation.buildSnapshot(finalMs);
        const firstPlayer = snapshot.players.find((player) => player.id === 'player-1');
        const secondPlayer = snapshot.players.find((player) => player.id === 'player-2');
        const distance = Math.hypot(
            (firstPlayer?.x ?? 0) - (secondPlayer?.x ?? 0),
            (firstPlayer?.z ?? 0) - (secondPlayer?.z ?? 0)
        );

        expect(hasCollisionBump).toEqual(true);
        expect(distance).toBeGreaterThan(0.25);
    });

    it('should deterministically finish and rank identical races', () => {
        const runRace = () => {
            const simulation = new RoomSimulation({
                roomId: 'ROOM1',
                seed: 77,
                tickHz: 60,
                totalLaps: 1,
                trackId: 'sunset-loop',
            });

            simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');
            simulation.joinPlayer('player-2', 'Bob', 'sport', 'blue');

            let nowMs = 1_000;
            for (let step = 1; step <= 7_000; step += 1) {
                nowMs = 1_000 + step * 16;
                simulation.queueInputFrame('player-1', createInputFrame('ROOM1', step, nowMs, 1, 0));
                simulation.queueInputFrame('player-2', createInputFrame('ROOM1', step, nowMs, 0.65, 0));
                simulation.step(nowMs);

                const raceEvents = simulation.drainRaceEvents();
                if (raceEvents.some((event) => event.kind === 'race_finished')) {
                    break;
                }
            }

            return simulation.buildSnapshot(nowMs);
        };

        const firstRun = runRace();
        const secondRun = runRace();

        expect(firstRun.raceState.status).toEqual('finished');
        expect(secondRun.raceState.status).toEqual('finished');
        expect(firstRun.raceState.winnerPlayerId).toEqual('player-1');
        expect(secondRun.raceState.winnerPlayerId).toEqual('player-1');
        expect(firstRun.raceState.playerOrder).toEqual(secondRun.raceState.playerOrder);
    });

    it('should reach sport-class max forward speed instead of capping near 35 km/h', () => {
        const simulation = new RoomSimulation({
            roomId: 'ROOM1',
            seed: 1,
            tickHz: 20,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });
        const sportClass = getVehicleClassManifestById('sport');

        simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');

        for (let step = 1; step <= 220; step += 1) {
            const nowMs = 1_000 + step * 50;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', step, nowMs, 1, 0));
            simulation.step(nowMs);
        }

        const snapshot = simulation.buildSnapshot(12_100);
        const player = snapshot.players.find((entry) => entry.id === 'player-1');

        expect(player).toBeDefined();
        expect(player?.speed ?? 0).toBeGreaterThan(10);
        expect(player?.speed ?? 0).toBeGreaterThanOrEqual(sportClass.physics.maxForwardSpeed - 0.5);
        expect(player?.speed ?? 0).toBeLessThanOrEqual(sportClass.physics.maxForwardSpeed + 0.5);
    });

    it('should reset player state to spawn when restarting the race', () => {
        const simulation = new RoomSimulation({
            roomId: 'ROOM1',
            seed: 1,
            tickHz: 20,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');
        for (let step = 1; step <= 80; step += 1) {
            const nowMs = 1_000 + step * 50;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', step, nowMs, 1, 0));
            simulation.step(nowMs);
        }

        const movedSnapshot = simulation.buildSnapshot(6_000);
        const movedPlayer = movedSnapshot.players.find((player) => player.id === 'player-1');
        expect(movedPlayer).toBeDefined();
        expect(movedPlayer?.z ?? 0).toBeGreaterThan(5);
        expect(movedPlayer?.lastProcessedInputSeq ?? -1).toBeGreaterThan(0);

        simulation.restartRace(7_000);
        const restartedSnapshot = simulation.buildSnapshot(7_000);
        const restartedPlayer = restartedSnapshot.players.find((player) => player.id === 'player-1');

        expect(restartedSnapshot.raceState.status).toEqual('running');
        expect(restartedSnapshot.raceState.winnerPlayerId).toEqual(null);
        expect(restartedSnapshot.raceState.endedAtMs).toEqual(null);
        expect(restartedSnapshot.raceState.startedAtMs).toEqual(7_000);
        expect(restartedPlayer).toBeDefined();
        expect(restartedPlayer?.x ?? 0).toBeCloseTo(-6, 1);
        expect(restartedPlayer?.z ?? 0).toBeCloseTo(0, 1);
        expect(restartedPlayer?.speed ?? 1).toBeCloseTo(0, 3);
        expect(restartedPlayer?.lastProcessedInputSeq).toEqual(-1);
        expect(restartedPlayer?.progress.distanceMeters ?? 1).toEqual(0);
    });
});
