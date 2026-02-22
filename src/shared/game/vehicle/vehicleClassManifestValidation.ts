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
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
};
