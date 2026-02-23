export const HARD_SNAP_THRESHOLD_METERS = 15;
export const PER_FRAME_BASE_ALPHA = 0.025;
export const MIN_CORRECTION_THRESHOLD = 0.5;
export const YAW_PER_FRAME_ALPHA = 0.03;

export const lerpAngle = (from: number, to: number, alpha: number): number => {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * alpha;
};

export const computeCorrectionAlpha = (positionError: number): number => {
    const errorRatio = Math.max(0, Math.min(1, positionError / HARD_SNAP_THRESHOLD_METERS));
    return PER_FRAME_BASE_ALPHA * (1 + errorRatio * 4);
};

export type CorrectionMode = 'hard' | 'none' | 'soft';

export const classifyCorrection = (positionError: number): CorrectionMode => {
    if (positionError >= HARD_SNAP_THRESHOLD_METERS) {
        return 'hard';
    }
    if (positionError >= MIN_CORRECTION_THRESHOLD) {
        return 'soft';
    }
    return 'none';
};

export const computeCameraLerpAlpha = (
    smoothedSpeed: number,
    minAlpha = 0.045,
    maxAlpha = 0.1,
    maxSpeedMps = 40,
): number => {
    const t = Math.max(0, Math.min(1, smoothedSpeed / maxSpeedMps));
    return maxAlpha + (minAlpha - maxAlpha) * t;
};
