import { describe, expect, it } from 'bun:test';
import {
    DEFAULT_DRIFT_CONFIG,
    DriftState,
    createInitialDriftContext,
    type DriftConfig,
} from './driftConfig';

describe('DriftConfig', () => {
    it('should have boost tier thresholds in ascending order', () => {
        expect(DEFAULT_DRIFT_CONFIG.boostTier1TimeMs).toBeLessThan(DEFAULT_DRIFT_CONFIG.boostTier2TimeMs);
        expect(DEFAULT_DRIFT_CONFIG.boostTier2TimeMs).toBeLessThan(DEFAULT_DRIFT_CONFIG.boostTier3TimeMs);
    });

    it('should have boost magnitudes in ascending order', () => {
        expect(DEFAULT_DRIFT_CONFIG.boostTier1Magnitude).toBeLessThan(DEFAULT_DRIFT_CONFIG.boostTier2Magnitude);
        expect(DEFAULT_DRIFT_CONFIG.boostTier2Magnitude).toBeLessThan(DEFAULT_DRIFT_CONFIG.boostTier3Magnitude);
    });

    it('should have all lateral friction values between 0 and 1', () => {
        const frictionKeys: (keyof DriftConfig)[] = [
            'driftingLateralFriction',
            'initiatingLateralFriction',
            'recoveringLateralFriction',
            'grippingLateralFriction',
        ];

        for (const key of frictionKeys) {
            const value = DEFAULT_DRIFT_CONFIG[key];
            expect(value).toBeGreaterThan(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('should have lateral friction ascending from drifting to gripping', () => {
        expect(DEFAULT_DRIFT_CONFIG.driftingLateralFriction).toBeLessThan(
            DEFAULT_DRIFT_CONFIG.initiatingLateralFriction,
        );
        expect(DEFAULT_DRIFT_CONFIG.initiatingLateralFriction).toBeLessThan(
            DEFAULT_DRIFT_CONFIG.recoveringLateralFriction,
        );
        expect(DEFAULT_DRIFT_CONFIG.recoveringLateralFriction).toBeLessThan(
            DEFAULT_DRIFT_CONFIG.grippingLateralFriction,
        );
    });

    it('should have DriftState enum values 0-3', () => {
        expect(DriftState.GRIPPING).toBe(0);
        expect(DriftState.INITIATING).toBe(1);
        expect(DriftState.DRIFTING).toBe(2);
        expect(DriftState.RECOVERING).toBe(3);
    });

    it('should have exactly 4 drift states', () => {
        const states = Object.values(DriftState);
        expect(states).toHaveLength(4);
    });

    it('should have positive initiation thresholds', () => {
        expect(DEFAULT_DRIFT_CONFIG.initiationSpeedThreshold).toBeGreaterThan(0);
        expect(DEFAULT_DRIFT_CONFIG.initiationSteerThreshold).toBeGreaterThan(0);
        expect(DEFAULT_DRIFT_CONFIG.initiationSteerThreshold).toBeLessThanOrEqual(1);
    });

    it('should have positive timing values', () => {
        expect(DEFAULT_DRIFT_CONFIG.initiatingToGrippingTimeMs).toBeGreaterThan(0);
        expect(DEFAULT_DRIFT_CONFIG.initiatingToDriftingTimeMs).toBeGreaterThan(0);
        expect(DEFAULT_DRIFT_CONFIG.boostDurationMs).toBeGreaterThan(0);
        expect(DEFAULT_DRIFT_CONFIG.recoveringDurationMs).toBeGreaterThan(0);
    });

    it('should have exactly 16 tunable parameters', () => {
        const keys = Object.keys(DEFAULT_DRIFT_CONFIG);
        expect(keys).toHaveLength(16);
    });

    it('should have consensus values matching research spec', () => {
        expect(DEFAULT_DRIFT_CONFIG.initiationSpeedThreshold).toBe(10);
        expect(DEFAULT_DRIFT_CONFIG.initiationSteerThreshold).toBe(0.7);
        expect(DEFAULT_DRIFT_CONFIG.driftingLateralFriction).toBe(0.15);
        expect(DEFAULT_DRIFT_CONFIG.grippingLateralFriction).toBe(0.65);
        expect(DEFAULT_DRIFT_CONFIG.boostTier1TimeMs).toBe(1000);
        expect(DEFAULT_DRIFT_CONFIG.boostTier2TimeMs).toBe(2000);
        expect(DEFAULT_DRIFT_CONFIG.boostTier3TimeMs).toBe(3000);
        expect(DEFAULT_DRIFT_CONFIG.boostTier1Magnitude).toBe(5);
        expect(DEFAULT_DRIFT_CONFIG.boostTier2Magnitude).toBe(9);
        expect(DEFAULT_DRIFT_CONFIG.boostTier3Magnitude).toBe(14);
        expect(DEFAULT_DRIFT_CONFIG.boostDurationMs).toBe(500);
        expect(DEFAULT_DRIFT_CONFIG.recoveringDurationMs).toBe(300);
    });
});

describe('DriftContext', () => {
    it('should initialize to GRIPPING state', () => {
        const ctx = createInitialDriftContext();
        expect(ctx.state).toBe(DriftState.GRIPPING);
    });

    it('should initialize with zero boost tier', () => {
        const ctx = createInitialDriftContext();
        expect(ctx.boostTier).toBe(0);
    });

    it('should initialize with zero accumulated drift time', () => {
        const ctx = createInitialDriftContext();
        expect(ctx.accumulatedDriftTimeMs).toBe(0);
    });

    it('should initialize with zero drift angle', () => {
        const ctx = createInitialDriftContext();
        expect(ctx.driftAngle).toBe(0);
    });

    it('should initialize with zero timestamps', () => {
        const ctx = createInitialDriftContext();
        expect(ctx.stateEnteredAtMs).toBe(0);
        expect(ctx.driftStartedAtMs).toBe(0);
    });

    it('should create independent instances', () => {
        const ctx1 = createInitialDriftContext();
        const ctx2 = createInitialDriftContext();
        ctx1.state = DriftState.DRIFTING;
        ctx1.boostTier = 2;
        expect(ctx2.state).toBe(DriftState.GRIPPING);
        expect(ctx2.boostTier).toBe(0);
    });
});
