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
    // M2 will add: dopplerCoefficient, RPM layer configs, mix state volumes, etc.
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
    audio: {},
    combat: {},
};
