import type { EventQueue, RigidBody } from '@dimforge/rapier3d-compat';
import { updateDriftState } from '@/server/sim/driftSystem';
import type { SimPlayerState } from '@/server/sim/types';
import { getStatusEffectManifestById } from '@/shared/game/effects/statusEffectManifest';
import { DEFAULT_GAMEPLAY_TUNING } from '@/shared/game/tuning/gameplayTuning';
import { DEFAULT_DRIFT_CONFIG } from '@/shared/game/vehicle/driftConfig';
import { getVehicleClassManifestById } from '@/shared/game/vehicle/vehicleClassManifest';

type CollisionPair = {
    firstPlayerId: string;
    secondPlayerId: string;
};

type MotionMultipliers = {
    movementMultiplier: number;
    steeringMultiplier: number;
};

type DriveStepArgs = {
    dtSeconds: number;
    nowMs: number;
    player: SimPlayerState;
    rigidBody: RigidBody;
};

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(value, max));
};

const normalizeAngle = (angleRadians: number) => {
    return Math.atan2(Math.sin(angleRadians), Math.cos(angleRadians));
};

const getYawFromQuaternion = (x: number, y: number, z: number, w: number) => {
    const sinyCosp = 2 * (w * y + x * z);
    const cosyCosp = 1 - 2 * (y * y + z * z);
    return normalizeAngle(Math.atan2(sinyCosp, cosyCosp));
};

const getMotionMultipliers = (player: SimPlayerState): MotionMultipliers => {
    let movementMultiplier = 1;
    let steeringMultiplier = 1;

    for (const effect of player.activeEffects) {
        const manifest = getStatusEffectManifestById(effect.effectType);
        if (!manifest) {
            continue;
        }
        movementMultiplier *= manifest.movementMultiplier;
        steeringMultiplier *= manifest.steeringMultiplier;
    }

    return {
        movementMultiplier: clamp(movementMultiplier, 0, 5),
        steeringMultiplier: clamp(steeringMultiplier, 0, 2),
    };
};

const applyScalarSpeed = (player: SimPlayerState, dtSeconds: number, movementMultiplier: number) => {
    const vehicleClass = getVehicleClassManifestById(player.vehicleId);
    const maxForwardSpeed = vehicleClass.physics.maxForwardSpeed * movementMultiplier;
    const maxReverseSpeed = vehicleClass.physics.maxReverseSpeed * movementMultiplier;
    const acceleration = vehicleClass.physics.acceleration * movementMultiplier;
    const friction = vehicleClass.physics.friction;

    let speed = player.motion.speed;

    if (player.inputState.throttle > 0.01) {
        speed += acceleration * player.inputState.throttle * dtSeconds;
    } else if (player.inputState.throttle < -0.01) {
        speed += acceleration * player.inputState.throttle * dtSeconds;
    } else if (speed > 0) {
        speed = Math.max(0, speed - friction * dtSeconds);
    } else if (speed < 0) {
        speed = Math.min(0, speed + friction * dtSeconds);
    }

    if (player.inputState.brake || player.inputState.handbrake) {
        // When handbrake + throttle are both active (drift scenario), use a much
        // lighter braking factor so the car decelerates gently instead of stopping.
        // Without throttle, handbrake still brakes at full force.
        const isThrottling = player.inputState.throttle > 0.01;
        const brakingMultiplier = player.inputState.handbrake ? (isThrottling ? 0.6 : 2.1) : 1.4;
        if (speed > 0) {
            speed = Math.max(0, speed - acceleration * brakingMultiplier * dtSeconds);
        } else {
            speed = Math.min(0, speed + acceleration * brakingMultiplier * dtSeconds);
        }
    }

    player.motion.speed = clamp(speed, -maxReverseSpeed, maxForwardSpeed);
};

const applySteering = (player: SimPlayerState, rigidBody: RigidBody, steeringMultiplier: number) => {
    const vehicleClass = getVehicleClassManifestById(player.vehicleId);
    const steering = clamp(player.inputState.steering, -1, 1);

    if (Math.abs(player.motion.speed) < vehicleClass.physics.minTurnSpeed || Math.abs(steering) < 0.01) {
        rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        return;
    }

    const direction = player.motion.speed >= 0 ? 1 : -1;
    const yawSpeed = steering * vehicleClass.physics.turnSpeed * direction * steeringMultiplier;
    rigidBody.setAngvel({ x: 0, y: yawSpeed, z: 0 }, true);
};

