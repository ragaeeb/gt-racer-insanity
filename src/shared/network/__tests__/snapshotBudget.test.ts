import { describe, expect, it } from 'bun:test';
import { serializeSnapshot } from '@/shared/network/snapshot';

const mockSnapshotPlayerState = (index: number) => ({
    activeEffects: [
        { appliedAtMs: 1000, effectType: 'boosted', expiresAtMs: 4000, intensity: 1 },
        { appliedAtMs: 1000, effectType: 'slowed', expiresAtMs: 3500, intensity: 0.7 },
    ],
    colorId: 'red',
    id: `player-${index}`,
    lastProcessedInputSeq: 100 + index,
    name: `Player${index}`,
    progress: {
        checkpointIndex: 2,
        completedCheckpoints: [
            { checkpointIndex: 0, completedAtMs: 5000 },
            { checkpointIndex: 1, completedAtMs: 10000 },
        ],
        distanceMeters: 450.5,
        finishedAtMs: null,
        lap: 2,
    },
    rotationY: 0.5,
    speed: 35.2,
    vehicleId: 'sport',
    x: 10.5,
    y: 0,
    z: 500.25,
});

export const SNAPSHOT_BUDGET_BYTES = 4096;

describe('Snapshot Payload Budget', () => {
    it('should fit 8-player snapshot with full state in <= 4096 bytes', () => {
        const snapshot = {
            hazards: Array.from({ length: 9 }, (_, i) => ({
                hazardId: 'spike-strip',
                id: `hz-${i}`,
                x: i * 10,
                z: i * 100,
            })),
            players: Array.from({ length: 8 }, (_, i) => mockSnapshotPlayerState(i)),
            powerups: Array.from({ length: 24 }, (_, i) => ({
                id: `pu-${i}`,
                isActive: i % 3 !== 0,
                powerupId: 'powerup-speed',
                x: i * 5,
                z: i * 50,
            })),
            raceState: {
                endedAtMs: null,
                playerOrder: Array.from({ length: 8 }, (_, i) => `player-${i}`),
                startedAtMs: 1000,
                status: 'running' as const,
                totalLaps: 3,
                trackId: 'sunset-loop',
                winnerPlayerId: null,
            },
            roomId: 'ROOM-TEST',
            seq: 42,
            serverTimeMs: 50000,
        };

        const bytes = new TextEncoder().encode(JSON.stringify(serializeSnapshot(snapshot as any))).length;
        expect(bytes).toBeLessThanOrEqual(SNAPSHOT_BUDGET_BYTES);
    });

    it('should fit 8-player snapshot with future combat state in <= 4096 bytes', () => {
        // Reserve space for projectiles and deployables added in M3
        const snapshot = {
            hazards: Array.from({ length: 9 }, (_, i) => ({
                hazardId: 'spike-strip', id: `hz-${i}`, x: i * 10, z: i * 100,
            })),
            players: Array.from({ length: 8 }, (_, i) => mockSnapshotPlayerState(i)),
            powerups: Array.from({ length: 24 }, (_, i) => ({
                id: `pu-${i}`, isActive: true, powerupId: 'powerup-speed', x: i * 5, z: i * 50,
            })),
            projectiles: Array.from({ length: 8 }, (_, i) => ({
                id: i, ownerId: `player-${i}`, targetId: `player-${(i + 1) % 8}`, x: i * 10, z: i * 50,
                velX: 5, velZ: 20, ttlTicks: 90,
            })),
            deployables: Array.from({ length: 8 }, (_, i) => ({
                id: `dep-${i}`, kind: 'oil_slick', ownerId: `player-${i}`, x: i * 10, z: i * 100,
                radius: 3.5, lifetimeTicks: 400,
            })),
            raceState: {
                endedAtMs: null,
                playerOrder: Array.from({ length: 8 }, (_, i) => `player-${i}`),
                startedAtMs: 1000, status: 'running' as const, totalLaps: 3,
                trackId: 'sunset-loop', winnerPlayerId: null,
            },
            roomId: 'ROOM-TEST',
            seq: 42,
            serverTimeMs: 50000,
        };

        const bytes = new TextEncoder().encode(JSON.stringify(serializeSnapshot(snapshot as any))).length;
        expect(bytes).toBeLessThanOrEqual(SNAPSHOT_BUDGET_BYTES);
    });
});
