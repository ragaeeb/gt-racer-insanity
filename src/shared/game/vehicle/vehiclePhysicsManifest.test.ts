import { describe, expect, it } from 'bun:test';
import {
    getVehicleClassManifestById,
    VEHICLE_CLASS_MANIFESTS,
} from '@/shared/game/vehicle/vehicleClassManifest';
import { validateVehicleClassManifests } from '@/shared/game/vehicle/vehicleClassManifestValidation';

describe('vehicle physics manifest', () => {
    it('should provide at least one vehicle class', () => {
        expect(VEHICLE_CLASS_MANIFESTS.length).toBeGreaterThan(0);
    });

    it('should resolve unknown vehicle ids to a default class', () => {
        const manifest = getVehicleClassManifestById('unknown');
        expect(manifest.id).toEqual(VEHICLE_CLASS_MANIFESTS[0].id);
    });

    it('should validate default vehicle manifests', () => {
        const validation = validateVehicleClassManifests(VEHICLE_CLASS_MANIFESTS);
        expect(validation.isValid).toEqual(true);
        expect(validation.issues).toHaveLength(0);
    });
});
