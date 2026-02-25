import { describe, expect, it } from 'bun:test';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { applyPlayerBumpResponse } from '../collisionSystem';
import type { SimPlayerState } from '../types';
import { createInitialDriftContext } from '@/shared/game/vehicle/driftConfig';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';

type Vector3 = { x: number; y: number; z: number };

type MockRigidBodyConfig = {
    angvel?: Vector3;
    linvel?: Vector3;
    mass: number;
    translation: Vector3;
};

const createMockRigidBody = ({
    angvel = { x: 0, y: 0, z: 0 },
    linvel = { x: 0, y: 0, z: 0 },
    mass,
    translation,
}: MockRigidBodyConfig): RigidBody => {
    let currentAngvel = { ...angvel };
    let currentLinvel = { ...linvel };
    const currentTranslation = { ...translation };
    const impulseLog: Vector3[] = [];

    const mockRigidBody = {
        angvel: () => ({ ...currentAngvel }),
        applyImpulse: (impulse: Vector3) => {
            impulseLog.push({ ...impulse });
            currentLinvel = {
                x: currentLinvel.x + impulse.x / mass,
                y: currentLinvel.y + impulse.y / mass,
                z: currentLinvel.z + impulse.z / mass,
            };
        },
        linvel: () => ({ ...currentLinvel }),
        mass: () => mass,
        setAngvel: (next: Vector3) => {
            currentAngvel = { ...next };
        },
        setLinvel: (next: Vector3) => {
            currentLinvel = { ...next };
        },
        translation: () => ({ ...currentTranslation }),
        /** Expose impulse log for test assertions */
        _impulseLog: impulseLog,
    };

    return mockRigidBody as unknown as RigidBody;
};

const createPlayer = (id: string, vehicleId: VehicleClassId, speed: number): SimPlayerState => ({
    activeEffects: [],
    colorId: 'red',
    driftContext: createInitialDriftContext(),
    id,
    inputState: {
        boost: false,
        brake: false,
        handbrake: false,
        steering: 0,
        throttle: 0,
    },
    lastProcessedInputSeq: 0,
    motion: {
        positionX: 0,
        positionZ: 0,
        rotationY: 0,
        speed,
    },
    name: id,
    progress: {
        checkpointIndex: 0,
        completedCheckpoints: [],
        distanceMeters: 0,
        finishedAtMs: null,
        lap: 0,
    },
    vehicleId,
});

const planarSpeed = (rigidBody: RigidBody) => {
    const velocity = rigidBody.linvel();
    return Math.hypot(velocity.x, velocity.z);
};

/** Compute total impulse magnitude applied to a mock rigid body */
const totalImpulseMagnitude = (rb: RigidBody): number => {
    const log = (rb as unknown as { _impulseLog: Vector3[] })._impulseLog;
    // Sum all impulse vectors (there may be multiple applyImpulse calls due to dampAndClamp)
    let totalX = 0;
    let totalZ = 0;
    for (const imp of log) {
        totalX += imp.x;
        totalZ += imp.z;
    }
    return Math.hypot(totalX, totalZ);
};

