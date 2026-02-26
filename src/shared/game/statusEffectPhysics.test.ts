import { describe, expect, it } from 'bun:test';
import {
    type CarControlState,
    type CarMotionState,
    type CarPhysicsConfig,
    DEFAULT_CAR_PHYSICS_CONFIG,
    stepCarMotion,
} from './carPhysics';
import {
    BOOST_DURATION_MS,
    BOOST_MOVEMENT_MULTIPLIER,
    FLAT_TIRE_DURATION_MS,
    FLAT_TIRE_MOVEMENT_MULTIPLIER,
    FLAT_TIRE_STEERING_MULTIPLIER,
    getStatusEffectManifestById,
    SLOWED_DURATION_MS,
    SLOWED_MOVEMENT_MULTIPLIER,
    SLOWED_STEERING_MULTIPLIER,
    STUNNED_DURATION_MS,
    STUNNED_MOVEMENT_MULTIPLIER,
    STUNNED_STEERING_MULTIPLIER,
} from './effects/statusEffectManifest';

const fullThrottle: CarControlState = { isUp: true, isDown: false, isLeft: false, isRight: false };
const origin: CarMotionState = { speed: 0, rotationY: 0, positionX: 0, positionY: 0, positionZ: 0 };
const dt = 1 / 60;

const scaleConfig = (config: CarPhysicsConfig, multiplier: number): CarPhysicsConfig => ({
    ...config,
    maxForwardSpeed: config.maxForwardSpeed * multiplier,
    maxReverseSpeed: config.maxReverseSpeed * multiplier,
    acceleration: config.acceleration * multiplier,
});