const MAX_IMPULSE_ACCELERATION_FACTOR = 3;

export const applyDriveStep = ({ dtSeconds, nowMs, player, rigidBody }: DriveStepArgs) => {
    const multipliers = getMotionMultipliers(player);

    applyScalarSpeed(player, dtSeconds, multipliers.movementMultiplier);
    applySteering(player, rigidBody, multipliers.steeringMultiplier);

    const vehicleClass = getVehicleClassManifestById(player.vehicleId);
    const rotation = rigidBody.rotation();
    const yawRadians = getYawFromQuaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const forwardX = Math.sin(yawRadians);
    const forwardZ = Math.cos(yawRadians);
    const rightX = Math.cos(yawRadians);
    const rightZ = -Math.sin(yawRadians);

    const currentVelocity = rigidBody.linvel();
    const currentForwardSpeed = currentVelocity.x * forwardX + currentVelocity.z * forwardZ;
    const currentLateralSpeed = currentVelocity.x * rightX + currentVelocity.z * rightZ;

    const desiredForwardSpeed = player.motion.speed;
    const rawDelta = desiredForwardSpeed - currentForwardSpeed;
    const maxDelta =
        vehicleClass.physics.acceleration *
        multipliers.movementMultiplier *
        dtSeconds *
        MAX_IMPULSE_ACCELERATION_FACTOR;
    const deltaForward = clamp(rawDelta, -maxDelta, maxDelta);
    const impulseForward = deltaForward * rigidBody.mass();

    // Drift-state-driven lateral damping (replaces hard-coded 0.65)
    const driftResult = updateDriftState(player, nowMs, DEFAULT_DRIFT_CONFIG);
    const lateralDamping = currentLateralSpeed * rigidBody.mass() * driftResult.lateralFrictionMultiplier;

    rigidBody.applyImpulse(
        {
            x: forwardX * impulseForward - rightX * lateralDamping,
            y: 0,
            z: forwardZ * impulseForward - rightZ * lateralDamping,
        },
        true,
    );

    // Apply drift exit boost impulse if granted
    if (driftResult.boostImpulse > 0) {
        const boostForce = driftResult.boostImpulse * rigidBody.mass();
        rigidBody.applyImpulse({ x: forwardX * boostForce, y: 0, z: forwardZ * boostForce }, true);
    }
};

export const syncPlayerMotionFromRigidBody = (
    player: SimPlayerState,
    rigidBody: RigidBody,
    trackBoundaryX?: number,
) => {
    const position = rigidBody.translation();
    const rotation = rigidBody.rotation();
    const yawRadians = getYawFromQuaternion(rotation.x, rotation.y, rotation.z, rotation.w);

    let x = position.x;
    if (trackBoundaryX !== undefined && Math.abs(x) > trackBoundaryX) {
        x = clamp(x, -trackBoundaryX, trackBoundaryX);
        rigidBody.setTranslation({ x, y: position.y, z: position.z }, true);

        // Zero only the lateral (x) velocity — preserve forward (z) speed so
        // the car slides along the wall instead of coming to a dead stop.
        // This is critical for the drift FSM: a full speed-zero would bail the
        // DRIFTING state (requires speed ≥ 5 m/s) every time the car touches the wall.
        const currentVel = rigidBody.linvel();
        rigidBody.setLinvel({ x: 0, y: currentVel.y, z: currentVel.z }, true);
    }

    player.motion.positionX = x;
    player.motion.positionY = position.y;
    player.motion.positionZ = position.z;
    player.motion.rotationY = yawRadians;
};

const BUMP_IMPULSE_STRENGTH = 25;
const BUMP_LATERAL_IMPULSE_FACTOR = 0.35;
const MAX_POST_BUMP_SPEED_MPS = 4.5;
const POST_BUMP_VELOCITY_DAMPING = 0.45;
const POST_BUMP_ANGULAR_DAMPING = 0.35;
const IMPULSE_SPEED_SCALE_CEILING_MPS = 30;

