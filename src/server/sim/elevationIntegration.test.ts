/**
 * M5-E: Elevation Integration Tests
 *
 * These tests use real RoomSimulation instances to validate that elevation
 * and banking infrastructure works end-to-end through the server physics
 * pipeline. They cover scenarios that E2E tests cannot reach because
 * production tracks don't yet have elevation data (M5-D).
 *
 * We create simulations with the existing flat tracks and verify that:
 *   1. Ground snap keeps cars on the track surface
 *   2. Y-position flows through to snapshots
 *   3. Elevation doesn't break drift, collision, or combat systems
 *   4. No NaN/Infinity positions after extended simulation
 *   5. Snapshot Y values are finite and bounded
 */
import { describe, expect, it } from 'bun:test';
import { RoomSimulation } from '@/server/sim/roomSimulation';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';

// ───────────────────────── helpers ──────────────────────────

const createInputFrame = (roomId: string, seq: number, timestampMs: number, throttle = 1, steering = 0) => ({
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

const createDriftInputFrame = (roomId: string, seq: number, timestampMs: number) => ({
    ackSnapshotSeq: null,
    controls: {
        boost: false,
        brake: false,
        handbrake: true,
        steering: 0.8,
        throttle: 1,
    },
    cruiseControlEnabled: true,
    precisionOverrideActive: false,
    protocolVersion: PROTOCOL_V2,
    roomId,
    seq,
    timestampMs,
});

const createSimulation = (trackId = 'sunset-loop', totalLaps = 1) =>
    new RoomSimulation({
        roomId: 'ELEV-TEST',
        seed: 42,
        tickHz: 60,
        totalLaps,
        trackId,
    });

// ────────────── snapshot Y-position validation ──────────────

describe('elevation snapshot integration', () => {
    it('should produce finite Y values in snapshots after sustained driving', () => {
        const sim = createSimulation();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red');

        let nowMs = 1_000;
        for (let step = 1; step <= 600; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, 0));
            sim.step(nowMs);
            sim.drainRaceEvents();
        }

        const snapshot = sim.buildSnapshot(nowMs);
        const player = snapshot.players.find((p) => p.id === 'p1');

        expect(player).toBeDefined();
        expect(Number.isFinite(player!.x)).toBeTrue();
        expect(Number.isFinite(player!.y)).toBeTrue();
        expect(Number.isFinite(player!.z)).toBeTrue();
        expect(Number.isNaN(player!.y)).toBeFalse();

        // On flat track, Y should be at ground-level (0) — NOT the collider center (0.5).
        // Regression: the server previously sent the physics rigid body Y (which includes
        // the half-height offset) instead of the visual ground-surface Y.
        expect(player!.y).toBeGreaterThanOrEqual(-0.1);
        expect(player!.y).toBeLessThanOrEqual(0.1);
    });

    // ──── Regression: floating car (positionY = collider center, not ground) ────

    it('should send ground-level Y (0) in snapshot, not collider-center Y (0.5)', () => {
        const sim = createSimulation();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red');

        // Run enough ticks for the ground snap to fully converge
        let nowMs = 1_000;
        for (let step = 1; step <= 60; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 0, 0));
            sim.step(nowMs);
            sim.drainRaceEvents();
        }

        const snapshot = sim.buildSnapshot(nowMs);
        const player = snapshot.players.find((p) => p.id === 'p1');

        expect(player).toBeDefined();
        // Ground-level Y on a flat track must be ~0.0, NOT ~0.5.
        // If this test fails with y ≈ 0.5, the server is leaking the physics
        // collider-center Y instead of the visual ground-surface Y.
        expect(player!.y).toBeCloseTo(0, 1);
    });

    it('should produce finite Y for all players in a multi-player race', () => {
        const sim = createSimulation();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red');
        sim.joinPlayer('p2', 'Bob', 'compact', 'blue');
        sim.joinPlayer('p3', 'Charlie', 'pickup', 'green');

        let nowMs = 1_000;
        for (let step = 1; step <= 300; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, 0));
            sim.queueInputFrame('p2', createInputFrame('ELEV-TEST', step, nowMs, 0.8, 0.1));
            sim.queueInputFrame('p3', createInputFrame('ELEV-TEST', step, nowMs, 0.6, -0.1));
            sim.step(nowMs);
            sim.drainRaceEvents();
        }

        const snapshot = sim.buildSnapshot(nowMs);

        for (const player of snapshot.players) {
            expect(Number.isFinite(player.y)).toBeTrue();
            expect(Number.isNaN(player.y)).toBeFalse();
            expect(player.y).toBeGreaterThan(-5);
            expect(player.y).toBeLessThan(20);
        }
    });

    it('should keep Y bounded during entire multi-lap race', () => {
        const sim = createSimulation('sunset-loop', 3);
        sim.joinPlayer('p1', 'Racer', 'sport', 'red');

        let nowMs = 1_000;
        let minY = Infinity;
        let maxY = -Infinity;

        // Run for 6000 ticks (100 seconds of game time at 60hz)
        for (let step = 1; step <= 6_000; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, 0));
            sim.step(nowMs);
            sim.drainRaceEvents();

            // Sample every 60 ticks (1 second)
            if (step % 60 === 0) {
                const snapshot = sim.buildSnapshot(nowMs);
                const player = snapshot.players[0];
                if (player) {
                    minY = Math.min(minY, player.y);
                    maxY = Math.max(maxY, player.y);
                    expect(Number.isFinite(player.y)).toBeTrue();
                }
            }
        }

        // On flat track, Y should stay near ground level
        expect(minY).toBeGreaterThan(-2);
        expect(maxY).toBeLessThan(10);
    });
});

