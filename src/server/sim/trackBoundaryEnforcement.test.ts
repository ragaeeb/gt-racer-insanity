import { describe, expect, it } from 'bun:test';
import { RoomSimulation } from '@/server/sim/roomSimulation';
import { DEFAULT_TRACK_WIDTH_METERS } from '@/shared/game/track/trackManifest';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import { PLAYER_COLLIDER_HALF_WIDTH_METERS } from '@/shared/physics/constants';

const TRACK_BOUNDARY_X = DEFAULT_TRACK_WIDTH_METERS * 0.5 - PLAYER_COLLIDER_HALF_WIDTH_METERS;

const createInputFrame = (
    roomId: string,
    seq: number,
    timestampMs: number,
    throttle = 1,
    steering = 0,
) => ({
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
});

const createSim = () =>
    new RoomSimulation({
        roomId: 'ROOM1',
        seed: 1,
        tickHz: 60,
        totalLaps: 3,
        trackId: 'sunset-loop',
    });

describe('server track boundary enforcement', () => {
    it('should keep car X within track boundary when driving straight into the right wall', () => {
        const simulation = createSim();
        simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');

        let nowMs = 1_000;
        for (let step = 1; step <= 600; step += 1) {
            nowMs = 1_000 + step * 16;
            simulation.queueInputFrame(
                'player-1',
                createInputFrame('ROOM1', step, nowMs, 1, -1),
            );
            simulation.step(nowMs);
        }

        const snapshot = simulation.buildSnapshot(nowMs);
        const player = snapshot.players.find((p) => p.id === 'player-1');

        expect(player).toBeDefined();
        expect(Math.abs(player!.x)).toBeLessThanOrEqual(TRACK_BOUNDARY_X + 0.01);
    });

    it('should keep car X within track boundary when driving straight into the left wall', () => {
        const simulation = createSim();
        simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');

        let nowMs = 1_000;
        for (let step = 1; step <= 600; step += 1) {
            nowMs = 1_000 + step * 16;
            simulation.queueInputFrame(
                'player-1',
                createInputFrame('ROOM1', step, nowMs, 1, 1),
            );
            simulation.step(nowMs);
        }

        const snapshot = simulation.buildSnapshot(nowMs);
        const player = snapshot.players.find((p) => p.id === 'player-1');

        expect(player).toBeDefined();
        expect(Math.abs(player!.x)).toBeLessThanOrEqual(TRACK_BOUNDARY_X + 0.01);
    });

    it('should keep car within boundary across all steps, not just the final one', () => {
        const simulation = createSim();
        simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');

        let maxAbsX = 0;
        let nowMs = 1_000;
        for (let step = 1; step <= 600; step += 1) {
            nowMs = 1_000 + step * 16;
            simulation.queueInputFrame(
                'player-1',
                createInputFrame('ROOM1', step, nowMs, 1, -1),
            );
            simulation.step(nowMs);

            if (step % 10 === 0) {
                const snapshot = simulation.buildSnapshot(nowMs);
                const player = snapshot.players.find((p) => p.id === 'player-1');
                if (player) {
                    maxAbsX = Math.max(maxAbsX, Math.abs(player.x));
                }
            }
        }

        expect(maxAbsX).toBeLessThanOrEqual(TRACK_BOUNDARY_X + 0.01);
    });

    it('should allow car to recover and move forward after hitting the wall', () => {
        const simulation = createSim();
        simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');

        let nowMs = 1_000;
        let seq = 0;

        for (let step = 0; step < 300; step += 1) {
            seq += 1;
            nowMs = 1_000 + seq * 16;
            simulation.queueInputFrame(
                'player-1',
                createInputFrame('ROOM1', seq, nowMs, 1, -1),
            );
            simulation.step(nowMs);
        }

        const atWallSnapshot = simulation.buildSnapshot(nowMs);
        const atWall = atWallSnapshot.players.find((p) => p.id === 'player-1');
        const zAtWall = atWall?.z ?? 0;

        for (let step = 0; step < 600; step += 1) {
            seq += 1;
            nowMs = 1_000 + seq * 16;
            simulation.queueInputFrame(
                'player-1',
                createInputFrame('ROOM1', seq, nowMs, 1, 0),
            );
            simulation.step(nowMs);
        }

        const afterRecovery = simulation.buildSnapshot(nowMs);
        const recovered = afterRecovery.players.find((p) => p.id === 'player-1');

        expect(recovered).toBeDefined();
        expect(recovered!.z).toBeGreaterThan(zAtWall + 5);
        expect(recovered!.speed).toBeGreaterThan(5);
    });

    it('should keep boosted car within track boundary at high speed wall collision', () => {
        const simulation = createSim();
        simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');

        let nowMs = 1_000;
        let seq = 0;

        for (let step = 0; step < 120; step += 1) {
            seq += 1;
            nowMs = 1_000 + seq * 16;
            simulation.queueInputFrame(
                'player-1',
                createInputFrame('ROOM1', seq, nowMs, 1, 0),
            );
            simulation.step(nowMs);
        }

        simulation.queueAbilityActivation('player-1', {
            abilityId: 'turbo-boost',
            seq: seq + 1,
            targetPlayerId: null,
        });

        for (let step = 0; step < 300; step += 1) {
            seq += 1;
            nowMs = 1_000 + seq * 16;
            simulation.queueInputFrame(
                'player-1',
                createInputFrame('ROOM1', seq, nowMs, 1, -1),
            );
            simulation.step(nowMs);
        }

        const snapshot = simulation.buildSnapshot(nowMs);
        const player = snapshot.players.find((p) => p.id === 'player-1');

        expect(player).toBeDefined();
        expect(Math.abs(player!.x)).toBeLessThanOrEqual(TRACK_BOUNDARY_X + 0.01);
    });
});
