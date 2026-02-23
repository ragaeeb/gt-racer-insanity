import type { StatusEffectType } from '@/shared/network/snapshot';

export type StatusEffectManifest = {
    defaultDurationMs: number;
    id: StatusEffectType;
    movementMultiplier: number;
    steeringMultiplier: number;
};

export const BOOST_DURATION_MS = 3_000;
export const BOOST_MOVEMENT_MULTIPLIER = 1.5;
export const FLAT_TIRE_DURATION_MS = 5_000;
export const FLAT_TIRE_MOVEMENT_MULTIPLIER = 0.45;
export const FLAT_TIRE_STEERING_MULTIPLIER = 0.5;
export const SLOWED_DURATION_MS = 2_500;
export const SLOWED_MOVEMENT_MULTIPLIER = 0.7;
export const SLOWED_STEERING_MULTIPLIER = 0.85;
export const STUNNED_DURATION_MS = 1_600;
export const STUNNED_MOVEMENT_MULTIPLIER = 0;
export const STUNNED_STEERING_MULTIPLIER = 0.2;

export const STATUS_EFFECT_MANIFESTS: StatusEffectManifest[] = [
    {
        defaultDurationMs: BOOST_DURATION_MS,
        id: 'boosted',
        movementMultiplier: BOOST_MOVEMENT_MULTIPLIER,
        steeringMultiplier: 1,
    },
    {
        defaultDurationMs: SLOWED_DURATION_MS,
        id: 'slowed',
        movementMultiplier: SLOWED_MOVEMENT_MULTIPLIER,
        steeringMultiplier: SLOWED_STEERING_MULTIPLIER,
    },
    {
        defaultDurationMs: STUNNED_DURATION_MS,
        id: 'stunned',
        movementMultiplier: STUNNED_MOVEMENT_MULTIPLIER,
        steeringMultiplier: STUNNED_STEERING_MULTIPLIER,
    },
    {
        defaultDurationMs: FLAT_TIRE_DURATION_MS,
        id: 'flat_tire',
        movementMultiplier: FLAT_TIRE_MOVEMENT_MULTIPLIER,
        steeringMultiplier: FLAT_TIRE_STEERING_MULTIPLIER,
    },
];

export const getStatusEffectManifestById = (effectId: StatusEffectType): StatusEffectManifest | undefined => {
    return STATUS_EFFECT_MANIFESTS.find((effect) => effect.id === effectId);
};
