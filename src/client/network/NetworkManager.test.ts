import { describe, expect, it } from 'bun:test';
import { buildSequencedInputFrame, shouldEmitByInterval } from '@/client/network/NetworkManager';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';

describe('NetworkManager helpers', () => {
    it('should throttle emits based on interval', () => {
        expect(shouldEmitByInterval(1_000, 990, 20)).toEqual(false);
        expect(shouldEmitByInterval(1_000, 970, 20)).toEqual(true);
    });

    it('should create a sequenced input frame with defaults', () => {
        const frame = buildSequencedInputFrame(
            {
                ackSnapshotSeq: null,
                controls: {
                    boost: false,
                    brake: false,
                    handbrake: false,
                    steering: 2,
                    throttle: 2,
                },
                cruiseControlEnabled: true,
                precisionOverrideActive: false,
                seq: 9,
                timestampMs: 10,
            },
            'ROOM1',
            PROTOCOL_V2
        );

        expect(frame.roomId).toEqual('ROOM1');
        expect(frame.protocolVersion).toEqual(PROTOCOL_V2);
        expect(frame.controls.steering).toEqual(1);
        expect(frame.controls.throttle).toEqual(1);
    });

    it('should preserve ack snapshot sequences in input frames', () => {
        const frame = buildSequencedInputFrame(
            {
                ackSnapshotSeq: 33,
                controls: {
                    boost: false,
                    brake: false,
                    handbrake: false,
                    steering: 0,
                    throttle: 0,
                },
                cruiseControlEnabled: true,
                precisionOverrideActive: false,
                seq: 11,
                timestampMs: 999,
            },
            'ROOM1',
            PROTOCOL_V2
        );

        expect(frame.ackSnapshotSeq).toEqual(33);
    });
});
