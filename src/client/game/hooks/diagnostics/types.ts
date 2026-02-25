import { PLAYER_COLLIDER_HALF_LENGTH_METERS } from '@/shared/physics/constants';

export type DiagFrameSample = {
    cameraJumpMeters: number;
    collisionContactToEventMs: number | null;
    collisionContactToFlipStartMs: number | null;
    collisionDriveLockRemainingMs: number | null;
    collisionEventAgeMs: number | null;
    collisionEventServerLagMs: number | null;
    collisionEventToOpponentFlipStartMs: number | null;
    collisionEventToFlipStartMs: number | null;
    collisionEventToSnapshotFlipMs: number | null;
    collisionHardSnapRemainingMs: number | null;
    contactAgeMs: number | null;
    contactOpponentId: string | null;
    contactPassThroughSuspected: boolean;
    correctionMode: string;
    correctionPositionError: number;
    fps: number;
    frameGapMs: number;
    frameDtMaxMs: number;
    longFrameCount: number;
    raceEventProcessingMs: number | null;
    nearestOpponentDistanceMeters: number | null;
    nearestOpponentRelativeZ: number | null;
    snapshotProcessingMs: number | null;
    playerX: number;
    playerZ: number;
    speedKph: number;
    tMs: number;
    visibilityState: DocumentVisibilityState;
};

export type DiagSpikeSample = {
    cameraJumpMeters: number;
    cameraMotionMeters: number;
    correctionMode: string;
    correctionPositionError: number;
    fps: number;
    playerX: number;
    playerZ: number;
    snapshotAgeMs: number | null;
    tMs: number;
};

export type DiagCaptureState = {
    correctionPositionErrorMaxMeters: number;
    drawCallsMax: number;
    drawCallsSampleCount: number;
    drawCallsSum: number;
    fpsMax: number;
    fpsMin: number;
    fpsSampleCount: number;
    fpsSum: number;
    frameSamples: DiagFrameSample[];
    framesCaptured: number;
    frameDtMaxMs: number;
    frameGapMaxMs: number;
    longFrameCount: number;
    longFrameGapCount: number;
    longTaskCount: number;
    longTaskMaxMs: number;
    passThroughSuspectedCount: number;
    sessionStartedAtMs: number;
    snapshotAgeCount: number;
    snapshotAgeMaxMs: number;
    snapshotAgeSumMs: number;
    spikeCount: number;
    spikeSamples: DiagSpikeSample[];
    speedKphMax: number;
    wallClampCount: number;
};

export type GTDebugState = {
    activeEffectIds: string[];
    connectionStatus: import('@/shared/network/types').ConnectionStatus;
    driftBoostTier: number;
    isRunning: boolean;
    localCarX: number | null;
    localCarZ: number | null;
    opponentCount: number;
    roomId: string | null;
    speedKph: number;
};

export type ContactEpisodeState = {
    active: boolean;
    hadCollisionEvent: boolean;
    initialRelativeZ: number;
    minDistanceMeters: number;
    opponentId: string | null;
    passThroughSuspected: boolean;
    startedAtMs: number;
};

export type NearestOpponent = {
    distanceMeters: number;
    id: string;
    relativeZ: number;
};

// Distances
export const CONTACT_DISTANCE_THRESHOLD_METERS = PLAYER_COLLIDER_HALF_LENGTH_METERS * 2 + 0.6;
export const PASS_THROUGH_DISTANCE_THRESHOLD_METERS = PLAYER_COLLIDER_HALF_LENGTH_METERS * 2 - 0.5;

// Frame thresholds
export const LONG_FRAME_THRESHOLD_MS = 80;
export const LONG_FRAME_GAP_THRESHOLD_MS = 50;

// Spike detection
export const SHAKE_SPIKE_CAMERA_JUMP_METERS = 1.5;
export const SHAKE_SPIKE_FPS_THRESHOLD = 45;
export const SHAKE_SPIKE_WARN_INTERVAL_MS = 1000;

// Collision windows
export const ACTIVE_COLLISION_WINDOW_MS = 3_500;

// Rolling buffer sizes
export const DIAG_MAX_FRAME_SAMPLES = 200;
export const DIAG_MAX_SPIKE_SAMPLES = 40;

// Logging
export const DIAGNOSTIC_LOG_INTERVAL_MS = 250;

export const createDiagCaptureState = (): DiagCaptureState => ({
    correctionPositionErrorMaxMeters: 0,
    drawCallsMax: 0,
    drawCallsSampleCount: 0,
    drawCallsSum: 0,
    fpsMax: 0,
    fpsMin: Number.POSITIVE_INFINITY,
    fpsSampleCount: 0,
    fpsSum: 0,
    frameSamples: [],
    framesCaptured: 0,
    frameDtMaxMs: 0,
    frameGapMaxMs: 0,
    longFrameCount: 0,
    longFrameGapCount: 0,
    longTaskCount: 0,
    longTaskMaxMs: 0,
    passThroughSuspectedCount: 0,
    sessionStartedAtMs: Date.now(),
    snapshotAgeCount: 0,
    snapshotAgeMaxMs: 0,
    snapshotAgeSumMs: 0,
    spikeCount: 0,
    spikeSamples: [],
    speedKphMax: 0,
    wallClampCount: 0,
});

export const createContactEpisodeState = (): ContactEpisodeState => ({
    active: false,
    hadCollisionEvent: false,
    initialRelativeZ: 0,
    minDistanceMeters: Number.POSITIVE_INFINITY,
    opponentId: null,
    passThroughSuspected: false,
    startedAtMs: 0,
});
