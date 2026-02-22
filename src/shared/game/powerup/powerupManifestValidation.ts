import type { PowerupManifest } from '@/shared/game/powerup/powerupManifest';

type PowerupManifestValidationResult = {
    isValid: boolean;
    issues: string[];
};

const isFinitePositive = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
};

export const validatePowerupManifests = (manifests: PowerupManifest[]): PowerupManifestValidationResult => {
    const ids = new Set<string>();
    const issues: string[] = [];

    for (const manifest of manifests) {
        if (ids.has(manifest.id)) {
            issues.push(`Duplicate powerup id: ${manifest.id}`);
        }
        ids.add(manifest.id);

        if (!isFinitePositive(manifest.respawnMs)) {
            issues.push(`Powerup ${manifest.id} must define a positive respawn`);
        }

        if (!isFinitePositive(manifest.value)) {
            issues.push(`Powerup ${manifest.id} must define a positive value`);
        }
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
};
