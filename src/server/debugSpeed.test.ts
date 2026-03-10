import { describe, expect, it } from 'bun:test';
import { MAX_DEBUG_SPEED_MULTIPLIER, sanitizeDebugSpeedMultiplier } from './debugSpeed';

describe('sanitizeDebugSpeedMultiplier', () => {
    it('should clamp invalid values to the default multiplier', () => {
        expect(sanitizeDebugSpeedMultiplier(undefined)).toEqual(1);
        expect(sanitizeDebugSpeedMultiplier(Number.NaN)).toEqual(1);
    });

    it('should clamp values into the supported multiplier range', () => {
        expect(sanitizeDebugSpeedMultiplier(0)).toEqual(1);
        expect(sanitizeDebugSpeedMultiplier(3)).toEqual(3);
        expect(sanitizeDebugSpeedMultiplier(99)).toEqual(MAX_DEBUG_SPEED_MULTIPLIER);
    });
});
