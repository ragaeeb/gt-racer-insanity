import type { DriftConfig } from '@/shared/game/vehicle/driftConfig';
import { DEFAULT_DRIFT_CONFIG } from '@/shared/game/vehicle/driftConfig';

export type DriftTuning = DriftConfig;

export type CollisionTuning = {
    /** Hard impulse clamp in N·s — prevents physics explosions (R04 mitigation). */
    maxImpulse: number;
    /** Newton's-3rd reaction multiplier for attacker. 0.3 = trucks feel powerful. */
    arcadeBias: number;
    /** Base stun duration applied on big impacts (ms). */
    stunBaseDurationMs: number;
    /** Contact force divisor — normalises raw Rapier force into 0–2 impulse scale. */
    forceNormalisationBase: number;
};

export type AudioTuning = {
    doppler: {
        /** Dampening coefficient — lower = less extreme pitch shift (0.3-0.5 recommended) */
        coefficient: number;
        /** Speed of sound in m/s (default ~343 at sea level) */
        speedOfSound: number;
        /** Minimum playback rate clamp */
        minRate: number;
        /** Maximum playback rate clamp */
        maxRate: number;
    };
    rpm: {
        rpmLayerCrossfadePoints: [number, number];
        gearShiftPitchDip: number;
        gearShiftDipDurationMs: number;
    };
    surface: {
        /** Minimum speed (m/s) before tire squeal triggers on asphalt */
        asphaltSquealThreshold: number;
        /** Peak volume for gravel rumble at zero friction */
        gravelRumbleVolume: number;
        /** frictionMultiplier ≥ this value counts as high-friction (asphalt) for squeal */
        asphaltFrictionMin: number;
        /** frictionMultiplier < this value counts as low-friction (gravel) for rumble */
        gravelFrictionMax: number;
    };
    mix: {
        /** Cross-fade duration in seconds between race phase transitions */
        crossfadeDurationSec: number;
        preRace: { music: number; engine: number; effects: number };
        racing: { music: number; engine: number; effects: number };
        postRace: { music: number; engine: number; effects: number };
    };
};

export type CombatTuning = {
    // M3 will add: projectile speed/TTL, deployable radius/lifetime, caps, etc.
};

export type GameplayTuningConfig = {
    drift: DriftTuning;
    collision: CollisionTuning;
    audio: AudioTuning;
    combat: CombatTuning;
};

export const DEFAULT_GAMEPLAY_TUNING: GameplayTuningConfig = {
    drift: { ...DEFAULT_DRIFT_CONFIG },
    collision: {
        maxImpulse: 800,
        arcadeBias: 0.3,
        stunBaseDurationMs: 300,
        forceNormalisationBase: 500,
    },
    audio: {
        doppler: {
            coefficient: 0.4,
            speedOfSound: 343,
            minRate: 0.5,
            maxRate: 2.0,
        },
        rpm: {
            rpmLayerCrossfadePoints: [0.33, 0.66],
            gearShiftPitchDip: 0.8,
            gearShiftDipDurationMs: 80,
        },
        surface: {
            asphaltSquealThreshold: 15,
            gravelRumbleVolume: 0.5,
            asphaltFrictionMin: 0.9,
            gravelFrictionMax: 0.8,
        },
        mix: {
            crossfadeDurationSec: 0.5,
            preRace: { music: 0.8, engine: 0.3, effects: 0.5 },
            racing: { music: 0.4, engine: 0.7, effects: 0.8 },
            postRace: { music: 0.9, engine: 0.2, effects: 0.5 },
        },
    },
    combat: {},
};
