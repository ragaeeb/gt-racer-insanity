export type RaceStatus = 'countdown' | 'running' | 'finished';

export type CheckpointState = {
    checkpointIndex: number;
    completedAtMs: number;
};

export type PlayerRaceProgress = {
    checkpointIndex: number;
    completedCheckpoints: CheckpointState[];
    distanceMeters: number;
    finishedAtMs: number | null;
    lap: number;
};

export type StatusEffectType = 'slowed' | 'stunned' | 'flat_tire' | 'boosted';

export type StatusEffectInstance = {
    appliedAtMs: number;
    effectType: StatusEffectType;
    expiresAtMs: number;
    intensity: number;
};

export type SnapshotPlayerState = {
    activeEffects: StatusEffectInstance[];
    colorId: string;
    id: string;
    lastProcessedInputSeq: number;
    name: string;
    progress: PlayerRaceProgress;
    rotationY: number;
    speed: number;
    vehicleId: string;
    x: number;
    y: number;
    z: number;
};

export type RaceState = {
    endedAtMs: number | null;
    playerOrder: string[];
    startedAtMs: number;
    status: RaceStatus;
    totalLaps: number;
    trackId: string;
    winnerPlayerId: string | null;
};

export type ServerSnapshotPayload = {
    players: SnapshotPlayerState[];
    raceState: RaceState;
    roomId: string;
    seq: number;
    serverTimeMs: number;
};

const isFiniteNumber = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value);
};

const isString = (value: unknown): value is string => {
    return typeof value === 'string';
};

const isRaceStatus = (value: unknown): value is RaceStatus => {
    return value === 'countdown' || value === 'running' || value === 'finished';
};

const isStatusEffectType = (value: unknown): value is StatusEffectType => {
    return value === 'slowed' || value === 'stunned' || value === 'flat_tire' || value === 'boosted';
};

export const isStatusEffectInstance = (value: unknown): value is StatusEffectInstance => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;

    return (
        isStatusEffectType(payload.effectType) &&
        isFiniteNumber(payload.intensity) &&
        isFiniteNumber(payload.appliedAtMs) &&
        isFiniteNumber(payload.expiresAtMs)
    );
};

export const isPlayerRaceProgress = (value: unknown): value is PlayerRaceProgress => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;
    if (!Array.isArray(payload.completedCheckpoints)) return false;

    return (
        isFiniteNumber(payload.lap) &&
        isFiniteNumber(payload.checkpointIndex) &&
        isFiniteNumber(payload.distanceMeters) &&
        (payload.finishedAtMs === null || isFiniteNumber(payload.finishedAtMs)) &&
        payload.completedCheckpoints.every((checkpoint) => {
            if (!checkpoint || typeof checkpoint !== 'object') return false;
            const checkpointRecord = checkpoint as Record<string, unknown>;
            return (
                isFiniteNumber(checkpointRecord.checkpointIndex) &&
                isFiniteNumber(checkpointRecord.completedAtMs)
            );
        })
    );
};

export const isSnapshotPlayerState = (value: unknown): value is SnapshotPlayerState => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;
    if (!Array.isArray(payload.activeEffects)) return false;

    return (
        isString(payload.id) &&
        isString(payload.name) &&
        isString(payload.vehicleId) &&
        isString(payload.colorId) &&
        isFiniteNumber(payload.x) &&
        isFiniteNumber(payload.y) &&
        isFiniteNumber(payload.z) &&
        isFiniteNumber(payload.rotationY) &&
        isFiniteNumber(payload.speed) &&
        isFiniteNumber(payload.lastProcessedInputSeq) &&
        isPlayerRaceProgress(payload.progress) &&
        payload.activeEffects.every((effect) => isStatusEffectInstance(effect))
    );
};

export const isRaceState = (value: unknown): value is RaceState => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;
    if (!Array.isArray(payload.playerOrder)) return false;

    return (
        isString(payload.trackId) &&
        isFiniteNumber(payload.totalLaps) &&
        isRaceStatus(payload.status) &&
        isFiniteNumber(payload.startedAtMs) &&
        (payload.endedAtMs === null || isFiniteNumber(payload.endedAtMs)) &&
        (payload.winnerPlayerId === null || isString(payload.winnerPlayerId)) &&
        payload.playerOrder.every((playerId) => isString(playerId))
    );
};

export const isServerSnapshotPayload = (value: unknown): value is ServerSnapshotPayload => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;
    if (!Array.isArray(payload.players)) return false;

    return (
        isString(payload.roomId) &&
        isFiniteNumber(payload.seq) &&
        isFiniteNumber(payload.serverTimeMs) &&
        isRaceState(payload.raceState) &&
        payload.players.every((player) => isSnapshotPlayerState(player))
    );
};
