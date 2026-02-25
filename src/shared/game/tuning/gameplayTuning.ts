export type DriftTuning = {
    // M1 will add: initiationSpeedThreshold, lateralFriction values, boost tiers, etc.
};

export type CollisionTuning = {
    // M1 will add: maxImpulse, arcadeBias, stun durations, etc.
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
    drift: {},
    collision: {},
    audio: {},
    combat: {},
};
