import { clientConfig } from './config';

export type DiagnosticsVerbosity = 'standard' | 'verbose';

export type GTDiagControls = {
    clearReport: () => void;
    disable: () => void;
    downloadReport: () => void;
    enable: () => void;
    setVerbose: (verbose: boolean) => void;
};

export type LobbyMode = 'create' | 'join';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
const LOBBY_MODE_KEY = 'gt-lobby-mode';

export const isEnabledFromFlag = (value: string | null) => value === '1' || value === 'true';

export const readStoredBooleanFlag = (key: string) => {
    if (typeof window === 'undefined') {
        return false;
    }
    return isEnabledFromFlag(window.localStorage.getItem(key));
};

export const readDiagnosticsEnabledDefault = () => {
    if (typeof window === 'undefined') {
        return false;
    }
    const queryFlag = new URLSearchParams(window.location.search).get('diag');
    if (isEnabledFromFlag(queryFlag)) {
        return true;
    }
    return readStoredBooleanFlag('gt-diag');
};

export const readDiagnosticsVerboseDefault = () => {
    if (typeof window === 'undefined') {
        return false;
    }
    const queryFlag = new URLSearchParams(window.location.search).get('diagVerbose');
    if (isEnabledFromFlag(queryFlag)) {
        return true;
    }
    return readStoredBooleanFlag('gt-diag-verbose');
};

export const getDiagControls = (): GTDiagControls | null => {
    if (typeof window === 'undefined') {
        return null;
    }
    const debugWindow = window as Window & { __GT_DIAG__?: GTDiagControls };
    return debugWindow.__GT_DIAG__ ?? null;
};

export const formatRaceDurationMs = (durationMs: number) => {
    const clamped = Math.max(0, Math.floor(durationMs));
    const totalSeconds = Math.floor(clamped / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((clamped % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds
        .toString()
        .padStart(2, '0')}`;
};

const isPrivateLanIpv4 = (value: string) => {
    if (value.startsWith('10.')) {
        return true;
    }
    if (value.startsWith('192.168.')) {
        return true;
    }
    const octets = value.split('.');
    if (octets.length !== 4) {
        return false;
    }
    const first = Number(octets[0]);
    const second = Number(octets[1]);
    return first === 172 && Number.isFinite(second) && second >= 16 && second <= 31;
};

const resolveShareOrigin = async () => {
    if (typeof window === 'undefined') {
        return '';
    }
    const locationUrl = new URL(window.location.href);
    if (!LOCAL_HOSTNAMES.has(locationUrl.hostname)) {
        return locationUrl.origin;
    }
    try {
        const response = await fetch(`${clientConfig.serverUrl}/network-info`);
        if (!response.ok) {
            return locationUrl.origin;
        }
        const payload = (await response.json()) as { lanIpv4?: unknown };
        const lanIpv4 = Array.isArray(payload.lanIpv4)
            ? payload.lanIpv4.filter((ip): ip is string => typeof ip === 'string')
            : [];
        const preferredIp = lanIpv4.find((ip) => isPrivateLanIpv4(ip)) ?? lanIpv4[0];
        if (!preferredIp) {
            return locationUrl.origin;
        }
        const portSuffix = locationUrl.port.length > 0 ? `:${locationUrl.port}` : '';
        return `${locationUrl.protocol}//${preferredIp}${portSuffix}`;
    } catch {
        return locationUrl.origin;
    }
};

export const buildShareRaceUrl = async (roomId: string) => {
    if (typeof window === 'undefined' || roomId.trim().length === 0) {
        return '';
    }
    const origin = await resolveShareOrigin();
    if (!origin) {
        return '';
    }
    const url = new URL(`${origin}/lobby`);
    url.searchParams.set('room', roomId);
    return url.toString();
};

export const readLobbyMode = (): LobbyMode => {
    if (typeof window === 'undefined') {
        return 'join';
    }
    const value = window.sessionStorage.getItem(LOBBY_MODE_KEY);
    return value === 'create' ? 'create' : 'join';
};

export const writeLobbyMode = (mode: LobbyMode) => {
    if (typeof window === 'undefined') {
        return;
    }
    window.sessionStorage.setItem(LOBBY_MODE_KEY, mode);
};

export const sanitizePlayerName = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return 'PLAYER';
    }
    return trimmed.slice(0, 24).toUpperCase();
};

export const sanitizeRoomId = (value: string) =>
    value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .slice(0, 16);

export const generateRoomId = () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let roomId = '';
    for (let index = 0; index < 6; index += 1) {
        roomId += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return roomId;
};
