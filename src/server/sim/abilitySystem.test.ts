import { describe, expect, it } from 'bun:test';
import { applyAbilityActivation } from '@/server/sim/abilitySystem';
import type { SimPlayerState } from '@/server/sim/types';

const createPlayer = (id: string): SimPlayerState => {
    return {
        activeEffects: [],
        colorId: 'red',
        id,
        inputState: {
            boost: false,
            brake: false,
            handbrake: false,
            steering: 0,
            throttle: 0,
        },
        lastProcessedInputSeq: 0,
        motion: {
            positionX: 0,
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
            cooldownStore
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
            cooldownStore
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
            cooldownStore
        );

        expect(first.applied).toEqual(true);
        expect(second.applied).toEqual(false);
        expect(second.reason).toEqual('cooldown');
    });
});
