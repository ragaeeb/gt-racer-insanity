import { describe, expect, it } from 'bun:test';
import { RoomStore } from '../../src/server/roomStore';

const sequence = (values: number[]) => {
    let index = 0;
    return () => {
        const value = values[index] ?? values[values.length - 1] ?? 0;
        index += 1;
        return value;
    };
};

describe('RoomStore', () => {
    it('should create a room and join the first player', () => {
        const store = new RoomStore(() => 101, () => 2.5);
        const result = store.joinRoom('ABCD', 'player-1');

        expect(result.created).toEqual(true);
        expect(result.room.seed).toEqual(101);
        expect(result.room.players.size).toEqual(1);
        expect(result.player.x).toEqual(2.5);
    });

    it('should keep the same room seed when other players join', () => {
        const store = new RoomStore(() => 777, sequence([1, -1]));

        const first = store.joinRoom('ROOM1', 'player-1');
        const second = store.joinRoom('ROOM1', 'player-2');

        expect(first.room.seed).toEqual(777);
        expect(second.room.seed).toEqual(777);
        expect(second.room.players.size).toEqual(2);
    });

    it('should update an existing player state', () => {
        const store = new RoomStore(
            () => 5,
            () => 0,
            {
                maxMovementSpeedPerSecond: 1_000_000,
                maxPositionDeltaPerTick: 1000,
                maxRotationDeltaPerTick: 10,
            }
        );
        store.joinRoom('ROOM1', 'player-1');

        const updated = store.updatePlayerState('ROOM1', 'player-1', {
            x: 10,
            y: 0,
            z: 20,
            rotationY: 1.2,
        }, 1_000);

        expect(updated).toEqual({
            id: 'player-1',
            x: 10,
            y: 0,
            z: 20,
            rotationY: 1.2,
        });
    });

    it('should remove the room when the last player leaves', () => {
        const store = new RoomStore(() => 9, () => 0);
        store.joinRoom('ROOM1', 'player-1');

        const result = store.removePlayerFromRoom('ROOM1', 'player-1');

        expect(result.removed).toEqual(true);
        expect(result.roomDeleted).toEqual(true);
        expect(store.getRoomCount()).toEqual(0);
    });

    it('should keep the room when at least one player remains', () => {
        const store = new RoomStore(() => 9, () => 0);
        store.joinRoom('ROOM1', 'player-1');
        store.joinRoom('ROOM1', 'player-2');

        const result = store.removePlayerFromRoom('ROOM1', 'player-1');

        expect(result.removed).toEqual(true);
        expect(result.roomDeleted).toEqual(false);
        expect(store.getRoomCount()).toEqual(1);
        expect(store.getRoom('ROOM1')?.players.size).toEqual(1);
    });

    it('should clamp impossible position jumps to the per-tick maximum', () => {
        const store = new RoomStore(
            () => 1,
            () => 0,
            {
                maxMovementSpeedPerSecond: 1000,
                maxPositionDeltaPerTick: 5,
                maxRotationDeltaPerTick: 2,
            }
        );
        store.joinRoom('ROOM1', 'player-1');

        const updated = store.updatePlayerState(
            'ROOM1',
            'player-1',
            {
                x: 999,
                y: 0,
                z: 0,
                rotationY: 0,
            },
            1_000
        );

        expect(updated?.x).toBeCloseTo(5, 6);
        expect(updated?.z).toBeCloseTo(0, 6);
    });

    it('should clamp impossible rotation jumps to the per-tick maximum', () => {
        const store = new RoomStore(
            () => 1,
            () => 0,
            {
                maxMovementSpeedPerSecond: 1000,
                maxPositionDeltaPerTick: 5,
                maxRotationDeltaPerTick: 0.25,
            }
        );
        store.joinRoom('ROOM1', 'player-1');

        const updated = store.updatePlayerState(
            'ROOM1',
            'player-1',
            {
                x: 0,
                y: 0,
                z: 0,
                rotationY: Math.PI,
            },
            1_000
        );

        expect(updated?.rotationY).toBeCloseTo(0.25, 6);
    });

    it('should clamp movement by speed limit using elapsed time', () => {
        const store = new RoomStore(
            () => 1,
            () => 0,
            {
                maxMovementSpeedPerSecond: 10,
                maxPositionDeltaPerTick: 100,
                maxRotationDeltaPerTick: 2,
            }
        );
        store.joinRoom('ROOM1', 'player-1');

        store.updatePlayerState(
            'ROOM1',
            'player-1',
            {
                x: 0,
                y: 0,
                z: 0,
                rotationY: 0,
            },
            1_000
        );

        const updated = store.updatePlayerState(
            'ROOM1',
            'player-1',
            {
                x: 50,
                y: 0,
                z: 0,
                rotationY: 0,
            },
            1_100
        );

        expect(updated?.x).toBeCloseTo(1, 6);
    });
});
