import type { TrackThemeId } from '@/shared/game/track/trackManifest';

export type SceneEnvironmentProfileId = 'sunnyDay' | 'canyonDusk' | 'neonCityNight' | 'desertSunset';

type Vec3Tuple = [number, number, number];

type SceneCloudPuff = {
    offset: Vec3Tuple;
    scale: number;
};

type SceneCloudCluster = {
    id: string;
    position: Vec3Tuple;
    scale: number;
};

export type SceneEnvironmentProfile = {
    id: SceneEnvironmentProfileId;
    backgroundColor: number;
    fog: {
        color: number;
        far: number;
        near: number;
    };
    cloud: {
        clusters: SceneCloudCluster[];
        color: number;
        opacity: number;
        puffs: SceneCloudPuff[];
    };
    hemisphereLight: {
        groundColor: number;
        intensity: number;
        skyColor: number;
    };
    ambientLight: {
        color: number;
        intensity: number;
    };
    sunLight: {
        color: number;
        followOffset: Vec3Tuple;
        intensity: number;
        shadowBounds: number;
        shadowMapSize: number;
    };
    fillLight?: {
        color: number;
        intensity: number;
        position: Vec3Tuple;
    };
};

export const DEFAULT_SCENE_ENVIRONMENT_ID: SceneEnvironmentProfileId = 'sunnyDay';

