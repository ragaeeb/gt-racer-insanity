import { describe, expect, it } from 'bun:test';
import {
    COLOR_ID_TO_HSL,
    VEHICLE_CLASS_TO_CATALOG_ID,
    colorIdToHSL,
    colorIdToHexString,
    isHexColorString,
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

    it('should parse hex color strings to HSL', () => {
        const hsl = colorIdToHSL('#00FF00');
        expect(hsl.h).toBeGreaterThan(0.30);
        expect(hsl.h).toBeLessThan(0.38);
        expect(hsl.s).toBeGreaterThan(0.95);
        expect(hsl.l).toBeGreaterThan(0.45);
        expect(hsl.l).toBeLessThan(0.55);
    });
});

describe('colorIdToHexString', () => {
    it('should return a valid CSS hex string for known colors', () => {
        for (const colorId of Object.keys(COLOR_ID_TO_HSL)) {
            const result = colorIdToHexString(colorId);
            expect(result).toMatch(/^#[0-9A-F]{6}$/);
        }
    });

    it('should return a fallback for unknown color ids', () => {
        const result = colorIdToHexString('nonexistent');
        expect(result).toBe('#FF0000');
    });

    it('should preserve valid hex values', () => {
        const result = colorIdToHexString('#12abef');
        expect(result).toBe('#12ABEF');
    });

    it('should cover every color in every vehicle palette', () => {
        for (const manifest of VEHICLE_CLASS_MANIFESTS) {
            for (const colorId of manifest.colorPaletteIds) {
                const result = colorIdToHexString(colorId);
                expect(result).toMatch(/^#[0-9A-F]{6}$/);
            }
        }
    });
});

describe('isHexColorString', () => {
    it('should validate strict #RRGGBB values', () => {
        expect(isHexColorString('#00FF00')).toBeTrue();
        expect(isHexColorString('#0f0')).toBeFalse();
        expect(isHexColorString('00FF00')).toBeFalse();
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
