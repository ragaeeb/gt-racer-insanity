export type HazardBehavior = 'static' | 'moving';

export type HazardManifest = {
    collisionRadius: number;
    id: string;
    label: string;
    movementAmplitude: number;
    movementSpeed: number;
    statusEffectId: 'flat_tire' | 'stunned' | 'slowed';
    type: HazardBehavior;
};

export const HAZARD_MANIFESTS: HazardManifest[] = [
    {
        collisionRadius: 1.4,
        id: 'spike-strip',
        label: 'Spike Strip',
        movementAmplitude: 0,
        movementSpeed: 0,
        statusEffectId: 'flat_tire',
        type: 'static',
    },
    {
        collisionRadius: 1.8,
        id: 'swing-hammer',
        label: 'Swing Hammer',
        movementAmplitude: 4,
        movementSpeed: 1.2,
        statusEffectId: 'stunned',
        type: 'moving',
    },
    {
        collisionRadius: 1.5,
        id: 'oil-slick',
        label: 'Oil Slick',
        movementAmplitude: 0,
        movementSpeed: 0,
        statusEffectId: 'slowed',
        type: 'static',
    },
];

export const getHazardManifestById = (hazardId: string): HazardManifest | null => {
    return HAZARD_MANIFESTS.find((hazard) => hazard.id === hazardId) ?? null;
};
