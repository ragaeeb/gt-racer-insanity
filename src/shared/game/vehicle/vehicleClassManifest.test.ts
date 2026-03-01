import { describe, expect, it } from 'bun:test';
import {
    DEFAULT_VEHICLE_MODIFIERS,
    getVehicleClassManifestById,
    getVehicleModifiers,
    VEHICLE_CLASS_MANIFESTS,
} from './vehicleClassManifest';

describe('getVehicleModifiers', () => {
    it('should return defaults for a vehicle with no explicit modifiers', () => {
        const mods = getVehicleModifiers('sport');
        expect(mods).toEqual(DEFAULT_VEHICLE_MODIFIERS);
    });

    it('should return bike modifiers with ability use limit of 3', () => {
        const mods = getVehicleModifiers('bike');
        expect(mods.abilityUseLimitPerRace).toBe(3);
        expect(mods.powerupSpeedMultiplier).toBe(1);
        expect(mods.stunDurationMultiplier).toBe(1);
    });

    it('should return truck modifiers with 2x powerup speed', () => {
        const mods = getVehicleModifiers('truck');
        expect(mods.powerupSpeedMultiplier).toBe(2);
        expect(mods.abilityUseLimitPerRace).toBe(Infinity);
        expect(mods.stunDurationMultiplier).toBe(1);
    });

    it('should return patrol modifiers with 0.5x stun duration', () => {
        const mods = getVehicleModifiers('patrol');
        expect(mods.stunDurationMultiplier).toBe(0.5);
        expect(mods.abilityUseLimitPerRace).toBe(Infinity);
        expect(mods.powerupSpeedMultiplier).toBe(1);
    });

    it('should fall back to defaults for unknown vehicle id', () => {
        const mods = getVehicleModifiers('nonexistent');
        expect(mods).toEqual(DEFAULT_VEHICLE_MODIFIERS);
    });

    it('should return defaults for muscle (no explicit modifiers)', () => {
        const mods = getVehicleModifiers('muscle');
        expect(mods).toEqual(DEFAULT_VEHICLE_MODIFIERS);
    });
});

describe('VEHICLE_CLASS_MANIFESTS', () => {
    it('should have at least one entry', () => {
        expect(VEHICLE_CLASS_MANIFESTS.length).toBeGreaterThan(0);
    });

    it('should have unique ids', () => {
        const ids = VEHICLE_CLASS_MANIFESTS.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('should include bike with turbo-boost ability', () => {
        const bike = getVehicleClassManifestById('bike');
        expect(bike.abilityId).toBe('turbo-boost');
    });
});
