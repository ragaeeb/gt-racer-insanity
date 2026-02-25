/**
 * Race phase audio mix state manager.
 *
 * Maps race lifecycle phases to master GainNode levels on three channels:
 *   - music:   background music bus
 *   - engine:  all car engine sounds
 *   - effects: SFX (surface audio, brakes, etc.)
 *
 * Cross-fades between states over 500ms to prevent jarring cuts.
 *
 * Usage:
 *   const mgr = new MixStateManager(audioContext);
 *   mgr.setPhase('racing');
 *   // Wire engine sources to mgr.getChannels().engine
 */

export type RacePhase = 'pre-race' | 'racing' | 'post-race';

export type MixState = {
    musicGain: number;
    engineGain: number;
    effectsGain: number;
};

export type MixStateTuning = {
    preRace: MixState;
    racing: MixState;
    postRace: MixState;
    /** Cross-fade duration in seconds */
    crossfadeDurationSec: number;
};

export const DEFAULT_MIX_STATE_TUNING: MixStateTuning = {
    preRace: { musicGain: 0.8, engineGain: 0.3, effectsGain: 0.5 },
    racing: { musicGain: 0.4, engineGain: 0.7, effectsGain: 0.8 },
    postRace: { musicGain: 0.9, engineGain: 0.2, effectsGain: 0.5 },
    crossfadeDurationSec: 0.5,
};

/**
 * Returns the mix state gains for a given race phase.
 * Pure function — easy to unit test without audio context.
 */
export const getMixStateForPhase = (phase: RacePhase, tuning: MixStateTuning = DEFAULT_MIX_STATE_TUNING): MixState => {
    switch (phase) {
        case 'pre-race':
            return tuning.preRace;
        case 'racing':
            return tuning.racing;
        case 'post-race':
            return tuning.postRace;
    }
};

export class MixStateManager {
    private currentPhase: RacePhase = 'pre-race';
    private readonly musicGainNode: GainNode;
    private readonly engineGainNode: GainNode;
    private readonly effectsGainNode: GainNode;
    private readonly tuning: MixStateTuning;

    constructor(audioContext: AudioContext, tuning: MixStateTuning = DEFAULT_MIX_STATE_TUNING) {
        this.tuning = tuning;
        this.musicGainNode = audioContext.createGain();
        this.engineGainNode = audioContext.createGain();
        this.effectsGainNode = audioContext.createGain();

        // Connect all channels to destination so consumers can wire into them
        this.musicGainNode.connect(audioContext.destination);
        this.engineGainNode.connect(audioContext.destination);
        this.effectsGainNode.connect(audioContext.destination);

        // Apply pre-race gains immediately (no ramp on first set)
        const initialMix = getMixStateForPhase('pre-race', tuning);
        this.musicGainNode.gain.value = initialMix.musicGain;
        this.engineGainNode.gain.value = initialMix.engineGain;
        this.effectsGainNode.gain.value = initialMix.effectsGain;
    }

    /** Transition to the given race phase, cross-fading over configured duration. */
    public setPhase = (phase: RacePhase): void => {
        if (phase === this.currentPhase) {
            return;
        }

        this.currentPhase = phase;
        const mix = getMixStateForPhase(phase, this.tuning);
        const now = this.musicGainNode.context.currentTime;
        const end = now + this.tuning.crossfadeDurationSec;

        this.musicGainNode.gain.linearRampToValueAtTime(mix.musicGain, end);
        this.engineGainNode.gain.linearRampToValueAtTime(mix.engineGain, end);
        this.effectsGainNode.gain.linearRampToValueAtTime(mix.effectsGain, end);
    };

    public getPhase = (): RacePhase => this.currentPhase;

    /** Returns the three channel GainNodes for wiring sources into. */
    public getChannels = () => ({
        music: this.musicGainNode,
        engine: this.engineGainNode,
        effects: this.effectsGainNode,
    });

    public dispose = (): void => {
        this.musicGainNode.disconnect();
        this.engineGainNode.disconnect();
        this.effectsGainNode.disconnect();
    };
}
