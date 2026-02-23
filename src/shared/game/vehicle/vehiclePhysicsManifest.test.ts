import { describe, expect, it } from 'bun:test';
import {
    getVehicleClassManifestById,
    VEHICLE_CLASS_MANIFESTS,
    vehicleManifestToPhysicsConfig,
} from '@/shared/game/vehicle/vehicleClassManifest';
import { DEFAULT_CAR_PHYSICS_CONFIG } from '@/shared/game/carPhysics';
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

describe('vehicleManifestToPhysicsConfig', () => {
    it('should map all manifest physics fields to config fields', () => {
        for (const manifest of VEHICLE_CLASS_MANIFESTS) {
            const config = vehicleManifestToPhysicsConfig(manifest.physics, DEFAULT_CAR_PHYSICS_CONFIG.deceleration);

            expect(config.acceleration).toBe(manifest.physics.acceleration);
            expect(config.friction).toBe(manifest.physics.friction);
            expect(config.maxForwardSpeed).toBe(manifest.physics.maxForwardSpeed);
            expect(config.maxReverseSpeed).toBe(manifest.physics.maxReverseSpeed);
            expect(config.minTurnSpeed).toBe(manifest.physics.minTurnSpeed);
            expect(config.turnSpeed).toBe(manifest.physics.turnSpeed);
        }
    });

    it('should use the provided deceleration fallback', () => {
        const manifest = VEHICLE_CLASS_MANIFESTS[0];
        const customDecel = 42;
        const config = vehicleManifestToPhysicsConfig(manifest.physics, customDecel);
        expect(config.deceleration).toBe(customDecel);
    });

    it('should produce per-vehicle maxForwardSpeed matching the manifest', () => {
        const sportConfig = vehicleManifestToPhysicsConfig(
            getVehicleClassManifestById('sport').physics,
            DEFAULT_CAR_PHYSICS_CONFIG.deceleration,
        );
        const truckConfig = vehicleManifestToPhysicsConfig(
            getVehicleClassManifestById('truck').physics,
            DEFAULT_CAR_PHYSICS_CONFIG.deceleration,
        );

        expect(sportConfig.maxForwardSpeed).toBe(44);
        expect(truckConfig.maxForwardSpeed).toBe(36);
        expect(sportConfig.maxForwardSpeed).toBeGreaterThan(truckConfig.maxForwardSpeed);
    });
});
