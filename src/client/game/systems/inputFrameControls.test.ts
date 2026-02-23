import { describe, expect, it } from 'bun:test';
import { resolveSteeringInput, resolveThrottleInput } from '@/client/game/systems/inputFrameControls';

describe('resolveSteeringInput', () => {
    it('should map left input to positive steering', () => {
        expect(resolveSteeringInput({ isLeftPressed: true, isRightPressed: false })).toEqual(1);
    });

    it('should map right input to negative steering', () => {
        expect(resolveSteeringInput({ isLeftPressed: false, isRightPressed: true })).toEqual(-1);
    });

    it('should return zero steering when both directions are active', () => {
        expect(resolveSteeringInput({ isLeftPressed: true, isRightPressed: true })).toEqual(0);
    });

    it('should return zero steering when no direction is active', () => {
        expect(resolveSteeringInput({ isLeftPressed: false, isRightPressed: false })).toEqual(0);
    });
});

describe('resolveThrottleInput', () => {
    it('should latch cruise at top speed and keep throttle after releasing up', () => {
        const latched = resolveThrottleInput({
            cruiseControlEnabled: true,
            currentSpeed: 44,
            isDownPressed: false,
            isPrecisionOverrideActive: false,
            isUpPressed: true,
            maxForwardSpeed: 44,
            previousCruiseLatchActive: false,
        });

        expect(latched.cruiseLatchActive).toEqual(true);
        expect(latched.throttle).toEqual(2);

        const autoCruise = resolveThrottleInput({
            cruiseControlEnabled: true,
            currentSpeed: 43.5,
            isDownPressed: false,
            isPrecisionOverrideActive: false,
            isUpPressed: false,
            maxForwardSpeed: 44,
            previousCruiseLatchActive: latched.cruiseLatchActive,
        });

        expect(autoCruise.cruiseLatchActive).toEqual(true);
        expect(autoCruise.throttle).toEqual(1);
    });

    it('should clear cruise latch when pressing down', () => {
        const result = resolveThrottleInput({
            cruiseControlEnabled: true,
            currentSpeed: 42,
            isDownPressed: true,
            isPrecisionOverrideActive: false,
            isUpPressed: false,
            maxForwardSpeed: 44,
            previousCruiseLatchActive: true,
        });

        expect(result.cruiseLatchActive).toEqual(false);
        expect(result.throttle).toEqual(-1);
    });
});
