import * as THREE from 'three';

export type LayerGains = {
    idle: number;
    mid: number;
    high: number;
};

export type EngineLayerBuffers = {
    idle?: AudioBuffer;
    mid?: AudioBuffer;
    high?: AudioBuffer;
};

export type EngineLayerTuning = {
    rpmLayerCrossfadePoints: [number, number];
    gearShiftPitchDip: number;
    gearShiftDipDurationMs: number;
};

type DominantLayer = keyof LayerGains;

const clamp01 = (value: number) => THREE.MathUtils.clamp(value, 0, 1);

const normalizeGainSum = (gains: LayerGains): LayerGains => {
    const sum = gains.idle + gains.mid + gains.high;
    if (sum <= 0) {
        return { idle: 1, mid: 0, high: 0 };
    }

    return {
        idle: gains.idle / sum,
        mid: gains.mid / sum,
        high: gains.high / sum,
    };
};

export const calculateLayerGains = (
    speed: number,
    maxSpeed: number,
    crossfadePoints: [number, number] = [0.33, 0.66],
): LayerGains => {
    const [idleToMid, midToHigh] = crossfadePoints;
    const safeMaxSpeed = maxSpeed > 0 ? maxSpeed : 1;
    const normalizedSpeed = clamp01(speed / safeMaxSpeed);

    if (normalizedSpeed <= idleToMid) {
        const fadeWidth = Math.max(idleToMid, 0.001);
        const t = normalizedSpeed / fadeWidth;
        return normalizeGainSum({ idle: 1 - t, mid: t, high: 0 });
    }

    if (normalizedSpeed < midToHigh) {
        return { idle: 0, mid: 1, high: 0 };
    }

    const fadeWidth = Math.max(1 - midToHigh, 0.001);
    const t = clamp01((normalizedSpeed - midToHigh) / fadeWidth);
    return normalizeGainSum({ idle: 0, mid: 1 - t, high: t });
};

export class EngineLayerManager {
    private readonly idleSound?: THREE.PositionalAudio;
    private readonly midSound?: THREE.PositionalAudio;
    private readonly highSound?: THREE.PositionalAudio;
    private lastDominantLayer: DominantLayer = 'idle';
    private shiftDipRemainingMs = 0;
    private idleBaseRate = 1;
    private midBaseRate = 1;
    private highBaseRate = 1;
    private shiftDipRate = 1;
    private dopplerRate = 1;

    constructor(
        listener: THREE.AudioListener,
        buffers: EngineLayerBuffers,
        private readonly tuning: EngineLayerTuning,
    ) {
        this.idleSound = this.createLoopingLayer(listener, buffers.idle);
        this.midSound = this.createLoopingLayer(listener, buffers.mid);
        this.highSound = this.createLoopingLayer(listener, buffers.high);
    }

    private createLoopingLayer = (listener: THREE.AudioListener, buffer?: AudioBuffer) => {
        if (!buffer) {
            return undefined;
        }

        const sound = new THREE.PositionalAudio(listener);
        sound.setBuffer(buffer);
        sound.setRefDistance(10);
        sound.setLoop(true);
        sound.setVolume(0);

        if (listener.context.state === 'suspended') {
            listener.context
                .resume()
                .then(() => {
                    sound.play();
                })
                .catch((err: unknown) => {
                    console.warn('AudioContext resume failed, audio layer will not loop', err);
                });
        } else {
            sound.play();
        }

        return sound;
    };

    public attachTo = (mesh: THREE.Object3D) => {
        for (const sound of [this.idleSound, this.midSound, this.highSound]) {
            if (sound) {
                mesh.add(sound);
            }
        }
    };

    public update = (speed: number, maxSpeed: number, dt: number, masterGain = 1) => {
        const gains = calculateLayerGains(speed, maxSpeed, this.tuning.rpmLayerCrossfadePoints);
        this.idleSound?.setVolume(gains.idle * masterGain);
        this.midSound?.setVolume(gains.mid * masterGain);
        this.highSound?.setVolume(gains.high * masterGain);

        const dominantLayer = this.resolveDominantLayer(gains);
        if (dominantLayer !== this.lastDominantLayer) {
            this.shiftDipRemainingMs = this.tuning.gearShiftDipDurationMs;
            this.lastDominantLayer = dominantLayer;
        }

        this.shiftDipRemainingMs = Math.max(0, this.shiftDipRemainingMs - dt * 1000);
        this.shiftDipRate = this.shiftDipRemainingMs > 0 ? this.tuning.gearShiftPitchDip : 1;
        const normalizedSpeed = clamp01(maxSpeed > 0 ? speed / maxSpeed : 0);

        this.idleBaseRate = 0.82 + normalizedSpeed * 0.18;
        this.midBaseRate = 0.9 + normalizedSpeed * 0.25;
        this.highBaseRate = 1.02 + normalizedSpeed * 0.38;
        this.applyCombinedPlaybackRates();
    };

    private resolveDominantLayer = (gains: LayerGains): DominantLayer => {
        if (gains.mid >= gains.idle && gains.mid >= gains.high) {
            return 'mid';
        }
        if (gains.high >= gains.idle) {
            return 'high';
        }
        return 'idle';
    };

    public stop = () => {
        for (const sound of [this.idleSound, this.midSound, this.highSound]) {
            if (sound?.isPlaying) {
                sound.stop();
            }
        }
    };

    public restart = () => {
        for (const sound of [this.idleSound, this.midSound, this.highSound]) {
            if (sound && !sound.isPlaying) {
                sound.play();
            }
        }
    };

    public disconnectFrom = (mesh: THREE.Object3D) => {
        for (const sound of [this.idleSound, this.midSound, this.highSound]) {
            if (sound) {
                mesh.remove(sound);
                sound.disconnect();
            }
        }
    };

    /**
     * Set playback rate multiplier for all audio layers.
     * Used for Doppler effect on remote cars.
     * @param rate - Playback rate multiplier (e.g., 1.0 = normal, >1 = higher pitch, <1 = lower pitch)
     */
    public setPlaybackRate = (rate: number) => {
        this.dopplerRate = rate;
        this.applyCombinedPlaybackRates();
    };

    private applyCombinedPlaybackRates = () => {
        const multiplier = this.shiftDipRate * this.dopplerRate;
        this.idleSound?.setPlaybackRate(this.idleBaseRate * multiplier);
        this.midSound?.setPlaybackRate(this.midBaseRate * multiplier);
        this.highSound?.setPlaybackRate(this.highBaseRate * multiplier);
    };

    /**
     * Connect all audio layers through the mix state's engine gain node.
     * This enables race-phase-based volume control.
     */
    public connectToMixState = (mixStateManager?: import('./mixStateManager').MixStateManager) => {
        if (!mixStateManager) {
            return;
        }
        const channels = mixStateManager.getChannels();
        const engineGain = channels.engine;

        for (const sound of [this.idleSound, this.midSound, this.highSound]) {
            if (sound) {
                sound.gain.disconnect();
                sound.gain.connect(engineGain as unknown as globalThis.AudioNode);
            }
        }
    };
}
