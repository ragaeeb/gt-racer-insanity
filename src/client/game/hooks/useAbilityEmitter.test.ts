import { describe, expect, it } from 'bun:test';
import { canEmitAbilityActivation } from '@/client/game/hooks/useAbilityEmitter';

describe('canEmitAbilityActivation', () => {
    it('should return false when key was not just pressed', () => {
        expect(
            canEmitAbilityActivation({
                abilityOffCooldown: true,
                abilityUseLimitPerRace: Infinity,
                abilityUsesThisRace: 0,
                justPressed: false,
            }),
        ).toBeFalse();
    });

    it('should return false when ability is on cooldown', () => {
        expect(
            canEmitAbilityActivation({
                abilityOffCooldown: false,
                abilityUseLimitPerRace: Infinity,
                abilityUsesThisRace: 0,
                justPressed: true,
            }),
        ).toBeFalse();
    });

    it('should return false when finite per-race usage limit is exhausted', () => {
        expect(
            canEmitAbilityActivation({
                abilityOffCooldown: true,
                abilityUseLimitPerRace: 3,
                abilityUsesThisRace: 3,
                justPressed: true,
            }),
        ).toBeFalse();
    });

    it('should return true when finite per-race usage limit has remaining uses', () => {
        expect(
            canEmitAbilityActivation({
                abilityOffCooldown: true,
                abilityUseLimitPerRace: 3,
                abilityUsesThisRace: 2,
                justPressed: true,
            }),
        ).toBeTrue();
    });

    it('should allow activation for unlimited abilities', () => {
        expect(
            canEmitAbilityActivation({
                abilityOffCooldown: true,
                abilityUseLimitPerRace: Infinity,
                abilityUsesThisRace: 999,
                justPressed: true,
            }),
        ).toBeTrue();
    });
});
