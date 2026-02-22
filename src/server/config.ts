type NodeEnvironment = 'development' | 'test' | 'production';

type ServerRuntimeConfig = {
    nodeEnv: NodeEnvironment;
    port: number;
    allowedOrigins: string[];
    maxJoinRoomPayloadBytes: number;
    maxUpdateStatePayloadBytes: number;
    maxInboundTickRateHz: number;
    maxPositionDeltaPerTick: number;
    maxRotationDeltaPerTick: number;
    maxMovementSpeedPerSecond: number;
};

const parseNumber = (value: string | undefined, fallback: number) => {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toNodeEnvironment = (value: string | undefined): NodeEnvironment => {
    if (value === 'production' || value === 'test') {
        return value;
    }

    return 'development';
};

const parseAllowedOrigins = (value: string | undefined) => {
    if (!value) return [];
    return value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
};

export const serverConfig: ServerRuntimeConfig = {
    allowedOrigins: parseAllowedOrigins(Bun.env.ALLOWED_ORIGINS),
    maxInboundTickRateHz: parseNumber(Bun.env.MAX_INBOUND_TICK_RATE_HZ, 30),
    maxJoinRoomPayloadBytes: parseNumber(Bun.env.MAX_JOIN_ROOM_PAYLOAD_BYTES, 128),
    maxMovementSpeedPerSecond: parseNumber(Bun.env.MAX_MOVEMENT_SPEED_PER_SECOND, 55),
    maxPositionDeltaPerTick: parseNumber(Bun.env.MAX_POSITION_DELTA_PER_TICK, 4.5),
    maxRotationDeltaPerTick: parseNumber(Bun.env.MAX_ROTATION_DELTA_PER_TICK, 0.9),
    maxUpdateStatePayloadBytes: parseNumber(Bun.env.MAX_UPDATE_STATE_PAYLOAD_BYTES, 256),
    nodeEnv: toNodeEnvironment(Bun.env.NODE_ENV),
    port: parseNumber(Bun.env.SERVER_PORT, 3001),
};

export const isAllowedOrigin = (origin: string | undefined) => {
    if (!origin) return true;

    if (serverConfig.allowedOrigins.length > 0) {
        return serverConfig.allowedOrigins.includes(origin);
    }

    return serverConfig.nodeEnv !== 'production';
};
