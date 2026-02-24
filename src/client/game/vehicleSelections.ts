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
    COLOR_ID_TO_HSL[colorId]?.h ?? 0;

/** Resolve a color ID to a full HSL triplet for the Car constructor. */
export const colorIdToHSL = (colorId: string): { h: number; s: number; l: number } =>
    COLOR_ID_TO_HSL[colorId] ?? { h: 0, s: 1.0, l: 0.5 };

/** Resolve a color ID to a CSS hsl() string for use in DOM elements. */
export const colorIdToHexString = (colorId: string): string => {
    const hsl = COLOR_ID_TO_HSL[colorId];
    if (!hsl) {
        return 'hsl(0, 100%, 50%)';
    }
    return `hsl(${Math.round(hsl.h * 360)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`;
};
