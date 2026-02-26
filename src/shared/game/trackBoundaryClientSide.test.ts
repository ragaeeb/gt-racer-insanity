import { describe, expect, it } from 'bun:test';
import { PLAYER_COLLIDER_HALF_WIDTH_METERS } from '@/shared/physics/constants';
import {
    type CarControlState,
    type CarMotionState,
    type CarPhysicsConfig,
    DEFAULT_CAR_PHYSICS_CONFIG,
    stepCarMotion,
} from './carPhysics';
import { BOOST_MOVEMENT_MULTIPLIER } from './effects/statusEffectManifest';
import { DEFAULT_TRACK_WIDTH_METERS } from './track/trackManifest';

const TRACK_BOUNDARY_X = DEFAULT_TRACK_WIDTH_METERS * 0.5 - PLAYER_COLLIDER_HALF_WIDTH_METERS;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const fullThrottle: CarControlState = { isUp: true, isDown: false, isLeft: false, isRight: false };
const origin: CarMotionState = { speed: 0, rotationY: 0, positionX: 0, positionY: 0, positionZ: 0 };
const dt = 1 / 60;

const scaleConfig = (config: CarPhysicsConfig, multiplier: number): CarPhysicsConfig => ({
    ...config,
    maxForwardSpeed: config.maxForwardSpeed * multiplier,
    maxReverseSpeed: config.maxReverseSpeed * multiplier,
    acceleration: config.acceleration * multiplier,
});

describe('client-side track boundary enforcement', () => {
    it('should keep car within track boundary when turning right continuously', () => {
        const turnRight: CarControlState = { isUp: true, isDown: false, isLeft: false, isRight: true };
        let state = { ...origin };
        let maxAbsX = 0;

        for (let i = 0; i < 600; i += 1) {
            state = stepCarMotion(state, turnRight, dt);
            state = {
                ...state,
                positionX: clamp(state.positionX, -TRACK_BOUNDARY_X, TRACK_BOUNDARY_X),
            };
            maxAbsX = Math.max(maxAbsX, Math.abs(state.positionX));
        }

        expect(maxAbsX).toBeGreaterThan(1);
        expect(Math.abs(state.positionX)).toBeLessThanOrEqual(TRACK_BOUNDARY_X);
    });

    it('should keep car within track boundary when turning left continuously', () => {
        const turnLeft: CarControlState = { isUp: true, isDown: false, isLeft: true, isRight: false };
        let state = { ...origin };
        let maxAbsX = 0;

        for (let i = 0; i < 600; i += 1) {
            state = stepCarMotion(state, turnLeft, dt);
            state = {
                ...state,
                positionX: clamp(state.positionX, -TRACK_BOUNDARY_X, TRACK_BOUNDARY_X),
            };
            maxAbsX = Math.max(maxAbsX, Math.abs(state.positionX));
        }

        expect(maxAbsX).toBeGreaterThan(1);
        expect(Math.abs(state.positionX)).toBeLessThanOrEqual(TRACK_BOUNDARY_X);
    });

    it('should keep boosted car within track boundary', () => {
        const turnRight: CarControlState = { isUp: true, isDown: false, isLeft: false, isRight: true };
        const boostedConfig = scaleConfig(DEFAULT_CAR_PHYSICS_CONFIG, BOOST_MOVEMENT_MULTIPLIER);
        let state = { ...origin };
        let maxAbsX = 0;

        for (let i = 0; i < 600; i += 1) {
            state = stepCarMotion(state, turnRight, dt, boostedConfig);
            state = {
                ...state,
                positionX: clamp(state.positionX, -TRACK_BOUNDARY_X, TRACK_BOUNDARY_X),
            };
            maxAbsX = Math.max(maxAbsX, Math.abs(state.positionX));
        }

        expect(maxAbsX).toBeGreaterThan(1);
        expect(Math.abs(state.positionX)).toBeLessThanOrEqual(TRACK_BOUNDARY_X);
    });

    it('should allow forward progress after wall clamp', () => {
        const turnRight: CarControlState = { isUp: true, isDown: false, isLeft: false, isRight: true };
        let state = { ...origin };

        for (let i = 0; i < 300; i += 1) {
            state = stepCarMotion(state, turnRight, dt);
            state = {
                ...state,
                positionX: clamp(state.positionX, -TRACK_BOUNDARY_X, TRACK_BOUNDARY_X),
            };
        }

        const zAtWall = state.positionZ;

        for (let i = 0; i < 300; i += 1) {
            state = stepCarMotion(state, fullThrottle, dt);
            state = {
                ...state,
                positionX: clamp(state.positionX, -TRACK_BOUNDARY_X, TRACK_BOUNDARY_X),
            };
        }

        expect(state.positionZ).toBeGreaterThan(zAtWall + 10);
    });

    it('should clamp symmetrically for both walls', () => {
        const turnRight: CarControlState = { isUp: true, isDown: false, isLeft: false, isRight: true };
        const turnLeft: CarControlState = { isUp: true, isDown: false, isLeft: true, isRight: false };
        let rightState = { ...origin };
        let leftState = { ...origin };

        for (let i = 0; i < 600; i += 1) {
            rightState = stepCarMotion(rightState, turnRight, dt);
            rightState = {
                ...rightState,
                positionX: clamp(rightState.positionX, -TRACK_BOUNDARY_X, TRACK_BOUNDARY_X),
            };

            leftState = stepCarMotion(leftState, turnLeft, dt);
            leftState = {
                ...leftState,
                positionX: clamp(leftState.positionX, -TRACK_BOUNDARY_X, TRACK_BOUNDARY_X),
            };
        }

        expect(rightState.positionX).toBeGreaterThan(0);
        expect(leftState.positionX).toBeLessThan(0);
        expect(Math.abs(rightState.positionX - Math.abs(leftState.positionX))).toBeLessThan(0.1);
    });

    it('should never produce clamped X beyond boundary during extended driving', () => {
        const turnRight: CarControlState = { isUp: true, isDown: false, isLeft: false, isRight: true };
        let state = { ...origin };
        let maxClampedAbsX = 0;

        for (let i = 0; i < 1200; i += 1) {
            state = stepCarMotion(state, turnRight, dt);
            state = {
                ...state,
                positionX: clamp(state.positionX, -TRACK_BOUNDARY_X, TRACK_BOUNDARY_X),
            };
            maxClampedAbsX = Math.max(maxClampedAbsX, Math.abs(state.positionX));
        }

        expect(maxClampedAbsX).toBeGreaterThan(1);
        expect(maxClampedAbsX).toBeLessThanOrEqual(TRACK_BOUNDARY_X);
    });
});
