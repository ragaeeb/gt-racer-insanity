import { describe, expect, it } from 'bun:test';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { applyPlayerBumpResponse } from '@/server/sim/collisionSystem';
import type { SimPlayerState } from '@/server/sim/types';
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

    const mockRigidBody = {
        angvel: () => ({ ...currentAngvel }),
        applyImpulse: (impulse: Vector3) => {
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

const FLOAT_EPSILON = 1e-9;

describe('applyPlayerBumpResponse', () => {
    it('should impart more knockback velocity to the lighter car', () => {
        const lightPlayer = createPlayer('light', 'sport', 6);
        const heavyPlayer = createPlayer('heavy', 'truck', 6);
        const lightBody = createMockRigidBody({
            mass: 1,
            translation: { x: 0, y: 0, z: 0 },
        });
        const heavyBody = createMockRigidBody({
            mass: 4,
            translation: { x: 0, y: 0, z: 4 },
        });
        const rigidBodyMap = new Map<string, RigidBody>([
            [lightPlayer.id, lightBody],
            [heavyPlayer.id, heavyBody],
        ]);

        applyPlayerBumpResponse(lightPlayer, heavyPlayer, rigidBodyMap);

        expect(planarSpeed(lightBody)).toBeGreaterThan(planarSpeed(heavyBody));
    });

    it('should clamp post-bump planar speeds to the configured maximum', () => {
        const playerA = createPlayer('A', 'sport', 30);
        const playerB = createPlayer('B', 'sport', 30);
        const bodyA = createMockRigidBody({
            mass: 1,
            translation: { x: -1, y: 0, z: 0 },
        });
        const bodyB = createMockRigidBody({
            mass: 1,
            translation: { x: 1, y: 0, z: 0 },
        });
        const rigidBodyMap = new Map<string, RigidBody>([
            [playerA.id, bodyA],
            [playerB.id, bodyB],
        ]);

        applyPlayerBumpResponse(playerA, playerB, rigidBodyMap);

        expect(planarSpeed(bodyA)).toBeLessThanOrEqual(4.5 + FLOAT_EPSILON);
        expect(planarSpeed(bodyB)).toBeLessThanOrEqual(4.5 + FLOAT_EPSILON);
    });

    it('should reset scalar motion speed so recovery logic cannot reuse stale pre-impact speed', () => {
        const playerA = createPlayer('A', 'sport', 12);
        const playerB = createPlayer('B', 'truck', -8);
        const bodyA = createMockRigidBody({
            mass: 1.2,
            translation: { x: 0, y: 0, z: 0 },
        });
        const bodyB = createMockRigidBody({
            mass: 2.8,
            translation: { x: 0, y: 0, z: 3.5 },
        });
        const rigidBodyMap = new Map<string, RigidBody>([
            [playerA.id, bodyA],
            [playerB.id, bodyB],
        ]);

        applyPlayerBumpResponse(playerA, playerB, rigidBodyMap);

        expect(playerA.motion.speed).toBe(0);
        expect(playerB.motion.speed).toBe(0);
    });
});
