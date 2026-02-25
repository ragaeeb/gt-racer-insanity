import { describe, expect, it } from 'bun:test';
import { DEFAULT_MIX_STATE_TUNING, getMixStateForPhase, MixStateManager, type RacePhase } from '../mixStateManager';

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

describe('MixStateManager class', () => {
    const createMockAudioContext = () => {
        const mockGainNode = () => {
            const gain = {
                value: 1,
                setValueAtTime: require('bun:test').mock(),
                linearRampToValueAtTime: require('bun:test').mock(),
                cancelScheduledValues: require('bun:test').mock(),
            };
            return {
                context: { currentTime: 10 },
                gain,
                connect: require('bun:test').mock(),
                disconnect: require('bun:test').mock(),
            };
        };

        return {
            createGain: () => mockGainNode(),
            destination: {},
            currentTime: 10,
        } as unknown as AudioContext;
    };

    it('should initialize with pre-race values and connect to destination', () => {
        const ctx = createMockAudioContext();
        const manager = new MixStateManager(ctx);

        expect(manager.getPhase()).toBe('pre-race');

        const channels = manager.getChannels();
        expect(channels.music.connect).toHaveBeenCalledWith(ctx.destination);
        expect(channels.engine.connect).toHaveBeenCalledWith(ctx.destination);
        expect(channels.effects.connect).toHaveBeenCalledWith(ctx.destination);

        expect(channels.music.gain.value).toBe(DEFAULT_MIX_STATE_TUNING.preRace.musicGain);
        expect(channels.engine.gain.value).toBe(DEFAULT_MIX_STATE_TUNING.preRace.engineGain);
        expect(channels.effects.gain.value).toBe(DEFAULT_MIX_STATE_TUNING.preRace.effectsGain);
    });

    it('should transition crossfade to racing then post-race with correct times', () => {
        const ctx = createMockAudioContext();
        const manager = new MixStateManager(ctx);

        const channels = manager.getChannels();

        // Before 1st ramp check, ensure we mock context time properly
        // @ts-expect-error Mocking readonly property
        channels.music.context.currentTime = 20;

        manager.setPhase('racing');

        expect(manager.getPhase()).toBe('racing');

        const expectedEnd = 20 + DEFAULT_MIX_STATE_TUNING.crossfadeDurationSec;
        expect(channels.music.gain.cancelScheduledValues).toHaveBeenCalledWith(20);
        expect(channels.music.gain.setValueAtTime).toHaveBeenCalledWith(channels.music.gain.value, 20);
        expect(channels.music.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
            DEFAULT_MIX_STATE_TUNING.racing.musicGain,
            expectedEnd,
        );
        expect(channels.engine.gain.cancelScheduledValues).toHaveBeenCalledWith(20);
        expect(channels.engine.gain.setValueAtTime).toHaveBeenCalledWith(channels.engine.gain.value, 20);
        expect(channels.engine.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
            DEFAULT_MIX_STATE_TUNING.racing.engineGain,
            expectedEnd,
        );
        expect(channels.effects.gain.cancelScheduledValues).toHaveBeenCalledWith(20);
        expect(channels.effects.gain.setValueAtTime).toHaveBeenCalledWith(channels.effects.gain.value, 20);
        expect(channels.effects.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
            DEFAULT_MIX_STATE_TUNING.racing.effectsGain,
            expectedEnd,
        );

        // Transition to post-race
        // @ts-expect-error Mocking readonly property
        channels.music.context.currentTime = 30;
        manager.setPhase('post-race');

        const expectedEndPost = 30 + DEFAULT_MIX_STATE_TUNING.crossfadeDurationSec;
        expect(channels.music.gain.cancelScheduledValues).toHaveBeenCalledWith(30);
        expect(channels.music.gain.setValueAtTime).toHaveBeenCalledWith(channels.music.gain.value, 30);
        expect(channels.music.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
            DEFAULT_MIX_STATE_TUNING.postRace.musicGain,
            expectedEndPost,
        );
    });

    it('should disconnect nodes on dispose', () => {
        const ctx = createMockAudioContext();
        const manager = new MixStateManager(ctx);
        const channels = manager.getChannels();

        manager.dispose();

        expect(channels.music.disconnect).toHaveBeenCalled();
        expect(channels.engine.disconnect).toHaveBeenCalled();
        expect(channels.effects.disconnect).toHaveBeenCalled();
    });
});
