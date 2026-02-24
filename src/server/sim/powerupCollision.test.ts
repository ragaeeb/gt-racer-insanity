import { describe, expect, it } from 'bun:test';
import { RoomSimulation } from '@/server/sim/roomSimulation';
import { getPowerupManifestById } from '@/shared/game/powerup/powerupManifest';
import { getTrackManifestById } from '@/shared/game/track/trackManifest';

const createSim = () =>
    new RoomSimulation({
        roomId: 'test-room',
        seed: 42,
        tickHz: 20,
        totalLaps: 3,
        trackId: 'sunset-loop',
    });

describe('powerup collision detection', () => {
    it('should include powerup positions in snapshot', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);
        const trackManifest = getTrackManifestById('sunset-loop');

        const snapshot = sim.buildSnapshot(nowMs);
        expect(snapshot.powerups.length).toBeGreaterThan(0);
        for (const powerup of snapshot.powerups) {
            const expectedId = trackManifest.powerupSpawns[0]?.powerupId;
            expect(powerup.powerupId).toBe(expectedId);
            expect(typeof powerup.x).toBe('number');
            expect(typeof powerup.z).toBe('number');
            expect(typeof powerup.isActive).toBe('boolean');
        }
    });

    it('should have powerups repeated for each lap', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);
        const trackManifest = getTrackManifestById('sunset-loop');
        const spawnsPerLap = trackManifest.powerupSpawns.length;

        const snapshot = sim.buildSnapshot(nowMs);
        const lap0 = snapshot.powerups.filter((p) => p.id.includes('lap0'));
        const lap1 = snapshot.powerups.filter((p) => p.id.includes('lap1'));
        const lap2 = snapshot.powerups.filter((p) => p.id.includes('lap2'));
        expect(lap0.length).toBe(spawnsPerLap);
        expect(lap1.length).toBe(spawnsPerLap);
        expect(lap2.length).toBe(spawnsPerLap);
    });

    it('should start all powerups as active', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        const snapshot = sim.buildSnapshot(nowMs);
        const allActive = snapshot.powerups.every((p) => p.isActive);
        expect(allActive).toBe(true);
    });

    it('should not trigger powerup when player is far away (at spawn)', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        sim.step(nowMs + 50);

        const snapshot = sim.buildSnapshot(nowMs + 50);
        const hasSpeedBurst = snapshot.players[0].activeEffects.some(
            (e) => e.effectType === 'speed_burst',
        );
        expect(hasSpeedBurst).toBe(false);
        const allActive = snapshot.powerups.every((p) => p.isActive);
        expect(allActive).toBe(true);
    });

    it('should reference valid powerup manifests', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        const snapshot = sim.buildSnapshot(nowMs);
        for (const powerup of snapshot.powerups) {
            const manifest = getPowerupManifestById(powerup.powerupId);
            expect(manifest).not.toBeNull();
            expect(manifest!.type).toBe('speed-boost');
        }
    });

    it('should apply speed_burst effect via powerup trigger queue', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        sim.queuePowerupTrigger({ playerId: 'p1', powerupType: 'speed-boost' });
        sim.step(nowMs + 50);

        const snapshot = sim.buildSnapshot(nowMs + 50);
        const hasSpeedBurst = snapshot.players[0].activeEffects.some(
            (e) => e.effectType === 'speed_burst',
        );
        expect(hasSpeedBurst).toBe(true);
    });

    it('should emit powerup_collected race event via trigger queue', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        sim.queuePowerupTrigger({ playerId: 'p1', powerupType: 'speed-boost' });
        sim.step(nowMs + 50);

        const events = sim.drainRaceEvents();
        const powerupEvent = events.find((e) => e.kind === 'powerup_collected');
        expect(powerupEvent).toBeDefined();
        expect(powerupEvent!.playerId).toBe('p1');
        expect(powerupEvent!.metadata?.powerupType).toBe('speed-boost');
    });

    it('should reset all powerups on race restart', () => {
        const sim = createSim();
        const nowMs = Date.now();
        sim.joinPlayer('p1', 'Alice', 'sport', 'red', nowMs);

        const before = sim.buildSnapshot(nowMs);
        const count = before.powerups.length;

        sim.restartRace(nowMs + 100);
        const after = sim.buildSnapshot(nowMs + 100);
        expect(after.powerups.length).toBe(count);
        expect(after.powerups.every((p) => p.isActive)).toBe(true);
    });
});
