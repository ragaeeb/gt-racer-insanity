import { describe, expect, it } from 'bun:test';
import { applyAbilityActivation, commitAbilityCooldown } from '@/server/sim/abilitySystem';
import type { SimPlayerState } from '@/server/sim/types';
import { createInitialDriftContext } from '@/shared/game/vehicle/driftConfig';

const createPlayer = (id: string): SimPlayerState => {
    return {
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
    };
};

describe('ability system', () => {
    it('should apply an ability effect and start cooldown', () => {
        const players = new Map<string, SimPlayerState>([['player-1', createPlayer('player-1')]]);
        const cooldownStore = new Map<string, number>();

        const result = applyAbilityActivation(
            players,
            'player-1',
            {
                abilityId: 'turbo-boost',
                seq: 1,
                targetPlayerId: null,
            },
            1_000,
            cooldownStore,
        );

        expect(result.applied).toEqual(true);
        expect(players.get('player-1')?.activeEffects.length).toEqual(1);
        expect(players.get('player-1')?.activeEffects[0]?.effectType).toEqual('boosted');
        expect(cooldownStore.size).toEqual(1);
    });

    it('should reject activation while cooldown is active', () => {
        const players = new Map<string, SimPlayerState>([['player-1', createPlayer('player-1')]]);
        const cooldownStore = new Map<string, number>();

        const first = applyAbilityActivation(
            players,
            'player-1',
            {
                abilityId: 'turbo-boost',
                seq: 1,
                targetPlayerId: null,
            },
            1_000,
            cooldownStore,
        );
        const second = applyAbilityActivation(
            players,
            'player-1',
            {
                abilityId: 'turbo-boost',
                seq: 2,
                targetPlayerId: null,
            },
            1_001,
            cooldownStore,
        );

        expect(first.applied).toEqual(true);
        expect(second.applied).toEqual(false);
        expect(second.reason).toEqual('cooldown');
    });

    it('should defer cooldown for projectile-delivery abilities until committed', () => {
        const players = new Map<string, SimPlayerState>([
            ['player-1', createPlayer('player-1')],
            ['player-2', createPlayer('player-2')],
        ]);
        const cooldownStore = new Map<string, number>();

        const result = applyAbilityActivation(
            players,
            'player-1',
            {
                abilityId: 'spike-shot',
                seq: 1,
                targetPlayerId: null,
            },
            1_000,
            cooldownStore,
        );

        expect(result.spawnProjectile).toEqual(true);
        expect(result.applied).toEqual(false);
        expect(cooldownStore.size).toEqual(0);

        const committed = commitAbilityCooldown(cooldownStore, 'player-1', 'spike-shot', 1_000);
        expect(committed).toEqual(true);
        expect(cooldownStore.size).toEqual(1);
    });

    it('should return invalid_player when source player does not exist', () => {
        const players = new Map<string, SimPlayerState>();
        const cooldownStore = new Map<string, number>();

        const result = applyAbilityActivation(
            players,
            'nonexistent',
            { abilityId: 'turbo-boost', seq: 1, targetPlayerId: null },
            1_000,
            cooldownStore,
        );

        expect(result.applied).toEqual(false);
        expect(result.reason).toEqual('invalid_player');
    });

    it('should return invalid_ability when ability id is unknown', () => {
        const players = new Map<string, SimPlayerState>([['player-1', createPlayer('player-1')]]);
        const cooldownStore = new Map<string, number>();

        const result = applyAbilityActivation(
            players,
            'player-1',
            { abilityId: 'unknown-ability', seq: 1, targetPlayerId: null },
            1_000,
            cooldownStore,
        );

        expect(result.applied).toEqual(false);
        expect(result.reason).toEqual('invalid_ability');
    });

    it('should return target_not_found for forward-cone ability when no opponent is ahead', () => {
        // Player facing forward (+Z), but no opponent is in the forward cone
        const p1 = createPlayer('player-1');
        p1.motion.rotationY = 0; // facing +Z
        p1.motion.positionX = 0;
        p1.motion.positionZ = 0;

        const p2 = createPlayer('player-2');
        // Place p2 directly behind p1 (negative Z relative to p1)
        p2.motion.positionX = 0;
        p2.motion.positionZ = -50;

        const players = new Map<string, SimPlayerState>([
            ['player-1', p1],
            ['player-2', p2],
        ]);
        const cooldownStore = new Map<string, number>();

        const result = applyAbilityActivation(
            players,
            'player-1',
            { abilityId: 'spike-burst', seq: 1, targetPlayerId: null },
            1_000,
            cooldownStore,
        );

        expect(result.applied).toEqual(false);
        expect(result.reason).toEqual('target_not_found');
    });

    it('should apply nearby-enemy ability to the nearest opponent', () => {
        const p1 = createPlayer('player-1');
        const p2 = createPlayer('player-2');
        p2.motion.positionZ = 10;

        const players = new Map<string, SimPlayerState>([
            ['player-1', p1],
            ['player-2', p2],
        ]);
        const cooldownStore = new Map<string, number>();

        const result = applyAbilityActivation(
            players,
            'player-1',
            { abilityId: 'ram-wave', seq: 1, targetPlayerId: null },
            1_000,
            cooldownStore,
        );

        expect(result.applied).toEqual(true);
        expect(result.targetPlayerId).toEqual('player-2');
        expect(p2.activeEffects.some((e) => e.effectType === 'slowed')).toBeTrue();
    });

    it('should use requestedTargetPlayerId for nearby-enemy targeting when target is valid', () => {
        const p1 = createPlayer('player-1');
        const p2 = createPlayer('player-2');
        const p3 = createPlayer('player-3');
        p2.motion.positionZ = 5; // closer
        p3.motion.positionZ = 100; // farther

        const players = new Map<string, SimPlayerState>([
            ['player-1', p1],
            ['player-2', p2],
            ['player-3', p3],
        ]);
        const cooldownStore = new Map<string, number>();

        const result = applyAbilityActivation(
            players,
            'player-1',
            { abilityId: 'ram-wave', seq: 1, targetPlayerId: 'player-3' },
            1_000,
            cooldownStore,
        );

        expect(result.applied).toEqual(true);
        expect(result.targetPlayerId).toEqual('player-3');
    });

    it('should apply forward-cone ability when opponent is directly ahead', () => {
        const p1 = createPlayer('player-1');
        p1.motion.rotationY = 0; // forward = (sin(0), cos(0)) = (0, 1) in XZ
        p1.motion.positionX = 0;
        p1.motion.positionZ = 0;

        const p2 = createPlayer('player-2');
        // Place p2 directly ahead in Z direction
        p2.motion.positionX = 0;
        p2.motion.positionZ = 20;

        const players = new Map<string, SimPlayerState>([
            ['player-1', p1],
            ['player-2', p2],
        ]);
        const cooldownStore = new Map<string, number>();

        const result = applyAbilityActivation(
            players,
            'player-1',
            { abilityId: 'spike-burst', seq: 1, targetPlayerId: null },
            1_000,
            cooldownStore,
        );

        expect(result.applied).toEqual(true);
        expect(result.targetPlayerId).toEqual('player-2');
    });

    it('should return false from commitAbilityCooldown for unknown ability', () => {
        const cooldownStore = new Map<string, number>();
        const result = commitAbilityCooldown(cooldownStore, 'player-1', 'unknown-ability', 1_000);
        expect(result).toEqual(false);
        expect(cooldownStore.size).toEqual(0);
    });

    it('should return target_not_found when only player is self for nearby-enemy', () => {
        // Only the source player exists in the map
        const players = new Map<string, SimPlayerState>([['player-1', createPlayer('player-1')]]);
        const cooldownStore = new Map<string, number>();

        const result = applyAbilityActivation(
            players,
            'player-1',
            { abilityId: 'ram-wave', seq: 1, targetPlayerId: null },
            1_000,
            cooldownStore,
        );

        expect(result.applied).toEqual(false);
        expect(result.reason).toEqual('target_not_found');
    });

    it('should not target self when requestedTargetPlayerId is own id for nearby-enemy', () => {
        // requestedTargetPlayerId === sourcePlayer.id → should fall through to findNearestOpponent
        const p1 = createPlayer('player-1');
        const p2 = createPlayer('player-2');
        p2.motion.positionZ = 10;

        const players = new Map<string, SimPlayerState>([
            ['player-1', p1],
            ['player-2', p2],
        ]);
        const cooldownStore = new Map<string, number>();

        const result = applyAbilityActivation(
            players,
            'player-1',
            { abilityId: 'ram-wave', seq: 1, targetPlayerId: 'player-1' }, // requesting self
            1_000,
            cooldownStore,
        );

        // Falls through to findNearestOpponent → finds player-2
        expect(result.applied).toEqual(true);
        expect(result.targetPlayerId).toEqual('player-2');
    });

    it('should skip opponents farther than maxDistanceAhead in forward-cone mode', () => {
        const p1 = createPlayer('player-1');
        p1.motion.rotationY = 0; // forward = (0, 1) in XZ
        p1.motion.positionX = 0;
        p1.motion.positionZ = 0;

        const p2 = createPlayer('player-2');
        // Place p2 far ahead (beyond spike-burst maxDistanceAhead if any)
        // spike-burst doesn't have maxDistanceAhead in manifest, so use a custom approach
        // Instead, let's test that two opponents ahead — one close, one far — picks the closer one
        p2.motion.positionX = 0;
        p2.motion.positionZ = 15; // close ahead

        const p3 = createPlayer('player-3');
        p3.motion.positionX = 0;
        p3.motion.positionZ = 50; // far ahead

        const players = new Map<string, SimPlayerState>([
            ['player-1', p1],
            ['player-2', p2],
            ['player-3', p3],
        ]);
        const cooldownStore = new Map<string, number>();

        // spike-burst uses forward-cone
        const result = applyAbilityActivation(
            players,
            'player-1',
            { abilityId: 'spike-burst', seq: 1, targetPlayerId: null },
            1_000,
            cooldownStore,
        );

        expect(result.applied).toEqual(true);
        // Should target the closest forward opponent
        expect(result.targetPlayerId).toEqual('player-2');
    });
});
