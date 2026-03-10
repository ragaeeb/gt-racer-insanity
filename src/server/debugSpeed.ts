export const MAX_DEBUG_SPEED_MULTIPLIER = 9;

export const sanitizeDebugSpeedMultiplier = (value: unknown) => {
    if (!Number.isFinite(value)) {
        return 1;
    }

    return Math.max(1, Math.min(MAX_DEBUG_SPEED_MULTIPLIER, Number(value)));
};