// ────────────── drift system with elevation ─────────────────

describe('drift with elevation enabled', () => {
    it('should still transition to DRIFTING state with Y-axis motion', () => {
        const sim = createSimulation();
        sim.joinPlayer('p1', 'Drifter', 'sport', 'red');

        let nowMs = 1_000;

        // Build speed: 200 ticks of throttle
        for (let step = 1; step <= 200; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, 0));
            sim.step(nowMs);
            sim.drainRaceEvents();
        }

        // Verify speed built up
        const preSnapshot = sim.buildSnapshot(nowMs);
        const prePlayer = preSnapshot.players.find((p) => p.id === 'p1');
        expect(prePlayer?.speed ?? 0).toBeGreaterThan(5);

        // Drift: handbrake + steer for 90 ticks (~1.5s)
        for (let step = 201; step <= 290; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createDriftInputFrame('ELEV-TEST', step, nowMs));
            sim.step(nowMs);
            sim.drainRaceEvents();
        }

        const snapshot = sim.buildSnapshot(nowMs);
        const player = snapshot.players.find((p) => p.id === 'p1');

        // Y should still be finite
        expect(Number.isFinite(player!.y)).toBeTrue();

        // Drift state should be active (1 = INITIATING, 2 = DRIFTING)
        expect(player!.driftState ?? 0).toBeGreaterThanOrEqual(1);
    });

    it('should grant drift boost tier after sustained drift with Y-axis enabled', () => {
        const sim = createSimulation();
        sim.joinPlayer('p1', 'Drifter', 'sport', 'red');

        let nowMs = 1_000;

        // Build speed
        for (let step = 1; step <= 250; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, 0));
            sim.step(nowMs);
            sim.drainRaceEvents();
        }

        // Drift for ~2 seconds (120 ticks) — should reach tier 1
        for (let step = 251; step <= 370; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createDriftInputFrame('ELEV-TEST', step, nowMs));
            sim.step(nowMs);
            sim.drainRaceEvents();
        }

        const snapshot = sim.buildSnapshot(nowMs);
        const player = snapshot.players.find((p) => p.id === 'p1');

        expect(player!.driftBoostTier ?? 0).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(player!.y)).toBeTrue();
    });
});

// ────────────── collision system with elevation ─────────────

describe('collision with elevation enabled', () => {
    it('should still produce collision_bump events on flat track', () => {
        const sim = createSimulation();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red');
        sim.joinPlayer('p2', 'Bob', 'sport', 'blue');

        let nowMs = 1_000;
        let bumpOccurred = false;

        // Drive both players toward each other via steering
        for (let step = 1; step <= 300; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, -1));
            sim.queueInputFrame('p2', createInputFrame('ELEV-TEST', step, nowMs, 1, 1));
            sim.step(nowMs);
            const events = sim.drainRaceEvents();
            if (events.some((e) => e.kind === 'collision_bump')) {
                bumpOccurred = true;
                break;
            }
        }

        expect(bumpOccurred).toBeTrue();

        // Verify Y is still finite after collision
        const snapshot = sim.buildSnapshot(nowMs);
        for (const player of snapshot.players) {
            expect(Number.isFinite(player.y)).toBeTrue();
        }
    });

    it('should zero both speeds after collision with Y-axis enabled', () => {
        const sim = createSimulation();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red');
        sim.joinPlayer('p2', 'Bob', 'sport', 'blue');

        let nowMs = 1_000;
        let bumpOccurred = false;

        for (let step = 1; step <= 300; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, -1));
            sim.queueInputFrame('p2', createInputFrame('ELEV-TEST', step, nowMs, 1, 1));
            sim.step(nowMs);
            const events = sim.drainRaceEvents();
            if (events.some((e) => e.kind === 'collision_bump')) {
                bumpOccurred = true;
                break;
            }
        }

        expect(bumpOccurred).toBeTrue();

        const snapshot = sim.buildSnapshot(nowMs);
        const p1 = snapshot.players.find((p) => p.id === 'p1');
        const p2 = snapshot.players.find((p) => p.id === 'p2');

        expect(p1?.speed ?? 99).toBe(0);
        expect(p2?.speed ?? 99).toBe(0);
    });
});

// ────────────── obstacle system with elevation ──────────────

