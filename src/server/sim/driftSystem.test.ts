import { describe, expect, it } from 'bun:test';
import { updateDriftState } from '@/server/sim/driftSystem';
import type { SimPlayerState } from '@/server/sim/types';
import {
    createInitialDriftContext,
    DEFAULT_DRIFT_CONFIG,
    type DriftConfig,
    type DriftContext,
    DriftState,
} from '@/shared/game/vehicle/driftConfig';

/**
 * Creates a minimal mock SimPlayerState for drift system tests.
 * Only the fields accessed by updateDriftState are required.
 */
const mockPlayer = (overrides: {
    driftContext?: Partial<DriftContext>;
    handbrake?: boolean;
    speed?: number;
    steering?: number;
}): SimPlayerState => {
    const base = createInitialDriftContext();
    return {
        abilityUsesThisRace: {},
        activeEffects: [],
        colorId: 'red',
        driftContext: {
            ...base,
            ...overrides.driftContext,
        },
        id: 'test-player',
        inputState: {
            boost: false,
            brake: false,
            handbrake: overrides.handbrake ?? false,
            steering: overrides.steering ?? 0,
            throttle: 1,
        },
        isGrounded: true,
        lastProcessedInputSeq: 0,
        motion: {
            positionX: 0,
            positionY: 0,
            positionZ: 0,
            rotationY: 0,
            speed: overrides.speed ?? 0,
        },
        name: 'TestDriver',
        progress: {
            checkpointIndex: 0,
            completedCheckpoints: [],
            distanceMeters: 0,
            finishedAtMs: null,
            lap: 0,
        },
        vehicleId: 'sport',
    };
};

