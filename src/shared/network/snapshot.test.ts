import { describe, expect, it } from 'bun:test';
import type { ServerSnapshotPayload } from './snapshot';
import {
    isPlayerRaceProgress,
    isRaceState,
    isServerSnapshotPayload,
    isSnapshotDeployableState,
    isSnapshotPlayerState,
    isSnapshotProjectileState,
    isStatusEffectInstance,
    serializeSnapshot,
} from './snapshot';

const makeEffect = (overrides: Record<string, unknown> = {}) => ({
    appliedAtMs: 1000,
    effectType: 'slowed',
    expiresAtMs: 2000,
    intensity: 1,
    ...overrides,
});

const makeProgress = (overrides: Record<string, unknown> = {}) => ({
    checkpointIndex: 0,
    completedCheckpoints: [],
    distanceMeters: 0,
    finishedAtMs: null,
    lap: 1,
    ...overrides,
});

const makePlayer = (overrides: Record<string, unknown> = {}) => ({
    activeEffects: [],
    colorId: 'red',
    id: 'player-1',
    lastProcessedInputSeq: 0,
    name: 'Alice',
    progress: makeProgress(),
    rotationY: 0,
    speed: 0,
    vehicleId: 'sport',
    x: 0,
    y: 0,
    z: 0,
    ...overrides,
});

const makeRaceState = (overrides: Record<string, unknown> = {}) => ({
    endedAtMs: null,
    playerOrder: [],
    startedAtMs: 1000,
    status: 'running',
    totalLaps: 3,
    trackId: 'sunset-loop',
    winnerPlayerId: null,
    ...overrides,
});

const makeSnapshot = (overrides: Partial<ServerSnapshotPayload> = {}): ServerSnapshotPayload => ({
    hazards: [],
    players: [makePlayer() as any],
    powerups: [],
    raceState: makeRaceState() as any,
    roomId: 'ROOM1',
    seq: 1,
    serverTimeMs: 5000,
    ...overrides,
});

describe('isStatusEffectInstance', () => {
    it('should return true for a valid effect', () => {
        expect(isStatusEffectInstance(makeEffect())).toBeTrue();
    });

    it('should return false for null', () => {
        expect(isStatusEffectInstance(null)).toBeFalse();
    });

    it('should return false for non-object', () => {
        expect(isStatusEffectInstance('string')).toBeFalse();
    });

    it('should return false when effectType is invalid', () => {
        expect(isStatusEffectInstance(makeEffect({ effectType: 'unknown_type' }))).toBeFalse();
    });

    it('should return false when intensity is NaN', () => {
        expect(isStatusEffectInstance(makeEffect({ intensity: NaN }))).toBeFalse();
    });

    it('should return false when appliedAtMs is missing', () => {
        const { appliedAtMs: _, ...rest } = makeEffect();
        expect(isStatusEffectInstance(rest)).toBeFalse();
    });

    it('should accept all valid StatusEffectType values', () => {
        const types = ['slowed', 'stunned', 'flat_tire', 'boosted', 'flipped', 'speed_burst'];
        for (const effectType of types) {
            expect(isStatusEffectInstance(makeEffect({ effectType }))).toBeTrue();
        }
    });
});

describe('isPlayerRaceProgress', () => {
    it('should return true for a valid progress object', () => {
        expect(isPlayerRaceProgress(makeProgress())).toBeTrue();
    });

    it('should return false for null', () => {
        expect(isPlayerRaceProgress(null)).toBeFalse();
    });

    it('should return false when completedCheckpoints is not an array', () => {
        expect(isPlayerRaceProgress(makeProgress({ completedCheckpoints: 'invalid' }))).toBeFalse();
    });

    it('should return false when lap is NaN', () => {
        expect(isPlayerRaceProgress(makeProgress({ lap: NaN }))).toBeFalse();
    });

    it('should accept finishedAtMs as null or a number', () => {
        expect(isPlayerRaceProgress(makeProgress({ finishedAtMs: null }))).toBeTrue();
        expect(isPlayerRaceProgress(makeProgress({ finishedAtMs: 9999 }))).toBeTrue();
    });

    it('should return false when finishedAtMs is non-null non-number', () => {
        expect(isPlayerRaceProgress(makeProgress({ finishedAtMs: 'done' }))).toBeFalse();
    });

    it('should return false when a completed checkpoint has invalid fields', () => {
        expect(
            isPlayerRaceProgress(
                makeProgress({
                    completedCheckpoints: [{ checkpointIndex: 'bad', completedAtMs: 100 }],
                }),
            ),
        ).toBeFalse();
    });

    it('should return true with valid completed checkpoints', () => {
        expect(
            isPlayerRaceProgress(
                makeProgress({
                    completedCheckpoints: [{ checkpointIndex: 0, completedAtMs: 5000 }],
                }),
            ),
        ).toBeTrue();
    });
});

