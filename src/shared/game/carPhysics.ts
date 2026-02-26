export type CarControlState = {
    isUp: boolean;
    isDown: boolean;
    isLeft: boolean;
    isRight: boolean;
};

export type CarMotionState = {
    speed: number;
    rotationY: number;
    positionX: number;
    positionY: number;
    positionZ: number;
};

export type CarPhysicsConfig = {
    maxForwardSpeed: number;
    maxReverseSpeed: number;
    acceleration: number;
    deceleration: number;
    friction: number;
    turnSpeed: number;
    minTurnSpeed: number;
};

export const DEFAULT_CAR_PHYSICS_CONFIG: CarPhysicsConfig = {
    maxForwardSpeed: 40,
    maxReverseSpeed: 20,
    acceleration: 20,
    deceleration: 10,
    friction: 8,
    turnSpeed: 2.5,
    minTurnSpeed: 0.1,
};

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(value, max));
};

export const stepCarMotion = (
    state: CarMotionState,
    controls: CarControlState,
    dt: number,
    config: CarPhysicsConfig = DEFAULT_CAR_PHYSICS_CONFIG,
): CarMotionState => {
    let speed = state.speed;
    let rotationY = state.rotationY;
    let positionX = state.positionX;
    let positionZ = state.positionZ;

    if (controls.isUp) {
        speed += config.acceleration * dt;
    } else if (controls.isDown) {
        speed -= config.deceleration * dt;
    } else if (speed > 0) {
        speed = Math.max(0, speed - config.friction * dt);
    } else if (speed < 0) {
        speed = Math.min(0, speed + config.friction * dt);
    }

    speed = clamp(speed, -config.maxReverseSpeed, config.maxForwardSpeed);

    if (Math.abs(speed) > config.minTurnSpeed) {
        const turnDirection = speed > 0 ? 1 : -1;

        if (controls.isLeft) {
            rotationY += config.turnSpeed * dt * turnDirection;
        } else if (controls.isRight) {
            rotationY -= config.turnSpeed * dt * turnDirection;
        }
    }

    positionX += Math.sin(rotationY) * speed * dt;
    positionZ += Math.cos(rotationY) * speed * dt;

    return {
        positionX,
        positionY: 0,
        positionZ,
        rotationY,
        speed,
    };
};