describe('Drift State Machine', () => {
    it('should stay GRIPPING when speed is below threshold', () => {
        const player = mockPlayer({
            speed: 5, // below 10 threshold
            handbrake: true,
            steering: 0.8,
            driftContext: { state: DriftState.GRIPPING },
        });

        const result = updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.GRIPPING);
        expect(result.lateralFrictionMultiplier).toBe(DEFAULT_DRIFT_CONFIG.grippingLateralFriction);
    });

    it('should stay GRIPPING when handbrake is not pressed', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: false,
            steering: 0.8,
            driftContext: { state: DriftState.GRIPPING },
        });

        const result = updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.GRIPPING);
        expect(result.lateralFrictionMultiplier).toBe(DEFAULT_DRIFT_CONFIG.grippingLateralFriction);
    });

    it('should stay GRIPPING when steering is below threshold', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: true,
            steering: 0.3, // below 0.7 threshold
            driftContext: { state: DriftState.GRIPPING },
        });

        const result = updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.GRIPPING);
        expect(result.lateralFrictionMultiplier).toBe(DEFAULT_DRIFT_CONFIG.grippingLateralFriction);
    });

    it('should transition GRIPPING -> INITIATING when handbrake + speed + steer thresholds met', () => {
        const player = mockPlayer({
            speed: 12,
            handbrake: true,
            steering: 0.8,
            driftContext: { state: DriftState.GRIPPING, stateEnteredAtMs: 500 },
        });

        const result = updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.INITIATING);
        expect(player.driftContext.stateEnteredAtMs).toBe(1000);
        expect(result.lateralFrictionMultiplier).toBe(DEFAULT_DRIFT_CONFIG.initiatingLateralFriction);
    });

    it('should transition INITIATING -> DRIFTING after hold time', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: true,
            steering: 0.8,
            driftContext: {
                state: DriftState.INITIATING,
                stateEnteredAtMs: 800,
            },
        });

        // nowMs = 800 + 150 = 950 → time in state = 150ms = initiatingToDriftingTimeMs threshold
        updateDriftState(player, 950, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.DRIFTING);
        expect(player.driftContext.stateEnteredAtMs).toBe(950);
    });

    it('should transition INITIATING -> GRIPPING when handbrake released', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: false, // released
            steering: 0.8,
            driftContext: {
                state: DriftState.INITIATING,
                stateEnteredAtMs: 900,
            },
        });

        const result = updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.GRIPPING);
        expect(result.boostImpulse).toBe(0);
    });

    it('should transition INITIATING -> GRIPPING when speed drops below 80% of threshold', () => {
        const player = mockPlayer({
            speed: 7, // below 10 * 0.8 = 8
            handbrake: true,
            steering: 0.8,
            driftContext: {
                state: DriftState.INITIATING,
                stateEnteredAtMs: 900,
            },
        });

        updateDriftState(player, 950, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.GRIPPING);
    });

    it('should stay INITIATING when holding conditions before timing threshold', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: true,
            steering: 0.8,
            driftContext: {
                state: DriftState.INITIATING,
                stateEnteredAtMs: 900,
            },
        });

        // Only 50ms in state (< 150ms threshold)
        const result = updateDriftState(player, 950, DEFAULT_DRIFT_CONFIG);

        // Still initiating since 50ms < 150ms
        // Actually 950 - 900 = 50ms which is under threshold, so still initiating
        expect(player.driftContext.state).toBe(DriftState.INITIATING);
        expect(result.lateralFrictionMultiplier).toBe(DEFAULT_DRIFT_CONFIG.initiatingLateralFriction);
    });

    it('should transition INITIATING -> GRIPPING when initiating timeout is reached before drifting threshold', () => {
        const customConfig: DriftConfig = {
            ...DEFAULT_DRIFT_CONFIG,
            initiatingToDriftingTimeMs: 150,
            initiatingToGrippingTimeMs: 80,
        };
        const player = mockPlayer({
            speed: 15,
            handbrake: true,
            steering: 0.8,
            driftContext: {
                state: DriftState.INITIATING,
                stateEnteredAtMs: 900,
            },
        });

        updateDriftState(player, 990, customConfig); // 90ms in INITIATING
        expect(player.driftContext.state).toBe(DriftState.GRIPPING);
    });

    it('should return low lateral friction (0.15) in DRIFTING state', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: true,
            steering: 0.8,
            driftContext: {
                state: DriftState.DRIFTING,
                stateEnteredAtMs: 900,
                lastDriftTickMs: 900,
                accumulatedDriftTimeMs: 100,
            },
        });

        const result = updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(result.lateralFrictionMultiplier).toBe(DEFAULT_DRIFT_CONFIG.driftingLateralFriction);
    });

    it('should accumulate drift time across multiple ticks', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: true,
            steering: 0.8,
            driftContext: {
                state: DriftState.DRIFTING,
                stateEnteredAtMs: 800,
                lastDriftTickMs: 900,
                accumulatedDriftTimeMs: 500,
            },
        });

        updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        // Should add 100ms (1000-900) to the 500ms already accumulated
        expect(player.driftContext.accumulatedDriftTimeMs).toBe(600);
        // stateEnteredAtMs must remain unchanged (immutable entry timestamp)
        expect(player.driftContext.stateEnteredAtMs).toBe(800);
        // lastDriftTickMs should be advanced to current time for next tick
        expect(player.driftContext.lastDriftTickMs).toBe(1000);
    });

    it('should grant tier-1 boost after 1s of drifting', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: true,
            steering: 0.8,
            driftContext: {
                state: DriftState.DRIFTING,
                stateEnteredAtMs: 950,
                lastDriftTickMs: 950,
                accumulatedDriftTimeMs: 950,
            },
        });

        // This tick adds 50ms → total 1000ms → tier 1
        updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.boostTier).toBe(1);
    });

    it('should grant tier-2 boost after 2s of drifting', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: true,
            steering: 0.8,
            driftContext: {
                state: DriftState.DRIFTING,
                stateEnteredAtMs: 100,
                lastDriftTickMs: 1950,
                accumulatedDriftTimeMs: 1950,
            },
        });

        // Adds 50ms → total 2000ms → tier 2
        updateDriftState(player, 2000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.boostTier).toBe(2);
    });

    it('should grant tier-3 ultra boost after 3s of drifting', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: true,
            steering: 0.8,
            driftContext: {
                state: DriftState.DRIFTING,
                stateEnteredAtMs: 100,
                lastDriftTickMs: 2950,
                accumulatedDriftTimeMs: 2950,
            },
        });

        // Adds 50ms → total 3000ms → tier 3
        updateDriftState(player, 3000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.boostTier).toBe(3);
    });

    it('should transition DRIFTING -> RECOVERING when handbrake released', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: false, // released
            steering: 0.8,
            driftContext: {
                state: DriftState.DRIFTING,
                stateEnteredAtMs: 900,
                lastDriftTickMs: 900,
                accumulatedDriftTimeMs: 1200,
                boostTier: 1,
            },
        });

        updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.RECOVERING);
        expect(player.driftContext.stateEnteredAtMs).toBe(1000);
    });

    it('should transition DRIFTING -> RECOVERING when steer goes neutral', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: true,
            steering: 0.05, // near neutral → below 0.1 threshold
            driftContext: {
                state: DriftState.DRIFTING,
                stateEnteredAtMs: 900,
                lastDriftTickMs: 900,
                accumulatedDriftTimeMs: 1200,
                boostTier: 1,
            },
        });

        updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.RECOVERING);
    });

    it('should transition DRIFTING -> GRIPPING with no boost when speed drops below threshold', () => {
        const player = mockPlayer({
            speed: 4, // below 10 * 0.5 = 5
            handbrake: true,
            steering: 0.8,
            driftContext: {
                state: DriftState.DRIFTING,
                stateEnteredAtMs: 900,
                lastDriftTickMs: 900,
                accumulatedDriftTimeMs: 2000,
                boostTier: 2,
            },
        });

        const result = updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.GRIPPING);
        expect(player.driftContext.boostTier).toBe(0);
        expect(result.boostImpulse).toBe(0);
    });

    it('should update drift angle based on steering in DRIFTING state', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: true,
            steering: -0.9,
            driftContext: {
                state: DriftState.DRIFTING,
                stateEnteredAtMs: 990,
                lastDriftTickMs: 990,
                accumulatedDriftTimeMs: 100,
            },
        });

        updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        // driftAngle should reflect steering direction
        expect(player.driftContext.driftAngle).toBeLessThan(0);
        expect(Math.abs(player.driftContext.driftAngle)).toBeGreaterThan(0);
    });

    it('should apply tier-1 boost impulse in RECOVERING state', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: false,
            driftContext: {
                state: DriftState.RECOVERING,
                stateEnteredAtMs: 1000,
                accumulatedDriftTimeMs: 1200,
                boostTier: 1,
            },
        });

        const result = updateDriftState(player, 1010, DEFAULT_DRIFT_CONFIG);

        expect(result.boostImpulse).toBe(DEFAULT_DRIFT_CONFIG.boostTier1Magnitude);
        // Boost should be consumed (tier set to 0 so it doesn't fire again)
        expect(player.driftContext.boostTier).toBe(0);
    });

    it('should apply tier-2 boost impulse in RECOVERING state', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: false,
            driftContext: {
                state: DriftState.RECOVERING,
                stateEnteredAtMs: 1000,
                accumulatedDriftTimeMs: 2500,
                boostTier: 2,
            },
        });

        const result = updateDriftState(player, 1010, DEFAULT_DRIFT_CONFIG);

        expect(result.boostImpulse).toBe(DEFAULT_DRIFT_CONFIG.boostTier2Magnitude);
    });

    it('should apply tier-3 boost impulse in RECOVERING state', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: false,
            driftContext: {
                state: DriftState.RECOVERING,
                stateEnteredAtMs: 1000,
                accumulatedDriftTimeMs: 3500,
                boostTier: 3,
            },
        });

        const result = updateDriftState(player, 1010, DEFAULT_DRIFT_CONFIG);

        expect(result.boostImpulse).toBe(DEFAULT_DRIFT_CONFIG.boostTier3Magnitude);
    });

    it('should transition RECOVERING -> GRIPPING after recovery duration', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: false,
            driftContext: {
                state: DriftState.RECOVERING,
                stateEnteredAtMs: 700,
                boostTier: 0, // already consumed
            },
        });

        // 300ms recovery duration: 1000 - 700 = 300ms
        const result = updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.GRIPPING);
        expect(result.lateralFrictionMultiplier).toBe(DEFAULT_DRIFT_CONFIG.grippingLateralFriction);
    });

    it('should return recovering lateral friction during recovery window', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: false,
            driftContext: {
                state: DriftState.RECOVERING,
                stateEnteredAtMs: 990,
                boostTier: 0,
            },
        });

        // Only 10ms in state (< 300ms recovery duration)
        const result = updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.RECOVERING);
        expect(result.lateralFrictionMultiplier).toBe(DEFAULT_DRIFT_CONFIG.recoveringLateralFriction);
    });

    it('should not apply boost impulse if no tier was earned (boostTier = 0)', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: false,
            driftContext: {
                state: DriftState.RECOVERING,
                stateEnteredAtMs: 990,
                boostTier: 0,
            },
        });

        const result = updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(result.boostImpulse).toBe(0);
    });

    it('should return GRIPPING lateral friction (0.65) when not drifting', () => {
        const player = mockPlayer({
            speed: 5,
            handbrake: false,
            steering: 0,
            driftContext: { state: DriftState.GRIPPING },
        });

        const result = updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(result.lateralFrictionMultiplier).toBe(0.65);
        expect(result.boostImpulse).toBe(0);
    });

    it('should handle negative steering values for drift entry', () => {
        const player = mockPlayer({
            speed: 12,
            handbrake: true,
            steering: -0.9, // left steer (abs > 0.7)
            driftContext: { state: DriftState.GRIPPING },
        });

        updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.INITIATING);
    });

    it('should handle negative speed for drift entry', () => {
        const player = mockPlayer({
            speed: -12, // reversing at speed
            handbrake: true,
            steering: 0.9,
            driftContext: { state: DriftState.GRIPPING },
        });

        updateDriftState(player, 1000, DEFAULT_DRIFT_CONFIG);

        expect(player.driftContext.state).toBe(DriftState.INITIATING);
    });

    it('should reset drift context on race restart', () => {
        const ctx = createInitialDriftContext();

        expect(ctx.state).toBe(DriftState.GRIPPING);
        expect(ctx.boostTier).toBe(0);
        expect(ctx.accumulatedDriftTimeMs).toBe(0);
        expect(ctx.driftAngle).toBe(0);
    });

    it('should only fire boost impulse on the first tick of RECOVERING', () => {
        const player = mockPlayer({
            speed: 15,
            handbrake: false,
            driftContext: {
                state: DriftState.RECOVERING,
                stateEnteredAtMs: 1000,
                boostTier: 2,
            },
        });

        // First tick: boost fires
        const result1 = updateDriftState(player, 1010, DEFAULT_DRIFT_CONFIG);
        expect(result1.boostImpulse).toBe(DEFAULT_DRIFT_CONFIG.boostTier2Magnitude);

        // Second tick: boost should NOT fire again (tier consumed)
        const result2 = updateDriftState(player, 1020, DEFAULT_DRIFT_CONFIG);
        expect(result2.boostImpulse).toBe(0);
    });

    it('should support custom drift config (tuning override)', () => {
        const customConfig: DriftConfig = {
            ...DEFAULT_DRIFT_CONFIG,
            initiationSpeedThreshold: 5, // lower threshold
            initiationSteerThreshold: 0.3,
        };

        const player = mockPlayer({
            speed: 6,
            handbrake: true,
            steering: 0.4,
            driftContext: { state: DriftState.GRIPPING },
        });

        updateDriftState(player, 1000, customConfig);

        // With lowered thresholds, this should now enter INITIATING
        expect(player.driftContext.state).toBe(DriftState.INITIATING);
    });
});
