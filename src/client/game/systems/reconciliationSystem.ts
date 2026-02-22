import type { CarMotionState } from '@/shared/game/carPhysics';

export type ReconciliationThresholds = {
    positionThreshold: number;
    yawThresholdRadians: number;
};

export type ReconciliationResult = {
    correctedState: CarMotionState;
    positionError: number;
    wasCorrected: boolean;
    yawError: number;
};

const normalizeAngleDelta = (current: number, target: number) => {
    return Math.atan2(Math.sin(target - current), Math.cos(target - current));
};

export const reconcileMotionState = (
    predictedState: CarMotionState,
    authoritativeState: CarMotionState,
    thresholds: ReconciliationThresholds
): ReconciliationResult => {
    const deltaX = authoritativeState.positionX - predictedState.positionX;
    const deltaZ = authoritativeState.positionZ - predictedState.positionZ;
    const positionError = Math.hypot(deltaX, deltaZ);
    const yawError = Math.abs(normalizeAngleDelta(predictedState.rotationY, authoritativeState.rotationY));

    if (positionError <= thresholds.positionThreshold && yawError <= thresholds.yawThresholdRadians) {
        return {
            correctedState: predictedState,
            positionError,
            wasCorrected: false,
            yawError,
        };
    }

    return {
        correctedState: authoritativeState,
        positionError,
        wasCorrected: true,
        yawError,
    };
};
