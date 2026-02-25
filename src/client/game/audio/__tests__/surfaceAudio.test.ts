import { describe, expect, it } from 'bun:test';
import {
    calculateSquealVolume,
    calculateSquealPitch,
    calculateRumbleVolume,
    DEFAULT_SURFACE_AUDIO_TUNING,
} from '../surfaceAudio';

describe('Surface Audio — squeal volume', () => {
    it('should return 0 when not drifting', () => {
        const vol = calculateSquealVolume(30, 1.0, false);
        expect(vol).toBe(0);
    });

    it('should return 0 when below speed threshold on asphalt', () => {
        const vol = calculateSquealVolume(10, 1.0, true);
        expect(vol).toBe(0);
    });

    it('should return 0 on low-friction surface even when drifting fast', () => {
        // frictionMultiplier 0.5 < asphaltFrictionMin 0.9
        const vol = calculateSquealVolume(40, 0.5, true);
        expect(vol).toBe(0);
    });

    it('should return positive volume when drifting on asphalt above threshold', () => {
        const vol = calculateSquealVolume(30, 1.0, true);
        expect(vol).toBeGreaterThan(0);
    });

    it('should scale volume with speed above threshold', () => {
        const low = calculateSquealVolume(20, 1.0, true);
        const high = calculateSquealVolume(35, 1.0, true);
        expect(high).toBeGreaterThan(low);
    });

    it('should clamp volume to 1.0 at very high speeds', () => {
        const vol = calculateSquealVolume(200, 1.0, true);
        expect(vol).toBe(1.0);
    });

    it('should trigger on high-friction grip pad (frictionMultiplier > 1)', () => {
        const vol = calculateSquealVolume(25, 1.08, true);
        expect(vol).toBeGreaterThan(0);
    });
});

describe('Surface Audio — squeal pitch', () => {
    it('should return 1.0 for standard asphalt (frictionMultiplier = 1.0)', () => {
        expect(calculateSquealPitch(1.0)).toBeCloseTo(1.0, 5);
    });

    it('should return lower pitch for canyon surface (frictionMultiplier = 0.92)', () => {
        const pitch = calculateSquealPitch(0.92);
        expect(pitch).toBeLessThan(1.0);
        expect(pitch).toBeCloseTo(0.976, 2);
    });

    it('should return higher pitch for grip pad (frictionMultiplier = 1.08)', () => {
        const pitch = calculateSquealPitch(1.08);
        expect(pitch).toBeGreaterThan(1.0);
        expect(pitch).toBeCloseTo(1.024, 2);
    });

    it('should follow formula: 0.7 + frictionMultiplier * 0.3', () => {
        const friction = 0.75;
        expect(calculateSquealPitch(friction)).toBeCloseTo(0.7 + friction * 0.3, 5);
    });
});

describe('Surface Audio — rumble volume', () => {
    it('should return 0 on standard asphalt (frictionMultiplier = 1.0)', () => {
        const vol = calculateRumbleVolume(1.0);
        expect(vol).toBe(0);
    });

    it('should return 0 when frictionMultiplier is at or above gravelFrictionMax', () => {
        const vol = calculateRumbleVolume(DEFAULT_SURFACE_AUDIO_TUNING.gravelFrictionMax);
        expect(vol).toBe(0);
    });

    it('should return positive volume on gravel (frictionMultiplier < 0.8)', () => {
        const vol = calculateRumbleVolume(0.5);
        expect(vol).toBeGreaterThan(0);
    });

    it('should scale inversely with frictionMultiplier on gravel', () => {
        const low = calculateRumbleVolume(0.7);
        const high = calculateRumbleVolume(0.3);
        expect(high).toBeGreaterThan(low);
    });

    it('should scale by gravelRumbleVolume tuning parameter', () => {
        const tuning = { ...DEFAULT_SURFACE_AUDIO_TUNING, gravelRumbleVolume: 1.0 };
        const vol = calculateRumbleVolume(0.5, tuning);
        // (1 - 0.5) * 1.0 = 0.5
        expect(vol).toBeCloseTo(0.5, 5);
    });

    it('should peak near gravelRumbleVolume for extremely low friction', () => {
        const vol = calculateRumbleVolume(0.0);
        expect(vol).toBeCloseTo(DEFAULT_SURFACE_AUDIO_TUNING.gravelRumbleVolume, 5);
    });
});
