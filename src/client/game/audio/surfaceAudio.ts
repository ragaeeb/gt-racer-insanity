/**
 * Surface-specific audio system for tire sounds.
 *
 * Drives two positional audio layers:
 *  - Squeal: plays on high-friction asphalt surfaces when drifting at speed.
 *  - Rumble: plays on low-friction surfaces (gravel/dirt) scaled by surface slip.
 *
 * Friction multiplier comes from TrackSegmentManifest.frictionMultiplier.
 * Screech pitch is modulated per surface: pitch = 0.7 + frictionMultiplier * 0.3
 * (formula from claude-sonnet-4.6-synthesis.md section 4.4 Qwen Surface Audio Modifiers).
 */

import * as THREE from 'three';

export type SurfaceAudioTuning = {
    /** Minimum speed (m/s) before tire squeal can trigger */
    asphaltSquealThreshold: number;
    /** Base volume for gravel rumble at zero friction */
    gravelRumbleVolume: number;
    /** frictionMultiplier cutoff above which surface counts as high-friction (asphalt) for squeal */
    asphaltFrictionMin: number;
    /** frictionMultiplier cutoff below which surface counts as low-friction (gravel) for rumble */
    gravelFrictionMax: number;
};

export const DEFAULT_SURFACE_AUDIO_TUNING: SurfaceAudioTuning = {
    asphaltSquealThreshold: 15,
    gravelRumbleVolume: 0.5,
    asphaltFrictionMin: 0.9,
    gravelFrictionMax: 0.8,
};

/**
 * Calculate tire squeal volume for a high-friction surface when drifting.
 *
 * @param speed - Current car speed in m/s
 * @param frictionMultiplier - Track segment friction (1.0 = asphalt)
 * @param isDrifting - Whether the car is currently in drift state
 * @param tuning - Surface audio tuning config
 * @returns Volume in [0, 1]
 */
export const calculateSquealVolume = (
    speed: number,
    frictionMultiplier: number,
    isDrifting: boolean,
    tuning: SurfaceAudioTuning = DEFAULT_SURFACE_AUDIO_TUNING,
): number => {
    if (frictionMultiplier < tuning.asphaltFrictionMin || !isDrifting || speed < tuning.asphaltSquealThreshold) {
        return 0;
    }
    return Math.min((speed - tuning.asphaltSquealThreshold) / 20, 1.0);
};

/**
 * Calculate squeal pitch, modulated per surface type.
 * Formula: pitch = 0.7 + frictionMultiplier * 0.3
 * - Asphalt (1.0): pitch = 1.0
 * - Canyon (0.92): pitch approx 0.976
 * - Grip pad (1.08): pitch approx 1.024
 *
 * @param frictionMultiplier - Track segment friction multiplier
 * @returns Playback rate for the squeal sound
 */
export const calculateSquealPitch = (frictionMultiplier: number): number => {
    return 0.7 + frictionMultiplier * 0.3;
};

/**
 * Calculate gravel rumble volume for low-friction surfaces.
 *
 * @param frictionMultiplier - Track segment friction
 * @param tuning - Surface audio tuning config
 * @returns Volume in [0, gravelRumbleVolume]
 */
export const calculateRumbleVolume = (
    frictionMultiplier: number,
    tuning: SurfaceAudioTuning = DEFAULT_SURFACE_AUDIO_TUNING,
): number => {
    const safeFriction = Number.isFinite(frictionMultiplier) ? THREE.MathUtils.clamp(frictionMultiplier, 0, 1) : 1;

    if (safeFriction >= tuning.gravelFrictionMax) {
        return 0;
    }

    return THREE.MathUtils.clamp((1.0 - safeFriction) * tuning.gravelRumbleVolume, 0, tuning.gravelRumbleVolume);
};

export class SurfaceAudioManager {
    private readonly squealSound?: THREE.PositionalAudio;
    private readonly rumbleSound?: THREE.PositionalAudio;
    private readonly tuning: SurfaceAudioTuning;

    constructor(
        listener: THREE.AudioListener,
        buffers: { squeal?: AudioBuffer; rumble?: AudioBuffer },
        tuning: SurfaceAudioTuning = DEFAULT_SURFACE_AUDIO_TUNING,
    ) {
        this.tuning = tuning;

        if (buffers.squeal) {
            this.squealSound = new THREE.PositionalAudio(listener);
            this.squealSound.setBuffer(buffers.squeal);
            this.squealSound.setRefDistance(10);
            this.squealSound.setLoop(true);
            this.squealSound.setVolume(0);
            this.squealSound.play();
        }

        if (buffers.rumble) {
            this.rumbleSound = new THREE.PositionalAudio(listener);
            this.rumbleSound.setBuffer(buffers.rumble);
            this.rumbleSound.setRefDistance(10);
            this.rumbleSound.setLoop(true);
            this.rumbleSound.setVolume(0);
            this.rumbleSound.play();
        }
    }

    public update = (speed: number, frictionMultiplier: number, isDrifting: boolean): void => {
        const squealVol = calculateSquealVolume(speed, frictionMultiplier, isDrifting, this.tuning);
        const squealPitch = calculateSquealPitch(frictionMultiplier);
        if (this.squealSound) {
            this.squealSound.setVolume(squealVol);
            this.squealSound.setPlaybackRate(squealPitch);
        }

        const rumbleVol = calculateRumbleVolume(frictionMultiplier, this.tuning);
        if (this.rumbleSound) {
            this.rumbleSound.setVolume(rumbleVol);
        }
    };

    public attachTo = (mesh: THREE.Object3D): void => {
        if (this.squealSound) {
            mesh.add(this.squealSound);
        }
        if (this.rumbleSound) {
            mesh.add(this.rumbleSound);
        }
    };

    public detachFrom = (mesh: THREE.Object3D): void => {
        if (this.squealSound) {
            mesh.remove(this.squealSound);
        }
        if (this.rumbleSound) {
            mesh.remove(this.rumbleSound);
        }
    };

    public stop = (): void => {
        if (this.squealSound?.isPlaying) {
            this.squealSound.stop();
        }
        if (this.rumbleSound?.isPlaying) {
            this.rumbleSound.stop();
        }
    };

    public restart = (): void => {
        if (this.squealSound && !this.squealSound.isPlaying) {
            this.squealSound.play();
        }
        if (this.rumbleSound && !this.rumbleSound.isPlaying) {
            this.rumbleSound.play();
        }
    };

    public dispose = (): void => {
        this.stop();
        if (this.squealSound) {
            this.squealSound.disconnect();
        }
        if (this.rumbleSound) {
            this.rumbleSound.disconnect();
        }
    };

    /**
     * Connect all surface audio layers through the mix state's effects gain node.
     * This enables race-phase-based volume control for tire sounds.
     */
    public connectToMixState = (mixStateManager?: import('./mixStateManager').MixStateManager) => {
        if (!mixStateManager) {
            return;
        }
        const channels = mixStateManager.getChannels();
        const effectsGain = channels.effects;

        if (this.squealSound) {
            this.squealSound.gain.disconnect();
            this.squealSound.gain.connect(effectsGain as unknown as globalThis.AudioNode);
        }
        if (this.rumbleSound) {
            this.rumbleSound.gain.disconnect();
            this.rumbleSound.gain.connect(effectsGain as unknown as globalThis.AudioNode);
        }
    };
}
