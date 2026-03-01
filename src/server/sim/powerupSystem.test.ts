import { describe, expect, it } from 'bun:test';
import { applyPowerupTriggers, type PowerupTrigger } from '@/server/sim/powerupSystem';
import type { SimPlayerState } from '@/server/sim/types';
import { createInitialDriftContext } from '@/shared/game/vehicle/driftConfig';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';

const createPlayer = (id: string, vehicleId: VehicleClassId = 'sport'): SimPlayerState => ({
    abilityUsesThisRace: {},
    activeEffects: [],
    colorId: 'red',
    driftContext: createInitialDriftContext(),
    id,
    inputState: { boost: false, brake: false, handbrake: false, steering: 0, throttle: 0 },
    isGrounded: true,
    lastProcessedInputSeq: 0,
    motion: { positionX: 0, positionY: 0, positionZ: 0, rotationY: 0, speed: 0 },
    name: 'Driver',
    progress: { checkpointIndex: 0, completedCheckpoints: [], distanceMeters: 0, finishedAtMs: null, lap: 0 },
    vehicleId,
});

describe('applyPowerupTriggers', () => {
    it('should apply speed_burst effect on speed-boost trigger', () => {
        const player = createPlayer('p1');
        const players = new Map([['p1', player]]);
        const triggers: PowerupTrigger[] = [{ playerId: 'p1', powerupType: 'speed-boost' }];

        applyPowerupTriggers(players, triggers, 1000);

        expect(player.activeEffects).toHaveLength(1);
        expect(player.activeEffects[0]?.effectType).toBe('speed_burst');
    });

    it('should set intensity=1 for sport (default powerupSpeedMultiplier)', () => {
        const player = createPlayer('p1', 'sport');
        const players = new Map([['p1', player]]);

        applyPowerupTriggers(players, [{ playerId: 'p1', powerupType: 'speed-boost' }], 1000);

        expect(player.activeEffects[0]?.intensity).toBe(1);
    });

    it('should set intensity=2 for truck (powerupSpeedMultiplier: 2)', () => {
        const player = createPlayer('p1', 'truck');
        const players = new Map([['p1', player]]);

        applyPowerupTriggers(players, [{ playerId: 'p1', powerupType: 'speed-boost' }], 1000);

        expect(player.activeEffects[0]?.intensity).toBe(2);
    });

    it('should set intensity=1 for bike (no powerup modifier)', () => {
        const player = createPlayer('p1', 'bike');
        const players = new Map([['p1', player]]);

        applyPowerupTriggers(players, [{ playerId: 'p1', powerupType: 'speed-boost' }], 1000);

        expect(player.activeEffects[0]?.intensity).toBe(1);
    });

    it('should skip unknown player ids without crashing', () => {
        const players = new Map<string, SimPlayerState>();
        const triggers: PowerupTrigger[] = [{ playerId: 'ghost', powerupType: 'speed-boost' }];

        applyPowerupTriggers(players, triggers, 1000);

        expect(players.size).toBe(0);
    });

    it('should not apply any effect for non-speed-boost trigger types', () => {
        const player = createPlayer('p1');
        const players = new Map([['p1', player]]);
        const triggers: PowerupTrigger[] = [{ playerId: 'p1', powerupType: 'shield' }];

        applyPowerupTriggers(players, triggers, 1000);

        expect(player.activeEffects).toHaveLength(0);
    });

    it('should handle multiple triggers for different players', () => {
        const sport = createPlayer('p1', 'sport');
        const truck = createPlayer('p2', 'truck');
        const players = new Map([
            ['p1', sport],
            ['p2', truck],
        ]);
        const triggers: PowerupTrigger[] = [
            { playerId: 'p1', powerupType: 'speed-boost' },
            { playerId: 'p2', powerupType: 'speed-boost' },
        ];

        applyPowerupTriggers(players, triggers, 1000);

        expect(sport.activeEffects[0]?.intensity).toBe(1);
        expect(truck.activeEffects[0]?.intensity).toBe(2);
    });
});
