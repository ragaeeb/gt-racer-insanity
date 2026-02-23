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
        movementMultiplier *= manifest.movementMultiplier;
        steeringMultiplier *= manifest.steeringMultiplier;
    }

    return {
        movementMultiplier: clamp(movementMultiplier, 0, 3),
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

export const applyDriveStep = ({ dtSeconds, player, rigidBody }: DriveStepArgs) => {
    const multipliers = getMotionMultipliers(player);

    applyScalarSpeed(player, dtSeconds, multipliers.movementMultiplier);
    applySteering(player, rigidBody, multipliers.steeringMultiplier);

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
    const deltaForward = desiredForwardSpeed - currentForwardSpeed;
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

export const syncPlayerMotionFromRigidBody = (player: SimPlayerState, rigidBody: RigidBody) => {
    const position = rigidBody.translation();
    const rotation = rigidBody.rotation();
    const yawRadians = getYawFromQuaternion(rotation.x, rotation.y, rotation.z, rotation.w);

    player.motion.positionX = position.x;
    player.motion.positionZ = position.z;
    player.motion.rotationY = yawRadians;
};

export const drainStartedPlayerCollisions = (
    eventQueue: EventQueue,
    playerIdByColliderHandle: Map<number, string>
): CollisionPair[] => {
    const uniquePairs = new Set<string>();
    const pairs: CollisionPair[] = [];

    eventQueue.drainCollisionEvents((firstColliderHandle, secondColliderHandle, started) => {
        if (!started) {
            return;
        }

        const firstPlayerId = playerIdByColliderHandle.get(firstColliderHandle) ?? null;
        const secondPlayerId = playerIdByColliderHandle.get(secondColliderHandle) ?? null;

        if (!firstPlayerId || !secondPlayerId || firstPlayerId === secondPlayerId) {
            return;
        }

        const [a, b] = firstPlayerId < secondPlayerId
            ? [firstPlayerId, secondPlayerId]
            : [secondPlayerId, firstPlayerId];

        const key = `${a}:${b}`;
        if (uniquePairs.has(key)) {
            return;
        }

        uniquePairs.add(key);
        pairs.push({
            firstPlayerId: a,
            secondPlayerId: b,
        });
    });

    return pairs;
};
