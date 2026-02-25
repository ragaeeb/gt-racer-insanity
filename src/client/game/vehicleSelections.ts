import { CAR_MODEL_CATALOG } from '@/client/game/assets/carModelCatalog';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';

export const VEHICLE_CLASS_TO_CATALOG_ID: Record<VehicleClassId, string> = {
    sport: 'sport',
    muscle: 'suv',
    patrol: 'police',
    truck: 'pickup',
};

export const COLOR_ID_TO_HSL: Record<string, { h: number; s: number; l: number }> = {
    black: { h: 0, s: 0.0, l: 0.12 },
    blue: { h: 0.583, s: 1.0, l: 0.5 },
    gold: { h: 0.131, s: 0.8, l: 0.55 },
    gray: { h: 0, s: 0.0, l: 0.42 },
    green: { h: 0.394, s: 1.0, l: 0.5 },
    orange: { h: 0.078, s: 1.0, l: 0.5 },
    red: { h: 0.003, s: 1.0, l: 0.5 },
    silver: { h: 0, s: 0.0, l: 0.75 },
    white: { h: 0, s: 0.0, l: 0.95 },
    yellow: { h: 0.167, s: 1.0, l: 0.5 },
};

const HEX_COLOR_RE = /^#([0-9a-f]{6})$/i;

const rgbToHsl = (r255: number, g255: number, b255: number): { h: number; l: number; s: number } => {
    const r = r255 / 255;
    const g = g255 / 255;
    const b = b255 / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const l = (max + min) / 2;

    if (delta === 0) {
        return { h: 0, l, s: 0 };
    }

    const s = delta / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (max === r) {
        h = ((g - b) / delta) % 6;
    } else if (max === g) {
        h = (b - r) / delta + 2;
    } else {
        h = (r - g) / delta + 4;
    }
    h /= 6;
    if (h < 0) {
        h += 1;
    }

    return { h, l, s };
};

const hslToRgb = (h: number, s: number, l: number): { b: number; g: number; r: number } => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hPrime = h * 6;
    const x = c * (1 - Math.abs((hPrime % 2) - 1));

    let r1 = 0;
    let g1 = 0;
    let b1 = 0;

    if (hPrime >= 0 && hPrime < 1) {
        r1 = c;
        g1 = x;
    } else if (hPrime < 2) {
        r1 = x;
        g1 = c;
    } else if (hPrime < 3) {
        g1 = c;
        b1 = x;
    } else if (hPrime < 4) {
        g1 = x;
        b1 = c;
    } else if (hPrime < 5) {
        r1 = x;
        b1 = c;
    } else {
        r1 = c;
        b1 = x;
    }

    const m = l - c / 2;
    return {
        b: Math.round((b1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        r: Math.round((r1 + m) * 255),
    };
};

const toHex2 = (value: number): string => {
    return value.toString(16).padStart(2, '0').toUpperCase();
};

export const isHexColorString = (value: string): boolean => {
    return HEX_COLOR_RE.test(value.trim());
};

const parseHexColorToHsl = (value: string): { h: number; l: number; s: number } | null => {
    const normalized = value.trim();
    if (!isHexColorString(normalized)) {
        return null;
    }
    const hex = normalized.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return rgbToHsl(r, g, b);
};

/**
 * Resolve a vehicle class ID (e.g. "sport") to a model variant index
 * into the CAR_MODEL_CATALOG array.
 */
export const vehicleClassToModelIndex = (vehicleClassId: string): number => {
    const catalogId = VEHICLE_CLASS_TO_CATALOG_ID[vehicleClassId as VehicleClassId];
    if (catalogId) {
        const idx = CAR_MODEL_CATALOG.findIndex((c) => c.id === catalogId);
        if (idx >= 0) {
            return idx;
        }
    }
    const fallbackIdx = CAR_MODEL_CATALOG.findIndex((c) => c.id === 'sport');
    return fallbackIdx >= 0 ? fallbackIdx : 0;
};

/** Resolve a color ID (e.g. "blue") to an HSL hue (0-1). */
export const colorIdToHue = (colorId: string): number =>
    colorIdToHSL(colorId).h;

/** Resolve a color ID to a full HSL triplet for the Car constructor. */
export const colorIdToHSL = (colorId: string): { h: number; s: number; l: number } => {
    const known = COLOR_ID_TO_HSL[colorId];
    if (known) {
        return known;
    }

    const parsed = parseHexColorToHsl(colorId);
    if (parsed) {
        return parsed;
    }

    return { h: 0, s: 1.0, l: 0.5 };
};

/** Resolve a color ID to a CSS hsl() string for use in DOM elements. */
export const colorIdToHexString = (colorId: string): string => {
    const parsedHex = colorId.trim();
    if (isHexColorString(parsedHex)) {
        return parsedHex.toUpperCase();
    }

    const hsl = COLOR_ID_TO_HSL[colorId];
    if (!hsl) {
        return '#FF0000';
    }
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    return `#${toHex2(rgb.r)}${toHex2(rgb.g)}${toHex2(rgb.b)}`;
};
