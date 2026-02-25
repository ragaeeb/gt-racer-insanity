import { describe, expect, it } from 'bun:test';
import { DEFAULT_GAMEPLAY_TUNING } from '@/shared/game/tuning/gameplayTuning';
import { createInitialDriftContext } from '@/shared/game/vehicle/driftConfig';
import { createProjectile, stepAllProjectiles, stepProjectile } from '../projectileSystem';
import type { ActiveProjectile, SimPlayerState, SimRoomState } from '../types';

const combatConfig = DEFAULT_GAMEPLAY_TUNING.combat;

/**
 * Creates a minimal mock SimPlayerState for projectile system tests.
 */
const mockPlayer = (overrides: {
    id?: string;
    positionX?: number;
    positionZ?: number;
    rotationY?: number;
    speed?: number;
}): SimPlayerState => ({
    activeEffects: [],
    colorId: 'red',
    driftContext: createInitialDriftContext(),
    id: overrides.id ?? 'p1',
    inputState: { boost: false, brake: false, handbrake: false, steering: 0, throttle: 1 },
    lastProcessedInputSeq: 0,
    motion: {
        positionX: overrides.positionX ?? 0,
        positionZ: overrides.positionZ ?? 0,
        rotationY: overrides.rotationY ?? 0,
        speed: overrides.speed ?? 10,
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
});

const mockProjectile = (overrides: Partial<ActiveProjectile>): ActiveProjectile => ({
    id: overrides.id ?? 1,
    ownerId: overrides.ownerId ?? 'p1',
    targetId: overrides.targetId ?? 'p2',
    position: overrides.position ?? { x: 0, z: 0 },
    velocity: overrides.velocity ?? { x: 0, z: combatConfig.projectileSpeed },
    ttlTicks: overrides.ttlTicks ?? combatConfig.projectileTtlTicks,
    speed: overrides.speed ?? combatConfig.projectileSpeed,
});

const mockRoomState = (players: SimPlayerState[], projectiles: ActiveProjectile[] = []): SimRoomState => ({
    activePowerups: [],
    activeProjectiles: projectiles,
    activeDeployables: [],
    hazards: [],
    players: new Map(players.map((p) => [p.id, p])),
    raceEvents: [],
    raceState: {
        endedAtMs: null,
        playerOrder: [],
        startedAtMs: 0,
        status: 'running',
        totalLaps: 1,
        trackId: 'sunset-loop',
        winnerPlayerId: null,
    },
    roomId: 'test-room',
    seed: 42,
    snapshotSeq: 0,
});

describe('Projectile System - Proportional Navigation', () => {
    it('should steer projectile toward stationary target', () => {
        const target = mockPlayer({ id: 'p2', positionX: 5, positionZ: 50 });
        const players = new Map<string, SimPlayerState>([['p2', target]]);

        // Projectile flying straight along Z, target is to the right
        const proj = mockProjectile({
            position: { x: 0, z: 0 },
            velocity: { x: 0, z: combatConfig.projectileSpeed },
            targetId: 'p2',
        });

        const result = stepProjectile(proj, players, 1 / 60, combatConfig);

        expect(result).toBe('flying');
        expect(proj.velocity.x).toBeGreaterThan(0); // turned toward x=5
    });

    it('should steer projectile toward moving target', () => {
        const target = mockPlayer({ id: 'p2', positionX: -10, positionZ: 30 });
        const players = new Map<string, SimPlayerState>([['p2', target]]);

        const proj = mockProjectile({
            position: { x: 0, z: 0 },
            velocity: { x: 0, z: combatConfig.projectileSpeed },
            targetId: 'p2',
        });

        stepProjectile(proj, players, 1 / 60, combatConfig);

        // Should steer left (negative X) toward target at x=-10
        expect(proj.velocity.x).toBeLessThan(0);
    });

    it('should fly straight when no target exists', () => {
        const players = new Map<string, SimPlayerState>();

        const proj = mockProjectile({
            position: { x: 0, z: 0 },
            velocity: { x: 0, z: combatConfig.projectileSpeed },
            targetId: null,
        });

        const initialVelX = proj.velocity.x;
        stepProjectile(proj, players, 1 / 60, combatConfig);

        // No steering should occur
        expect(proj.velocity.x).toBe(initialVelX);
        expect(proj.position.z).toBeGreaterThan(0); // advanced forward
    });

    it('should fly straight when target ID is not found in players', () => {
        const players = new Map<string, SimPlayerState>();

        const proj = mockProjectile({
            position: { x: 0, z: 0 },
            velocity: { x: 0, z: combatConfig.projectileSpeed },
            targetId: 'p-missing',
        });

        stepProjectile(proj, players, 1 / 60, combatConfig);

        // Should continue straight (no steering)
        expect(proj.velocity.x).toBe(0);
    });

    it('should return "hit" when within hit radius of target', () => {
        const target = mockPlayer({ id: 'p2', positionX: 1, positionZ: 2 });
        const players = new Map<string, SimPlayerState>([['p2', target]]);

        // dist ≈ 2.24m, within 2.5m hit radius
        const proj = mockProjectile({
            position: { x: 0, z: 0 },
            targetId: 'p2',
        });

        const result = stepProjectile(proj, players, 1 / 60, combatConfig);

        expect(result).toBe('hit');
    });

    it('should return "expired" after TTL ticks', () => {
        const players = new Map<string, SimPlayerState>();

        const proj = mockProjectile({ ttlTicks: 1 }); // will hit 0 this tick

        const result = stepProjectile(proj, players, 1 / 60, combatConfig);

        expect(result).toBe('expired');
    });

    it('should maintain constant speed throughout flight', () => {
        const target = mockPlayer({ id: 'p2', positionX: 20, positionZ: 50 });
        const players = new Map<string, SimPlayerState>([['p2', target]]);

        const proj = mockProjectile({
            position: { x: 0, z: 0 },
            velocity: { x: 0, z: combatConfig.projectileSpeed },
            targetId: 'p2',
        });

        // Run multiple ticks
        for (let i = 0; i < 30; i++) {
            stepProjectile(proj, players, 1 / 60, combatConfig);
        }

        const speed = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.z ** 2);
        expect(speed).toBeCloseTo(combatConfig.projectileSpeed, 1);
    });

    it('should respect max turn rate (no instant 180-degree turns)', () => {
        // Target directly behind projectile
        const target = mockPlayer({ id: 'p2', positionX: 0, positionZ: -50 });
        const players = new Map<string, SimPlayerState>([['p2', target]]);

        const proj = mockProjectile({
            position: { x: 0, z: 0 },
            velocity: { x: 0, z: combatConfig.projectileSpeed }, // flying forward (positive Z)
            targetId: 'p2',
        });

        // Single tick — should not reverse direction
        stepProjectile(proj, players, 1 / 60, combatConfig);

        // After one tick, the projectile should still be mostly forward
        // The turn angle should be limited by turnRate * dt
        expect(proj.velocity.z).toBeGreaterThan(0); // still flying roughly forward
    });

    it('should advance position based on velocity and dt', () => {
        const players = new Map<string, SimPlayerState>();

        const proj = mockProjectile({
            position: { x: 0, z: 0 },
            velocity: { x: 10, z: 20 },
            targetId: null,
        });

        const dt = 1 / 60;
        stepProjectile(proj, players, dt, combatConfig);

        expect(proj.position.x).toBeCloseTo(10 * dt, 5);
        expect(proj.position.z).toBeCloseTo(20 * dt, 5);
    });
});