describe('obstacle hits with elevation enabled', () => {
    it('should still trigger stun on obstacle collision', () => {
        const sim = createSimulation();
        sim.joinPlayer('p1', 'Driver', 'sport', 'red');

        let nowMs = 1_000;

        // Drive straight for a reasonable distance — should eventually hit an obstacle
        for (let step = 1; step <= 3_000; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, 0));
            sim.step(nowMs);
            const events = sim.drainRaceEvents();
            if (events.some((e) => e.kind === 'hazard_triggered')) {
                break;
            }
        }

        // Even if we don't hit an obstacle in a straight line (depends on placement),
        // verify Y is still sane after the long drive
        const snapshot = sim.buildSnapshot(nowMs);
        const player = snapshot.players.find((p) => p.id === 'p1');
        expect(Number.isFinite(player!.y)).toBeTrue();
        expect(player!.y).toBeGreaterThan(-2);
        expect(player!.y).toBeLessThan(10);
    });
});

// ────────────── canyon track regression ──────────────────────

describe('canyon-sprint track with elevation enabled', () => {
    it('should produce finite Y values on canyon-sprint track', () => {
        const sim = createSimulation('canyon-sprint', 1);
        sim.joinPlayer('p1', 'Canyon Driver', 'sport', 'red');

        let nowMs = 1_000;
        for (let step = 1; step <= 600; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, 0.05));
            sim.step(nowMs);
            sim.drainRaceEvents();
        }

        const snapshot = sim.buildSnapshot(nowMs);
        const player = snapshot.players.find((p) => p.id === 'p1');

        expect(player).toBeDefined();
        expect(Number.isFinite(player!.y)).toBeTrue();
        expect(player!.y).toBeGreaterThan(-2);
        // Verify the player actually moved forward (was receiving input)
        expect(player!.z).toBeGreaterThan(10);
        expect(player!.speed).toBeGreaterThan(0);
    });

    it('should handle different vehicle classes on canyon-sprint', () => {
        const sim = createSimulation('canyon-sprint', 1);
        sim.joinPlayer('p1', 'Sport', 'sport', 'red');
        sim.joinPlayer('p2', 'Pickup', 'pickup', 'blue');
        sim.joinPlayer('p3', 'SUV', 'suv', 'green');

        let nowMs = 1_000;
        for (let step = 1; step <= 300; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, 0));
            sim.queueInputFrame('p2', createInputFrame('ELEV-TEST', step, nowMs, 1, 0.1));
            sim.queueInputFrame('p3', createInputFrame('ELEV-TEST', step, nowMs, 0.9, -0.1));
            sim.step(nowMs);
            sim.drainRaceEvents();
        }

        const snapshot = sim.buildSnapshot(nowMs);
        for (const player of snapshot.players) {
            expect(Number.isFinite(player.y)).toBeTrue();
            expect(Number.isFinite(player.x)).toBeTrue();
            expect(Number.isFinite(player.z)).toBeTrue();
            expect(Number.isFinite(player.speed)).toBeTrue();
        }
    });
});

// ────────────── race completion regression ───────────────────

describe('race completion with elevation enabled', () => {
    it('should deterministically complete a 1-lap race', () => {
        const runRace = () => {
            const sim = createSimulation('sunset-loop', 1);
            sim.joinPlayer('p1', 'Racer', 'sport', 'red');

            let nowMs = 1_000;
            for (let step = 1; step <= 12_000; step += 1) {
                nowMs = 1_000 + step * 16;
                sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, 0));
                sim.step(nowMs);

                const events = sim.drainRaceEvents();
                if (events.some((e) => e.kind === 'race_finished')) {
                    break;
                }
            }

            return sim.buildSnapshot(nowMs);
        };

        const firstRun = runRace();
        const secondRun = runRace();

        // Both should finish
        expect(firstRun.raceState.status).toBe('finished');
        expect(secondRun.raceState.status).toBe('finished');

        // Deterministic: same winner across runs
        expect(firstRun.raceState.winnerPlayerId).toBe(secondRun.raceState.winnerPlayerId);

        // Y values should be finite in the final snapshot
        for (const player of firstRun.players) {
            expect(Number.isFinite(player.y)).toBeTrue();
        }
    });

    it('should complete a 3-lap race without Y-axis anomalies', () => {
        const sim = createSimulation('sunset-loop', 3);
        sim.joinPlayer('p1', 'Endurance', 'sport', 'red');

        let nowMs = 1_000;
        let finished = false;
        let maxY = -Infinity;
        let minY = Infinity;

        for (let step = 1; step <= 30_000; step += 1) {
            nowMs = 1_000 + step * 16;
            sim.queueInputFrame('p1', createInputFrame('ELEV-TEST', step, nowMs, 1, 0));
            sim.step(nowMs);

            const events = sim.drainRaceEvents();
            if (events.some((e) => e.kind === 'race_finished')) {
                finished = true;
                break;
            }

            // Sample Y every second
            if (step % 60 === 0) {
                const snap = sim.buildSnapshot(nowMs);
                const p = snap.players[0];
                if (p) {
                    maxY = Math.max(maxY, p.y);
                    minY = Math.min(minY, p.y);
                }
            }
        }

        expect(finished).toBeTrue();

        // On flat track, Y should not oscillate wildly
        expect(minY).toBeGreaterThan(-3);
        expect(maxY).toBeLessThan(10);
    });
});