describe('status effect physics integration', () => {
    describe('movement multiplier scaling', () => {
        it('should produce higher max speed with boost multiplier', () => {
            const normalConfig = DEFAULT_CAR_PHYSICS_CONFIG;
            const boostedConfig = scaleConfig(normalConfig, BOOST_MOVEMENT_MULTIPLIER);

            let normalState = { ...origin };
            let boostedState = { ...origin };
            for (let i = 0; i < 600; i += 1) {
                normalState = stepCarMotion(normalState, fullThrottle, dt, normalConfig);
                boostedState = stepCarMotion(boostedState, fullThrottle, dt, boostedConfig);
            }

            expect(boostedState.speed).toBeGreaterThan(normalState.speed);
            expect(boostedState.speed).toBeCloseTo(normalConfig.maxForwardSpeed * BOOST_MOVEMENT_MULTIPLIER, 1);
        });

        it('should produce lower max speed with flat tire multiplier', () => {
            const normalConfig = DEFAULT_CAR_PHYSICS_CONFIG;
            const flatTireConfig = scaleConfig(normalConfig, FLAT_TIRE_MOVEMENT_MULTIPLIER);

            let normalState = { ...origin };
            let flatTireState = { ...origin };
            for (let i = 0; i < 600; i += 1) {
                normalState = stepCarMotion(normalState, fullThrottle, dt, normalConfig);
                flatTireState = stepCarMotion(flatTireState, fullThrottle, dt, flatTireConfig);
            }

            expect(flatTireState.speed).toBeLessThan(normalState.speed);
            expect(flatTireState.speed).toBeCloseTo(normalConfig.maxForwardSpeed * FLAT_TIRE_MOVEMENT_MULTIPLIER, 1);
        });

        it('should cover more distance with boost than without over the same time', () => {
            const normalConfig = DEFAULT_CAR_PHYSICS_CONFIG;
            const boostedConfig = scaleConfig(normalConfig, BOOST_MOVEMENT_MULTIPLIER);
            const boostFrames = Math.ceil((BOOST_DURATION_MS / 1000) * 60);

            let normalState = { ...origin, speed: normalConfig.maxForwardSpeed };
            let boostedState = { ...origin, speed: boostedConfig.maxForwardSpeed };
            for (let i = 0; i < boostFrames; i += 1) {
                normalState = stepCarMotion(normalState, fullThrottle, dt, normalConfig);
                boostedState = stepCarMotion(boostedState, fullThrottle, dt, boostedConfig);
            }

            const normalDistance = Math.hypot(normalState.positionX, normalState.positionZ);
            const boostedDistance = Math.hypot(boostedState.positionX, boostedState.positionZ);
            expect(boostedDistance).toBeGreaterThan(normalDistance * 1.2);
        });

        it('should produce zero movement with stunned multiplier (0)', () => {
            const stunnedConfig = scaleConfig(DEFAULT_CAR_PHYSICS_CONFIG, 0);

            let state = { ...origin };
            for (let i = 0; i < 120; i += 1) {
                state = stepCarMotion(state, fullThrottle, dt, stunnedConfig);
            }

            expect(state.speed).toBe(0);
            expect(state.positionZ).toBe(0);
        });

        it('should never produce speed exceeding scaled max forward speed', () => {
            const multipliers = [BOOST_MOVEMENT_MULTIPLIER, FLAT_TIRE_MOVEMENT_MULTIPLIER, 0.7, 2.0];

            for (const m of multipliers) {
                const config = scaleConfig(DEFAULT_CAR_PHYSICS_CONFIG, m);
                let state = { ...origin };
                for (let i = 0; i < 600; i += 1) {
                    state = stepCarMotion(state, fullThrottle, dt, config);
                }
                expect(state.speed).toBeLessThanOrEqual(config.maxForwardSpeed + 0.01);
            }
        });
    });

    describe('configurable effect constants', () => {
        it('should have manifest values matching the named constants', () => {
            const boost = getStatusEffectManifestById('boosted');
            expect(boost).toBeDefined();
            expect(boost!.movementMultiplier).toBe(BOOST_MOVEMENT_MULTIPLIER);
            expect(boost!.defaultDurationMs).toBe(BOOST_DURATION_MS);

            const flatTire = getStatusEffectManifestById('flat_tire');
            expect(flatTire).toBeDefined();
            expect(flatTire!.movementMultiplier).toBe(FLAT_TIRE_MOVEMENT_MULTIPLIER);
            expect(flatTire!.defaultDurationMs).toBe(FLAT_TIRE_DURATION_MS);
            expect(flatTire!.steeringMultiplier).toBe(FLAT_TIRE_STEERING_MULTIPLIER);

            const slowed = getStatusEffectManifestById('slowed');
            expect(slowed).toBeDefined();
            expect(slowed!.movementMultiplier).toBe(SLOWED_MOVEMENT_MULTIPLIER);
            expect(slowed!.defaultDurationMs).toBe(SLOWED_DURATION_MS);
            expect(slowed!.steeringMultiplier).toBe(SLOWED_STEERING_MULTIPLIER);

            const stunned = getStatusEffectManifestById('stunned');
            expect(stunned).toBeDefined();
            expect(stunned!.movementMultiplier).toBe(STUNNED_MOVEMENT_MULTIPLIER);
            expect(stunned!.defaultDurationMs).toBe(STUNNED_DURATION_MS);
            expect(stunned!.steeringMultiplier).toBe(STUNNED_STEERING_MULTIPLIER);
        });

        it('should have all effect multipliers within sane ranges', () => {
            const effects = ['boosted', 'slowed', 'stunned', 'flat_tire', 'speed_burst'] as const;
            for (const id of effects) {
                const manifest = getStatusEffectManifestById(id);
                expect(manifest).toBeDefined();
                expect(manifest!.movementMultiplier).toBeGreaterThanOrEqual(0);
                expect(manifest!.movementMultiplier).toBeLessThanOrEqual(5);
                expect(manifest!.steeringMultiplier).toBeGreaterThanOrEqual(0);
                expect(manifest!.steeringMultiplier).toBeLessThanOrEqual(2);
                expect(manifest!.defaultDurationMs).toBeGreaterThan(0);
            }
        });
    });
});
