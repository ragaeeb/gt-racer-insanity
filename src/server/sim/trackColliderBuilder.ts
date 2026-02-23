import type RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '@dimforge/rapier3d-compat';
import { getTrackManifestById } from '@/shared/game/track/trackManifest';
import { generateTrackObstacles } from '@/shared/game/track/trackObstacles';

type TrackColliderBuildOptions = {
    seed: number;
    totalLaps: number;
    trackId: string;
    trackWidthMeters?: number;
    wallHeightMeters?: number;
};

export type TrackColliderBuildResult = {
    finishBarrierColliderHandle: number;
    obstacleColliderHandles: Set<number>;
    totalTrackLengthMeters: number;
    trackWidthMeters: number;
};

const DEFAULT_TRACK_WIDTH_METERS = 76;
const DEFAULT_WALL_HEIGHT_METERS = 3;

const createFloorCollider = (
    rapier: typeof RAPIER,
    world: World,
    trackWidthMeters: number,
    totalTrackLengthMeters: number,
    staticBody: ReturnType<World['createRigidBody']>
) => {
    const floorColliderDesc = rapier.ColliderDesc.cuboid(
        trackWidthMeters * 0.5,
        0.6,
        totalTrackLengthMeters * 0.5
    )
        .setFriction(1.1)
        .setTranslation(0, -0.6, totalTrackLengthMeters * 0.5);

    world.createCollider(floorColliderDesc, staticBody);
};

const createWallColliders = (
    rapier: typeof RAPIER,
    world: World,
    trackWidthMeters: number,
    totalTrackLengthMeters: number,
    wallHeightMeters: number,
    staticBody: ReturnType<World['createRigidBody']>
) => {
    const halfTrackWidth = trackWidthMeters * 0.5;
    const halfTrackLength = totalTrackLengthMeters * 0.5;

    const leftWall = rapier.ColliderDesc.cuboid(1, wallHeightMeters, halfTrackLength)
        .setTranslation(-halfTrackWidth - 1, wallHeightMeters, halfTrackLength)
        .setFriction(1.4)
        .setRestitution(0.08);

    const rightWall = rapier.ColliderDesc.cuboid(1, wallHeightMeters, halfTrackLength)
        .setTranslation(halfTrackWidth + 1, wallHeightMeters, halfTrackLength)
        .setFriction(1.4)
        .setRestitution(0.08);

    world.createCollider(leftWall, staticBody);
    world.createCollider(rightWall, staticBody);
};

const createFinishBarrierCollider = (
    rapier: typeof RAPIER,
    world: World,
    trackWidthMeters: number,
    totalTrackLengthMeters: number,
    wallHeightMeters: number,
    staticBody: ReturnType<World['createRigidBody']>
) => {
    const finishBarrier = rapier.ColliderDesc.cuboid(trackWidthMeters * 0.5, wallHeightMeters, 1)
        .setTranslation(0, wallHeightMeters, totalTrackLengthMeters + 1)
        .setFriction(1.4)
        .setRestitution(0.06)
        .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);

    const finishBarrierCollider = world.createCollider(finishBarrier, staticBody);
    return finishBarrierCollider.handle;
};

const createObstacleColliders = (
    rapier: typeof RAPIER,
    world: World,
    options: TrackColliderBuildOptions,
    trackWidthMeters: number,
    staticBody: ReturnType<World['createRigidBody']>,
): Set<number> => {
    const totalLaps = Math.max(1, options.totalLaps);
    const layout = generateTrackObstacles(options.trackId, options.seed, totalLaps, trackWidthMeters);
    const handles = new Set<number>();

    for (const obs of layout.obstacles) {
        const colliderDesc = rapier.ColliderDesc.cuboid(obs.halfSize, obs.halfSize, obs.halfSize)
            .setTranslation(obs.positionX, obs.halfSize, obs.positionZ)
            .setSensor(true)
            .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);

        const collider = world.createCollider(colliderDesc, staticBody);
        handles.add(collider.handle);
    }

    return handles;
};

export const buildTrackColliders = (
    rapier: typeof RAPIER,
    world: World,
    options: TrackColliderBuildOptions
): TrackColliderBuildResult => {
    const trackManifest = getTrackManifestById(options.trackId);
    if (trackManifest.id !== options.trackId) {
        console.warn(
            `[TrackColliderBuilder] Requested track "${options.trackId}" resolved to "${trackManifest.id}" fallback`
        );
    }
    const totalLaps = Math.max(1, options.totalLaps);
    const totalTrackLengthMeters = trackManifest.lengthMeters * totalLaps;
    const trackWidthMeters = options.trackWidthMeters ?? DEFAULT_TRACK_WIDTH_METERS;
    const wallHeightMeters = options.wallHeightMeters ?? DEFAULT_WALL_HEIGHT_METERS;

    const staticBody = world.createRigidBody(rapier.RigidBodyDesc.fixed());

    createFloorCollider(rapier, world, trackWidthMeters, totalTrackLengthMeters, staticBody);
    createWallColliders(
        rapier,
        world,
        trackWidthMeters,
        totalTrackLengthMeters,
        wallHeightMeters,
        staticBody
    );

    const finishBarrierColliderHandle = createFinishBarrierCollider(
        rapier,
        world,
        trackWidthMeters,
        totalTrackLengthMeters,
        wallHeightMeters,
        staticBody
    );

    const obstacleColliderHandles = createObstacleColliders(
        rapier,
        world,
        options,
        trackWidthMeters,
        staticBody,
    );

    return {
        finishBarrierColliderHandle,
        obstacleColliderHandles,
        totalTrackLengthMeters,
        trackWidthMeters,
    };
};
