import { describe, expect, it } from 'bun:test';
import {
    isClientInputFrame,
    isInputFramePayload,
    sanitizeClientInputFrame,
} from '@/shared/network/inputFrame';
import { coerceProtocolVersion, PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import { isServerSnapshotPayload } from '@/shared/network/snapshot';

describe('network v2 validators', () => {
    it('should sanitize and clamp input frame controls', () => {
        const frame = sanitizeClientInputFrame({
            ackSnapshotSeq: null,
            controls: {
                boost: false,
                brake: false,
                handbrake: false,
                steering: 99,
                throttle: -99,
            },
            cruiseControlEnabled: true,
            precisionOverrideActive: false,
            roomId: 'ROOM1',
            seq: 12.9,
            timestampMs: 100.7,
        });

        expect(frame.seq).toEqual(12);
        expect(frame.timestampMs).toEqual(100);
        expect(frame.controls.steering).toEqual(1);
        expect(frame.controls.throttle).toEqual(-1);
    });

    it('should validate input frame payload shape', () => {
        const valid = {
            roomId: 'ROOM1',
            frame: {
                ackSnapshotSeq: 4,
                controls: {
                    boost: false,
                    brake: false,
                    handbrake: false,
                    steering: 0.4,
                    throttle: 1,
                },
                cruiseControlEnabled: true,
                precisionOverrideActive: false,
                protocolVersion: PROTOCOL_V2,
                roomId: 'ROOM1',
                seq: 10,
                timestampMs: Date.now(),
            },
        };

        const invalid = {
            roomId: 'ROOM1',
            frame: {
                ...valid.frame,
                controls: {
                    ...valid.frame.controls,
                    steering: 'left',
                },
            },
        };

        expect(isInputFramePayload(valid)).toEqual(true);
        expect(isInputFramePayload(invalid)).toEqual(false);
    });

    it('should validate server snapshot payload shape', () => {
        const payload = {
            hazards: [],
            players: [
                {
                    activeEffects: [],
                    colorId: 'default-red',
                    id: 'player-1',
                    lastProcessedInputSeq: 6,
                    name: 'Alice',
                    progress: {
                        checkpointIndex: 1,
                        completedCheckpoints: [
                            { checkpointIndex: 0, completedAtMs: 1_000 },
                        ],
                        distanceMeters: 42,
                        finishedAtMs: null,
                        lap: 0,
                    },
                    rotationY: 0.1,
                    speed: 8,
                    vehicleId: 'sport',
                    x: 1,
                    y: 0,
                    z: 2,
                },
            ],
            powerups: [],
            raceState: {
                endedAtMs: null,
                playerOrder: ['player-1'],
                startedAtMs: 1_000,
                status: 'running',
                totalLaps: 3,
                trackId: 'sunset-loop',
                winnerPlayerId: null,
            },
            roomId: 'ROOM1',
            seq: 2,
            serverTimeMs: 1_050,
        };

        expect(isServerSnapshotPayload(payload)).toEqual(true);
        expect(
            isServerSnapshotPayload({
                ...payload,
                raceState: {
                    ...payload.raceState,
                    status: 'paused',
                },
            })
        ).toEqual(false);
    });

    it('should coerce unsupported protocol versions to latest', () => {
        expect(coerceProtocolVersion(PROTOCOL_V2)).toEqual(PROTOCOL_V2);
        expect(coerceProtocolVersion('3')).toEqual(PROTOCOL_V2);
    });

    it('should reject invalid client input frames', () => {
        expect(
            isClientInputFrame({
                ackSnapshotSeq: null,
                controls: {
                    boost: true,
                    brake: false,
                    handbrake: false,
                    steering: 0,
                    throttle: 1,
                },
                cruiseControlEnabled: true,
                precisionOverrideActive: false,
                protocolVersion: PROTOCOL_V2,
                roomId: 'ROOM1',
                seq: 1,
                timestampMs: Date.now(),
            })
        ).toEqual(true);

        expect(
            isClientInputFrame({
                ackSnapshotSeq: null,
                controls: {
                    boost: true,
                    brake: false,
                    handbrake: false,
                    steering: 0,
                    throttle: 1,
                },
                cruiseControlEnabled: true,
                precisionOverrideActive: false,
                protocolVersion: '9',
                roomId: 'ROOM1',
                seq: 1,
                timestampMs: Date.now(),
            })
        ).toEqual(false);
    });
});
