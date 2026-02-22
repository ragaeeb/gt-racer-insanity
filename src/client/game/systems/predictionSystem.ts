import {
    DEFAULT_CAR_PHYSICS_CONFIG,
    stepCarMotion,
    type CarMotionState,
    type CarPhysicsConfig,
} from '@/shared/game/carPhysics';
import type { ClientInputFrame } from '@/shared/network/types';

const toControlState = (frame: ClientInputFrame) => {
    return {
        isDown: frame.controls.throttle < -0.05 || frame.controls.brake || frame.controls.handbrake,
        isLeft: frame.controls.steering < -0.1,
        isRight: frame.controls.steering > 0.1,
        isUp: frame.controls.throttle > 0.05 && !frame.controls.brake,
    };
};

export const applyPredictionStep = (
    state: CarMotionState,
    frame: ClientInputFrame,
    dtSeconds: number,
    config: CarPhysicsConfig = DEFAULT_CAR_PHYSICS_CONFIG
): CarMotionState => {
    return stepCarMotion(state, toControlState(frame), dtSeconds, config);
};
