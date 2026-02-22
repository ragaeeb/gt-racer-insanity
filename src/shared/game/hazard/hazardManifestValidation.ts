import type { HazardManifest } from '@/shared/game/hazard/hazardManifest';

type HazardManifestValidationResult = {
    isValid: boolean;
    issues: string[];
};

const isFinitePositiveOrZero = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
};

export const validateHazardManifests = (manifests: HazardManifest[]): HazardManifestValidationResult => {
    const ids = new Set<string>();
    const issues: string[] = [];

    for (const manifest of manifests) {
        if (ids.has(manifest.id)) {
            issues.push(`Duplicate hazard id: ${manifest.id}`);
        }
        ids.add(manifest.id);

        if (!isFinitePositiveOrZero(manifest.collisionRadius) || manifest.collisionRadius === 0) {
            issues.push(`Invalid collisionRadius for hazard ${manifest.id}`);
        }

        if (!isFinitePositiveOrZero(manifest.movementAmplitude)) {
            issues.push(`Invalid movementAmplitude for hazard ${manifest.id}`);
        }

        if (!isFinitePositiveOrZero(manifest.movementSpeed)) {
            issues.push(`Invalid movementSpeed for hazard ${manifest.id}`);
        }
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
};
