type ClientRuntimeConfig = {
    gameMode: GameMode;
    inputFrameRateHz: number;
    interpolationDelayMs: number;
    reconciliationPositionThreshold: number;
    reconciliationYawThresholdRadians: number;
    serverUrl: string;
};

export type GameMode = 'multiplayer' | 'singleplayer';

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

export const coerceGameMode = (value: string | undefined | null): GameMode | null => {
    if (!value) {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'singleplayer') {
        return 'singleplayer';
    }
    if (normalized === 'multiplayer') {
        return 'multiplayer';
    }
    return null;
};

export const resolveGameMode = (envValue?: string, querySearch?: string): GameMode => {
    const queryMode = querySearch
        ? coerceGameMode(new URLSearchParams(querySearch).get('gameMode'))
        : null;
    if (queryMode) {
        return queryMode;
    }

    const envMode = coerceGameMode(envValue);
    if (envMode) {
        return envMode;
    }

    return 'multiplayer';
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
        // Tuned up from 0.35 to work with per-frame soft-correction pass in correctionSystem.ts.
        // Lower values cause over-frequent corrections at normal driving speeds.
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
    gameMode:
        typeof window === 'undefined'
            ? resolveGameMode(import.meta.env.VITE_GAME_MODE)
            : resolveGameMode(import.meta.env.VITE_GAME_MODE, window.location.search),
    inputFrameRateHz: parseInputFrameRate(),
    interpolationDelayMs: parseInterpolationDelayMs(),
    reconciliationPositionThreshold: parsePositionThreshold(),
    reconciliationYawThresholdRadians: parseYawThreshold(),
    serverUrl: resolveServerUrl(),
};
