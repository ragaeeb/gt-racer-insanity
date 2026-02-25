import type { StatusEffectType } from '@/shared/network/snapshot';

export type AbilityTargeting = 'self' | 'forward-cone' | 'nearby-enemy';

/**
 * How the ability applies its effect:
 * - `'instant'` — applies the status effect immediately to the resolved target
 * - `'projectile'` — spawns a homing projectile that applies the effect on hit
 */
export type AbilityDelivery = 'instant' | 'projectile';

export type AbilityManifest = {
    baseCooldownMs: number;
    /** How the effect reaches its target. Default: 'instant'. */
    delivery: AbilityDelivery;
    description: string;
    effectId: StatusEffectType;
    id: string;
    label: string;
    /** Optional max distance ahead for forward-cone targeting (meters). */
    maxDistanceAhead?: number;
    targeting: AbilityTargeting;
};

export const ABILITY_MANIFESTS: AbilityManifest[] = [
    {
        baseCooldownMs: 8_000,
        delivery: 'instant',
        description: 'Instant speed surge for a short burst window.',
        effectId: 'boosted',
        id: 'turbo-boost',
        label: 'Turbo Boost',
        targeting: 'self',
    },
    {
        baseCooldownMs: 9_000,
        delivery: 'instant',
        description: 'Impulse wave that slows nearby opponents.',
        effectId: 'slowed',
        id: 'ram-wave',
        label: 'Ram Wave',
        targeting: 'nearby-enemy',
    },
    {
        baseCooldownMs: 7_000,
        delivery: 'projectile',
        description: 'Launches a homing EMP that stuns the nearest opponent on hit.',
        effectId: 'stunned',
        id: 'spike-shot',
        label: 'Homing EMP',
        targeting: 'nearby-enemy',
    },
    {
        baseCooldownMs: 10_000,
        delivery: 'instant',
        description: 'Launches spikes in a forward cone to flatten tires.',
        effectId: 'flat_tire',
        id: 'spike-burst',
        label: 'Spike Burst',
        targeting: 'forward-cone',
    },
];

export const getAbilityManifestById = (abilityId: string): AbilityManifest | null => {
    return ABILITY_MANIFESTS.find((ability) => ability.id === abilityId) ?? null;
};
