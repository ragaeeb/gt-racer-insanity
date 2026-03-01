import { describe, expect, it } from 'bun:test';
import { createInitialDriftContext } from '@/shared/game/vehicle/driftConfig';
import { applyStatusEffectToPlayer, tickStatusEffects } from './effectSystem';
import type { SimPlayerState } from './types';

const createPlayer = (id = 'player-1'): SimPlayerState => ({
    abilityUsesThisRace: {},
    activeEffects: [],
    colorId: 'red',
    driftContext: createInitialDriftContext(),
    id,
    inputState: {
        boost: false,
        brake: false,
        handbrake: false,
        steering: 0,
        throttle: 0,
    },
    isGrounded: true,
    lastProcessedInputSeq: 0,
    motion: {
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotationY: 0,
        speed: 0,
    },
    name: 'Driver',
    progress: {
        checkpointIndex: 0,
        completedCheckpoints: [],
        distanceMeters: 0,
        finishedAtMs: null,
        lap: 0,
    },
    vehicleId: 'sport',
});

describe('applyStatusEffectToPlayer', () => {
    it('should add a new effect to a player with no existing effects', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 1000);
        expect(player.activeEffects).toHaveLength(1);
        expect(player.activeEffects[0]?.effectType).toBe('slowed');
        expect(player.activeEffects[0]?.appliedAtMs).toBe(1000);
    });

    it('should set expiresAtMs based on manifest default duration', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 1000);
        expect(player.activeEffects[0]?.expiresAtMs).toBeGreaterThan(1000);
    });

    it('should use custom duration override when provided', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 1000, 1, 500);
        expect(player.activeEffects[0]?.expiresAtMs).toBe(1500);
    });

    it('should set intensity to the provided value', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 1000, 0.5);
        expect(player.activeEffects[0]?.intensity).toBe(0.5);
    });

    it('should clamp intensity to 0 minimum', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 1000, -1);
        expect(player.activeEffects[0]?.intensity).toBe(0);
    });

    it('should merge with existing effect of the same type, taking max expiresAtMs', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 1000, 1, 1000);
        // Effect expires at 2000
        applyStatusEffectToPlayer(player, 'slowed', 1100, 1, 500);
        // New effect would expire at 1600 — less than 2000, so keep 2000
        expect(player.activeEffects).toHaveLength(1);
        expect(player.activeEffects[0]?.expiresAtMs).toBe(2000);
    });

    it('should merge with existing effect, taking max intensity', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 1000, 0.5, 1000);
        applyStatusEffectToPlayer(player, 'slowed', 1100, 0.9, 500);
        expect(player.activeEffects[0]?.intensity).toBe(0.9);
    });

    it('should do nothing when an unknown effect id is provided', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'unknown_effect' as any, 1000);
        expect(player.activeEffects).toHaveLength(0);
    });

    it('should handle multiple different effect types independently', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 1000);
        applyStatusEffectToPlayer(player, 'stunned', 1000);
        expect(player.activeEffects).toHaveLength(2);
    });

    it('should halve stun duration for patrol vehicle (stunDurationMultiplier: 0.5)', () => {
        const player = createPlayer();
        player.vehicleId = 'patrol';
        applyStatusEffectToPlayer(player, 'stunned', 1000, 1, 2000);
        const stun = player.activeEffects.find((e) => e.effectType === 'stunned');
        expect(stun?.expiresAtMs).toBe(1000 + 1000); // 2000 * 0.5 = 1000
    });

    it('should apply full stun duration for sport vehicle (no modifier)', () => {
        const player = createPlayer();
        player.vehicleId = 'sport';
        applyStatusEffectToPlayer(player, 'stunned', 1000, 1, 2000);
        const stun = player.activeEffects.find((e) => e.effectType === 'stunned');
        expect(stun?.expiresAtMs).toBe(1000 + 2000);
    });

    it('should not apply stun modifier to non-stun effects', () => {
        const player = createPlayer();
        player.vehicleId = 'patrol';
        applyStatusEffectToPlayer(player, 'slowed', 1000, 1, 2000);
        const slow = player.activeEffects.find((e) => e.effectType === 'slowed');
        expect(slow?.expiresAtMs).toBe(1000 + 2000);
    });
});

describe('applyStatusEffectToPlayer — duplicate handling', () => {
    it('should merge when there are multiple duplicate effects in the array', () => {
        const player = createPlayer();

        // Manually inject two identical effects (simulating an inconsistent state)
        player.activeEffects.push({
            appliedAtMs: 0,
            effectType: 'slowed',
            expiresAtMs: 2000,
            intensity: 0.5,
        });
        player.activeEffects.push({
            appliedAtMs: 0,
            effectType: 'slowed',
            expiresAtMs: 1500,
            intensity: 0.8,
        });

        // Now apply again - should merge all three into one, taking max of expiresAtMs and intensity
        applyStatusEffectToPlayer(player, 'slowed', 1000, 0.3, 500);

        expect(player.activeEffects).toHaveLength(1);
        // Max expiresAtMs across: 2000, 1500, 1000+500=1500 → 2000
        expect(player.activeEffects[0]?.expiresAtMs).toBe(2000);
        // Max intensity across: 0.5, 0.8, 0.3 → 0.8
        expect(player.activeEffects[0]?.intensity).toBe(0.8);
    });
});

describe('tickStatusEffects', () => {
    it('should remove expired effects', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 0, 1, 500);
        // At nowMs=1000, effect expires at 500 → expired
        tickStatusEffects(player, 1000);
        expect(player.activeEffects).toHaveLength(0);
    });

    it('should keep effects that have not yet expired', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 1000, 1, 500);
        // Expires at 1500, tick at 1200 → still active
        tickStatusEffects(player, 1200);
        expect(player.activeEffects).toHaveLength(1);
    });

    it('should remove effect exactly at expiry time', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 0, 1, 500);
        // Effect expires at 500. At nowMs=500, 500 > 500 is false → removed
        tickStatusEffects(player, 500);
        expect(player.activeEffects).toHaveLength(0);
    });

    it('should only remove expired effects and keep fresh ones', () => {
        const player = createPlayer();
        applyStatusEffectToPlayer(player, 'slowed', 0, 1, 300);
        applyStatusEffectToPlayer(player, 'stunned', 1000, 1, 1000);
        tickStatusEffects(player, 500);
        // slowed expired (300 < 500), stunned still active (2000 > 500)
        expect(player.activeEffects).toHaveLength(1);
        expect(player.activeEffects[0]?.effectType).toBe('stunned');
    });
});
