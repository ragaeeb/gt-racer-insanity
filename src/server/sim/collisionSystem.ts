import type { EventQueue, RigidBody } from '@dimforge/rapier3d-compat';
import { getVehicleClassManifestById } from '@/shared/game/vehicle/vehicleClassManifest';
import { getStatusEffectManifestById } from '@/shared/game/effects/statusEffectManifest';
import type { SimPlayerState } from '@/server/sim/types';

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
        const brakingMultiplier = player.inputState.handbrake ? 2.1 : 1.4;
        if (speed > 0) {
            speed = Math.max(0, speed - acceleration * brakingMultiplier * dtSeconds);
        } else {
            speed = Math.min(0, speed + acceleration * brakingMultiplier * dtSeconds);
        }
    }

    player.motion.speed = clamp(speed, -maxReverseSpeed, maxForwardSpeed);
};

const applySteering = (
    player: SimPlayerState,
    rigidBody: RigidBody,
    steeringMultiplier: number
) => {
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

export const applyDriveStep = ({ dtSeconds, player, rigidBody }: DriveStepArgs) => {
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
    const maxDelta = vehicleClass.physics.acceleration * multipliers.movementMultiplier * dtSeconds * MAX_IMPULSE_ACCELERATION_FACTOR;
    const deltaForward = clamp(rawDelta, -maxDelta, maxDelta);
    const impulseForward = deltaForward * rigidBody.mass();

    const lateralDamping = currentLateralSpeed * rigidBody.mass() * 0.65;

    rigidBody.applyImpulse(
        {
            x: forwardX * impulseForward - rightX * lateralDamping,
            y: 0,
            z: forwardZ * impulseForward - rightZ * lateralDamping,
        },
        true
    );
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
        rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        player.motion.speed = 0;
    }

    player.motion.positionX = x;
    player.motion.positionZ = position.z;
    player.motion.rotationY = yawRadians;
};

const BUMP_IMPULSE_STRENGTH = 25;
const BUMP_LATERAL_IMPULSE_FACTOR = 0.35;
const MAX_POST_BUMP_SPEED_MPS = 4.5;
const POST_BUMP_VELOCITY_DAMPING = 0.45;
const IMPULSE_SPEED_SCALE_CEILING_MPS = 30;

export const applyPlayerBumpResponse = (
    playerA: SimPlayerState,
    playerB: SimPlayerState,
    rigidBodyMap: Map<string, RigidBody>,
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
    const ratioA = massB / totalMass;
    const ratioB = massA / totalMass;

    const impactSpeed = Math.max(Math.abs(playerA.motion.speed), Math.abs(playerB.motion.speed));
    const speedFactor = clamp(impactSpeed / IMPULSE_SPEED_SCALE_CEILING_MPS, 0.12, 1);
    const scaledStrength = BUMP_IMPULSE_STRENGTH * speedFactor;

    const impulseA = scaledStrength * ratioA * massA;
    const impulseB = scaledStrength * ratioB * massB;
    const lateralImpulseA = impulseA * BUMP_LATERAL_IMPULSE_FACTOR;
    const lateralImpulseB = impulseB * BUMP_LATERAL_IMPULSE_FACTOR;

    rbA.applyImpulse(
        {
            x: -dx * impulseA + lateralX * lateralImpulseA * lateralSign,
            y: 0,
            z: -dz * impulseA + lateralZ * lateralImpulseA * lateralSign,
        },
        true,
    );
    rbB.applyImpulse(
        {
            x: dx * impulseB - lateralX * lateralImpulseB * lateralSign,
            y: 0,
            z: dz * impulseB - lateralZ * lateralImpulseB * lateralSign,
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
                y: currentAngVel.y * 0.35,
                z: 0,
            },
            true,
        );
    };

    dampAndClampPostBumpVelocity(rbA);
    dampAndClampPostBumpVelocity(rbB);

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

        const [a, b] = firstPlayerId < secondPlayerId
            ? [firstPlayerId, secondPlayerId]
            : [secondPlayerId, firstPlayerId];

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
