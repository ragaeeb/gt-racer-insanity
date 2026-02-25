import { describe, expect, it } from 'bun:test';
import { DEFAULT_MIX_STATE_TUNING, getMixStateForPhase, type RacePhase } from '../mixStateManager';

describe('Mix State Manager — getMixStateForPhase', () => {
    it('should return high music and low engine for pre-race', () => {
        const mix = getMixStateForPhase('pre-race');
        expect(mix.musicGain).toBeGreaterThan(mix.engineGain);
        expect(mix.musicGain).toBe(DEFAULT_MIX_STATE_TUNING.preRace.musicGain);
        expect(mix.engineGain).toBe(DEFAULT_MIX_STATE_TUNING.preRace.engineGain);
    });

    it('should return dominant engine and lower music for racing', () => {
        const mix = getMixStateForPhase('racing');
        expect(mix.engineGain).toBeGreaterThan(mix.musicGain);
        expect(mix.musicGain).toBe(DEFAULT_MIX_STATE_TUNING.racing.musicGain);
        expect(mix.engineGain).toBe(DEFAULT_MIX_STATE_TUNING.racing.engineGain);
    });

    it('should return highest music and lowest engine for post-race', () => {
        const preRaceMix = getMixStateForPhase('pre-race');
        const postRaceMix = getMixStateForPhase('post-race');
        expect(postRaceMix.musicGain).toBeGreaterThanOrEqual(preRaceMix.musicGain);
        expect(postRaceMix.engineGain).toBeLessThan(preRaceMix.engineGain);
    });

    it('should return custom tuning values when provided', () => {
        const customTuning = {
            ...DEFAULT_MIX_STATE_TUNING,
            racing: { musicGain: 0.1, engineGain: 0.9, effectsGain: 0.9 },
        };
        const mix = getMixStateForPhase('racing', customTuning);
        expect(mix.musicGain).toBe(0.1);
        expect(mix.engineGain).toBe(0.9);
    });

    it('should cover all three race phases without throwing', () => {
        const phases: RacePhase[] = ['pre-race', 'racing', 'post-race'];
        for (const phase of phases) {
            expect(() => getMixStateForPhase(phase)).not.toThrow();
        }
    });

    it('should have all gain values in [0, 1] range', () => {
        const phases: RacePhase[] = ['pre-race', 'racing', 'post-race'];
        for (const phase of phases) {
            const mix = getMixStateForPhase(phase);
            expect(mix.musicGain).toBeGreaterThanOrEqual(0);
            expect(mix.musicGain).toBeLessThanOrEqual(1);
            expect(mix.engineGain).toBeGreaterThanOrEqual(0);
            expect(mix.engineGain).toBeLessThanOrEqual(1);
            expect(mix.effectsGain).toBeGreaterThanOrEqual(0);
            expect(mix.effectsGain).toBeLessThanOrEqual(1);
        }
    });
});
