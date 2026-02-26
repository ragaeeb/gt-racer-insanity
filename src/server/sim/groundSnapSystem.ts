import type RAPIER from '@dimforge/rapier3d-compat';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import type { SimPlayerState } from '@/server/sim/types';
import { PLAYER_COLLIDER_HALF_HEIGHT_METERS } from '@/shared/physics/constants';

/** Maximum distance for the downward raycast probe (meters). */
export const GROUND_SNAP_MAX_DISTANCE = 15;

/** Damping factor applied to Y velocity each tick when grounded.
 *  Lower = stronger damping. 0.3 aggressively kills bounce. */
export const Y_VELOCITY_DAMPING = 0.3;

/** Hard cap on downward velocity to prevent falling through the world. */
export const MAX_Y_VELOCITY = 20;

/** Gravity acceleration (m/s²). Applied when airborne. */
const GRAVITY = 9.81;

/** Vertical offset from the ray origin above the player's Y position. */
const RAY_PROBE_OFFSET_Y = 1;

export type GroundSnapInput = {
    currentY: number;
    /** Distance from the ray origin to the ground hit, or null if no hit. */
    groundHitDistance: number | null;
    currentYVelocity: number;
    dtSeconds: number;
};

export type GroundSnapResult = {
    /** Whether the player is currently on the ground. */
    grounded: boolean;
    /** Target Y position if grounded (undefined when airborne). */
    targetY: number | undefined;
    /** Resulting Y velocity after snap/damping/gravity. */
    yVelocity: number;
    /** If true, steering should be suppressed (player is airborne). */
    suppressSteering: boolean;
};

/**
 * Pure function that computes the ground-snap result from raycast data.
 * No Rapier dependency — fully unit-testable.
 *
 * Design: The raycast probes from `currentY + RAY_PROBE_OFFSET_Y` downward.
 * If a hit is found, groundY = probeOriginY - hitDistance, and the player
 * snaps to groundY + PLAYER_COLLIDER_HALF_HEIGHT_METERS.
 */
export const computeGroundSnap = (input: GroundSnapInput): GroundSnapResult => {
    const { currentY, groundHitDistance, currentYVelocity, dtSeconds } = input;

    if (groundHitDistance !== null && groundHitDistance <= GROUND_SNAP_MAX_DISTANCE) {
        // Grounded
        const probeOriginY = currentY + RAY_PROBE_OFFSET_Y;
        const groundY = probeOriginY - groundHitDistance;
        const targetY = groundY + PLAYER_COLLIDER_HALF_HEIGHT_METERS;

        // Damp Y velocity: zero negative (stop falling), damp positive (prevent bounce)
        let yVelocity = currentYVelocity;
        if (yVelocity < 0) {
            yVelocity = 0;
        } else {
            yVelocity *= Y_VELOCITY_DAMPING;
        }

        return {
            grounded: true,
            suppressSteering: false,
            targetY,
            yVelocity,
        };
    }

    // Airborne — apply gravity, clamp terminal velocity
    let yVelocity = currentYVelocity - GRAVITY * dtSeconds;
    yVelocity = Math.max(yVelocity, -MAX_Y_VELOCITY);

    return {
        grounded: false,
        suppressSteering: true,
        targetY: undefined,
        yVelocity,
    };
};

// Composite filter flag: exclude sensors (obstacles, QueryFilterFlags.EXCLUDE_SENSORS = 8)
// and dynamic bodies (players, QueryFilterFlags.EXCLUDE_DYNAMIC = 4).
// We use numeric literals because the WASM module must be initialised before
// the enum values are populated, and this constant is evaluated at module load.
const GROUND_RAY_FILTER = 8 | 4; // EXCLUDE_SENSORS | EXCLUDE_DYNAMIC

/**
 * Performs a downward raycast and snaps the player's rigid body to the
 * detected ground surface. Called once per tick per player, after the
 * Rapier physics step.
 *
 * This function wraps the pure `computeGroundSnap` with actual Rapier
 * raycast calls so the core logic remains testable without WASM.
 *
 * **Ordering note**: This must run *after* `syncPlayerMotionFromRigidBody`
 * which sets positionY from the Rapier rigid body. This function then
 * overwrites positionY with the snapped value. The two-step ordering
 * in `roomSimulation.ts` is intentional and cannot be reordered.
 */
export const snapPlayerToGround = (
    rapier: typeof RAPIER,
    player: SimPlayerState,
    rigidBody: RigidBody,
    world: World,
    dtSeconds: number,
    isTrackFlat = false,
): GroundSnapResult => {
    const pos = rigidBody.translation();
    const vel = rigidBody.linvel();

    // Fast path: on completely flat tracks, skip the Rapier raycast entirely
    // and snap to ground level directly. This avoids per-tick raycast overhead
    // for all current production tracks (which have zero elevation).
    if (isTrackFlat) {
        const flatResult = computeGroundSnap({
            currentY: pos.y,
            currentYVelocity: vel.y,
            dtSeconds,
            // Simulate a hit at the expected distance for flat ground (Y=0)
            groundHitDistance: pos.y + RAY_PROBE_OFFSET_Y,
        });

        if (flatResult.grounded && flatResult.targetY !== undefined) {
            rigidBody.setTranslation({ x: pos.x, y: flatResult.targetY, z: pos.z }, true);
            // Store ground-surface Y for rendering (not collider-center Y)
            player.motion.positionY = flatResult.targetY - PLAYER_COLLIDER_HALF_HEIGHT_METERS;
        } else {
            player.motion.positionY = pos.y - PLAYER_COLLIDER_HALF_HEIGHT_METERS;
        }

        rigidBody.setLinvel({ x: vel.x, y: flatResult.yVelocity, z: vel.z }, true);
        // Persist grounded flag for steering suppression on next tick
        player.isGrounded = flatResult.grounded;
        return flatResult;
    }

    // Probe origin: slightly above the player to avoid self-intersection
    const probeOriginY = pos.y + RAY_PROBE_OFFSET_Y;
    const ray = new rapier.Ray({ x: pos.x, y: probeOriginY, z: pos.z }, { x: 0, y: -1, z: 0 });

    const hit = world.castRay(ray, GROUND_SNAP_MAX_DISTANCE, true, GROUND_RAY_FILTER);

    const result = computeGroundSnap({
        currentY: pos.y,
        currentYVelocity: vel.y,
        dtSeconds,
        groundHitDistance: hit !== null ? hit.timeOfImpact : null,
    });

    if (result.grounded && result.targetY !== undefined) {
        // Snap rigid body to collider-center Y
        rigidBody.setTranslation({ x: pos.x, y: result.targetY, z: pos.z }, true);
        // Store ground-surface Y for rendering (not collider-center Y)
        player.motion.positionY = result.targetY - PLAYER_COLLIDER_HALF_HEIGHT_METERS;
    } else {
        // Airborne — update Y from velocity
        player.motion.positionY = pos.y - PLAYER_COLLIDER_HALF_HEIGHT_METERS;
    }

    // Apply computed Y velocity
    rigidBody.setLinvel({ x: vel.x, y: result.yVelocity, z: vel.z }, true);

    // Persist grounded flag so applyDriveStep can suppress steering when airborne
    player.isGrounded = result.grounded;

    return result;
};
