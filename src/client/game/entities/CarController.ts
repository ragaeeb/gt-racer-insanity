import * as THREE from 'three';
import type { InputManager } from '@/client/game/systems/InputManager';
import { stepCarMotion } from '@/shared/game/carPhysics';

type CarControllerState = {
    position: THREE.Vector3;
    rotationY: number;
};

export class CarController {
    private speed = 0;
    private readonly maxSpeed = 40;
    private cruiseLatchActive = false;
    private isBrakingInputActive = false;
    private isAcceleratingInputActive = false;

    public updateLocal = (
        state: CarControllerState,
        inputManager: InputManager,
        dt: number
    ): CarControllerState => {
        const isUpPressed =
            inputManager.isKeyPressed('KeyW') || inputManager.isKeyPressed('ArrowUp');
        const isDownPressed =
            inputManager.isKeyPressed('KeyS') || inputManager.isKeyPressed('ArrowDown');
        const isLeftPressed =
            inputManager.isKeyPressed('KeyA') || inputManager.isKeyPressed('ArrowLeft');
        const isRightPressed =
            inputManager.isKeyPressed('KeyD') || inputManager.isKeyPressed('ArrowRight');
        const isCruiseEnabled = inputManager.isCruiseControlEnabled();
        const isPrecisionOverrideActive = inputManager.isPrecisionOverrideActive();
        const topSpeedLatchThreshold = this.maxSpeed * 0.98;
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
            isCruiseEnabled &&
            !isPrecisionOverrideActive &&
            this.cruiseLatchActive &&
            !isDownPressed;

        const movement = stepCarMotion(
            {
                speed: this.speed,
                rotationY: state.rotationY,
                positionX: state.position.x,
                positionZ: state.position.z,
            },
            {
                isUp: isUpPressed || shouldAutoCruise,
                isDown: isDownPressed,
                isLeft: isLeftPressed,
                isRight: isRightPressed,
            },
            dt
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
        targetRotationY: number
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
    };

    public getSpeed = () => {
        return this.speed;
    };

    public getMaxSpeed = () => {
        return this.maxSpeed;
    };

    public isBraking = () => {
        return this.isBrakingInputActive;
    };

    public isAccelerating = () => {
        return this.isAcceleratingInputActive;
    };
}
