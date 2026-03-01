import { describe, expect, it } from 'bun:test';
import { buildAbilityIndicatorPresentation } from '@/components/AbilityIndicator';

describe('buildAbilityIndicatorPresentation', () => {
    it('should present exhausted state when uses are depleted', () => {
        const result = buildAbilityIndicatorPresentation({
            abilityLabel: 'Turbo Boost',
            nowMs: 1_000,
            readyAtMs: 1_500,
            remainingUses: 0,
        });

        expect(result.isExhausted).toBeTrue();
        expect(result.isReady).toBeFalse();
        expect(result.label).toBe('Turbo Boost: NO USES LEFT');
    });

    it('should present cooldown state when still recharging', () => {
        const result = buildAbilityIndicatorPresentation({
            abilityLabel: 'Turbo Boost',
            nowMs: 1_000,
            readyAtMs: 2_500,
            remainingUses: null,
        });

        expect(result.isExhausted).toBeFalse();
        expect(result.isReady).toBeFalse();
        expect(result.label).toBe('Turbo Boost: 1.5s');
    });

    it('should include suffix during cooldown for finite abilities', () => {
        const result = buildAbilityIndicatorPresentation({
            abilityLabel: 'Turbo Boost',
            nowMs: 1_000,
            readyAtMs: 2_500,
            remainingUses: 2,
        });

        expect(result.isExhausted).toBeFalse();
        expect(result.isReady).toBeFalse();
        expect(result.suffix).toBe('2 LEFT');
    });

    it('should present ready state when no cooldown remains', () => {
        const result = buildAbilityIndicatorPresentation({
            abilityLabel: 'Turbo Boost',
            nowMs: 2_500,
            readyAtMs: 2_500,
            remainingUses: 2,
        });

        expect(result.isExhausted).toBeFalse();
        expect(result.isReady).toBeTrue();
        expect(result.label).toBe('Turbo Boost: READY');
    });

    it('should include remaining-use count for finite abilities', () => {
        const result = buildAbilityIndicatorPresentation({
            abilityLabel: 'Turbo Boost',
            nowMs: 2_500,
            readyAtMs: 2_500,
            remainingUses: 2,
        });

        expect(result.suffix).toBe('2 LEFT');
    });
});
