import { describe, expect, it } from 'bun:test';
import { InputQueue } from '@/server/sim/inputQueue';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';

describe('InputQueue', () => {
    it('should consume the latest frame after the processed sequence', () => {
        const queue = new InputQueue();
        queue.enqueue('player-1', {
            ackSnapshotSeq: null,
            controls: {
                boost: false,
                brake: false,
                handbrake: false,
                steering: 0.1,
                throttle: 0.4,
            },
            cruiseControlEnabled: true,
            precisionOverrideActive: false,
            protocolVersion: PROTOCOL_V2,
            roomId: 'ROOM1',
            seq: 1,
            timestampMs: 1_000,
        });
        queue.enqueue('player-1', {
            ackSnapshotSeq: null,
            controls: {
                boost: true,
                brake: false,
                handbrake: false,
                steering: 0.4,
                throttle: 1,
            },
            cruiseControlEnabled: true,
            precisionOverrideActive: false,
            protocolVersion: PROTOCOL_V2,
            roomId: 'ROOM1',
            seq: 2,
            timestampMs: 1_010,
        });

        const frame = queue.consumeLatestAfter('player-1', 0);
        expect(frame?.seq).toEqual(2);
        expect(queue.getDepth('player-1')).toEqual(0);
    });

    it('should cap queue size for each player', () => {
        const queue = new InputQueue({ maxFramesPerPlayer: 2 });
        queue.enqueue('player-1', {
            ackSnapshotSeq: null,
            controls: {
                boost: false,
                brake: false,
                handbrake: false,
                steering: 0,
                throttle: 0,
            },
            cruiseControlEnabled: false,
            precisionOverrideActive: false,
            protocolVersion: PROTOCOL_V2,
            roomId: 'ROOM1',
            seq: 1,
            timestampMs: 1,
        });
        queue.enqueue('player-1', {
            ackSnapshotSeq: null,
            controls: {
                boost: false,
                brake: false,
                handbrake: false,
                steering: 0,
                throttle: 0,
            },
            cruiseControlEnabled: false,
            precisionOverrideActive: false,
            protocolVersion: PROTOCOL_V2,
            roomId: 'ROOM1',
            seq: 2,
            timestampMs: 2,
        });
        queue.enqueue('player-1', {
            ackSnapshotSeq: null,
            controls: {
                boost: false,
                brake: false,
                handbrake: false,
                steering: 0,
                throttle: 0,
            },
            cruiseControlEnabled: false,
            precisionOverrideActive: false,
            protocolVersion: PROTOCOL_V2,
            roomId: 'ROOM1',
            seq: 3,
            timestampMs: 3,
        });

        expect(queue.getDepth('player-1')).toEqual(2);
        expect(queue.consumeLatestAfter('player-1', 0)?.seq).toEqual(3);
    });
});
