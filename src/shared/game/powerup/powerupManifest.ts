export type PowerupType = 'speed-boost' | 'ability-charge' | 'shield';

export type PowerupManifest = {
    id: string;
    label: string;
    respawnMs: number;
    type: PowerupType;
    value: number;
};

export const POWERUP_MANIFESTS: PowerupManifest[] = [
    {
        id: 'powerup-speed',
        label: 'Speed Orb',
        respawnMs: 8_000,
        type: 'speed-boost',
        value: 1.2,
    },
    {
        id: 'powerup-charge',
        label: 'Charge Cell',
        respawnMs: 10_000,
        type: 'ability-charge',
        value: 0.25,
    },
    {
        id: 'powerup-shield',
        label: 'Shield Core',
        respawnMs: 12_000,
        type: 'shield',
        value: 1,
    },
];

export const getPowerupManifestById = (powerupId: string): PowerupManifest | null => {
    return POWERUP_MANIFESTS.find((powerup) => powerup.id === powerupId) ?? null;
};
