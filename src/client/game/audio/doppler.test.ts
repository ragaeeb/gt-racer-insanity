import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { DEFAULT_GAMEPLAY_TUNING } from '@/shared/game/tuning/gameplayTuning';
import { calculateDopplerRate, calculateRadialVelocity } from './dopplerEffect';

describe('Doppler Effect', () => {
    it('should increase pitch when car approaches listener', () => {
        // Negative velocity = approaching (source moving toward listener)
        const relativeVelocity = -20; // approaching at 20 m/s
        const rate = calculateDopplerRate(relativeVelocity);
        expect(rate).toBeGreaterThan(1.0); // higher pitch
    });

    it('should decrease pitch when car recedes from listener', () => {
        // Positive velocity = receding (source moving away from listener)
        const relativeVelocity = 20; // receding at 20 m/s
        const rate = calculateDopplerRate(relativeVelocity);
        expect(rate).toBeLessThan(1.0); // lower pitch
    });

    it('should return 1.0 when relative velocity is zero', () => {
        const rate = calculateDopplerRate(0);
        expect(rate).toBeCloseTo(1.0, 2);
    });

    it('should clamp playback rate to minimum 0.5', () => {
        // Extreme receding velocity should clamp to 0.5
        const extremeRecede = calculateDopplerRate(200);
        expect(extremeRecede).toBeGreaterThanOrEqual(0.5);
    });

    it('should clamp playback rate to maximum 2.0', () => {
        // Extreme approaching velocity should clamp to 2.0
        const extremeApproach = calculateDopplerRate(-200);
        expect(extremeApproach).toBeLessThanOrEqual(2.0);
    });

    it('should produce symmetric rates for equal approaching/receding velocities', () => {
        const approachRate = calculateDopplerRate(-30);
        const recedeRate = calculateDopplerRate(30);
        // The rates should be reciprocally related around 1.0
        // approach * recede should be close to 1.0 (before clamping)
        expect(approachRate * recedeRate).toBeCloseTo(1.0, 1);
    });

    it('should handle very small velocities without division issues', () => {
        // Very small velocities should not cause issues
        const rate = calculateDopplerRate(0.001);
        expect(rate).toBeCloseTo(1.0, 1);
    });

    it('should use gameplay tuning doppler values by default', () => {
        const tuning = DEFAULT_GAMEPLAY_TUNING.audio.doppler;
        const relativeVelocity = 42;

        const expectedRaw = tuning.speedOfSound / (tuning.speedOfSound + relativeVelocity + 0.001);
        const expectedScaled = 1 + (expectedRaw - 1) * tuning.coefficient;
        const expected = Math.max(tuning.minRate, Math.min(tuning.maxRate, expectedScaled));

        expect(calculateDopplerRate(relativeVelocity)).toBeCloseTo(expected, 6);
    });
});

describe('calculateRadialVelocity', () => {
    // We are listener, stationary at origin
    const listenerPos = new THREE.Vector3(0, 0, 0);
    const listenerVel = new THREE.Vector3(0, 0, 0);

    it('should return a negative velocity when source is moving toward listener', () => {
        const sourcePos = new THREE.Vector3(100, 0, 0); // 100m away on X axis
        const sourceVel = new THREE.Vector3(-20, 0, 0); // moving toward origin at 20m/s

        const radialVel = calculateRadialVelocity(sourcePos, sourceVel, listenerPos, listenerVel);
        expect(radialVel).toBeLessThan(0);
        expect(radialVel).toBeCloseTo(-20, 2);
    });

    it('should return a positive velocity when source is moving away from listener', () => {
        const sourcePos = new THREE.Vector3(100, 0, 0); // 100m away on X axis
        const sourceVel = new THREE.Vector3(20, 0, 0); // moving away from origin at 20m/s

        const radialVel = calculateRadialVelocity(sourcePos, sourceVel, listenerPos, listenerVel);
        expect(radialVel).toBeGreaterThan(0);
        expect(radialVel).toBeCloseTo(20, 2);
    });

    it('should return 0 when source and listener are co-located', () => {
        const sourcePos = new THREE.Vector3(0, 0, 0); // exact same position
        const sourceVel = new THREE.Vector3(10, 0, 0); // moving, but co-located

        // At co-located position, direction vector becomes (0,0,0) resulting in dot product 0
        const radialVel = calculateRadialVelocity(sourcePos, sourceVel, listenerPos, listenerVel);
        expect(radialVel).toBe(0);
    });
});
