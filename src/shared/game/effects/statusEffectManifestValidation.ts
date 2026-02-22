import type { StatusEffectManifest } from '@/shared/game/effects/statusEffectManifest';

type StatusEffectValidationResult = {
    isValid: boolean;
    issues: string[];
};

const isFinitePositive = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
};

const isFiniteZeroOrPositive = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
};

export const validateStatusEffectManifests = (
    manifests: StatusEffectManifest[]
): StatusEffectValidationResult => {
    const ids = new Set<string>();
    const issues: string[] = [];

    for (const manifest of manifests) {
        if (ids.has(manifest.id)) {
            issues.push(`Duplicate status effect id: ${manifest.id}`);
        }
        ids.add(manifest.id);

        if (!isFinitePositive(manifest.defaultDurationMs)) {
            issues.push(`Invalid duration for effect ${manifest.id}`);
        }

        if (!isFiniteZeroOrPositive(manifest.movementMultiplier)) {
            issues.push(`Invalid movement multiplier for effect ${manifest.id}`);
        }

        if (!isFiniteZeroOrPositive(manifest.steeringMultiplier)) {
            issues.push(`Invalid steering multiplier for effect ${manifest.id}`);
        }
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
};