describe('isSnapshotPlayerState', () => {
    it('should return true for a valid player state', () => {
        expect(isSnapshotPlayerState(makePlayer())).toBeTrue();
    });

    it('should return false for null', () => {
        expect(isSnapshotPlayerState(null)).toBeFalse();
    });

    it('should return false when id is not a string', () => {
        expect(isSnapshotPlayerState(makePlayer({ id: 123 }))).toBeFalse();
    });

    it('should return false when x is NaN', () => {
        expect(isSnapshotPlayerState(makePlayer({ x: NaN }))).toBeFalse();
    });

    it('should return false when activeEffects is not an array', () => {
        expect(isSnapshotPlayerState(makePlayer({ activeEffects: null }))).toBeFalse();
    });

    it('should return false when driftState is provided but non-finite', () => {
        expect(isSnapshotPlayerState(makePlayer({ driftState: NaN }))).toBeFalse();
    });

    it('should accept optional drift fields when valid', () => {
        expect(isSnapshotPlayerState(makePlayer({ driftState: 1, driftAngle: 0.5, driftBoostTier: 2 }))).toBeTrue();
    });

    it('should return false when driftAngle is non-finite', () => {
        expect(isSnapshotPlayerState(makePlayer({ driftAngle: Infinity }))).toBeFalse();
    });

    it('should return false when driftBoostTier is non-finite', () => {
        expect(isSnapshotPlayerState(makePlayer({ driftBoostTier: NaN }))).toBeFalse();
    });
});

describe('isRaceState', () => {
    it('should return true for a valid race state', () => {
        expect(isRaceState(makeRaceState())).toBeTrue();
    });

    it('should return false for null', () => {
        expect(isRaceState(null)).toBeFalse();
    });

    it('should return false when status is invalid', () => {
        expect(isRaceState(makeRaceState({ status: 'unknown' }))).toBeFalse();
    });

    it('should accept countdown and finished status values', () => {
        expect(isRaceState(makeRaceState({ status: 'countdown' }))).toBeTrue();
        expect(isRaceState(makeRaceState({ status: 'finished' }))).toBeTrue();
    });

    it('should return false when playerOrder is not an array', () => {
        expect(isRaceState(makeRaceState({ playerOrder: 'bad' }))).toBeFalse();
    });

    it('should accept winnerPlayerId as null or string', () => {
        expect(isRaceState(makeRaceState({ winnerPlayerId: null }))).toBeTrue();
        expect(isRaceState(makeRaceState({ winnerPlayerId: 'player-1' }))).toBeTrue();
    });

    it('should return false when winnerPlayerId is a number', () => {
        expect(isRaceState(makeRaceState({ winnerPlayerId: 123 }))).toBeFalse();
    });

    it('should accept endedAtMs as null or number', () => {
        expect(isRaceState(makeRaceState({ endedAtMs: null }))).toBeTrue();
        expect(isRaceState(makeRaceState({ endedAtMs: 99999 }))).toBeTrue();
    });
});

describe('isSnapshotProjectileState', () => {
    const makeProjectile = (overrides: Record<string, unknown> = {}) => ({
        id: 1,
        ownerId: 'player-1',
        targetId: null,
        x: 0,
        z: 0,
        velX: 5,
        velZ: 20,
        ttlTicks: 90,
        ...overrides,
    });

    it('should return true for a valid projectile', () => {
        expect(isSnapshotProjectileState(makeProjectile())).toBeTrue();
    });

    it('should return false for null', () => {
        expect(isSnapshotProjectileState(null)).toBeFalse();
    });

    it('should accept targetId as null or string', () => {
        expect(isSnapshotProjectileState(makeProjectile({ targetId: null }))).toBeTrue();
        expect(isSnapshotProjectileState(makeProjectile({ targetId: 'player-2' }))).toBeTrue();
    });

    it('should return false when id is NaN', () => {
        expect(isSnapshotProjectileState(makeProjectile({ id: NaN }))).toBeFalse();
    });

    it('should return false when ownerId is not a string', () => {
        expect(isSnapshotProjectileState(makeProjectile({ ownerId: 123 }))).toBeFalse();
    });
});

