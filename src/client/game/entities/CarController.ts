import * as THREE from 'three';
import type { InputManager } from '@/client/game/systems/InputManager';
import { type CarPhysicsConfig, DEFAULT_CAR_PHYSICS_CONFIG, stepCarMotion } from '@/shared/game/carPhysics';

type CarControllerState = {
    position: THREE.Vector3;
    rotationY: number;
};

export class CarController {
    private speed = 0;
    private readonly physicsConfig: CarPhysicsConfig;
    private cruiseLatchActive = false;
    private isBrakingInputActive = false;
    private isAcceleratingInputActive = false;
    private _movementMultiplier = 1;
    private driveLockUntilMs = 0;

    constructor(physicsConfig?: CarPhysicsConfig) {
        this.physicsConfig = physicsConfig ?? DEFAULT_CAR_PHYSICS_CONFIG;
    }

    public setMovementMultiplier = (multiplier: number) => {
        this._movementMultiplier = Math.max(0, multiplier);
    };

    public updateLocal = (state: CarControllerState, inputManager: InputManager, dt: number): CarControllerState => {
        if (Date.now() < this.driveLockUntilMs) {
            this.speed = 0;
            this.cruiseLatchActive = false;
            this.isBrakingInputActive = false;
            this.isAcceleratingInputActive = false;
            return {
                position: state.position.clone(),
                rotationY: state.rotationY,
            };
        }

        const isUpPressed = inputManager.isKeyPressed('KeyW') || inputManager.isKeyPressed('ArrowUp');
        const isDownPressed = inputManager.isKeyPressed('KeyS') || inputManager.isKeyPressed('ArrowDown');
        const isLeftPressed = inputManager.isKeyPressed('KeyA') || inputManager.isKeyPressed('ArrowLeft');
        const isRightPressed = inputManager.isKeyPressed('KeyD') || inputManager.isKeyPressed('ArrowRight');
        const isCruiseEnabled = inputManager.isCruiseControlEnabled();
        const isPrecisionOverrideActive = inputManager.isPrecisionOverrideActive();
        const m = this._movementMultiplier;
        const effectiveMaxForward = this.physicsConfig.maxForwardSpeed * m;
        const topSpeedLatchThreshold = effectiveMaxForward * 0.98;
        this.isBrakingInputActive = isDownPressed;
        this.isAcceleratingInputActive = isUpPressed;

        if (!isCruiseEnabled || isPrecisionOverrideActive) {
            this.cruiseLatchActive = false;
        }

        if (isDownPressed) {
            this.cruiseLatchActive = false;
        }

        if (isUpPressed && this.speed >= topSpeedLatchThreshold) {
            this.cruiseLatchActive = true;
        }

        const shouldAutoCruise =
            isCruiseEnabled && !isPrecisionOverrideActive && this.cruiseLatchActive && !isDownPressed;

        const scaledConfig =
            m === 1
                ? this.physicsConfig
                : {
                      ...this.physicsConfig,
                      maxForwardSpeed: effectiveMaxForward,
                      maxReverseSpeed: this.physicsConfig.maxReverseSpeed * m,
                      acceleration: this.physicsConfig.acceleration * m,
                  };

        const movement = stepCarMotion(
            {
                speed: this.speed,
                rotationY: state.rotationY,
                positionX: state.position.x,
                positionY: state.position.y,
                positionZ: state.position.z,
            },
            {
                isUp: isUpPressed || shouldAutoCruise,
                isDown: isDownPressed,
                isLeft: isLeftPressed,
                isRight: isRightPressed,
            },
            dt,
            scaledConfig,
        );

        this.speed = movement.speed;

        return {
            position: new THREE.Vector3(movement.positionX, state.position.y, movement.positionZ),
            rotationY: movement.rotationY,
        };
    };

    public updateRemote = (
        state: CarControllerState,
        targetPosition: THREE.Vector3,
        targetRotationY: number,
    ): CarControllerState => {
        const nextPosition = state.position.clone().lerp(targetPosition, 0.2);
        const diff = targetRotationY - state.rotationY;
        const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const nextRotationY = state.rotationY + normalizedDiff * 0.2;

        return {
            position: nextPosition,
            rotationY: nextRotationY,
        };
    };

    public reset = () => {
        this.speed = 0;
        this.cruiseLatchActive = false;
        this.isBrakingInputActive = false;
        this.isAcceleratingInputActive = false;
        this.driveLockUntilMs = 0;
    };

    public applyDriveLock = (durationMs: number) => {
        const clampedDurationMs = Math.max(0, durationMs);
        this.driveLockUntilMs = Math.max(this.driveLockUntilMs, Date.now() + clampedDurationMs);
        this.speed = 0;
        this.cruiseLatchActive = false;
    };

    public syncAuthoritativeSpeed = (speed: number) => {
        if (Date.now() < this.driveLockUntilMs) {
            return;
        }
        const maxForwardSpeed = this.physicsConfig.maxForwardSpeed * this._movementMultiplier;
        const maxReverseSpeed = this.physicsConfig.maxReverseSpeed * this._movementMultiplier;
        this.speed = THREE.MathUtils.clamp(speed, -maxReverseSpeed, maxForwardSpeed);
    };

    public getSpeed = () => {
        return this.speed;
    };

    public getMaxSpeed = () => {
        return this.physicsConfig.maxForwardSpeed * this._movementMultiplier;
    };

    public isBraking = () => {
        return this.isBrakingInputActive;
    };

    public isAccelerating = () => {
        return this.isAcceleratingInputActive;
    };
}
