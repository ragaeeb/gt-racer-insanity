import { describe, expect, it } from 'bun:test';
import {
    VEHICLE_CLASS_MANIFESTS,
    getVehicleClassManifestById,
    type VehicleClassId,
} from './vehicleClassManifest';
import {
    COLOR_ID_TO_HSL,
    VEHICLE_CLASS_TO_CATALOG_ID,
} from '@/client/game/vehicleSelections';

describe('vehicle selection integration', () => {
    describe('vehicle class manifests', () => {
        it('should map every vehicle class to a catalog model id', () => {
            for (const manifest of VEHICLE_CLASS_MANIFESTS) {
                const catalogId = VEHICLE_CLASS_TO_CATALOG_ID[manifest.id];
                expect(catalogId).toBeDefined();
                expect(typeof catalogId).toBe('string');
                expect(catalogId.length).toBeGreaterThan(0);
            }
        });

        it('should resolve every vehicle class id back to its own manifest', () => {
            for (const manifest of VEHICLE_CLASS_MANIFESTS) {
                const resolved = getVehicleClassManifestById(manifest.id);
                expect(resolved.id).toBe(manifest.id);
            }
        });

        it('should have unique ids across all vehicle classes', () => {
            const ids = VEHICLE_CLASS_MANIFESTS.map((m) => m.id);
            expect(new Set(ids).size).toBe(ids.length);
        });
    });

    describe('color palette completeness', () => {
        it('should have an HSL mapping for every color in every vehicle palette', () => {
            for (const manifest of VEHICLE_CLASS_MANIFESTS) {
                for (const colorId of manifest.colorPaletteIds) {
                    const hsl = COLOR_ID_TO_HSL[colorId];
                    expect(hsl).toBeDefined();
                    expect(typeof hsl.h).toBe('number');
                    expect(typeof hsl.s).toBe('number');
                    expect(typeof hsl.l).toBe('number');
                }
            }
        });

        it('should have valid HSL ranges for all color mappings', () => {
            for (const [, hsl] of Object.entries(COLOR_ID_TO_HSL)) {
                expect(hsl.h).toBeGreaterThanOrEqual(0);
                expect(hsl.h).toBeLessThanOrEqual(1);
                expect(hsl.s).toBeGreaterThanOrEqual(0);
                expect(hsl.s).toBeLessThanOrEqual(1);
                expect(hsl.l).toBeGreaterThanOrEqual(0);
                expect(hsl.l).toBeLessThanOrEqual(1);
            }
        });

        it('should have at least one color in every vehicle palette', () => {
            for (const manifest of VEHICLE_CLASS_MANIFESTS) {
                expect(manifest.colorPaletteIds.length).toBeGreaterThan(0);
            }
        });

        it('should only include black in patrol (police) palette', () => {
            for (const manifest of VEHICLE_CLASS_MANIFESTS) {
                if (manifest.colorPaletteIds.includes('black')) {
                    expect(manifest.id).toBe('patrol');
                }
            }
        });
    });

    describe('lobby to race round-trip', () => {
        it('should preserve vehicle class id through server join flow', () => {
            for (const manifest of VEHICLE_CLASS_MANIFESTS) {
                const lobbySelection = manifest.id;
                const serverNormalized = (lobbySelection || 'sport') as VehicleClassId;
                const resolved = getVehicleClassManifestById(serverNormalized);
                expect(resolved.id).toBe(lobbySelection);
            }
        });

        it('should preserve color id through server join flow', () => {
            for (const manifest of VEHICLE_CLASS_MANIFESTS) {
                for (const colorId of manifest.colorPaletteIds) {
                    const serverColorId = colorId || 'red';
                    const hsl = COLOR_ID_TO_HSL[serverColorId];
                    expect(hsl).toBeDefined();
                }
            }
        });

        it('should fall back to sport when server receives empty vehicle id', () => {
            const emptyVehicle = '';
            const serverNormalized = (emptyVehicle || 'sport') as VehicleClassId;
            const resolved = getVehicleClassManifestById(serverNormalized);
            expect(resolved.id).toBe('sport');
        });

        it('should fall back to sport when server receives unknown vehicle id', () => {
            const resolved = getVehicleClassManifestById('nonexistent');
            expect(resolved.id).toBe(VEHICLE_CLASS_MANIFESTS[0].id);
        });

        it('should fall back to red when color id is empty', () => {
            const emptyColor = '';
            const serverColorId = emptyColor || 'red';
            expect(COLOR_ID_TO_HSL[serverColorId]).toBeDefined();
        });

        it('should include color and vehicle in simulated snapshot player state', () => {
            for (const manifest of VEHICLE_CLASS_MANIFESTS) {
                for (const colorId of manifest.colorPaletteIds) {
                    const snapshotPlayer = {
                        colorId,
                        vehicleId: manifest.id,
                        x: 0,
                        y: 0,
                        z: 0,
                        rotationY: 0,
                        speed: 0,
                    };

                    expect(snapshotPlayer.vehicleId).toBe(manifest.id);
                    expect(snapshotPlayer.colorId).toBe(colorId);

                    const resolvedManifest = getVehicleClassManifestById(snapshotPlayer.vehicleId);
                    expect(resolvedManifest.id).toBe(manifest.id);

                    const resolvedHSL = COLOR_ID_TO_HSL[snapshotPlayer.colorId];
                    expect(resolvedHSL).toBeDefined();
                }
            }
        });
    });

    describe('catalog id mapping stability', () => {
        it('should map sport to sport catalog entry', () => {
            expect(VEHICLE_CLASS_TO_CATALOG_ID.sport).toBe('sport');
        });

        it('should map muscle to suv catalog entry', () => {
            expect(VEHICLE_CLASS_TO_CATALOG_ID.muscle).toBe('suv');
        });

        it('should map truck to pickup catalog entry', () => {
            expect(VEHICLE_CLASS_TO_CATALOG_ID.truck).toBe('pickup');
        });
    });
});