describe('isSnapshotDeployableState', () => {
    const makeDeployable = (overrides: Record<string, unknown> = {}) => ({
        id: 1,
        kind: 'oil-slick',
        ownerId: 'player-1',
        x: 5,
        z: 10,
        radius: 3.5,
        lifetimeTicks: 400,
        ...overrides,
    });

    it('should return true for a valid deployable', () => {
        expect(isSnapshotDeployableState(makeDeployable())).toBeTrue();
    });

    it('should return false for null', () => {
        expect(isSnapshotDeployableState(null)).toBeFalse();
    });

    it('should return false when kind is not oil-slick', () => {
        expect(isSnapshotDeployableState(makeDeployable({ kind: 'mine' }))).toBeFalse();
    });

    it('should return false when radius is NaN', () => {
        expect(isSnapshotDeployableState(makeDeployable({ radius: NaN }))).toBeFalse();
    });

    it('should return false when ownerId is not a string', () => {
        expect(isSnapshotDeployableState(makeDeployable({ ownerId: 42 }))).toBeFalse();
    });
});

describe('isServerSnapshotPayload', () => {
    it('should return true for a valid snapshot', () => {
        expect(isServerSnapshotPayload(makeSnapshot())).toBeTrue();
    });

    it('should return false for null', () => {
        expect(isServerSnapshotPayload(null)).toBeFalse();
    });

    it('should return false when players is not an array', () => {
        expect(isServerSnapshotPayload({ ...makeSnapshot(), players: null })).toBeFalse();
    });

    it('should return false when roomId is not a string', () => {
        expect(isServerSnapshotPayload({ ...makeSnapshot(), roomId: 123 })).toBeFalse();
    });

    it('should validate optional projectiles when present', () => {
        const snap = makeSnapshot({
            projectiles: [{ id: 1, ownerId: 'p1', targetId: null, x: 0, z: 0, velX: 1, velZ: 1, ttlTicks: 10 }],
        });
        expect(isServerSnapshotPayload(snap)).toBeTrue();
    });

    it('should return false when projectiles contains an invalid entry', () => {
        const snap = makeSnapshot({
            projectiles: [{ id: 'bad', ownerId: 'p1', targetId: null, x: 0, z: 0 }] as any,
        });
        expect(isServerSnapshotPayload(snap)).toBeFalse();
    });

    it('should return false when projectiles is not an array', () => {
        const snap = { ...makeSnapshot(), projectiles: 'bad' as any };
        expect(isServerSnapshotPayload(snap)).toBeFalse();
    });

    it('should validate optional deployables when present', () => {
        const snap = makeSnapshot({
            deployables: [{ id: 1, kind: 'oil-slick', ownerId: 'p1', x: 0, z: 0, radius: 3, lifetimeTicks: 100 }],
        });
        expect(isServerSnapshotPayload(snap)).toBeTrue();
    });

    it('should return false when deployables contains an invalid entry', () => {
        const snap = makeSnapshot({
            deployables: [{ id: 'bad', kind: 'oil-slick', ownerId: 'p1', x: 0, z: 0 }] as any,
        });
        expect(isServerSnapshotPayload(snap)).toBeFalse();
    });

    it('should return false when deployables is not an array', () => {
        const snap = { ...makeSnapshot(), deployables: 'bad' as any };
        expect(isServerSnapshotPayload(snap)).toBeFalse();
    });
});