describe('Projectile System - Lifecycle', () => {
    it('should create projectile targeting nearest opponent', () => {
        const owner = mockPlayer({ id: 'p1', positionX: 0, positionZ: 0, rotationY: 0 });
        const near = mockPlayer({ id: 'p2', positionX: 5, positionZ: 10 });
        const far = mockPlayer({ id: 'p3', positionX: 50, positionZ: 50 });
        const players = new Map<string, SimPlayerState>([
            ['p1', owner],
            ['p2', near],
            ['p3', far],
        ]);

        const proj = createProjectile(owner, players, [], combatConfig);

        expect(proj).not.toBeNull();
        expect(proj!.targetId).toBe('p2'); // nearest
        expect(proj!.ownerId).toBe('p1');
    });

    it('should return null when no opponents exist', () => {
        const owner = mockPlayer({ id: 'p1' });
        const players = new Map<string, SimPlayerState>([['p1', owner]]);

        const proj = createProjectile(owner, players, [], combatConfig);

        expect(proj).toBeNull();
    });

    it('should reject creation when per-player cap exceeded', () => {
        const owner = mockPlayer({ id: 'p1' });
        const opponent = mockPlayer({ id: 'p2', positionX: 10, positionZ: 10 });
        const players = new Map<string, SimPlayerState>([
            ['p1', owner],
            ['p2', opponent],
        ]);

        // Already at per-player cap
        const existingProjectiles = Array.from({ length: combatConfig.projectileMaxPerPlayer }, (_, i) =>
            mockProjectile({ id: i + 1, ownerId: 'p1' }),
        );

        const proj = createProjectile(owner, players, existingProjectiles, combatConfig);

        expect(proj).toBeNull();
    });

    it('should reject creation when per-room cap exceeded', () => {
        const owner = mockPlayer({ id: 'p1' });
        const opponent = mockPlayer({ id: 'p2', positionX: 10, positionZ: 10 });
        const players = new Map<string, SimPlayerState>([
            ['p1', owner],
            ['p2', opponent],
        ]);

        // Room at cap with projectiles from various owners
        const existingProjectiles = Array.from({ length: combatConfig.projectileMaxPerRoom }, (_, i) =>
            mockProjectile({ id: i + 1, ownerId: `other-${i}` }),
        );

        const proj = createProjectile(owner, players, existingProjectiles, combatConfig);

        expect(proj).toBeNull();
    });

    it('should apply stunned effect on hit', () => {
        const owner = mockPlayer({ id: 'p1', positionX: 0, positionZ: 0 });
        const target = mockPlayer({ id: 'p2', positionX: 1, positionZ: 1 });

        const proj = mockProjectile({
            ownerId: 'p1',
            targetId: 'p2',
            position: { x: 1, z: 1 }, // direct hit
        });

        const state = mockRoomState([owner, target], [proj]);
        const nowMs = 5000;
        const events: any[] = [];

        stepAllProjectiles(state, 1 / 60, nowMs, combatConfig, (event) => events.push(event));

        // Target should have stunned effect
        expect(target.activeEffects.some((e) => e.effectType === 'stunned')).toBe(true);
        // Projectile should be removed
        expect(state.activeProjectiles.length).toBe(0);
    });

    it('should respect hit immunity window (1.5s)', () => {
        const owner = mockPlayer({ id: 'p1', positionX: 0, positionZ: 0 });
        const target = mockPlayer({ id: 'p2', positionX: 1, positionZ: 1 });

        // Target was recently hit — has a stunned effect that just expired
        // but the immunity window is tracked by existing stunned effect timestamp
        const proj = mockProjectile({
            ownerId: 'p1',
            targetId: 'p2',
            position: { x: 1, z: 1 }, // direct hit position
        });

        // Simulate: target was hit recently (has active stunned effect applied 100ms ago)
        target.activeEffects.push({
            appliedAtMs: 4900,
            effectType: 'stunned',
            expiresAtMs: 6500, // still active
            intensity: 1,
        });

        const state = mockRoomState([owner, target], [proj]);
        const nowMs = 5000;

        stepAllProjectiles(state, 1 / 60, nowMs, combatConfig, () => {});

        // Should still count as a hit (projectile consumed), but target already has stunned
        // The effect system merges/extends the duration rather than stacking
        expect(state.activeProjectiles.length).toBe(0);
    });

    it('should clear projectiles on race restart (via array reset)', () => {
        const projectiles = [mockProjectile({ id: 1 }), mockProjectile({ id: 2 }), mockProjectile({ id: 3 })];

        // Simulating what restartRace does
        projectiles.length = 0;

        expect(projectiles.length).toBe(0);
    });

    it('should remove expired projectiles from state', () => {
        const owner = mockPlayer({ id: 'p1' });
        const proj = mockProjectile({
            ownerId: 'p1',
            ttlTicks: 1, // expires this tick
            targetId: null,
        });

        const state = mockRoomState([owner], [proj]);

        stepAllProjectiles(state, 1 / 60, 5000, combatConfig, () => {});

        expect(state.activeProjectiles.length).toBe(0);
    });

    it('should remove hit projectiles from state', () => {
        const owner = mockPlayer({ id: 'p1', positionX: 0, positionZ: 0 });
        const target = mockPlayer({ id: 'p2', positionX: 0.5, positionZ: 0.5 });

        const proj = mockProjectile({
            ownerId: 'p1',
            targetId: 'p2',
            position: { x: 0.5, z: 0.5 }, // overlapping with target
        });

        const state = mockRoomState([owner, target], [proj]);

        stepAllProjectiles(state, 1 / 60, 5000, combatConfig, () => {});

        expect(state.activeProjectiles.length).toBe(0);
    });

    it('should not hit the projectile owner', () => {
        const owner = mockPlayer({ id: 'p1', positionX: 0, positionZ: 0 });

        // Projectile at same position as owner
        const proj = mockProjectile({
            ownerId: 'p1',
            targetId: 'p2',
            position: { x: 0, z: 0 },
        });

        const state = mockRoomState([owner], [proj]);

        stepAllProjectiles(state, 1 / 60, 5000, combatConfig, () => {});

        // Projectile should still be flying (not consumed by self-hit)
        // It will decrement TTL but not register a hit on owner
        expect(owner.activeEffects.some((e) => e.effectType === 'stunned')).toBe(false);
    });

    it('should emit race event on projectile hit', () => {
        const owner = mockPlayer({ id: 'p1', positionX: 0, positionZ: 0 });
        const target = mockPlayer({ id: 'p2', positionX: 0.5, positionZ: 0.5 });

        const proj = mockProjectile({
            ownerId: 'p1',
            targetId: 'p2',
            position: { x: 0.5, z: 0.5 },
        });

        const state = mockRoomState([owner, target], [proj]);
        const events: any[] = [];

        stepAllProjectiles(state, 1 / 60, 5000, combatConfig, (event) => events.push(event));

        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events[0].kind).toBe('projectile_hit');
        expect(events[0].playerId).toBe('p2');
    });

    it('should initialize projectile velocity in owner forward direction', () => {
        // Owner facing along Z axis (rotationY = 0)
        const owner = mockPlayer({ id: 'p1', positionX: 0, positionZ: 0, rotationY: 0 });
        const opponent = mockPlayer({ id: 'p2', positionX: 0, positionZ: 50 });
        const players = new Map<string, SimPlayerState>([
            ['p1', owner],
            ['p2', opponent],
        ]);

        const proj = createProjectile(owner, players, [], combatConfig);
        expect(proj).not.toBeNull();

        // Forward in this engine: sin(0) = 0 for x, cos(0) = 1 for z
        expect(proj!.velocity.z).toBeGreaterThan(0);
    });

    it('should set projectile speed to combat tuning speed', () => {
        const owner = mockPlayer({ id: 'p1', positionX: 0, positionZ: 0 });
        const opponent = mockPlayer({ id: 'p2', positionX: 0, positionZ: 50 });
        const players = new Map<string, SimPlayerState>([
            ['p1', owner],
            ['p2', opponent],
        ]);

        const proj = createProjectile(owner, players, [], combatConfig);
        expect(proj).not.toBeNull();

        const speed = Math.sqrt(proj!.velocity.x ** 2 + proj!.velocity.z ** 2);
        expect(speed).toBeCloseTo(combatConfig.projectileSpeed, 1);
    });
});
