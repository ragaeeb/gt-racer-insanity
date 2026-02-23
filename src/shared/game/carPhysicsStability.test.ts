import { describe, expect, it } from 'bun:test';
import {
    DEFAULT_CAR_PHYSICS_CONFIG,
    stepCarMotion,
    type CarControlState,
    type CarMotionState,
} from './carPhysics';
import { VEHICLE_CLASS_MANIFESTS, vehicleManifestToPhysicsConfig } from './vehicle/vehicleClassManifest';

const noInput: CarControlState = { isUp: false, isDown: false, isLeft: false, isRight: false };
const fullThrottle: CarControlState = { isUp: true, isDown: false, isLeft: false, isRight: false };
const origin: CarMotionState = { speed: 0, rotationY: 0, positionX: 0, positionZ: 0 };

describe('car physics stability', () => {
    it('should never produce NaN or Infinity in any output field', () => {
        const edgeCases: { state: CarMotionState; controls: CarControlState; dt: number }[] = [
            { state: origin, controls: fullThrottle, dt: 0 },
            { state: origin, controls: fullThrottle, dt: 0.0001 },
            { state: origin, controls: fullThrottle, dt: 1 },
            { state: origin, controls: noInput, dt: 10 },
            { state: { ...origin, speed: 1e6 }, controls: noInput, dt: 0.016 },
            { state: { ...origin, speed: -1e6 }, controls: noInput, dt: 0.016 },
            { state: { ...origin, rotationY: 1000 }, controls: fullThrottle, dt: 0.016 },
            { state: { ...origin, rotationY: -1000 }, controls: fullThrottle, dt: 0.016 },
        ];

        for (const { state, controls, dt } of edgeCases) {
            const result = stepCarMotion(state, controls, dt, DEFAULT_CAR_PHYSICS_CONFIG);
            expect(Number.isFinite(result.speed)).toBe(true);
            expect(Number.isFinite(result.rotationY)).toBe(true);
            expect(Number.isFinite(result.positionX)).toBe(true);
            expect(Number.isFinite(result.positionZ)).toBe(true);
        }
    });

    it('should clamp speed even with very large dt values', () => {
        const result = stepCarMotion(origin, fullThrottle, 100, DEFAULT_CAR_PHYSICS_CONFIG);
        expect(result.speed).toBeLessThanOrEqual(DEFAULT_CAR_PHYSICS_CONFIG.maxForwardSpeed);
        expect(result.speed).toBeGreaterThanOrEqual(-DEFAULT_CAR_PHYSICS_CONFIG.maxReverseSpeed);
    });

    it('should reach max forward speed for every vehicle class within 10 simulated seconds', () => {
        for (const manifest of VEHICLE_CLASS_MANIFESTS) {
            const config = vehicleManifestToPhysicsConfig(manifest.physics, DEFAULT_CAR_PHYSICS_CONFIG.deceleration);

            let state = { ...origin };
            const dt = 1 / 60;
            for (let i = 0; i < 600; i++) {
                state = stepCarMotion(state, fullThrottle, dt, config);
            }

            expect(state.speed).toBeGreaterThanOrEqual(config.maxForwardSpeed * 0.95);
        }
    });

    it('should come to a full stop from max speed within 10 seconds of no input', () => {
        for (const manifest of VEHICLE_CLASS_MANIFESTS) {
            const config = vehicleManifestToPhysicsConfig(manifest.physics, DEFAULT_CAR_PHYSICS_CONFIG.deceleration);

            let state: CarMotionState = { ...origin, speed: config.maxForwardSpeed };
            const dt = 1 / 60;
            for (let i = 0; i < 600; i++) {
                state = stepCarMotion(state, noInput, dt, config);
            }

            expect(state.speed).toBe(0);
        }
    });

    it('should produce deterministic results for the same inputs', () => {
        const dt = 1 / 60;
        const controls: CarControlState = { isUp: true, isDown: false, isLeft: true, isRight: false };
        let stateA = { ...origin };
        let stateB = { ...origin };

        for (let i = 0; i < 300; i++) {
            stateA = stepCarMotion(stateA, controls, dt);
            stateB = stepCarMotion(stateB, controls, dt);
        }

        expect(stateA.positionX).toBe(stateB.positionX);
        expect(stateA.positionZ).toBe(stateB.positionZ);
        expect(stateA.speed).toBe(stateB.speed);
        expect(stateA.rotationY).toBe(stateB.rotationY);
    });

    it('should keep position changes proportional to speed and dt', () => {
        const state: CarMotionState = { ...origin, speed: 20 };
        const dt = 1 / 60;
        const result = stepCarMotion(state, noInput, dt);
        const distanceMoved = Math.hypot(
            result.positionX - state.positionX,
            result.positionZ - state.positionZ,
        );
        const expectedMaxDistance = state.speed * dt * 1.1;
        expect(distanceMoved).toBeLessThanOrEqual(expectedMaxDistance);
    });
});
