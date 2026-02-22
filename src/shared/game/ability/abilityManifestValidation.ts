import type { AbilityManifest } from '@/shared/game/ability/abilityManifest';

type AbilityManifestValidationResult = {
    isValid: boolean;
    issues: string[];
};

export const validateAbilityManifests = (manifests: AbilityManifest[]): AbilityManifestValidationResult => {
    const issues: string[] = [];
    const ids = new Set<string>();

    for (const manifest of manifests) {
        if (ids.has(manifest.id)) {
            issues.push(`Duplicate ability id: ${manifest.id}`);
        }
        ids.add(manifest.id);

        if (manifest.baseCooldownMs <= 0) {
            issues.push(`Ability ${manifest.id} must define a positive cooldown`);
        }

        if (!manifest.effectId.trim()) {
            issues.push(`Ability ${manifest.id} has empty effectId`);
        }
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
};
