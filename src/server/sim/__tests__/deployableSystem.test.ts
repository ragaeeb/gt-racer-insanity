import { describe, expect, it } from 'bun:test';
import { RoomSimulation } from '@/server/sim/roomSimulation';
import { DEFAULT_GAMEPLAY_TUNING } from '@/shared/game/tuning/gameplayTuning';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import {
    checkDeployableCollisions,
    resetDeployableIdCounter,
    spawnDeployable,
    updateDeployables,
} from '../deployableSystem';
import type { ActiveDeployable } from '../types';
import { mockPlayer } from './testFactories';

const combatTuning = DEFAULT_GAMEPLAY_TUNING.combat;
const oilSlickLifetimeTicks = combatTuning.deployableOilSlickLifetimeTicks;

const createInputFrame = (roomId: string, seq: number, timestampMs: number, boost: boolean) => {
    return {
        ackSnapshotSeq: null,
        controls: {
            boost,
            brake: false,
            handbrake: false,
            steering: 0,
            throttle: 0,
        },
        cruiseControlEnabled: false,
        precisionOverrideActive: false,
        protocolVersion: PROTOCOL_V2,
        roomId,
        seq,
        timestampMs,
    };
};

const mockDeployable = (overrides: {
    id?: number;
    ownerId?: string;
    x?: number;
    z?: number;
    radius?: number;
    remainingTicks?: number;
    triggered?: boolean;
}): ActiveDeployable => ({
    id: overrides.id ?? 1,
    kind: 'oil-slick',
    lifetimeTicks: oilSlickLifetimeTicks,
    ownerId: overrides.ownerId ?? 'owner',
    position: {
        x: overrides.x ?? 0,
        z: overrides.z ?? 0,
    },
    radius: overrides.radius ?? combatTuning.deployableOilSlickRadius,
    remainingTicks: overrides.remainingTicks ?? oilSlickLifetimeTicks,
    triggered: overrides.triggered ?? false,
});

describe('Deployable System', () => {
    it('should spawn oil slick 5m behind player', () => {
        resetDeployableIdCounter();
        const player = mockPlayer({ rotationY: 0, x: 10, z: 20 });

        const deployable = spawnDeployable('oil-slick', player, [], oilSlickLifetimeTicks, combatTuning);

        expect(deployable).not.toBeNull();
        expect(deployable?.position.x).toBeCloseTo(10, 5);
        expect(deployable?.position.z).toBeCloseTo(15, 5);
        expect(deployable?.kind).toBe('oil-slick');
    });

    it('should apply slowed effect to player inside radius', () => {
        const deployable = mockDeployable({ ownerId: 'owner', radius: 3, x: 10, z: 10 });
        const owner = mockPlayer({ id: 'owner', x: 10, z: 10 });
        const opponent = mockPlayer({ id: 'opponent', x: 11, z: 11 });

        const effects = checkDeployableCollisions([deployable], [owner, opponent], combatTuning);

        expect(effects.length).toBe(1);
        expect(effects[0]?.playerId).toBe('opponent');
        expect(effects[0]?.effectType).toBe('slowed');
        expect(deployable.triggered).toBeTrue();
    });

    it('should not apply effect to player outside radius', () => {
        const deployable = mockDeployable({ radius: 3, x: 10, z: 10 });
        const player = mockPlayer({ id: 'opponent', x: 20, z: 20 });

        const effects = checkDeployableCollisions([deployable], [player], combatTuning);

        expect(effects.length).toBe(0);
        expect(deployable.triggered).toBeFalse();
    });

    it('should not apply effect to deployable owner', () => {
        const deployable = mockDeployable({ ownerId: 'player-1', radius: 3, x: 5, z: 5 });
        const owner = mockPlayer({ id: 'player-1', x: 5.5, z: 5.5 });

        const effects = checkDeployableCollisions([deployable], [owner], combatTuning);

        expect(effects.length).toBe(0);
        expect(deployable.triggered).toBeFalse();
    });

    it('should despawn after lifetime expires', () => {
        const deployables = [mockDeployable({ id: 1, remainingTicks: 1 })];

        updateDeployables(deployables, 2);

        expect(deployables.length).toBe(0);
    });

    it('should cap deployables at max per room', () => {
        const player = mockPlayer({});

        // Fill the room with dummy deployables
        const dummyDeployables: ActiveDeployable[] = Array(combatTuning.deployableMaxPerRoom).fill(
            mockDeployable({ ownerId: 'other-player' }),
        );

        const deployable = spawnDeployable('oil-slick', player, dummyDeployables, oilSlickLifetimeTicks, combatTuning);

        expect(deployable).toBeNull();
    });

    it('should cap deployables at max per player', () => {
        const player = mockPlayer({ id: 'owner' });

        const dummyDeployables: ActiveDeployable[] = Array(combatTuning.deployableMaxPerPlayer).fill(
            mockDeployable({ ownerId: 'owner' }),
        );

        const deployable = spawnDeployable('oil-slick', player, dummyDeployables, oilSlickLifetimeTicks, combatTuning);

        expect(deployable).toBeNull();
    });

    it('should include oil slick deployable in room snapshot after deploy input', () => {
        const sim = new RoomSimulation({
            roomId: 'deploy-room',
            seed: 42,
            tickHz: 60,
            totalLaps: 1,
            trackId: 'sunset-loop',
        });

        sim.joinPlayer('player-1', 'Alice', 'sport', 'red', 1_000);
        sim.queueInputFrame('player-1', createInputFrame('deploy-room', 1, 1_016, true));
        sim.step(1_016);

        const snapshot = sim.buildSnapshot(1_016);
        expect(snapshot.deployables).toBeDefined();
        expect(snapshot.deployables?.length).toBe(1);
        expect(snapshot.deployables?.[0]?.kind).toBe('oil-slick');
    });
});
