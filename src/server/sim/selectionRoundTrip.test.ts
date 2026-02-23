import { describe, expect, it } from 'bun:test';
import { RoomSimulation } from './roomSimulation';
import {
    VEHICLE_CLASS_MANIFESTS,
    type VehicleClassId,
} from '@/shared/game/vehicle/vehicleClassManifest';

const createSimulation = () =>
    new RoomSimulation({
        roomId: 'TEST',
        seed: 42,
        trackId: 'sunset-loop',
        tickHz: 60,
        totalLaps: 1,
    });

describe('selection round-trip through server simulation', () => {
    it('should preserve vehicle id in snapshot for every vehicle class', () => {
        const sim = createSimulation();
        const classes: VehicleClassId[] = ['sport', 'muscle', 'truck'];

        for (const vehicleId of classes) {
            sim.joinPlayer(`player-${vehicleId}`, `Player ${vehicleId}`, vehicleId, 'red');
        }

        sim.step(1000);
        const snapshot = sim.buildSnapshot(1000);

        for (const vehicleId of classes) {
            const player = snapshot.players.find((p) => p.id === `player-${vehicleId}`);
            expect(player).toBeDefined();
            expect(player!.vehicleId).toBe(vehicleId);
        }
    });

    it('should preserve color id in snapshot for every color in every palette', () => {
        const sim = createSimulation();
        let idx = 0;

        for (const manifest of VEHICLE_CLASS_MANIFESTS) {
            for (const colorId of manifest.colorPaletteIds) {
                const playerId = `player-${idx++}`;
                sim.joinPlayer(playerId, `P${idx}`, manifest.id, colorId);
            }
        }

        sim.step(1000);
        const snapshot = sim.buildSnapshot(1000);

        idx = 0;
        for (const manifest of VEHICLE_CLASS_MANIFESTS) {
            for (const colorId of manifest.colorPaletteIds) {
                const playerId = `player-${idx++}`;
                const player = snapshot.players.find((p) => p.id === playerId);
                expect(player).toBeDefined();
                expect(player!.colorId).toBe(colorId);
                expect(player!.vehicleId).toBe(manifest.id);
            }
        }
    });

    it('should default to sport and red when given empty selections', () => {
        const sim = createSimulation();
        sim.joinPlayer('player-default', 'Default', '', '');

        sim.step(1000);
        const snapshot = sim.buildSnapshot(1000);

        const player = snapshot.players.find((p) => p.id === 'player-default');
        expect(player).toBeDefined();
        expect(player!.vehicleId).toBe('sport');
        expect(player!.colorId).toBe('red');
    });

    it('should preserve selections through race restart', () => {
        const sim = createSimulation();
        sim.joinPlayer('player-1', 'Alice', 'truck', 'green');

        sim.step(1000);
        sim.restartRace(2000);

        const snapshot = sim.buildSnapshot(2000);
        const player = snapshot.players.find((p) => p.id === 'player-1');
        expect(player).toBeDefined();
        expect(player!.vehicleId).toBe('truck');
        expect(player!.colorId).toBe('green');
    });

    it('should maintain different selections for multiple players in same room', () => {
        const sim = createSimulation();
        sim.joinPlayer('player-1', 'Alice', 'sport', 'red');
        sim.joinPlayer('player-2', 'Bob', 'muscle', 'blue');
        sim.joinPlayer('player-3', 'Carol', 'truck', 'yellow');

        sim.step(1000);
        const snapshot = sim.buildSnapshot(1000);

        const p1 = snapshot.players.find((p) => p.id === 'player-1')!;
        const p2 = snapshot.players.find((p) => p.id === 'player-2')!;
        const p3 = snapshot.players.find((p) => p.id === 'player-3')!;

        expect(p1.vehicleId).toBe('sport');
        expect(p1.colorId).toBe('red');
        expect(p2.vehicleId).toBe('muscle');
        expect(p2.colorId).toBe('blue');
        expect(p3.vehicleId).toBe('truck');
        expect(p3.colorId).toBe('yellow');
    });
});
