import type { TrackThemeId } from '@/shared/game/track/trackManifest';

export type SceneEnvironmentProfileId = 'sunnyDay' | 'canyonDusk';

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
};

const TRACK_THEME_TO_SCENE_ENVIRONMENT: Record<TrackThemeId, SceneEnvironmentProfileId> = {
    'canyon-dusk': 'canyonDusk',
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
    return TRACK_THEME_TO_SCENE_ENVIRONMENT[trackThemeId] ?? DEFAULT_SCENE_ENVIRONMENT_ID;
};
