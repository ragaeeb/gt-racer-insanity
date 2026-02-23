import { describe, expect, it } from 'bun:test';
import { RoomSimulation } from '@/server/sim/roomSimulation';
import { getHazardManifestById } from '@/shared/game/hazard/hazardManifest';

const createSim = () =>
    new RoomSimulation({
        roomId: 'test-room',
        seed: 42,
        tickHz: 20,
        totalLaps: 3,
        trackId: 'sunset-loop',
    });

describe('hazard collision detection', () => {
    it('should include hazard positions in snapshot', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        const snapshot = sim.buildSnapshot(nowMs);
        expect(snapshot.hazards.length).toBeGreaterThan(0);
        for (const hazard of snapshot.hazards) {
            expect(hazard.hazardId).toBe('spike-strip');
            expect(typeof hazard.x).toBe('number');
            expect(typeof hazard.z).toBe('number');
        }
    });

    it('should have hazards repeated for each lap', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        const snapshot = sim.buildSnapshot(nowMs);
        const lap0Hazards = snapshot.hazards.filter((h) => h.id.includes('lap0'));
        const lap1Hazards = snapshot.hazards.filter((h) => h.id.includes('lap1'));
        const lap2Hazards = snapshot.hazards.filter((h) => h.id.includes('lap2'));
        expect(lap0Hazards.length).toBe(3);
        expect(lap1Hazards.length).toBe(3);
        expect(lap2Hazards.length).toBe(3);
    });

    it('should not trigger hazard when player is far away (at spawn)', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        sim.step(nowMs + 50);

        const snapshot = sim.buildSnapshot(nowMs + 50);
        const hasFlatTire = snapshot.players[0].activeEffects.some(
            (e) => e.effectType === 'flat_tire',
        );
        expect(hasFlatTire).toBe(false);
    });

    it('should reference valid hazard manifests', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        const snapshot = sim.buildSnapshot(nowMs);
        for (const hazard of snapshot.hazards) {
            const manifest = getHazardManifestById(hazard.hazardId);
            expect(manifest).not.toBeNull();
            expect(manifest!.statusEffectId).toBe('flat_tire');
        }
    });

    it('should reset hazards on race restart', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        const before = sim.buildSnapshot(nowMs);
        const hazardCountBefore = before.hazards.length;

        sim.restartRace(nowMs + 100);
        const after = sim.buildSnapshot(nowMs + 100);
        expect(after.hazards.length).toBe(hazardCountBefore);
    });

    it('should queue hazard trigger when checking hazard collision', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        sim.queueHazardTrigger({ effectType: 'flat_tire', playerId: 'p1' });
        sim.step(nowMs + 50);

        const snapshot = sim.buildSnapshot(nowMs + 50);
        const hasFlatTire = snapshot.players[0].activeEffects.some(
            (e) => e.effectType === 'flat_tire',
        );
        expect(hasFlatTire).toBe(true);
    });

    it('should emit hazard_triggered race event when trigger is queued', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        sim.queueHazardTrigger({ effectType: 'flat_tire', playerId: 'p1' });
        sim.step(nowMs + 50);

        const events = sim.drainRaceEvents();
        const hazardEvent = events.find((e) => e.kind === 'hazard_triggered');
        expect(hazardEvent).toBeDefined();
        expect(hazardEvent!.playerId).toBe('p1');
        expect(hazardEvent!.metadata?.effectType).toBe('flat_tire');
    });
});
