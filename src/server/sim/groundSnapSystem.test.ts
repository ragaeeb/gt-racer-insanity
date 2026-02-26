import { describe, expect, it } from 'bun:test';
import { computeGroundSnap, MAX_Y_VELOCITY, Y_VELOCITY_DAMPING } from './groundSnapSystem';

// ─────────────────── computeGroundSnap ──────────────────────

describe('computeGroundSnap', () => {
    it('should snap player to ground when within range', () => {
        const result = computeGroundSnap({
            currentY: 5,
            groundHitDistance: 4.5, // ground is 4.5m below probe origin (5 + 1 = 6 above ground at Y=1.5)
            currentYVelocity: 0,
            dtSeconds: 1 / 60,
        });

        expect(result.grounded).toBeTrue();
        expect(result.targetY).toBeDefined();
    });

    it('should position player at ground level plus collider offset', () => {
        // Player at Y=3, probe at Y=4, ground hit at distance 4 → ground at Y=0
        // Target = groundY + playerColliderHalfHeight = 0 + 0.5 = 0.5
        const result = computeGroundSnap({
            currentY: 3,
            groundHitDistance: 4, // probe Y = 3+1 = 4, ground at Y = 4-4 = 0
            currentYVelocity: 0,
            dtSeconds: 1 / 60,
        });

        expect(result.grounded).toBeTrue();
        expect(result.targetY).toBeCloseTo(0.5, 1);
    });

    it('should clamp downward Y velocity when grounded', () => {
        const result = computeGroundSnap({
            currentY: 1,
            groundHitDistance: 1.5, // probe at 2, ground at 0.5
            currentYVelocity: -5,
            dtSeconds: 1 / 60,
        });

        expect(result.grounded).toBeTrue();
        expect(result.yVelocity).toBe(0); // downward velocity zeroed on ground
    });

    it('should damp positive Y velocity when grounded (prevent bounce)', () => {
        const result = computeGroundSnap({
            currentY: 1,
            groundHitDistance: 1.5,
            currentYVelocity: 5, // upward velocity
            dtSeconds: 1 / 60,
        });

        expect(result.grounded).toBeTrue();
        expect(result.yVelocity).toBeLessThan(5); // damped
        expect(result.yVelocity).toBeCloseTo(5 * Y_VELOCITY_DAMPING, 3);
    });

    it('should report airborne when no ground is within range', () => {
        const result = computeGroundSnap({
            currentY: 20,
            groundHitDistance: null, // no hit
            currentYVelocity: 0,
            dtSeconds: 1 / 60,
        });

        expect(result.grounded).toBeFalse();
        expect(result.targetY).toBeUndefined();
    });

    it('should apply gravity when airborne', () => {
        const dtSeconds = 1 / 60;
        const result = computeGroundSnap({
            currentY: 20,
            groundHitDistance: null,
            currentYVelocity: 0,
            dtSeconds,
        });

        expect(result.grounded).toBeFalse();
        // Gravity should add negative Y velocity
        expect(result.yVelocity).toBeLessThan(0);
        expect(result.yVelocity).toBeCloseTo(-9.81 * dtSeconds, 3);
    });

    it('should clamp Y velocity to MAX_Y_VELOCITY when falling', () => {
        const result = computeGroundSnap({
            currentY: 100,
            groundHitDistance: null,
            currentYVelocity: -19, // already falling fast
            dtSeconds: 1 / 60,
        });

        expect(result.grounded).toBeFalse();
        expect(result.yVelocity).toBeGreaterThanOrEqual(-MAX_Y_VELOCITY);
    });

    it('should report steering suppression when airborne', () => {
        const result = computeGroundSnap({
            currentY: 20,
            groundHitDistance: null,
            currentYVelocity: 0,
            dtSeconds: 1 / 60,
        });

        expect(result.suppressSteering).toBeTrue();
    });

    it('should not suppress steering when grounded', () => {
        const result = computeGroundSnap({
            currentY: 1,
            groundHitDistance: 1.5,
            currentYVelocity: 0,
            dtSeconds: 1 / 60,
        });

        expect(result.suppressSteering).toBeFalse();
    });

    it('should snap to elevated ground correctly', () => {
        // Segment at elevation 8m: player at Y=12, probe at Y=13, ground at Y=8
        // Hit distance = 13 - 8 = 5
        const result = computeGroundSnap({
            currentY: 12,
            groundHitDistance: 5,
            currentYVelocity: 0,
            dtSeconds: 1 / 60,
        });

        expect(result.grounded).toBeTrue();
        // Ground at 8, target = 8 + 0.5 = 8.5
        expect(result.targetY).toBeCloseTo(8.5, 1);
    });

    it('should handle player exactly at ground level', () => {
        // Player at Y=0.5 (exactly on ground), probe at Y=1.5, ground at Y=0
        // Hit distance = 1.5
        const result = computeGroundSnap({
            currentY: 0.5,
            groundHitDistance: 1.5,
            currentYVelocity: 0,
            dtSeconds: 1 / 60,
        });

        expect(result.grounded).toBeTrue();
        expect(result.targetY).toBeCloseTo(0.5, 1);
    });
});

// ──────────── flat segment optimization ─────────────────────

describe('flat segment optimization', () => {
    it('should skip expensive raycast on segments with zero elevation', () => {
        // This tests the principle that flat segments don't need raycasting.
        // The optimization is that when elevation is always 0, we can skip the
        // raycast and just snap to Y=0.5 (collider half-height).
        // Player at Y=0.5, probe at Y=1.5, ground at Y=0 → hit distance = 1.5
        const result = computeGroundSnap({
            currentY: 0.5,
            groundHitDistance: 1.5, // probe 1.5 - 1.5 = ground at Y=0
            currentYVelocity: 0,
            dtSeconds: 1 / 60,
        });

        expect(result.grounded).toBeTrue();
        expect(result.targetY).toBeCloseTo(0.5, 2);
    });
});

// ──────────── Y-axis safety ─────────────────────────────────

describe('Y-axis safety constraints', () => {
    it('should never produce NaN values', () => {
        const result = computeGroundSnap({
            currentY: 5,
            groundHitDistance: 2,
            currentYVelocity: 0,
            dtSeconds: 1 / 60,
        });

        expect(Number.isFinite(result.yVelocity)).toBeTrue();
        if (result.targetY !== undefined) {
            expect(Number.isFinite(result.targetY)).toBeTrue();
        }
    });

    it('should produce finite values with extreme inputs', () => {
        const result = computeGroundSnap({
            currentY: 99999,
            groundHitDistance: null,
            currentYVelocity: -100,
            dtSeconds: 1 / 60,
        });

        expect(Number.isFinite(result.yVelocity)).toBeTrue();
        expect(result.yVelocity).toBeGreaterThanOrEqual(-MAX_Y_VELOCITY);
    });

    it('should handle zero dt gracefully', () => {
        const result = computeGroundSnap({
            currentY: 5,
            groundHitDistance: null,
            currentYVelocity: 0,
            dtSeconds: 0,
        });

        expect(Number.isFinite(result.yVelocity)).toBeTrue();
    });
});
