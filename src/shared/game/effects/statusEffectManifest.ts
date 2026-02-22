import type { StatusEffectType } from '@/shared/network/snapshot';

export type StatusEffectManifest = {
    defaultDurationMs: number;
    id: StatusEffectType;
    movementMultiplier: number;
    steeringMultiplier: number;
};

export const STATUS_EFFECT_MANIFESTS: StatusEffectManifest[] = [
    {
        defaultDurationMs: 2_000,
        id: 'boosted',
        movementMultiplier: 1.3,
        steeringMultiplier: 1,
    },
    {
        defaultDurationMs: 2_500,
        id: 'slowed',
        movementMultiplier: 0.7,
        steeringMultiplier: 0.85,
    },
    {
        defaultDurationMs: 1_600,
        id: 'stunned',
        movementMultiplier: 0,
        steeringMultiplier: 0.2,
    },
    {
        defaultDurationMs: 3_000,
        id: 'flat_tire',
        movementMultiplier: 0.55,
        steeringMultiplier: 0.6,
    },
];

export const getStatusEffectManifestById = (effectId: StatusEffectType): StatusEffectManifest => {
    return STATUS_EFFECT_MANIFESTS.find((effect) => effect.id === effectId) ?? STATUS_EFFECT_MANIFESTS[0];
};
