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

export type StatusEffectType = 'slowed' | 'stunned' | 'flat_tire' | 'boosted' | 'flipped' | 'speed_burst';

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

export type SnapshotPowerupState = {
    id: string;
    isActive: boolean;
    powerupId: string;
    x: number;
    z: number;
};

export type SnapshotHazardState = {
    hazardId: string;
    id: string;
    x: number;
    z: number;
};

export type ServerSnapshotPayload = {
    hazards: SnapshotHazardState[];
    players: SnapshotPlayerState[];
    powerups: SnapshotPowerupState[];
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
    return value === 'slowed' || value === 'stunned' || value === 'flat_tire' || value === 'boosted' || value === 'flipped' || value === 'speed_burst';
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

const isSnapshotPowerupState = (value: unknown): value is SnapshotPowerupState => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    return isString(p.id) && isString(p.powerupId) && typeof p.isActive === 'boolean' && isFiniteNumber(p.x) && isFiniteNumber(p.z);
};

const isSnapshotHazardState = (value: unknown): value is SnapshotHazardState => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    return isString(p.id) && isString(p.hazardId) && isFiniteNumber(p.x) && isFiniteNumber(p.z);
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
        Array.isArray(payload.powerups) &&
        Array.isArray(payload.hazards) &&
        payload.players.every((player) => isSnapshotPlayerState(player)) &&
        payload.powerups.every((p) => isSnapshotPowerupState(p)) &&
        payload.hazards.every((h) => isSnapshotHazardState(h))
    );
};

export const serializeSnapshot = (snapshot: ServerSnapshotPayload & { projectiles?: any[], deployables?: any[] }): any[] => {
    return [
        snapshot.seq,
        snapshot.serverTimeMs,
        snapshot.roomId,
        [
            snapshot.raceState.status,
            snapshot.raceState.trackId,
            snapshot.raceState.totalLaps,
            snapshot.raceState.startedAtMs,
            snapshot.raceState.endedAtMs,
            snapshot.raceState.winnerPlayerId,
            snapshot.raceState.playerOrder,
        ],
        snapshot.players.map(p => [
            p.id, p.name, p.vehicleId, p.colorId, p.x, p.y, p.z, p.rotationY, p.speed, p.lastProcessedInputSeq,
            [p.progress.checkpointIndex, p.progress.completedCheckpoints.map(c => [c.checkpointIndex, c.completedAtMs]), p.progress.distanceMeters, p.progress.finishedAtMs, p.progress.lap],
            p.activeEffects.map(e => [e.effectType, e.appliedAtMs, e.expiresAtMs, e.intensity])
        ]),
        snapshot.powerups.map(p => [p.id, p.powerupId, p.isActive, p.x, p.z]),
        snapshot.hazards.map(h => [h.id, h.hazardId, h.x, h.z]),
        snapshot.projectiles?.map(pr => [pr.id, pr.ownerId, pr.targetId, pr.x, pr.z, pr.velX, pr.velZ, pr.ttlTicks]) ?? [],
        snapshot.deployables?.map(d => [d.id, d.kind, d.ownerId, d.x, d.z, d.radius, d.lifetimeTicks]) ?? []
    ];
};