describe('Mass-Based Collision Impulse', () => {
    it('should produce higher impulse to sport car when truck hits it', () => {
        // Truck (1800 kg) hitting sport (1050 kg)
        const truckPlayer = createPlayer('truck', 'truck', 20);
        const sportPlayer = createPlayer('sport', 'sport', 20);

        const truckBody = createMockRigidBody({
            mass: 1800,
            translation: { x: 0, y: 0, z: 0 },
        });
        const sportBody = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 4 },
        });

        const rigidBodyMap = new Map<string, RigidBody>([
            [truckPlayer.id, truckBody],
            [sportPlayer.id, sportBody],
        ]);

        applyPlayerBumpResponse(truckPlayer, sportPlayer, rigidBodyMap);

        // Sport car should receive higher velocity change (lighter car gets knocked more)
        expect(planarSpeed(sportBody)).toBeGreaterThan(planarSpeed(truckBody));
    });

    it('should produce equal impulse when same-mass cars collide', () => {
        const playerA = createPlayer('A', 'sport', 20);
        const playerB = createPlayer('B', 'sport', 20);

        const bodyA = createMockRigidBody({
            mass: 1050,
            translation: { x: -2, y: 0, z: 0 },
        });
        const bodyB = createMockRigidBody({
            mass: 1050,
            translation: { x: 2, y: 0, z: 0 },
        });

        const rigidBodyMap = new Map<string, RigidBody>([
            [playerA.id, bodyA],
            [playerB.id, bodyB],
        ]);

        applyPlayerBumpResponse(playerA, playerB, rigidBodyMap);

        // Same mass should produce roughly equal post-bump speeds
        const speedA = planarSpeed(bodyA);
        const speedB = planarSpeed(bodyB);
        const ratio = Math.min(speedA, speedB) / Math.max(speedA, speedB);
        expect(ratio).toBeGreaterThan(0.9); // within 10% of each other
    });

    it('should clamp impulse at MAX_IMPULSE (800) to prevent physics explosion', () => {
        // Extreme collision: truck vs sport at maximum speed (50 m/s)
        const truckPlayer = createPlayer('truck', 'truck', 50);
        const sportPlayer = createPlayer('sport', 'sport', 50);

        const truckBody = createMockRigidBody({
            mass: 1800,
            translation: { x: 0, y: 0, z: 0 },
        });
        const sportBody = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 4 },
        });

        const rigidBodyMap = new Map<string, RigidBody>([
            [truckPlayer.id, truckBody],
            [sportPlayer.id, sportBody],
        ]);

        // With very high contact force
        applyPlayerBumpResponse(truckPlayer, sportPlayer, rigidBodyMap, 99999);

        // Post-bump speed must be bounded by dampAndClamp (MAX_POST_BUMP_SPEED_MPS = 4.5)
        // This confirms the entire chain: MAX_IMPULSE clamp + velocity damping prevent explosion
        const sportFinalSpeed = planarSpeed(sportBody);
        const truckFinalSpeed = planarSpeed(truckBody);
        expect(sportFinalSpeed).toBeLessThanOrEqual(5);
        expect(truckFinalSpeed).toBeLessThanOrEqual(5);

        // Also verify via impulse log that individual directional impulse components stay bounded.
        // The total impulse to sportBody (heavier attacker hitting it) should use clamped base.
        const sportImpulseLog = (sportBody as unknown as { _impulseLog: Vector3[] })._impulseLog;
        const mainImpulse = sportImpulseLog[0];
        // The directional (non-lateral) component along dz should be clamped
        // Since cars are separated along z, dz ≈ 1, so |impulse.z| ≈ totalImpulseB
        // totalImpulseB = impulseToB + reactionToB, where impulseToB ≤ MAX_IMPULSE = 800
        // and reactionToB = impulseToA * 0.3 where impulseToA ≤ 800
        // Max total = 800 + 800*0.3 = 1040 (directional) + lateral
        // The combined vector magnitude should be bounded
        const totalMag = Math.hypot(mainImpulse.x, mainImpulse.z);
        expect(totalMag).toBeLessThanOrEqual(1500); // well below physics-explosion territory
    });

    it('should scale impulse by contact force magnitude', () => {
        // Use low mass + low speed to ensure impulse stays below MAX_IMPULSE clamp
        // so force scaling has room to differentiate
        const makeCollisionPair = (forceMag?: number) => {
            const pA = createPlayer('A', 'muscle', 5);
            const pB = createPlayer('B', 'muscle', 5);
            const bA = createMockRigidBody({
                mass: 100,
                translation: { x: 0, y: 0, z: 0 },
            });
            const bB = createMockRigidBody({
                mass: 100,
                translation: { x: 0, y: 0, z: 4 },
            });
            const map = new Map<string, RigidBody>([
                [pA.id, bA],
                [pB.id, bB],
            ]);
            applyPlayerBumpResponse(pA, pB, map, forceMag);
            return { bodyA: bA, bodyB: bB };
        };

        const lowForce = makeCollisionPair(200);
        const highForce = makeCollisionPair(800);

        // Higher contact force should produce higher impulse
        // Use impulse logs to verify directly, bypassing the velocity clamp
        const lowImpulseLog = (lowForce.bodyB as unknown as { _impulseLog: Vector3[] })._impulseLog;
        const highImpulseLog = (highForce.bodyB as unknown as { _impulseLog: Vector3[] })._impulseLog;
        const lowImpulseMag = Math.hypot(lowImpulseLog[0].x, lowImpulseLog[0].z);
        const highImpulseMag = Math.hypot(highImpulseLog[0].x, highImpulseLog[0].z);
        expect(highImpulseMag).toBeGreaterThan(lowImpulseMag);
    });

    it('should apply arcade bias (0.3x) to attacker reaction', () => {
        // When a heavy car hits a light car, the heavy car should barely react
        const truckPlayer = createPlayer('truck', 'truck', 20);
        const sportPlayer = createPlayer('sport', 'sport', 5);

        const truckBody = createMockRigidBody({
            mass: 1800,
            translation: { x: 0, y: 0, z: 0 },
        });
        const sportBody = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 4 },
        });

        const rigidBodyMap = new Map<string, RigidBody>([
            [truckPlayer.id, truckBody],
            [sportPlayer.id, sportBody],
        ]);

        applyPlayerBumpResponse(truckPlayer, sportPlayer, rigidBodyMap);

        // Truck should barely move compared to sport car after bump
        const truckSpeed = planarSpeed(truckBody);
        const sportSpeed = planarSpeed(sportBody);

        // The truck's post-bump speed should be meaningfully less than the sport car's
        expect(truckSpeed).toBeLessThan(sportSpeed);
    });

    it('should not explode with extreme mass ratio (1.8:1.0 at max speed)', () => {
        // Regression test for R04: truck (1800) vs sport (1050) at max speed
        const truckPlayer = createPlayer('truck', 'truck', 44); // near max forward speed
        const sportPlayer = createPlayer('sport', 'sport', 44);

        const truckBody = createMockRigidBody({
            mass: 1800,
            translation: { x: 0, y: 0, z: 0 },
            linvel: { x: 0, y: 0, z: 20 }, // already moving fast
        });
        const sportBody = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 4 },
            linvel: { x: 0, y: 0, z: -20 }, // head-on
        });

        const rigidBodyMap = new Map<string, RigidBody>([
            [truckPlayer.id, truckBody],
            [sportPlayer.id, sportBody],
        ]);

        // With max contact force
        applyPlayerBumpResponse(truckPlayer, sportPlayer, rigidBodyMap, 5000);

        // Post-bump speeds must remain within sane bounds
        // The dampAndClamp function caps to MAX_POST_BUMP_SPEED_MPS = 4.5
        const truckFinalSpeed = planarSpeed(truckBody);
        const sportFinalSpeed = planarSpeed(sportBody);

        expect(truckFinalSpeed).toBeLessThanOrEqual(5); // reasonable bound
        expect(sportFinalSpeed).toBeLessThanOrEqual(5); // reasonable bound
        expect(truckFinalSpeed).toBeGreaterThanOrEqual(0);
        expect(sportFinalSpeed).toBeGreaterThanOrEqual(0);
    });

    it('should work without contact force magnitude (backward compatibility)', () => {
        const playerA = createPlayer('A', 'sport', 15);
        const playerB = createPlayer('B', 'truck', 15);

        const bodyA = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 0 },
        });
        const bodyB = createMockRigidBody({
            mass: 1800,
            translation: { x: 0, y: 0, z: 4 },
        });

        const rigidBodyMap = new Map<string, RigidBody>([
            [playerA.id, bodyA],
            [playerB.id, bodyB],
        ]);

        // Should not throw when called without contactForceMagnitude
        expect(() => {
            applyPlayerBumpResponse(playerA, playerB, rigidBodyMap);
        }).not.toThrow();

        // Both should end up with some velocity
        expect(planarSpeed(bodyA)).toBeGreaterThan(0);
        expect(planarSpeed(bodyB)).toBeGreaterThan(0);
    });

    it('should use force normalisation base of 500 for scaling', () => {
        const playerA = createPlayer('A', 'sport', 15);
        const playerB = createPlayer('B', 'sport', 15);

        // Exactly at normalisation base: forceScale should be 1.0
        const bodyA = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 0 },
        });
        const bodyB = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 4 },
        });

        const bodyA2 = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 0 },
        });
        const bodyB2 = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 4 },
        });

        const map1 = new Map<string, RigidBody>([
            [playerA.id, bodyA],
            [playerB.id, bodyB],
        ]);
        const pA2 = createPlayer('A', 'sport', 15);
        const pB2 = createPlayer('B', 'sport', 15);
        const map2 = new Map<string, RigidBody>([
            [pA2.id, bodyA2],
            [pB2.id, bodyB2],
        ]);

        applyPlayerBumpResponse(playerA, playerB, map1, 500); // forceScale = 1.0
        applyPlayerBumpResponse(pA2, pB2, map2);              // no force = default 1.0

        // At normalisation base of 500, result should match no-force case
        const speed1 = planarSpeed(bodyB);
        const speed2 = planarSpeed(bodyB2);
        const ratio = Math.min(speed1, speed2) / Math.max(speed1, speed2);
        expect(ratio).toBeGreaterThan(0.95);
    });

    it('should cap force scale at 2.0 to prevent oversized impulses', () => {
        const playerA = createPlayer('A', 'sport', 15);
        const playerB = createPlayer('B', 'sport', 15);

        // Force magnitude 2000 → scale = 2000/500 = 4.0, but capped at 2.0
        const bodyHuge = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 0 },
        });
        const bodyHuge2 = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 4 },
        });

        // Force magnitude 1000 → scale = 1000/500 = 2.0 (at exact cap)
        const bodyCap = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 0 },
        });
        const bodyCap2 = createMockRigidBody({
            mass: 1050,
            translation: { x: 0, y: 0, z: 4 },
        });

        const pA1 = createPlayer('A', 'sport', 15);
        const pB1 = createPlayer('B', 'sport', 15);
        const map1 = new Map<string, RigidBody>([
            [pA1.id, bodyHuge],
            [pB1.id, bodyHuge2],
        ]);

        const pA2 = createPlayer('A', 'sport', 15);
        const pB2 = createPlayer('B', 'sport', 15);
        const map2 = new Map<string, RigidBody>([
            [pA2.id, bodyCap],
            [pB2.id, bodyCap2],
        ]);

        applyPlayerBumpResponse(pA1, pB1, map1, 2000); // would be 4.0x without cap
        applyPlayerBumpResponse(pA2, pB2, map2, 1000); // exactly 2.0x

        // Both should produce the same result since both are capped at 2.0
        const speed1 = planarSpeed(bodyHuge2);
        const speed2 = planarSpeed(bodyCap2);
        const ratio = Math.min(speed1, speed2) / Math.max(speed1, speed2);
        expect(ratio).toBeGreaterThan(0.95);
    });
});
