import { describe, expect, it } from 'bun:test';
import {
    COLOR_ID_TO_HSL,
    VEHICLE_CLASS_TO_CATALOG_ID,
    colorIdToHSL,
    colorIdToHexString,
    vehicleClassToModelIndex,
} from './vehicleSelections';
import { CAR_MODEL_CATALOG } from './assets/carModelCatalog';
import { VEHICLE_CLASS_MANIFESTS } from '@/shared/game/vehicle/vehicleClassManifest';

describe('vehicleClassToModelIndex', () => {
    it('should resolve sport to the sport catalog entry', () => {
        const idx = vehicleClassToModelIndex('sport');
        expect(CAR_MODEL_CATALOG[idx].id).toBe('sport');
    });

    it('should resolve muscle to the suv catalog entry', () => {
        const idx = vehicleClassToModelIndex('muscle');
        expect(CAR_MODEL_CATALOG[idx].id).toBe('suv');
    });

    it('should resolve truck to the pickup catalog entry', () => {
        const idx = vehicleClassToModelIndex('truck');
        expect(CAR_MODEL_CATALOG[idx].id).toBe('pickup');
    });

    it('should fall back to sport for unknown vehicle class ids', () => {
        const idx = vehicleClassToModelIndex('nonexistent');
        expect(CAR_MODEL_CATALOG[idx].id).toBe('sport');
    });

    it('should fall back to sport for empty string', () => {
        const idx = vehicleClassToModelIndex('');
        expect(CAR_MODEL_CATALOG[idx].id).toBe('sport');
    });
});

describe('colorIdToHSL', () => {
    it('should return valid HSL for all defined colors', () => {
        for (const [colorId, expectedHsl] of Object.entries(COLOR_ID_TO_HSL)) {
            const hsl = colorIdToHSL(colorId);
            expect(hsl.h).toBe(expectedHsl.h);
            expect(hsl.s).toBe(expectedHsl.s);
            expect(hsl.l).toBe(expectedHsl.l);
        }
    });

    it('should return a default red-like HSL for unknown color ids', () => {
        const hsl = colorIdToHSL('nonexistent');
        expect(hsl.h).toBe(0);
        expect(hsl.s).toBe(1.0);
        expect(hsl.l).toBe(0.5);
    });
});

describe('colorIdToHexString', () => {
    it('should return a valid CSS hsl() string for known colors', () => {
        for (const colorId of Object.keys(COLOR_ID_TO_HSL)) {
            const result = colorIdToHexString(colorId);
            expect(result).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
        }
    });

    it('should return a fallback for unknown color ids', () => {
        const result = colorIdToHexString('nonexistent');
        expect(result).toMatch(/^hsl\(/);
    });

    it('should cover every color in every vehicle palette', () => {
        for (const manifest of VEHICLE_CLASS_MANIFESTS) {
            for (const colorId of manifest.colorPaletteIds) {
                const result = colorIdToHexString(colorId);
                expect(result).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
            }
        }
    });
});

describe('VEHICLE_CLASS_TO_CATALOG_ID', () => {
    it('should have an entry for every vehicle class in manifests', () => {
        for (const manifest of VEHICLE_CLASS_MANIFESTS) {
            expect(VEHICLE_CLASS_TO_CATALOG_ID[manifest.id]).toBeDefined();
        }
    });

    it('should map to valid catalog entries', () => {
        for (const catalogId of Object.values(VEHICLE_CLASS_TO_CATALOG_ID)) {
            const entry = CAR_MODEL_CATALOG.find((c) => c.id === catalogId);
            expect(entry).toBeDefined();
        }
    });
});
