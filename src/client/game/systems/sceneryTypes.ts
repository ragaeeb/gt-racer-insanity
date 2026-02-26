import type { TrackThemeId } from '@/shared/game/track/trackManifest';

export type BuildingDescriptor = {
    depth: number;
    height: number;
    materialIndex: number;
    width: number;
    x: number;
    z: number;
};

export type StreetLightDescriptor = {
    x: number;
    z: number;
};

export type ConeDescriptor = {
    x: number;
    y: number;
    z: number;
};

export type PillarDescriptor = {
    height: number;
    scaleX: number;
    scaleZ: number;
    x: number;
    z: number;
};

export type MesaDescriptor = {
    depth: number;
    height: number;
    width: number;
    x: number;
    z: number;
};

export type BillboardDescriptor = {
    height: number;
    x: number;
    z: number;
};

export type CactusDescriptor = {
    armHeight: number;
    hasSecondArm: boolean;
    height: number;
    x: number;
    z: number;
};

export const BUILDING_ZONE_INTERVAL = 40;
export const STREET_LIGHT_INTERVAL = 60;
export const TRACK_EDGE_OFFSET = 15;
export const BILLBOARD_INTERVAL = 90;
export const CACTUS_INTERVAL = 70;

export const LOD_DISTANCE_BUILDINGS = 400;
export const LOD_DISTANCE_STREET_LIGHTS = 200;
export const LOD_DISTANCE_TRAFFIC_CONES = 100;
export const LOD_DISTANCE_ROCK_PILLARS = 500;
export const LOD_DISTANCE_MESAS = 500;
export const LOD_DISTANCE_BILLBOARDS = 300;
export const LOD_DISTANCE_CACTI = 200;

export type SceneryThemePalette = {
    buildingColors: number[];
    buildingWindow: number;
    decorationPrimary: number;
    decorationSecondary: number;
    lightColor: number;
    lightEmissive: number;
    rockColor: number;
};

export const SCENERY_THEME_PALETTES: Record<TrackThemeId, SceneryThemePalette> = {
    'sunny-day': {
        buildingColors: [0x7a8a9a, 0x8899aa, 0x6b7b8b, 0xa0b0c0, 0x9098a0],
        buildingWindow: 0x88bbdd,
        decorationPrimary: 0xff6600,
        decorationSecondary: 0xcccccc,
        lightColor: 0xffeecc,
        lightEmissive: 0xffcc88,
        rockColor: 0x888888,
    },
    'canyon-dusk': {
        buildingColors: [0x8b6b4a, 0x9a7a5a, 0x7a5b3a],
        buildingWindow: 0x554433,
        decorationPrimary: 0x6b8b3a,
        decorationSecondary: 0xaa8866,
        lightColor: 0xffaa66,
        lightEmissive: 0xff8844,
        rockColor: 0x8b6b4a,
    },
    'cyberpunk-night': {
        buildingColors: [0x13172a, 0x1a2037, 0x20284a, 0x152038, 0x1f3251],
        buildingWindow: 0x2de0ff,
        decorationPrimary: 0x00e5ff,
        decorationSecondary: 0x7d50ff,
        lightColor: 0xff55f3,
        lightEmissive: 0xff00dd,
        rockColor: 0x242034,
    },
    'desert-sunset': {
        buildingColors: [0xa9835d, 0xbd9469, 0x8d6f4d],
        buildingWindow: 0x6b4a2e,
        decorationPrimary: 0x5c8f3e,
        decorationSecondary: 0xd9b075,
        lightColor: 0xffc98f,
        lightEmissive: 0xff9d54,
        rockColor: 0xb4865e,
    },
};
