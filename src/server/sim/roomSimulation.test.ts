import { describe, expect, it } from 'bun:test';
import { RoomSimulation } from '@/server/sim/roomSimulation';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';

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
        simulation.queueInputFrame('player-1', {
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

        simulation.queueInputFrame('player-1', {
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
        simulation.queueInputFrame('player-2', {
            ackSnapshotSeq: null,
            controls: {
                boost: false,
                brake: false,
                handbrake: false,
                steering: 0,
                throttle: 0.2,
            },
            cruiseControlEnabled: false,
            precisionOverrideActive: false,
            protocolVersion: PROTOCOL_V2,
            roomId: 'ROOM1',
            seq: 1,
            timestampMs: 1_000,
        });

        simulation.step(1_016);
        const snapshot = simulation.buildSnapshot(1_016);

        expect(snapshot.raceState.playerOrder[0]).toEqual('player-1');
    });
});
