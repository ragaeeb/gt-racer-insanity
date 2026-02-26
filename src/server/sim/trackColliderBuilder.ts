import type RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '@dimforge/rapier3d-compat';
import type { TrackSegmentManifest } from '@/shared/game/track/trackManifest';
import { DEFAULT_TRACK_WIDTH_METERS, getTrackManifestById } from '@/shared/game/track/trackManifest';
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

const DEFAULT_WALL_HEIGHT_METERS = 3;
const FLOOR_HALF_HEIGHT = 0.6;

// ─────────────────────── quaternion math ───────────────────────
//
// Euler XYZ → quaternion conversion. Avoids a Three.js dependency on the
// server.  The rotation order is Rx(pitch) · Ry(yaw) · Rz(roll) following
// the "XYZ" intrinsic convention used by Rapier cuboid orientations.
//
// For track colliders:
//   pitch (xRad) = slope angle (rotation around the X axis for elevation)
//   yaw   (yRad) = 0 (tracks run along Z)
//   roll  (zRad) = bank angle (rotation around the Z axis for banking)

export type RapierQuaternion = { w: number; x: number; y: number; z: number };

export const eulerToQuaternion = (xRad: number, yRad: number, zRad: number): RapierQuaternion => {
    const cx = Math.cos(xRad / 2);
    const sx = Math.sin(xRad / 2);
    const cy = Math.cos(yRad / 2);
    const sy = Math.sin(yRad / 2);
    const cz = Math.cos(zRad / 2);
    const sz = Math.sin(zRad / 2);

    return {
        w: cx * cy * cz + sx * sy * sz,
        x: sx * cy * cz - cx * sy * sz,
        y: cx * sy * cz + sx * cy * sz,
        z: cx * cy * sz - sx * sy * cz,
    };
};

// ──────────────── segment collider transform ──────────────────

export type SegmentColliderTransform = {
    centerY: number;
    centerZ: number;
    halfLength: number;
    rotation: RapierQuaternion;
    wallCenterY: number;
};

/**
 * Computes the position, rotation, and wall height for a segment's collider.
 * This is a pure function — no Rapier dependency — so it's fully unit-testable.
 *
 * @param segment - Track segment manifest
 * @param segmentStartZ - The Z coordinate where this segment begins on the track
 * @param wallHeightMeters - Wall height (defaults to 3m)
 * @returns Transform data for creating the floor and wall colliders
 */
export const computeSegmentColliderTransform = (
    segment: TrackSegmentManifest,
    segmentStartZ: number,
    wallHeightMeters = DEFAULT_WALL_HEIGHT_METERS,
): SegmentColliderTransform => {
    const elevStart = segment.elevationStartM ?? 0;
    const elevEnd = segment.elevationEndM ?? 0;
    const bankDeg = segment.bankAngleDeg ?? 0;

    const halfLength = segment.lengthMeters / 2;
    const centerZ = segmentStartZ + halfLength;
    const midElevation = (elevStart + elevEnd) / 2;

    // Floor collider center Y: midpoint elevation minus half-height so
    // the top surface sits at the correct elevation.
    const centerY = midElevation - FLOOR_HALF_HEIGHT;

    // Slope angle: positive slope = uphill (nose of segment rises).
    // We negate because Rapier's X-axis rotation follows the right-hand rule:
    // a positive angle tilts the +Z end downward, but we want it upward.
    const slopeRad = -Math.atan2(elevEnd - elevStart, segment.lengthMeters);

    // Bank angle: convert degrees → radians
    const bankRad = (bankDeg * Math.PI) / 180;

    // Compose rotation:  pitch (X) for slope, roll (Z) for banking
    const rotation = eulerToQuaternion(slopeRad, 0, bankRad);

    // Wall center Y: walls sit on top of the flight elevation
    const wallCenterY = midElevation + wallHeightMeters;

    return { centerY, centerZ, halfLength, rotation, wallCenterY };
};

// ──────────────── per-segment floor colliders ─────────────────

