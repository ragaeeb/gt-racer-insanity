export type AbilityTargeting = 'self' | 'forward-cone' | 'nearby-enemy';

export type AbilityManifest = {
    baseCooldownMs: number;
    description: string;
    effectId: string;
    id: string;
    label: string;
    targeting: AbilityTargeting;
};

export const ABILITY_MANIFESTS: AbilityManifest[] = [
    {
        baseCooldownMs: 8_000,
        description: 'Instant speed surge for a short burst window.',
        effectId: 'boosted',
        id: 'turbo-boost',
        label: 'Turbo Boost',
        targeting: 'self',
    },
    {
        baseCooldownMs: 9_000,
        description: 'Impulse wave that slows nearby opponents.',
        effectId: 'slowed',
        id: 'ram-wave',
        label: 'Ram Wave',
        targeting: 'nearby-enemy',
    },
    {
        baseCooldownMs: 10_000,
        description: 'Drops spikes behind the car to flatten tires.',
        effectId: 'flat_tire',
        id: 'spike-burst',
        label: 'Spike Burst',
        targeting: 'forward-cone',
    },
];

export const getAbilityManifestById = (abilityId: string): AbilityManifest | null => {
    return ABILITY_MANIFESTS.find((ability) => ability.id === abilityId) ?? null;
};
