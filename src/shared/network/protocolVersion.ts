export const PROTOCOL_V1 = '1' as const;
export const PROTOCOL_V2 = '2' as const;
export const LATEST_PROTOCOL_VERSION = PROTOCOL_V2;

export type ProtocolVersion = typeof PROTOCOL_V1 | typeof PROTOCOL_V2;

export const isProtocolVersion = (value: unknown): value is ProtocolVersion => {
    return value === PROTOCOL_V1 || value === PROTOCOL_V2;
};

export const coerceProtocolVersion = (value: unknown): ProtocolVersion => {
    return isProtocolVersion(value) ? value : LATEST_PROTOCOL_VERSION;
};
