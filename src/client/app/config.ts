type ClientRuntimeConfig = {
    serverUrl: string;
    outboundTickRateHz: number;
};

const DEFAULT_SERVER_PORT = '3001';
const MAX_OUTBOUND_TICK_RATE_HZ = 20;

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(value, max));
};

const parseTickRate = () => {
    const rawTickRate = import.meta.env.VITE_NETWORK_TICK_RATE_HZ;
    if (!rawTickRate) {
        return MAX_OUTBOUND_TICK_RATE_HZ;
    }

    const parsed = Number(rawTickRate);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return MAX_OUTBOUND_TICK_RATE_HZ;
    }

    return clamp(parsed, 1, MAX_OUTBOUND_TICK_RATE_HZ);
};

const resolveServerUrl = () => {
    const configured = import.meta.env.VITE_SERVER_URL?.trim();
    if (configured) {
        return configured.replace(/\/+$/, '');
    }

    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_SERVER_PORT}`;
};

export const clientConfig: ClientRuntimeConfig = {
    outboundTickRateHz: parseTickRate(),
    serverUrl: resolveServerUrl(),
};
