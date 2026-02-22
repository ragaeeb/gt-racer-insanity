import type { ProtocolVersion } from '@/shared/network/protocolVersion';
import { LATEST_PROTOCOL_VERSION, isProtocolVersion } from '@/shared/network/protocolVersion';

export type InputFrameControlState = {
    throttle: number;
    steering: number;
    brake: boolean;
    boost: boolean;
    handbrake: boolean;
};

export type ClientInputFrame = {
    ackSnapshotSeq: number | null;
    controls: InputFrameControlState;
    cruiseControlEnabled: boolean;
    precisionOverrideActive: boolean;
    protocolVersion: ProtocolVersion;
    roomId: string;
    seq: number;
    timestampMs: number;
};

export type InputFramePayload = {
    frame: ClientInputFrame;
    roomId: string;
};

const isFiniteNumber = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value);
};

const isBoolean = (value: unknown): value is boolean => {
    return typeof value === 'boolean';
};

const isString = (value: unknown): value is string => {
    return typeof value === 'string';
};

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(value, max));
};

export const clampInputFrameControlState = (
    controls: InputFrameControlState
): InputFrameControlState => {
    return {
        boost: controls.boost,
        brake: controls.brake,
        handbrake: controls.handbrake,
        steering: clamp(controls.steering, -1, 1),
        throttle: clamp(controls.throttle, -1, 1),
    };
};

export const isInputFrameControlState = (value: unknown): value is InputFrameControlState => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;

    return (
        isFiniteNumber(payload.throttle) &&
        isFiniteNumber(payload.steering) &&
        isBoolean(payload.brake) &&
        isBoolean(payload.boost) &&
        isBoolean(payload.handbrake)
    );
};

export const isClientInputFrame = (value: unknown): value is ClientInputFrame => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;

    const ackSnapshotSeq = payload.ackSnapshotSeq;
    const hasValidAck = ackSnapshotSeq === null || isFiniteNumber(ackSnapshotSeq);

    return (
        isFiniteNumber(payload.seq) &&
        isFiniteNumber(payload.timestampMs) &&
        isString(payload.roomId) &&
        isProtocolVersion(payload.protocolVersion) &&
        isBoolean(payload.cruiseControlEnabled) &&
        isBoolean(payload.precisionOverrideActive) &&
        isInputFrameControlState(payload.controls) &&
        hasValidAck
    );
};

export const sanitizeClientInputFrame = (
    frame: Omit<ClientInputFrame, 'controls' | 'protocolVersion'> & {
        controls: Partial<InputFrameControlState>;
        protocolVersion?: ProtocolVersion;
    }
): ClientInputFrame => {
    const controls: InputFrameControlState = {
        boost: Boolean(frame.controls.boost),
        brake: Boolean(frame.controls.brake),
        handbrake: Boolean(frame.controls.handbrake),
        steering: Number(frame.controls.steering ?? 0),
        throttle: Number(frame.controls.throttle ?? 0),
    };

    return {
        ackSnapshotSeq: frame.ackSnapshotSeq ?? null,
        controls: clampInputFrameControlState(controls),
        cruiseControlEnabled: Boolean(frame.cruiseControlEnabled),
        precisionOverrideActive: Boolean(frame.precisionOverrideActive),
        protocolVersion: frame.protocolVersion ?? LATEST_PROTOCOL_VERSION,
        roomId: frame.roomId,
        seq: Math.max(0, Math.floor(frame.seq)),
        timestampMs: Math.max(0, Math.floor(frame.timestampMs)),
    };
};

export const isInputFramePayload = (value: unknown): value is InputFramePayload => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;

    return isString(payload.roomId) && isClientInputFrame(payload.frame);
};
