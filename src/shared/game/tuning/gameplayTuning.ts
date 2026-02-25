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
        preRace: { musicGain: number; engineGain: number; effectsGain: number };
        racing: { musicGain: number; engineGain: number; effectsGain: number };
        postRace: { musicGain: number; engineGain: number; effectsGain: number };
    };
};

export type CombatTuning = {
    /** Max deployables any single player may have active simultaneously. */
    deployableMaxPerPlayer: number;
    /** Max deployables across the entire room. */
    deployableMaxPerRoom: number;
    /** Radius of an oil slick deployable in meters. */
    deployableOilSlickRadius: number;
    /** Lifetime of an oil slick in ticks (600 = 10s @ 60Hz). */
    deployableOilSlickLifetimeTicks: number;
    /** Spawn offset behind the deploying player in meters. */
    deployableOilSlickSpawnDistance: number;
    /** Duration of the slippery/slowed effect applied by oil slick (ms). */
    deployableOilSlickEffectDurationMs: number;
    /** Max projectiles any single player may have active simultaneously. */
    projectileMaxPerPlayer: number;
    /** Max projectiles across the entire room. */
    projectileMaxPerRoom: number;
    /** Projectile travel speed in m/s. */
    projectileSpeed: number;
    /** Time-to-live in ticks (120 = 2s @ 60Hz). */
    projectileTtlTicks: number;
    /** Distance within which a projectile hits its target (meters). */
    projectileHitRadius: number;
    /** Maximum turn rate in rad/s for proportional navigation steering. */
    projectileTurnRate: number;
    /** Immunity window after being hit by a projectile (ms). */
    projectileHitImmunityMs: number;
    /** Duration of the stunned effect applied on projectile hit (ms). */
    stunnedEffectDurationMs: number;
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
            preRace: { musicGain: 0.8, engineGain: 0.3, effectsGain: 0.5 },
            racing: { musicGain: 0.4, engineGain: 0.7, effectsGain: 0.8 },
            postRace: { musicGain: 0.9, engineGain: 0.2, effectsGain: 0.5 },
        },
    },
    combat: {
        deployableMaxPerPlayer: 1,
        deployableMaxPerRoom: 8,
        deployableOilSlickRadius: 3.5,
        deployableOilSlickLifetimeTicks: 600,
        deployableOilSlickSpawnDistance: 5,
        deployableOilSlickEffectDurationMs: 2000,
        projectileMaxPerPlayer: 1,
        projectileMaxPerRoom: 8,
        projectileSpeed: 25,
        projectileTtlTicks: 120,
        projectileHitRadius: 2.5,
        projectileTurnRate: 3.0,
        projectileHitImmunityMs: 1500,
        stunnedEffectDurationMs: 1500,
    },
};
