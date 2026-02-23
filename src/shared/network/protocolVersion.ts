export const PROTOCOL_V2 = '2' as const;
export const LATEST_PROTOCOL_VERSION = PROTOCOL_V2;

export type ProtocolVersion = typeof PROTOCOL_V2;

export const isProtocolVersion = (value: unknown): value is ProtocolVersion => {
    return value === PROTOCOL_V2;
};

// Intentionally kept as a coercion hook for future protocol versions; runtime is currently V2-only.
export const coerceProtocolVersion = (value: unknown): ProtocolVersion => {
    if (isProtocolVersion(value)) {
        return value;
    }

    return LATEST_PROTOCOL_VERSION;
};