/** Hard impulse clamp in N·s — prevents physics explosions (R04 mitigation). */
const MAX_IMPULSE = DEFAULT_GAMEPLAY_TUNING.collision.maxImpulse;
/** Newton's 3rd reaction multiplier for the attacker: 0.3 = trucks feel powerful. */
const ARCADE_BIAS = DEFAULT_GAMEPLAY_TUNING.collision.arcadeBias;
/** Raw contact force divisor — normalises Rapier force magnitude into 0–2 impulse scale. */
const FORCE_NORMALISATION_BASE = DEFAULT_GAMEPLAY_TUNING.collision.forceNormalisationBase;
/** Upper bound for the contact-force scaling factor. */
const FORCE_SCALE_CAP = 2.0;

export const applyPlayerBumpResponse = (
    playerA: SimPlayerState,
    playerB: SimPlayerState,
    rigidBodyMap: Map<string, RigidBody>,
    contactForceMagnitude?: number,
) => {
    const rbA = rigidBodyMap.get(playerA.id);
    const rbB = rigidBodyMap.get(playerB.id);
    if (!rbA || !rbB) {
        return;
    }

    const posA = rbA.translation();
    const posB = rbB.translation();
    let dx = posB.x - posA.x;
    let dz = posB.z - posA.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.001) {
        dx = 0;
        dz = 1;
    } else {
        dx /= dist;
        dz /= dist;
    }
    const lateralX = -dz;
    const lateralZ = dx;
    const lateralSign = playerA.id < playerB.id ? 1 : -1;

    const massA = rbA.mass();
    const massB = rbB.mass();
    const totalMass = massA + massB;
    const reducedMass = (massA * massB) / totalMass;

    const impactSpeed = Math.max(Math.abs(playerA.motion.speed), Math.abs(playerB.motion.speed));
    const speedFactor = clamp(impactSpeed / IMPULSE_SPEED_SCALE_CEILING_MPS, 0.12, 1);

    // Scale by contact force if available (normalised to 0–FORCE_SCALE_CAP range).
    // Floor at 0.1 so a zero contactForceMagnitude doesn't nullify the impulse entirely.
    const forceScale =
        contactForceMagnitude !== undefined
            ? Math.max(0.1, Math.min(contactForceMagnitude / FORCE_NORMALISATION_BASE, FORCE_SCALE_CAP))
            : 1.0;

    const scaledStrength = BUMP_IMPULSE_STRENGTH * speedFactor * forceScale;

    // Reduced-mass base impulse — same physics magnitude applied to both bodies,
    // but lighter cars experience a larger velocity delta (impulse / mass).
    const baseImpulse = scaledStrength * reducedMass;

    // Mass-ratio–scaled impulse TO each player:
    //   impulseToA = how hard A gets hit (scaled by B's relative mass)
    //   impulseToB = how hard B gets hit (scaled by A's relative mass)
    const massRatioBtoA = massB / massA; // > 1 if B is heavier → A gets hit harder
    const massRatioAtoB = massA / massB; // > 1 if A is heavier → B gets hit harder

    const rawImpulseToA = baseImpulse * massRatioBtoA;
    const rawImpulseToB = baseImpulse * massRatioAtoB;

    // Arcade bias: attacker gets only ARCADE_BIAS fraction of the reaction impulse.
    // This makes a heavy car (truck) feel powerful — it barely recoils on hit.
    const reactionToA = rawImpulseToB * ARCADE_BIAS;
    const reactionToB = rawImpulseToA * ARCADE_BIAS;

    // Clamp the final totals (not the per-player raws) so the arcade reaction
    // cannot push the combined impulse above the MAX_IMPULSE hard cap.
    const totalImpulseA = Math.min(rawImpulseToA + reactionToA, MAX_IMPULSE);
    const totalImpulseB = Math.min(rawImpulseToB + reactionToB, MAX_IMPULSE);

    const lateralImpulseA = totalImpulseA * BUMP_LATERAL_IMPULSE_FACTOR;
    const lateralImpulseB = totalImpulseB * BUMP_LATERAL_IMPULSE_FACTOR;

    rbA.applyImpulse(
        {
            x: -dx * totalImpulseA + lateralX * lateralImpulseA * lateralSign,
            y: 0,
            z: -dz * totalImpulseA + lateralZ * lateralImpulseA * lateralSign,
        },
        true,
    );
    rbB.applyImpulse(
        {
            x: dx * totalImpulseB - lateralX * lateralImpulseB * lateralSign,
            y: 0,
            z: dz * totalImpulseB - lateralZ * lateralImpulseB * lateralSign,
        },
        true,
    );

    const dampAndClampPostBumpVelocity = (rigidBody: RigidBody) => {
        const currentVelocity = rigidBody.linvel();
        const dampedX = currentVelocity.x * POST_BUMP_VELOCITY_DAMPING;
        const dampedZ = currentVelocity.z * POST_BUMP_VELOCITY_DAMPING;
        const dampedPlanarSpeed = Math.hypot(dampedX, dampedZ);

        if (dampedPlanarSpeed > MAX_POST_BUMP_SPEED_MPS && dampedPlanarSpeed > 0.001) {
            const speedScale = MAX_POST_BUMP_SPEED_MPS / dampedPlanarSpeed;
            rigidBody.setLinvel(
                {
                    x: dampedX * speedScale,
                    y: 0,
                    z: dampedZ * speedScale,
                },
                true,
            );
        } else {
            rigidBody.setLinvel(
                {
                    x: dampedX,
                    y: 0,
                    z: dampedZ,
                },
                true,
            );
        }

        const currentAngVel = rigidBody.angvel();
        rigidBody.setAngvel(
            {
                x: 0,
                y: currentAngVel.y * POST_BUMP_ANGULAR_DAMPING,
                z: 0,
            },
            true,
        );
    };

    dampAndClampPostBumpVelocity(rbA);
    dampAndClampPostBumpVelocity(rbB);

    // Keep scalar speed in sync with the bump recovery lock; drive step is skipped while
    // recovering and this prevents stale pre-impact scalar speed from persisting in gameplay logic.
    playerA.motion.speed = 0;
    playerB.motion.speed = 0;
};

