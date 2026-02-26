/**
 * Shared test factory functions for SimPlayerState and related types.
 * Eliminates duplication across deployableSystem, projectileSystem, and driftSystem tests.
 */
import type { DriftContext } from '@/shared/game/vehicle/driftConfig';
import { createInitialDriftContext } from '@/shared/game/vehicle/driftConfig';
import type { SimPlayerState } from './types';

export type MockPlayerOverrides = {
    driftContext?: Partial<DriftContext>;
    handbrake?: boolean;
    id?: string;
    positionX?: number;
    positionZ?: number;
    rotationY?: number;
    speed?: number;
    steering?: number;
    x?: number; // alias for positionX (deployable-style)
    z?: number; // alias for positionZ (deployable-style)
};

/**
 * Creates a mock SimPlayerState with sensible defaults and optional overrides.
 * Supports all override styles used across combat test files.
 */
export const mockPlayer = (overrides: MockPlayerOverrides = {}): SimPlayerState => {
    const base = createInitialDriftContext();
    return {
        activeEffects: [],
        colorId: 'red',
        driftContext: {
            ...base,
            ...overrides.driftContext,
        },
        id: overrides.id ?? 'player-1',
        inputState: {
            boost: false,
            brake: false,
            handbrake: overrides.handbrake ?? false,
            steering: overrides.steering ?? 0,
            throttle: 0,
        },
        isGrounded: true,
        lastProcessedInputSeq: 0,
        motion: {
            positionX: overrides.positionX ?? overrides.x ?? 0,
            positionY: 0,
            positionZ: overrides.positionZ ?? overrides.z ?? 0,
            rotationY: overrides.rotationY ?? 0,
            speed: overrides.speed ?? 0,
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
    };
};
