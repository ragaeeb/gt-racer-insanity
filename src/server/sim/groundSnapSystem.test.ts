import { describe, expect, it } from 'bun:test';
import { createInitialDriftContext } from '@/shared/game/vehicle/driftConfig';
import { computeGroundSnap, MAX_Y_VELOCITY, snapPlayerToGround, Y_VELOCITY_DAMPING } from './groundSnapSystem';
import type { SimPlayerState } from './types';

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

// NOTE: The full snapPlayerToGround(... isTrackFlat: true) path is exercised
// by the integration tests in elevationIntegration.test.ts, which spin up
// a real RoomSimulation and verify snapshot Y ≈ 0 on flat tracks. These
// tests cover the pure computeGroundSnap logic used by that path.

describe('flat segment optimization', () => {
    it('should compute grounded state with synthetic flat-ground hit distance', () => {
        // This mirrors the isTrackFlat fast path in snapPlayerToGround:
        // when elevation is always 0, groundHitDistance = pos.y + RAY_PROBE_OFFSET_Y
        // For pos.y=0.5, offset=1 → distance=1.5, ground at Y=0, target=0.5
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

describe('snapPlayerToGround', () => {
    const createMockPlayer = (): SimPlayerState => ({
        activeEffects: [],
        colorId: 'red',
        driftContext: createInitialDriftContext(),
        id: 'player-1',
        inputState: { boost: false, brake: false, handbrake: false, steering: 0, throttle: 0 },
        isGrounded: false,
        lastProcessedInputSeq: 0,
        motion: {
            positionX: 0,
            positionY: 3,
            positionZ: 0,
            rotationY: 0,
            speed: 0,
        },
        name: 'Driver',
        progress: {
            checkpointIndex: 0,
            completedCheckpoints: [],
            distanceMeters: 0,
            finishedAtMs: null,
            lap: 0,
        },
        vehicleId: 'sport',
    });

    it('should snap and persist grounded state on flat-track fast path', () => {
        const player = createMockPlayer();
        let translation = { x: 0, y: 0.5, z: 0 };
        let linvel = { x: 0, y: -2, z: 0 };
        const rigidBody = {
            linvel: () => linvel,
            setLinvel: (next: { x: number; y: number; z: number }) => {
                linvel = next;
            },
            setTranslation: (next: { x: number; y: number; z: number }) => {
                translation = next;
            },
            translation: () => translation,
        };
        const world = {
            castRay: () => null,
        };

        const result = snapPlayerToGround(
            { Ray: class {} } as any,
            player,
            rigidBody as any,
            world as any,
            1 / 60,
            true,
        );

        expect(result.grounded).toBeTrue();
        expect(player.isGrounded).toBeTrue();
        expect(translation.y).toBeCloseTo(0.5, 2);
        expect(player.motion.positionY).toBeCloseTo(0, 2);
    });

    it('should use world raycast on non-flat tracks', () => {
        const player = createMockPlayer();
        let translation = { x: 0, y: 4, z: 0 };
        let linvel = { x: 0, y: 0, z: 0 };
        const rigidBody = {
            linvel: () => linvel,
            setLinvel: (next: { x: number; y: number; z: number }) => {
                linvel = next;
            },
            setTranslation: (next: { x: number; y: number; z: number }) => {
                translation = next;
            },
            translation: () => translation,
        };
        let castRayCalls = 0;
        const world = {
            castRay: () => {
                castRayCalls += 1;
                return { timeOfImpact: 5 };
            },
        };

        const result = snapPlayerToGround(
            { Ray: class {} } as any,
            player,
            rigidBody as any,
            world as any,
            1 / 60,
            false,
        );

        expect(castRayCalls).toBe(1);
        expect(result.grounded).toBeTrue();
        expect(player.isGrounded).toBeTrue();
    });
});
