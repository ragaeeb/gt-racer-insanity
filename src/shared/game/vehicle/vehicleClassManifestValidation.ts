import type { VehicleClassManifest } from '@/shared/game/vehicle/vehicleClassManifest';

type VehicleManifestValidationResult = {
    isValid: boolean;
    issues: string[];
};

const isPositiveNumber = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
};

export const validateVehicleClassManifests = (
    manifests: VehicleClassManifest[]
): VehicleManifestValidationResult => {
    const issues: string[] = [];
    const ids = new Set<string>();

    for (const manifest of manifests) {
        if (ids.has(manifest.id)) {
            issues.push(`Duplicate vehicle class id: ${manifest.id}`);
        }
        ids.add(manifest.id);

        if (!isPositiveNumber(manifest.physics.maxForwardSpeed)) {
            issues.push(`Invalid maxForwardSpeed for ${manifest.id}`);
        }

        if (!isPositiveNumber(manifest.physics.acceleration)) {
            issues.push(`Invalid acceleration for ${manifest.id}`);
        }

        if (!isPositiveNumber(manifest.physics.collisionMass)) {
            issues.push(`Invalid collisionMass for ${manifest.id}`);
        }

        if (manifest.colorPaletteIds.length === 0) {
            issues.push(`Vehicle class ${manifest.id} must provide at least one color`);
        }

        const modifiers = manifest.modifiers;
        if (!modifiers) {
            continue;
        }

        if (modifiers.abilityUseLimitPerRace !== undefined) {
            const limit = modifiers.abilityUseLimitPerRace;
            const isValidLimit =
                limit === Infinity || (Number.isFinite(limit) && Number.isInteger(limit) && limit >= 1);
            if (!isValidLimit) {
                issues.push(
                    `Invalid modifiers.abilityUseLimitPerRace for ${manifest.id}; expected positive integer or Infinity`,
                );
            }
        }

        if (modifiers.powerupSpeedMultiplier !== undefined) {
            const powerupSpeedMultiplier = modifiers.powerupSpeedMultiplier;
            if (!Number.isFinite(powerupSpeedMultiplier) || powerupSpeedMultiplier < 0) {
                issues.push(
                    `Invalid modifiers.powerupSpeedMultiplier for ${manifest.id}; expected finite number >= 0`,
                );
            }
        }

        if (modifiers.stunDurationMultiplier !== undefined) {
            const stunDurationMultiplier = modifiers.stunDurationMultiplier;
            if (!Number.isFinite(stunDurationMultiplier) || stunDurationMultiplier < 0) {
                issues.push(
                    `Invalid modifiers.stunDurationMultiplier for ${manifest.id}; expected finite number >= 0`,
                );
            }
        }
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
};
