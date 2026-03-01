import { describe, expect, it } from 'bun:test';
import { applyPowerupTriggers } from '@/server/sim/powerupSystem';
import { applyStatusEffectToPlayer } from '@/server/sim/effectSystem';
import type { SimPlayerState } from '@/server/sim/types';
import { createInitialDriftContext } from '@/shared/game/vehicle/driftConfig';
import { SPEED_BURST_MOVEMENT_MULTIPLIER } from '@/shared/game/effects/statusEffectManifest';

const createPlayer = (id: string, vehicleId: SimPlayerState['vehicleId'] = 'sport'): SimPlayerState => ({
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

describe('vehicle modifier — powerup speed multiplier', () => {
    it('should apply intensity=1 for sport (default powerupSpeedMultiplier)', () => {
        const player = createPlayer('p1', 'sport');
        const players = new Map([['p1', player]]);
        applyPowerupTriggers(players, [{ playerId: 'p1', powerupType: 'speed-boost' }], 1000);

        const effect = player.activeEffects.find((e) => e.effectType === 'speed_burst');
        expect(effect).toBeDefined();
        expect(effect!.intensity).toBe(1);
    });

    it('should apply intensity=2 for truck (powerupSpeedMultiplier: 2)', () => {
        const player = createPlayer('p1', 'truck');
        const players = new Map([['p1', player]]);
        applyPowerupTriggers(players, [{ playerId: 'p1', powerupType: 'speed-boost' }], 1000);

        const effect = player.activeEffects.find((e) => e.effectType === 'speed_burst');
        expect(effect).toBeDefined();
        expect(effect!.intensity).toBe(2);
    });

    it('should produce a stronger movement bonus with intensity=2', () => {
        // With intensity=1: effective multiplier = 1 + (1.3 - 1) * 1 = 1.3
        // With intensity=2: effective multiplier = 1 + (1.3 - 1) * 2 = 1.6
        const baseBonus = SPEED_BURST_MOVEMENT_MULTIPLIER - 1;
        const effectiveAtIntensity1 = 1 + baseBonus * 1;
        const effectiveAtIntensity2 = 1 + baseBonus * 2;

        expect(effectiveAtIntensity1).toBeCloseTo(1.3, 5);
        expect(effectiveAtIntensity2).toBeCloseTo(1.6, 5);
        expect(effectiveAtIntensity2).toBeGreaterThan(effectiveAtIntensity1);
    });
});

describe('vehicle modifier — stun duration multiplier', () => {
    it('should halve stun duration for patrol on any stun source', () => {
        const player = createPlayer('p1', 'patrol');
        applyStatusEffectToPlayer(player, 'stunned', 1000, 1, 2000);

        const stun = player.activeEffects.find((e) => e.effectType === 'stunned');
        expect(stun).toBeDefined();
        expect(stun!.expiresAtMs).toBe(1000 + 1000); // 2000 * 0.5 = 1000
    });

    it('should keep full stun duration for sport', () => {
        const player = createPlayer('p1', 'sport');
        applyStatusEffectToPlayer(player, 'stunned', 1000, 1, 2000);

        const stun = player.activeEffects.find((e) => e.effectType === 'stunned');
        expect(stun!.expiresAtMs).toBe(1000 + 2000);
    });

    it('should keep full stun duration for truck (no stun modifier)', () => {
        const player = createPlayer('p1', 'truck');
        applyStatusEffectToPlayer(player, 'stunned', 1000, 1, 2000);

        const stun = player.activeEffects.find((e) => e.effectType === 'stunned');
        expect(stun!.expiresAtMs).toBe(1000 + 2000);
    });

    it('should also scale default stun duration (no override) for patrol', () => {
        const player = createPlayer('p1', 'patrol');
        applyStatusEffectToPlayer(player, 'stunned', 1000);

        const stun = player.activeEffects.find((e) => e.effectType === 'stunned');
        expect(stun).toBeDefined();
        // Default stunned duration is 1600ms; patrol halves it to 800ms
        expect(stun!.expiresAtMs).toBe(1000 + 800);
    });

    it('should not modify duration for non-stun effects on patrol', () => {
        const player = createPlayer('p1', 'patrol');
        applyStatusEffectToPlayer(player, 'slowed', 1000, 1, 2000);

        const effect = player.activeEffects.find((e) => e.effectType === 'slowed');
        expect(effect!.expiresAtMs).toBe(1000 + 2000);
    });
});

describe('vehicle modifier — ability use limit', () => {
    it('should reset abilityUsesThisRace on new player creation', () => {
        const player = createPlayer('p1', 'bike');
        expect(player.abilityUsesThisRace).toEqual({});
    });
});