const createSegmentFloorColliders = (
    rapier: typeof RAPIER,
    world: World,
    segments: TrackSegmentManifest[],
    trackWidthMeters: number,
    totalLaps: number,
    wallHeightMeters: number,
    staticBody: ReturnType<World['createRigidBody']>,
) => {
    const lapLength = segments.reduce((sum, s) => sum + s.lengthMeters, 0);
    const halfTrackWidth = trackWidthMeters * 0.5;

    for (let lap = 0; lap < totalLaps; lap++) {
        let segmentStartZ = lap * lapLength;

        for (const segment of segments) {
            const transform = computeSegmentColliderTransform(segment, segmentStartZ, wallHeightMeters);

            // --- floor ---
            const floorDesc = rapier.ColliderDesc.cuboid(halfTrackWidth, FLOOR_HALF_HEIGHT, transform.halfLength)
                .setFriction(1.1)
                .setTranslation(0, transform.centerY, transform.centerZ)
                .setRotation(transform.rotation);

            world.createCollider(floorDesc, staticBody);

            // --- per-segment walls ---
            const leftWall = rapier.ColliderDesc.cuboid(1, wallHeightMeters, transform.halfLength)
                .setTranslation(-halfTrackWidth - 1, transform.wallCenterY, transform.centerZ)
                .setFriction(1.4)
                .setRestitution(0.08);

            const rightWall = rapier.ColliderDesc.cuboid(1, wallHeightMeters, transform.halfLength)
                .setTranslation(halfTrackWidth + 1, transform.wallCenterY, transform.centerZ)
                .setFriction(1.4)
                .setRestitution(0.08);

            world.createCollider(leftWall, staticBody);
            world.createCollider(rightWall, staticBody);

            segmentStartZ += segment.lengthMeters;
        }
    }
};

// ──────────────── finish barrier ───────────────────────────────

const createFinishBarrierCollider = (
    rapier: typeof RAPIER,
    world: World,
    trackWidthMeters: number,
    totalTrackLengthMeters: number,
    wallHeightMeters: number,
    staticBody: ReturnType<World['createRigidBody']>,
) => {
    const finishBarrier = rapier.ColliderDesc.cuboid(trackWidthMeters * 0.5, wallHeightMeters, 1)
        .setTranslation(0, wallHeightMeters, totalTrackLengthMeters + 1)
        .setFriction(1.4)
        .setRestitution(0.06)
        .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);

    const finishBarrierCollider = world.createCollider(finishBarrier, staticBody);
    return finishBarrierCollider.handle;
};

// ──────────────── obstacles ───────────────────────────────────

const createObstacleColliders = (
    rapier: typeof RAPIER,
    world: World,
    trackId: string,
    seed: number,
    totalLaps: number,
    trackWidthMeters: number,
    staticBody: ReturnType<World['createRigidBody']>,
): Set<number> => {
    const layout = generateTrackObstacles(trackId, seed, totalLaps, trackWidthMeters);
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

// ──────────────── main entry point ────────────────────────────

export const buildTrackColliders = (
    rapier: typeof RAPIER,
    world: World,
    options: TrackColliderBuildOptions,
): TrackColliderBuildResult => {
    const trackManifest = getTrackManifestById(options.trackId);
    if (trackManifest.id !== options.trackId) {
        console.warn(
            `[TrackColliderBuilder] Requested track "${options.trackId}" resolved to "${trackManifest.id}" fallback`,
        );
    }
    const totalLaps = Math.max(1, options.totalLaps);
    const totalTrackLengthMeters = trackManifest.lengthMeters * totalLaps;
    const trackWidthMeters = options.trackWidthMeters ?? DEFAULT_TRACK_WIDTH_METERS;
    const wallHeightMeters = options.wallHeightMeters ?? DEFAULT_WALL_HEIGHT_METERS;

    const staticBody = world.createRigidBody(rapier.RigidBodyDesc.fixed());

    createSegmentFloorColliders(
        rapier,
        world,
        trackManifest.segments,
        trackWidthMeters,
        totalLaps,
        wallHeightMeters,
        staticBody,
    );

    const finishBarrierColliderHandle = createFinishBarrierCollider(
        rapier,
        world,
        trackWidthMeters,
        totalTrackLengthMeters,
        wallHeightMeters,
        staticBody,
    );

    const obstacleColliderHandles = createObstacleColliders(
        rapier,
        world,
        options.trackId,
        options.seed,
        totalLaps,
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
