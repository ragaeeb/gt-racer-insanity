import { describe, expect, it } from 'bun:test';
import { calculateDopplerRate } from '../dopplerEffect';

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
});
