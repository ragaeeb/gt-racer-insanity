import { describe, expect, it } from 'bun:test';
import { RoomSimulation } from '@/server/sim/roomSimulation';
import { generateTrackObstacles } from '@/shared/game/track/trackObstacles';
import { getVehicleClassManifestById } from '@/shared/game/vehicle/vehicleClassManifest';
import { DriftState } from '@/shared/game/vehicle/driftConfig';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';

type TestRigidBody = {
    setLinvel: (velocity: { x: number; y: number; z: number }, wakeUp: boolean) => void;
    setTranslation: (translation: { x: number; y: number; z: number }, wakeUp: boolean) => void;
};

const getPlayerRigidBodies = (simulation: RoomSimulation) => {
    const internals = simulation as unknown as {
        playerRigidBodyById: Map<string, TestRigidBody>;
    };
    return internals.playerRigidBodyById;
};

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

    it('should keep snapshot invariants stable after many simulation steps', () => {
        const simulation = new RoomSimulation({
            roomId: 'ROOM1',
            seed: 42,
            tickHz: 60,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('player-1', 'Alice', 'sport', 'red');
        simulation.joinPlayer('player-2', 'Bob', 'sport', 'blue');

        let nowMs = 1_000;
        for (let step = 1; step <= 1_200; step += 1) {
            nowMs = 1_000 + step * 16;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', step, nowMs, 1, 0.15));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', step, nowMs, 0.9, -0.1));
            simulation.step(nowMs);
            simulation.drainRaceEvents();
        }

        const snapshot = simulation.buildSnapshot(nowMs);
        expect(snapshot.players.length).toEqual(2);
        expect(snapshot.raceState.playerOrder.length).toEqual(snapshot.players.length);

        const playerIds = new Set(snapshot.players.map((player) => player.id));
        expect(playerIds.has('player-1')).toEqual(true);
        expect(playerIds.has('player-2')).toEqual(true);

        for (const player of snapshot.players) {
            expect(Number.isFinite(player.x)).toEqual(true);
            expect(Number.isFinite(player.y)).toEqual(true);
            expect(Number.isFinite(player.z)).toEqual(true);
            expect(Number.isFinite(player.rotationY)).toEqual(true);
            expect(Number.isFinite(player.speed)).toEqual(true);
            expect(Number.isFinite(player.progress.distanceMeters)).toEqual(true);
            expect(Number.isNaN(player.x)).toEqual(false);
            expect(Number.isNaN(player.z)).toEqual(false);
            expect(Number.isNaN(player.speed)).toEqual(false);
        }
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
            (firstPlayer?.z ?? 0) - (secondPlayer?.z ?? 0),
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
            for (let step = 1; step <= 12_000; step += 1) {
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

    it('should zero both players speeds after a collision bump', () => {
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
        let bumpOccurred = false;
        for (let step = 0; step < 300; step += 1) {
            finalMs = 1_000 + (step + 1) * 16;
            const seq = step + 1;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, finalMs, 1, -1));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, finalMs, 1, 1));
            simulation.step(finalMs);
            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'collision_bump')) {
                bumpOccurred = true;
                break;
            }
        }

        expect(bumpOccurred).toEqual(true);

        const snapshot = simulation.buildSnapshot(finalMs);
        const player1 = snapshot.players.find((p) => p.id === 'player-1');
        const player2 = snapshot.players.find((p) => p.id === 'player-2');

        expect(player1?.speed ?? 99).toEqual(0);
        expect(player2?.speed ?? 99).toEqual(0);
    });

    it('should continue separating cars for a short recovery window after collision', () => {
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
        let bumpOccurred = false;
        for (let step = 0; step < 300; step += 1) {
            finalMs = 1_000 + (step + 1) * 16;
            const seq = step + 1;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, finalMs, 1, -1));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, finalMs, 1, 1));
            simulation.step(finalMs);
            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'collision_bump')) {
                bumpOccurred = true;
                break;
            }
        }

        expect(bumpOccurred).toEqual(true);

        const bumpSnapshot = simulation.buildSnapshot(finalMs);
        const bumpPlayer1 = bumpSnapshot.players.find((p) => p.id === 'player-1');
        const bumpPlayer2 = bumpSnapshot.players.find((p) => p.id === 'player-2');
        const bumpDistance = Math.hypot(
            (bumpPlayer1?.x ?? 0) - (bumpPlayer2?.x ?? 0),
            (bumpPlayer1?.z ?? 0) - (bumpPlayer2?.z ?? 0),
        );

        for (let step = 0; step < 6; step += 1) {
            finalMs += 16;
            const seq = 400 + step;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, finalMs, 1, 0));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, finalMs, 1, 0));
            simulation.step(finalMs);
            simulation.drainRaceEvents();
        }

        const recoverySnapshot = simulation.buildSnapshot(finalMs);
        const recoveryPlayer1 = recoverySnapshot.players.find((p) => p.id === 'player-1');
        const recoveryPlayer2 = recoverySnapshot.players.find((p) => p.id === 'player-2');
        const recoveryDistance = Math.hypot(
            (recoveryPlayer1?.x ?? 0) - (recoveryPlayer2?.x ?? 0),
            (recoveryPlayer1?.z ?? 0) - (recoveryPlayer2?.z ?? 0),
        );

        expect(recoveryDistance).toBeGreaterThan(bumpDistance + 0.05);
    });

    it('should keep post-impact travel bounded so the hitter cannot blast through', () => {
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
        let bumpOccurred = false;
        for (let step = 0; step < 320; step += 1) {
            finalMs = 1_000 + (step + 1) * 16;
            const seq = step + 1;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, finalMs, 1, -1));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, finalMs, 1, 1));
            simulation.step(finalMs);
            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'collision_bump')) {
                bumpOccurred = true;
                break;
            }
        }

        expect(bumpOccurred).toEqual(true);

        const bumpSnapshot = simulation.buildSnapshot(finalMs);
        const bumpPlayer1 = bumpSnapshot.players.find((p) => p.id === 'player-1');
        const bumpPlayer2 = bumpSnapshot.players.find((p) => p.id === 'player-2');
        const bumpP1X = bumpPlayer1?.x ?? 0;
        const bumpP1Z = bumpPlayer1?.z ?? 0;
        const bumpP2X = bumpPlayer2?.x ?? 0;
        const bumpP2Z = bumpPlayer2?.z ?? 0;

        for (let step = 0; step < 24; step += 1) {
            finalMs += 16;
            const seq = 500 + step;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, finalMs, 1, 0));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, finalMs, 1, 0));
            simulation.step(finalMs);
            simulation.drainRaceEvents();
        }

        const recoverySnapshot = simulation.buildSnapshot(finalMs);
        const recoveryPlayer1 = recoverySnapshot.players.find((p) => p.id === 'player-1');
        const recoveryPlayer2 = recoverySnapshot.players.find((p) => p.id === 'player-2');
        const travelP1 = Math.hypot((recoveryPlayer1?.x ?? 0) - bumpP1X, (recoveryPlayer1?.z ?? 0) - bumpP1Z);
        const travelP2 = Math.hypot((recoveryPlayer2?.x ?? 0) - bumpP2X, (recoveryPlayer2?.z ?? 0) - bumpP2Z);

        expect(travelP1).toBeLessThan(3.5);
        expect(travelP2).toBeLessThan(3.5);
    });

    it('should keep the rammer slowed during the short recovery window after impact', () => {
        const simulation = new RoomSimulation({
            roomId: 'ROOM1',
            seed: 1,
            tickHz: 60,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('player-1', 'Victim', 'sport', 'red');
        simulation.joinPlayer('player-2', 'Rammer', 'sport', 'blue');

        const rigidBodies = getPlayerRigidBodies(simulation);
        const victimRigidBody = rigidBodies.get('player-1');
        const rammerRigidBody = rigidBodies.get('player-2');
        expect(victimRigidBody).toBeDefined();
        expect(rammerRigidBody).toBeDefined();

        victimRigidBody?.setTranslation({ x: -6, y: 0.45, z: 50 }, true);
        victimRigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rammerRigidBody?.setTranslation({ x: -6, y: 0.45, z: 0 }, true);
        rammerRigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);

        const victim = simulation.getPlayers().get('player-1');
        const rammer = simulation.getPlayers().get('player-2');
        if (victim) {
            victim.motion.positionX = -6;
            victim.motion.positionZ = 50;
            victim.motion.speed = 0;
        }
        if (rammer) {
            rammer.motion.positionX = -6;
            rammer.motion.positionZ = 0;
            rammer.motion.speed = 0;
        }

        let finalMs = 1_000;
        let bumpOccurred = false;
        for (let step = 1; step <= 800; step += 1) {
            finalMs = 1_000 + step * 16;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', step, finalMs, 0, 0));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', step, finalMs, 1, 0));
            simulation.step(finalMs);

            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'collision_bump')) {
                bumpOccurred = true;
                break;
            }
        }

        expect(bumpOccurred).toEqual(true);

        for (let step = 0; step < 20; step += 1) {
            finalMs += 16;
            const seq = 10_000 + step;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, finalMs, 0, 0));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, finalMs, 1, 0));
            simulation.step(finalMs);
            simulation.drainRaceEvents();
        }

        const snapshot = simulation.buildSnapshot(finalMs);
        const rammerAfterImpact = snapshot.players.find((player) => player.id === 'player-2');

        expect(rammerAfterImpact?.speed ?? 99).toBeLessThan(5);
    });

    it('should apply flipped effect to the slower player after collision', () => {
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
        let bumpOccurred = false;
        for (let step = 0; step < 300; step += 1) {
            finalMs = 1_000 + (step + 1) * 16;
            const seq = step + 1;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, finalMs, 1, -1));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, finalMs, 1, 1));
            simulation.step(finalMs);
            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'collision_bump')) {
                bumpOccurred = true;
                break;
            }
        }

        expect(bumpOccurred).toEqual(true);

        const snapshot = simulation.buildSnapshot(finalMs);
        const allEffects = snapshot.players.flatMap((p) => p.activeEffects);
        const hasFlipped = allEffects.some((e) => e.effectType === 'flipped');

        expect(hasFlipped).toEqual(true);
    });

    it('should apply stunned to the bumped car (not the rammer) on big-impact collisions', () => {
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
        let bumpOccurred = false;
        for (let step = 0; step < 300; step += 1) {
            finalMs = 1_000 + (step + 1) * 16;
            const seq = step + 1;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, finalMs, 1, -1));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, finalMs, 1, 1));
            simulation.step(finalMs);
            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'collision_bump')) {
                bumpOccurred = true;
                break;
            }
        }

        expect(bumpOccurred).toEqual(true);

        const snapshot = simulation.buildSnapshot(finalMs);
        const stunnedPlayers = snapshot.players.filter((p) => p.activeEffects.some((e) => e.effectType === 'stunned'));
        const flippedPlayers = snapshot.players.filter((p) => p.activeEffects.some((e) => e.effectType === 'flipped'));
        const rammerPlayer = snapshot.players.find((player) => player.name === 'Bob');
        expect(stunnedPlayers.length).toBeGreaterThanOrEqual(1);
        expect(flippedPlayers.length).toBeGreaterThanOrEqual(1);
        for (const stunnedPlayer of stunnedPlayers) {
            expect(stunnedPlayer.activeEffects.some((e) => e.effectType === 'flipped')).toEqual(true);
        }
        expect(rammerPlayer).toBeDefined();
        expect(
            rammerPlayer?.activeEffects.every((effect) => effect.effectType !== 'stunned' && effect.effectType !== 'flipped'),
        ).toEqual(true);
    });

    it('should keep rammer speed at zero during drive-lock window even with throttle input', () => {
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
        let bumpOccurred = false;
        let bumpMs = 0;
        for (let step = 0; step < 300; step += 1) {
            finalMs = 1_000 + (step + 1) * 16;
            const seq = step + 1;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, finalMs, 1, -1));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, finalMs, 1, 1));
            simulation.step(finalMs);
            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'collision_bump')) {
                bumpOccurred = true;
                bumpMs = finalMs;
                break;
            }
        }

        expect(bumpOccurred).toEqual(true);

        for (let i = 0; i < 18; i += 1) {
            finalMs = bumpMs + (i + 1) * 16;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', 400 + i, finalMs, 1, 0));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', 400 + i, finalMs, 1, 0));
            simulation.step(finalMs);
        }

        const snapshot = simulation.buildSnapshot(finalMs);
        const rammerPlayer = snapshot.players.find((player) => player.id === 'player-2');
        expect(rammerPlayer).toBeDefined();
        expect(rammerPlayer?.speed ?? 99).toEqual(0);
    });

    it('should not apply bump response more than once per pair within cooldown', () => {
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
        let bumpCount = 0;
        for (let step = 0; step < 300; step += 1) {
            finalMs = 1_000 + (step + 1) * 16;
            const seq = step + 1;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, finalMs, 1, -1));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, finalMs, 1, 1));
            simulation.step(finalMs);
            const events = simulation.drainRaceEvents();
            bumpCount += events.filter((event) => event.kind === 'collision_bump').length;
        }

        expect(bumpCount).toBeGreaterThanOrEqual(1);
        expect(bumpCount).toBeLessThanOrEqual(4);
    });

    it('should not apply a second bump within the 3-second pair cooldown', () => {
        const simulation = new RoomSimulation({
            roomId: 'ROOM1',
            seed: 1,
            tickHz: 60,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('player-1', 'Victim', 'sport', 'red');
        simulation.joinPlayer('player-2', 'Rammer', 'sport', 'blue');

        const rigidBodies = getPlayerRigidBodies(simulation);
        const victimRigidBody = rigidBodies.get('player-1');
        const rammerRigidBody = rigidBodies.get('player-2');
        expect(victimRigidBody).toBeDefined();
        expect(rammerRigidBody).toBeDefined();

        const victim = simulation.getPlayers().get('player-1');
        const rammer = simulation.getPlayers().get('player-2');
        expect(victim).toBeDefined();
        expect(rammer).toBeDefined();

        const setPositions = (victimZ: number, rammerZ: number) => {
            victimRigidBody?.setTranslation({ x: -6, y: 0.45, z: victimZ }, true);
            victimRigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
            rammerRigidBody?.setTranslation({ x: -6, y: 0.45, z: rammerZ }, true);
            rammerRigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
            if (victim) {
                victim.motion.positionX = -6;
                victim.motion.positionZ = victimZ;
                victim.motion.speed = 0;
            }
            if (rammer) {
                rammer.motion.positionX = -6;
                rammer.motion.positionZ = rammerZ;
                rammer.motion.speed = 0;
            }
        };

        setPositions(72, 48);

        let nowMs = 1_000;
        let firstBumpMs: number | null = null;

        for (let step = 1; step <= 500; step += 1) {
            nowMs = 1_000 + step * 16;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', step, nowMs, 0, 0));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', step, nowMs, 1, 0));
            simulation.step(nowMs);
            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'collision_bump')) {
                firstBumpMs = nowMs;
                break;
            }
        }

        expect(firstBumpMs).not.toEqual(null);

        setPositions(95, 65);
        nowMs += 16;
        simulation.queueInputFrame('player-1', createInputFrame('ROOM1', 10_001, nowMs, 0, 0));
        simulation.queueInputFrame('player-2', createInputFrame('ROOM1', 10_001, nowMs, 0, 0));
        simulation.step(nowMs);
        simulation.drainRaceEvents();

        setPositions(95, 91.2);
        if (rammer) {
            rammer.motion.speed = 10;
        }

        let secondBumpMs: number | null = null;
        for (let step = 1; step <= 40; step += 1) {
            nowMs += 16;
            const seq = 10_100 + step;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, nowMs, 0, 0));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, nowMs, 1, 0));
            simulation.step(nowMs);
            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'collision_bump')) {
                secondBumpMs = nowMs;
                break;
            }
        }

        expect(secondBumpMs).toEqual(null);
    });

    it('should keep the rammer at zero speed during the 350ms recovery window', () => {
        const simulation = new RoomSimulation({
            roomId: 'ROOM1',
            seed: 1,
            tickHz: 60,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('player-1', 'Victim', 'sport', 'red');
        simulation.joinPlayer('player-2', 'Rammer', 'sport', 'blue');

        const rigidBodies = getPlayerRigidBodies(simulation);
        const victimRigidBody = rigidBodies.get('player-1');
        const rammerRigidBody = rigidBodies.get('player-2');
        expect(victimRigidBody).toBeDefined();
        expect(rammerRigidBody).toBeDefined();

        victimRigidBody?.setTranslation({ x: -6, y: 0.45, z: 60 }, true);
        victimRigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rammerRigidBody?.setTranslation({ x: -6, y: 0.45, z: 0 }, true);
        rammerRigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);

        const victim = simulation.getPlayers().get('player-1');
        const rammer = simulation.getPlayers().get('player-2');
        if (victim) {
            victim.motion.positionX = -6;
            victim.motion.positionZ = 60;
            victim.motion.speed = 0;
        }
        if (rammer) {
            rammer.motion.positionX = -6;
            rammer.motion.positionZ = 0;
            rammer.motion.speed = 0;
        }

        let nowMs = 1_000;
        let bumpMs: number | null = null;

        for (let step = 1; step <= 800; step += 1) {
            nowMs = 1_000 + step * 16;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', step, nowMs, 0, 0));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', step, nowMs, 1, 0));
            simulation.step(nowMs);
            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'collision_bump')) {
                bumpMs = nowMs;
                break;
            }
        }

        expect(bumpMs).not.toEqual(null);

        for (let i = 0; i < 20; i += 1) {
            nowMs += 16;
            const seq = 20_000 + i;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', seq, nowMs, 0, 0));
            simulation.queueInputFrame('player-2', createInputFrame('ROOM1', seq, nowMs, 1, 0));
            simulation.step(nowMs);
            simulation.drainRaceEvents();
        }

        const snapshot = simulation.buildSnapshot(nowMs);
        const rammerSnapshot = snapshot.players.find((player) => player.id === 'player-2');

        expect(rammerSnapshot).toBeDefined();
        expect(rammerSnapshot?.speed ?? 99).toBeLessThanOrEqual(3);
    });

    it('should still apply stun to a player who hits an obstacle', () => {
        const simulation = new RoomSimulation({
            roomId: 'ROOM1',
            seed: 1,
            tickHz: 60,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('player-1', 'Driver', 'sport', 'red');
        const firstObstacle = generateTrackObstacles('sunset-loop', 1, 3).obstacles[0];
        expect(firstObstacle).toBeDefined();

        const rigidBodies = getPlayerRigidBodies(simulation);
        const driverRigidBody = rigidBodies.get('player-1');
        expect(driverRigidBody).toBeDefined();
        driverRigidBody?.setTranslation(
            {
                x: firstObstacle!.positionX,
                y: 0.45,
                z: firstObstacle!.positionZ - 5,
            },
            true,
        );
        driverRigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);

        const driverState = simulation.getPlayers().get('player-1');
        if (driverState) {
            driverState.motion.positionX = firstObstacle!.positionX;
            driverState.motion.positionZ = firstObstacle!.positionZ - 5;
            driverState.motion.speed = 0;
        }

        let nowMs = 1_000;
        let stunned = false;
        for (let step = 1; step <= 240; step += 1) {
            nowMs = 1_000 + step * 16;
            simulation.queueInputFrame('player-1', createInputFrame('ROOM1', step, nowMs, 1, 0));
            simulation.step(nowMs);
            const events = simulation.drainRaceEvents();
            if (events.some((event) => event.kind === 'hazard_triggered' && event.metadata?.effectType === 'stunned')) {
                stunned = true;
                break;
            }
        }

        expect(stunned).toBeTrue();
        const snapshot = simulation.buildSnapshot(nowMs);
        const driver = snapshot.players.find((p) => p.id === 'player-1');
        expect(driver?.activeEffects.some((e) => e.effectType === 'stunned')).toEqual(true);
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

/**
 * Creates an input frame with explicit handbrake control for drift testing.
 */
const createDriftInputFrame = (
    roomId: string,
    seq: number,
    timestampMs: number,
    throttle: number,
    steering: number,
    handbrake: boolean,
) => ({
    ackSnapshotSeq: null,
    controls: {
        boost: false,
        brake: false,
        handbrake,
        steering,
        throttle,
    },
    cruiseControlEnabled: !handbrake,
    precisionOverrideActive: handbrake,
    protocolVersion: PROTOCOL_V2,
    roomId,
    seq,
    timestampMs,
});

describe('drift system integration', () => {
    const TICK_HZ = 60;
    const DT_MS = Math.round(1000 / TICK_HZ);

    /**
     * Accelerates a player to top speed over ~120 ticks (2 seconds at 60 Hz).
     * Returns the nowMs after acceleration.
     */
    const accelerateToSpeed = (
        simulation: RoomSimulation,
        playerId: string,
        roomId: string,
        startSeq: number,
        startMs: number,
        ticks: number,
    ) => {
        let nowMs = startMs;
        for (let i = 0; i < ticks; i++) {
            const seq = startSeq + i;
            nowMs = startMs + (i + 1) * DT_MS;
            simulation.queueInputFrame(playerId, createDriftInputFrame(roomId, seq, nowMs, 1, 0, false));
            simulation.step(nowMs);
            simulation.drainRaceEvents();
        }
        return { nowMs, nextSeq: startSeq + ticks };
    };

    it('should transition driftState to DRIFTING in snapshot when handbrake + steer at speed', () => {
        const simulation = new RoomSimulation({
            roomId: 'DRIFT1',
            seed: 1,
            tickHz: TICK_HZ,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('drifter', 'Drifter', 'sport', 'red');

        // Phase 1: accelerate to well above 10 m/s threshold
        const { nowMs: accelEndMs, nextSeq } = accelerateToSpeed(simulation, 'drifter', 'DRIFT1', 1, 1_000, 120);

        // Phase 2: hold handbrake + full left steer for enough ticks to pass INITIATING (150ms → ~10 ticks)
        let nowMs = accelEndMs;
        let driftingDetected = false;
        for (let i = 0; i < 30; i++) {
            const seq = nextSeq + i;
            nowMs += DT_MS;
            simulation.queueInputFrame('drifter', createDriftInputFrame('DRIFT1', seq, nowMs, 1.0, 1.0, true));
            simulation.step(nowMs);
            simulation.drainRaceEvents();

            const snapshot = simulation.buildSnapshot(nowMs);
            const player = snapshot.players.find((p) => p.id === 'drifter');
            if (player?.driftState === DriftState.DRIFTING) {
                driftingDetected = true;
                break;
            }
        }

        expect(driftingDetected).toBeTrue();
    });

    it('should show non-zero driftAngle in snapshot while DRIFTING', () => {
        const simulation = new RoomSimulation({
            roomId: 'DRIFT2',
            seed: 1,
            tickHz: TICK_HZ,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('drifter', 'Drifter', 'sport', 'red');

        const { nowMs: accelEndMs, nextSeq } = accelerateToSpeed(simulation, 'drifter', 'DRIFT2', 1, 1_000, 120);

        // Hold handbrake + steer until DRIFTING, then read angle after at least one full tick in DRIFTING
        let nowMs = accelEndMs;
        let driftAngle: number | undefined;
        let ticksInDrifting = 0;
        for (let i = 0; i < 30; i++) {
            const seq = nextSeq + i;
            nowMs += DT_MS;
            simulation.queueInputFrame('drifter', createDriftInputFrame('DRIFT2', seq, nowMs, 1.0, -0.9, true));
            simulation.step(nowMs);
            simulation.drainRaceEvents();

            const snapshot = simulation.buildSnapshot(nowMs);
            const player = snapshot.players.find((p) => p.id === 'drifter');
            if (player?.driftState === DriftState.DRIFTING) {
                ticksInDrifting++;
                // driftAngle is set inside the DRIFTING handler, so we need
                // at least one full tick processing in DRIFTING state
                if (ticksInDrifting >= 2) {
                    driftAngle = player.driftAngle;
                    break;
                }
            }
        }

        expect(driftAngle).toBeDefined();
        expect(driftAngle).not.toBe(0);
    });

    it('should reach driftBoostTier >= 1 after 1s+ of DRIFTING in snapshot', () => {
        const simulation = new RoomSimulation({
            roomId: 'DRIFT3',
            seed: 1,
            tickHz: TICK_HZ,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('drifter', 'Drifter', 'sport', 'red');

        const { nowMs: accelEndMs, nextSeq } = accelerateToSpeed(simulation, 'drifter', 'DRIFT3', 1, 1_000, 120);

        // Hold handbrake + steer for ~1.5s sim time (≥90 ticks at 60Hz)
        let nowMs = accelEndMs;
        let maxBoostTier = 0;
        for (let i = 0; i < 120; i++) {
            const seq = nextSeq + i;
            nowMs += DT_MS;
            simulation.queueInputFrame('drifter', createDriftInputFrame('DRIFT3', seq, nowMs, 1.0, 1.0, true));
            simulation.step(nowMs);
            simulation.drainRaceEvents();

            const snapshot = simulation.buildSnapshot(nowMs);
            const player = snapshot.players.find((p) => p.id === 'drifter');
            maxBoostTier = Math.max(maxBoostTier, player?.driftBoostTier ?? 0);
        }

        expect(maxBoostTier).toBeGreaterThanOrEqual(1);
    });

    it('should reset driftBoostTier to 0 after handbrake release and recovery', () => {
        const simulation = new RoomSimulation({
            roomId: 'DRIFT4',
            seed: 1,
            tickHz: TICK_HZ,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('drifter', 'Drifter', 'sport', 'red');

        const { nowMs: accelEndMs, nextSeq } = accelerateToSpeed(simulation, 'drifter', 'DRIFT4', 1, 1_000, 120);

        // Phase 2: drift for 1.5s to earn a boost tier
        let nowMs = accelEndMs;
        let seq = nextSeq;
        let maxBoostTier = 0;
        for (let i = 0; i < 100; i++) {
            nowMs += DT_MS;
            simulation.queueInputFrame('drifter', createDriftInputFrame('DRIFT4', seq++, nowMs, 1.0, 1.0, true));
            simulation.step(nowMs);
            simulation.drainRaceEvents();

            const snapshot = simulation.buildSnapshot(nowMs);
            const player = snapshot.players.find((p) => p.id === 'drifter');
            maxBoostTier = Math.max(maxBoostTier, player?.driftBoostTier ?? 0);
        }

        expect(maxBoostTier).toBeGreaterThanOrEqual(1);

        // Phase 3: release handbrake, wait for recovery (300ms ≈ 18 ticks)
        for (let i = 0; i < 30; i++) {
            nowMs += DT_MS;
            simulation.queueInputFrame('drifter', createDriftInputFrame('DRIFT4', seq++, nowMs, 1.0, 0, false));
            simulation.step(nowMs);
            simulation.drainRaceEvents();
        }

        const finalSnapshot = simulation.buildSnapshot(nowMs);
        const player = finalSnapshot.players.find((p) => p.id === 'drifter');

        expect(player?.driftState).toBe(DriftState.GRIPPING);
        expect(player?.driftBoostTier).toBe(0);
    });

    it('should reach tier-3 boost after 3s+ of sustained drifting', () => {
        const simulation = new RoomSimulation({
            roomId: 'DRIFT5',
            seed: 1,
            tickHz: TICK_HZ,
            totalLaps: 3,
            trackId: 'sunset-loop',
        });

        simulation.joinPlayer('drifter', 'Drifter', 'sport', 'red');

        const { nowMs: accelEndMs, nextSeq } = accelerateToSpeed(simulation, 'drifter', 'DRIFT5', 1, 1_000, 120);

        // Drift with 0.75 steering (just above 0.7 threshold) + full throttle.
        // The reduced handbrake braking while throttling and preserved forward
        // speed on wall-clamp allow sustained drifting up to tier 3.
        let nowMs = accelEndMs;
        let maxBoostTier = 0;
        for (let i = 0; i < 300; i++) {
            const seq = nextSeq + i;
            nowMs += DT_MS;
            simulation.queueInputFrame('drifter', createDriftInputFrame('DRIFT5', seq, nowMs, 1.0, 0.75, true));
            simulation.step(nowMs);
            simulation.drainRaceEvents();

            const snapshot = simulation.buildSnapshot(nowMs);
            const player = snapshot.players.find((p) => p.id === 'drifter');
            maxBoostTier = Math.max(maxBoostTier, player?.driftBoostTier ?? 0);
        }

        expect(maxBoostTier).toBe(3);
    });
});
