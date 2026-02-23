type ClientRuntimeConfig = {
    inputFrameRateHz: number;
    interpolationDelayMs: number;
    reconciliationPositionThreshold: number;
    reconciliationYawThresholdRadians: number;
    serverUrl: string;
};

const DEFAULT_SERVER_PORT = '3001';
const MAX_INPUT_FRAME_RATE_HZ = 30;

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(value, max));
};

const resolveServerUrl = () => {
    const configured = import.meta.env.VITE_SERVER_URL?.trim();
    if (configured) {
        return configured.replace(/\/+$/, '');
    }

    if (typeof window === 'undefined') {
        return `http://127.0.0.1:${DEFAULT_SERVER_PORT}`;
    }

    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_SERVER_PORT}`;
};

const parseInputFrameRate = () => {
    const raw = import.meta.env.VITE_INPUT_FRAME_RATE_HZ;
    if (!raw) {
        return MAX_INPUT_FRAME_RATE_HZ;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return MAX_INPUT_FRAME_RATE_HZ;
    }

    return clamp(parsed, 1, MAX_INPUT_FRAME_RATE_HZ);
};

const parseInterpolationDelayMs = () => {
    const parsed = Number(import.meta.env.VITE_INTERPOLATION_DELAY_MS);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 100;
    }
    return Math.floor(parsed);
};

const parsePositionThreshold = () => {
    const parsed = Number(import.meta.env.VITE_RECONCILE_POSITION_THRESHOLD);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 1.5;
    }
    return parsed;
};

const parseYawThreshold = () => {
    const parsed = Number(import.meta.env.VITE_RECONCILE_YAW_THRESHOLD);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return (4 * Math.PI) / 180;
    }
    return parsed;
};

export const clientConfig: ClientRuntimeConfig = {
    inputFrameRateHz: parseInputFrameRate(),
    interpolationDelayMs: parseInterpolationDelayMs(),
    reconciliationPositionThreshold: parsePositionThreshold(),
    reconciliationYawThresholdRadians: parseYawThreshold(),
    serverUrl: resolveServerUrl(),
};