const SCENE_ENVIRONMENT_PROFILES: Record<SceneEnvironmentProfileId, SceneEnvironmentProfile> = {
    sunnyDay: {
        id: 'sunnyDay',
        backgroundColor: 0x87ceeb,
        fog: {
            color: 0xbfe9ff,
            near: 140,
            far: 900,
        },
        cloud: {
            color: 0xffffff,
            opacity: 0.88,
            puffs: [
                { offset: [-7, 0.2, 0], scale: 6.8 },
                { offset: [-1.4, 1.5, 0.8], scale: 8.1 },
                { offset: [4.4, 0, -0.5], scale: 6.2 },
                { offset: [8.6, -0.9, 0.6], scale: 5.1 },
            ],
            clusters: [
                { id: 'cloud-1', position: [-120, 86, -160], scale: 1.1 },
                { id: 'cloud-2', position: [-60, 96, 40], scale: 1.35 },
                { id: 'cloud-3', position: [30, 92, 220], scale: 1.15 },
                { id: 'cloud-4', position: [130, 88, -20], scale: 1.05 },
                { id: 'cloud-5', position: [190, 95, 180], scale: 1.25 },
                { id: 'cloud-6', position: [-190, 90, 200], scale: 1.2 },
            ],
        },
        ambientLight: {
            color: 0xf2f8ff,
            intensity: 0.78,
        },
        hemisphereLight: {
            skyColor: 0xd6f0ff,
            groundColor: 0xcfe7c0,
            intensity: 0.65,
        },
        sunLight: {
            color: 0xfff5d6,
            followOffset: [22, 54, 18],
            intensity: 1.65,
            shadowBounds: 130,
            shadowMapSize: 2048,
        },
    },
    canyonDusk: {
        id: 'canyonDusk',
        backgroundColor: 0x332032,
        fog: {
            color: 0x4c334f,
            near: 120,
            far: 760,
        },
        cloud: {
            color: 0xf2d9cd,
            opacity: 0.7,
            puffs: [
                { offset: [-7.2, 0.2, -0.3], scale: 6.5 },
                { offset: [-1.2, 1.6, 0.7], scale: 7.9 },
                { offset: [4.2, -0.1, -0.7], scale: 6.1 },
                { offset: [8.8, -0.8, 0.8], scale: 5.4 },
            ],
            clusters: [
                { id: 'canyon-cloud-1', position: [-150, 80, -120], scale: 1.08 },
                { id: 'canyon-cloud-2', position: [-40, 88, 70], scale: 1.18 },
                { id: 'canyon-cloud-3', position: [55, 84, 250], scale: 1.1 },
                { id: 'canyon-cloud-4', position: [165, 82, 10], scale: 1.04 },
                { id: 'canyon-cloud-5', position: [-215, 86, 210], scale: 1.2 },
            ],
        },
        ambientLight: {
            color: 0xffd9c7,
            intensity: 0.68,
        },
        hemisphereLight: {
            skyColor: 0xd99374,
            groundColor: 0x4a2f22,
            intensity: 0.6,
        },
        sunLight: {
            color: 0xffb68b,
            followOffset: [20, 48, 16],
            intensity: 1.45,
            shadowBounds: 130,
            shadowMapSize: 2048,
        },
    },
    neonCityNight: {
        id: 'neonCityNight',
        backgroundColor: 0x122452,
        fog: {
            color: 0x2b3f74,
            near: 85,
            far: 520,
        },
        cloud: {
            color: 0x7f5dba,
            opacity: 0.36,
            puffs: [
                { offset: [-8.4, 0.3, -0.2], scale: 6.6 },
                { offset: [-2, 1.4, 0.7], scale: 7.6 },
                { offset: [3.8, -0.2, -0.5], scale: 5.8 },
                { offset: [8.1, -1, 0.8], scale: 5.2 },
            ],
            clusters: [
                { id: 'neon-cloud-1', position: [-145, 88, -120], scale: 1.08 },
                { id: 'neon-cloud-2', position: [-35, 98, 60], scale: 1.16 },
                { id: 'neon-cloud-3', position: [75, 92, 240], scale: 1.12 },
                { id: 'neon-cloud-4', position: [170, 84, 20], scale: 1.02 },
                { id: 'neon-cloud-5', position: [-205, 92, 220], scale: 1.18 },
            ],
        },
        ambientLight: {
            color: 0xa5b7ff,
            intensity: 0.9,
        },
        hemisphereLight: {
            skyColor: 0x6886c9,
            groundColor: 0x342654,
            intensity: 0.9,
        },
        sunLight: {
            color: 0xff8ef0,
            followOffset: [44, 90, 44],
            intensity: 1.25,
            shadowBounds: 130,
            shadowMapSize: 2048,
        },
        fillLight: {
            color: 0x7ad6ff,
            intensity: 0.75,
            position: [-28, 36, -24],
        },
    },
    desertSunset: {
        id: 'desertSunset',
        backgroundColor: 0xff8844,
        fog: {
            color: 0xffaa66,
            near: 100,
            far: 760,
        },
        cloud: {
            color: 0xffe2b8,
            opacity: 0.52,
            puffs: [
                { offset: [-8.2, 0.1, -0.4], scale: 6.7 },
                { offset: [-1.6, 1.2, 0.6], scale: 7.8 },
                { offset: [4.6, -0.3, -0.6], scale: 6.1 },
                { offset: [9, -0.9, 0.9], scale: 5.3 },
            ],
            clusters: [
                { id: 'desert-cloud-1', position: [-180, 76, -150], scale: 1.12 },
                { id: 'desert-cloud-2', position: [-45, 88, 65], scale: 1.2 },
                { id: 'desert-cloud-3', position: [80, 82, 250], scale: 1.15 },
                { id: 'desert-cloud-4', position: [190, 74, 15], scale: 1.04 },
                { id: 'desert-cloud-5', position: [-230, 84, 220], scale: 1.24 },
            ],
        },
        ambientLight: {
            color: 0xffddaa,
            intensity: 0.6,
        },
        hemisphereLight: {
            skyColor: 0xffc07f,
            groundColor: 0x8f5a34,
            intensity: 0.62,
        },
        sunLight: {
            color: 0xff6600,
            followOffset: [-100, 80, 100],
            intensity: 0.8,
            shadowBounds: 130,
            shadowMapSize: 2048,
        },
    },
};

const TRACK_THEME_TO_SCENE_ENVIRONMENT: Record<TrackThemeId, SceneEnvironmentProfileId> = {
    'canyon-dusk': 'canyonDusk',
    'cyberpunk-night': 'neonCityNight',
    'desert-sunset': 'desertSunset',
    'sunny-day': 'sunnyDay',
};

export const getSceneEnvironmentProfile = (
    profileId: SceneEnvironmentProfileId
): SceneEnvironmentProfile => {
    return SCENE_ENVIRONMENT_PROFILES[profileId];
};

export const getSceneEnvironmentProfileIdForTrackTheme = (
    trackThemeId: TrackThemeId
): SceneEnvironmentProfileId => {
    return TRACK_THEME_TO_SCENE_ENVIRONMENT[trackThemeId];
};
