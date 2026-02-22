import { describe, expect, it } from 'bun:test';
import {
    DEFAULT_CAR_PHYSICS_CONFIG,
    stepCarMotion,
    type CarControlState,
    type CarMotionState,
} from './carPhysics';

const noInput: CarControlState = {
    isUp: false,
    isDown: false,
    isLeft: false,
    isRight: false,
};

const defaultState: CarMotionState = {
    speed: 0,
    rotationY: 0,
    positionX: 0,
    positionZ: 0,
};

describe('stepCarMotion', () => {
    it('should accelerate forward when the up control is pressed', () => {
        const next = stepCarMotion(
            defaultState,
            { ...noInput, isUp: true },
            1
        );

        expect(next.speed).toEqual(DEFAULT_CAR_PHYSICS_CONFIG.acceleration);
        expect(next.positionZ).toBeGreaterThan(0);
    });

    it('should apply friction towards zero when there is no input', () => {
        const next = stepCarMotion(
            { ...defaultState, speed: 5 },
            noInput,
            1
        );

        expect(next.speed).toEqual(0);
    });

    it('should clamp forward and reverse speeds', () => {
        const fastForward = stepCarMotion(
            { ...defaultState, speed: 100 },
            noInput,
            0
        );
        const fastReverse = stepCarMotion(
            { ...defaultState, speed: -100 },
            noInput,
            0
        );

        expect(fastForward.speed).toEqual(DEFAULT_CAR_PHYSICS_CONFIG.maxForwardSpeed);
        expect(fastReverse.speed).toEqual(-DEFAULT_CAR_PHYSICS_CONFIG.maxReverseSpeed);
    });

    it('should rotate left while moving forward', () => {
        const next = stepCarMotion(
            { ...defaultState, speed: 8 },
            { ...noInput, isLeft: true, isUp: true },
            1
        );

        expect(next.rotationY).toBeGreaterThan(0);
    });

    it('should rotate right while reversing', () => {
        const next = stepCarMotion(
            { ...defaultState, speed: -8 },
            { ...noInput, isRight: true, isDown: true },
            1
        );

        expect(next.rotationY).toBeGreaterThan(0);
    });
});