describe('isServerSnapshotPayload — powerup and hazard validation', () => {
    it('should return false when powerups contains an invalid entry (non-boolean isActive)', () => {
        const snap = {
            ...makeSnapshot(),
            powerups: [{ id: 'pu-1', powerupId: 'speed', isActive: 'yes', x: 0, z: 0 }],
        };
        expect(isServerSnapshotPayload(snap)).toBeFalse();
    });

    it('should return false when powerups contains an entry with NaN x', () => {
        const snap = {
            ...makeSnapshot(),
            powerups: [{ id: 'pu-1', powerupId: 'speed', isActive: true, x: NaN, z: 0 }],
        };
        expect(isServerSnapshotPayload(snap)).toBeFalse();
    });

    it('should return false when hazards contains an invalid entry (missing hazardId)', () => {
        const snap = {
            ...makeSnapshot(),
            hazards: [{ id: 'hz-1', hazardId: 123, x: 0, z: 0 }],
        };
        expect(isServerSnapshotPayload(snap)).toBeFalse();
    });

    it('should return false when hazards contains null entry', () => {
        const snap = {
            ...makeSnapshot(),
            hazards: [null],
        };
        expect(isServerSnapshotPayload(snap)).toBeFalse();
    });

    it('should return false when powerups contains null entry', () => {
        const snap = {
            ...makeSnapshot(),
            powerups: [null],
        };
        expect(isServerSnapshotPayload(snap)).toBeFalse();
    });

    it('should accept a valid snapshot with powerups and hazards', () => {
        const snap = makeSnapshot({
            powerups: [{ id: 'pu-1', powerupId: 'speed', isActive: true, x: 5, z: 10 }],
            hazards: [{ id: 'hz-1', hazardId: 'spike-strip', x: 0, z: 20 }],
        });
        expect(isServerSnapshotPayload(snap)).toBeTrue();
    });
});

describe('isPlayerRaceProgress — null checkpoint entry', () => {
    it('should return false when completed checkpoints contains null', () => {
        expect(
            isPlayerRaceProgress(
                makeProgress({
                    completedCheckpoints: [null],
                }),
            ),
        ).toBeFalse();
    });
});

describe('serializeSnapshot', () => {
    it('should serialize a snapshot to a compact array', () => {
        const snap = makeSnapshot();
        const result = serializeSnapshot(snap);
        expect(Array.isArray(result)).toBeTrue();
        expect(result[0]).toBe(snap.seq);
        expect(result[1]).toBe(snap.serverTimeMs);
        expect(result[2]).toBe(snap.roomId);
    });

    it('should include race state data in the fourth element', () => {
        const snap = makeSnapshot();
        const result = serializeSnapshot(snap);
        const raceData = result[3] as any[];
        expect(raceData[0]).toBe(snap.raceState.status);
        expect(raceData[1]).toBe(snap.raceState.trackId);
    });

    it('should serialize players array', () => {
        const snap = makeSnapshot();
        const result = serializeSnapshot(snap);
        const players = result[4] as any[];
        expect(players).toHaveLength(1);
        expect(players[0][0]).toBe('player-1');
    });

    it('should serialize optional projectiles as empty array when not present', () => {
        const snap = makeSnapshot();
        const result = serializeSnapshot(snap);
        // projectiles is at index 7
        expect(result[7]).toEqual([]);
    });

    it('should serialize optional deployables as empty array when not present', () => {
        const snap = makeSnapshot();
        const result = serializeSnapshot(snap);
        // deployables is at index 8
        expect(result[8]).toEqual([]);
    });

    it('should serialize projectiles when present', () => {
        const snap = makeSnapshot({
            projectiles: [{ id: 1, ownerId: 'p1', targetId: 'p2', x: 5, z: 10, velX: 1, velZ: 2, ttlTicks: 90 }],
        });
        const result = serializeSnapshot(snap);
        const projectiles = result[7] as any[];
        expect(projectiles).toHaveLength(1);
        expect(projectiles[0][0]).toBe(1);
        expect(projectiles[0][1]).toBe('p1');
    });

    it('should serialize deployables when present', () => {
        const snap = makeSnapshot({
            deployables: [{ id: 2, kind: 'oil-slick', ownerId: 'p1', x: 3, z: 7, radius: 4, lifetimeTicks: 200 }],
        });
        const result = serializeSnapshot(snap);
        const deployables = result[8] as any[];
        expect(deployables).toHaveLength(1);
        expect(deployables[0][1]).toBe('oil-slick');
    });

    it('should serialize active effects inside player data', () => {
        const snap = makeSnapshot({
            players: [makePlayer({ activeEffects: [makeEffect()] }) as any],
        });
        const result = serializeSnapshot(snap);
        const players = result[4] as any[];
        const effects = players[0][11] as any[];
        expect(effects).toHaveLength(1);
        expect(effects[0][0]).toBe('slowed');
    });
});