export type ObstacleHit = {
    playerId: string;
};

export type DrainCollisionResult = {
    endedPlayerPairs: CollisionPair[];
    obstacleHits: ObstacleHit[];
    startedPlayerPairs: CollisionPair[];
};

export const drainStartedCollisions = (
    eventQueue: EventQueue,
    playerIdByColliderHandle: Map<number, string>,
    obstacleColliderHandles: Set<number>,
): DrainCollisionResult => {
    const uniqueStartedPairs = new Set<string>();
    const uniqueEndedPairs = new Set<string>();
    const startedPlayerPairs: CollisionPair[] = [];
    const endedPlayerPairs: CollisionPair[] = [];
    const hitPlayerIds = new Set<string>();
    const obstacleHits: ObstacleHit[] = [];

    eventQueue.drainCollisionEvents((firstColliderHandle, secondColliderHandle, started) => {
        const firstPlayerId = playerIdByColliderHandle.get(firstColliderHandle) ?? null;
        const secondPlayerId = playerIdByColliderHandle.get(secondColliderHandle) ?? null;
        const firstIsObstacle = obstacleColliderHandles.has(firstColliderHandle);
        const secondIsObstacle = obstacleColliderHandles.has(secondColliderHandle);

        if (started && firstPlayerId && secondIsObstacle && !hitPlayerIds.has(firstPlayerId)) {
            hitPlayerIds.add(firstPlayerId);
            obstacleHits.push({ playerId: firstPlayerId });
            return;
        }

        if (started && secondPlayerId && firstIsObstacle && !hitPlayerIds.has(secondPlayerId)) {
            hitPlayerIds.add(secondPlayerId);
            obstacleHits.push({ playerId: secondPlayerId });
            return;
        }

        if (!firstPlayerId || !secondPlayerId || firstPlayerId === secondPlayerId) {
            return;
        }

        const [a, b] =
            firstPlayerId < secondPlayerId ? [firstPlayerId, secondPlayerId] : [secondPlayerId, firstPlayerId];

        const key = `${a}:${b}`;
        if (started) {
            if (uniqueStartedPairs.has(key)) {
                return;
            }
            uniqueStartedPairs.add(key);
            startedPlayerPairs.push({
                firstPlayerId: a,
                secondPlayerId: b,
            });
        } else {
            if (uniqueEndedPairs.has(key)) {
                return;
            }
            uniqueEndedPairs.add(key);
            endedPlayerPairs.push({
                firstPlayerId: a,
                secondPlayerId: b,
            });
        }
    });

    return { endedPlayerPairs, obstacleHits, startedPlayerPairs };
};
