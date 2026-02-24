import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraFrameMetrics } from '@/client/game/hooks/useCameraFollow';
import type { RaceSession } from '@/client/game/hooks/types';
import { useHudStore } from '@/client/game/state/hudStore';
import { PLAYER_COLLIDER_HALF_LENGTH_METERS } from '@/shared/physics/constants';
import type { ConnectionStatus } from '@/shared/network/types';

type DiagFrameSample = {
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

type DiagSpikeSample = {
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

type DiagCaptureState = {
    correctionPositionErrorMaxMeters: number;
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

type GTDebugState = {
    connectionStatus: ConnectionStatus;
    isRunning: boolean;
    localCarX: number | null;
    localCarZ: number | null;
    opponentCount: number;
    roomId: string | null;
    speedKph: number;
};

type ContactEpisodeState = {
    active: boolean;
    hadCollisionEvent: boolean;
    initialRelativeZ: number;
    minDistanceMeters: number;
    opponentId: string | null;
    passThroughSuspected: boolean;
    startedAtMs: number;
};

const DIAGNOSTIC_LOG_INTERVAL_MS = 250;
const DIAG_MAX_FRAME_SAMPLES = 200;
const DIAG_MAX_SPIKE_SAMPLES = 40;
const CONTACT_DISTANCE_THRESHOLD_METERS = PLAYER_COLLIDER_HALF_LENGTH_METERS * 2 + 0.6;
const PASS_THROUGH_DISTANCE_THRESHOLD_METERS = PLAYER_COLLIDER_HALF_LENGTH_METERS * 2 - 0.5;
const LONG_FRAME_THRESHOLD_MS = 80;
const LONG_FRAME_GAP_THRESHOLD_MS = 50;
const SHAKE_SPIKE_CAMERA_JUMP_METERS = 1.5;
const SHAKE_SPIKE_FPS_THRESHOLD = 45;
const SHAKE_SPIKE_WARN_INTERVAL_MS = 1000;

const createDiagCaptureState = (): DiagCaptureState => ({
    correctionPositionErrorMaxMeters: 0,
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

const parseDiagnosticsFlag = () => {
    if (typeof window === 'undefined') return false;
    const searchParams = new URLSearchParams(window.location.search);
    const queryFlag = searchParams.get('diag');
    if (queryFlag === '1' || queryFlag === 'true') return true;
    const localStorageFlag = window.localStorage.getItem('gt-diag');
    return localStorageFlag === '1' || localStorageFlag === 'true';
};

const parseDiagnosticsVerboseFlag = () => {
    if (typeof window === 'undefined') return false;
    const searchParams = new URLSearchParams(window.location.search);
    const queryFlag = searchParams.get('diagVerbose');
    if (queryFlag === '1' || queryFlag === 'true') return true;
    const localStorageFlag = window.localStorage.getItem('gt-diag-verbose');
    return localStorageFlag === '1' || localStorageFlag === 'true';
};

const downloadReport = (capture: DiagCaptureState) => {
    const nowMs = Date.now();
    const durationMs = Math.max(1, nowMs - capture.sessionStartedAtMs);
    const averageFps = capture.fpsSampleCount > 0 ? capture.fpsSum / capture.fpsSampleCount : 0;
    const snapshotAgeAverageMs =
        capture.snapshotAgeCount > 0 ? capture.snapshotAgeSumMs / capture.snapshotAgeCount : 0;
    const fpsMin = capture.fpsSampleCount > 0 ? capture.fpsMin : 0;
    const header = [
        '# GT Racer Diagnostic Report',
        `generatedAt: ${new Date(nowMs).toISOString()}`,
        `sessionDurationMs: ${durationMs}`,
        `framesCaptured: ${capture.framesCaptured}`,
        `spikeCount: ${capture.spikeCount}`,
        `fpsAvg: ${averageFps.toFixed(2)}`,
        `fpsMin: ${fpsMin.toFixed(2)}`,
        `fpsMax: ${capture.fpsMax.toFixed(2)}`,
        `maxSpeedKph: ${capture.speedKphMax.toFixed(2)}`,
        `maxCorrectionErrorMeters: ${capture.correctionPositionErrorMaxMeters.toFixed(4)}`,
        `snapshotAgeAvgMs: ${snapshotAgeAverageMs.toFixed(2)}`,
        `snapshotAgeMaxMs: ${capture.snapshotAgeMaxMs.toFixed(2)}`,
        `maxFrameDtMs: ${capture.frameDtMaxMs.toFixed(2)}`,
        `longFrameCount: ${capture.longFrameCount}`,
        `maxFrameGapMs: ${capture.frameGapMaxMs.toFixed(2)}`,
        `longFrameGapCount: ${capture.longFrameGapCount}`,
        `longTaskCount: ${capture.longTaskCount}`,
        `longTaskMaxMs: ${capture.longTaskMaxMs.toFixed(2)}`,
        `passThroughSuspectedCount: ${capture.passThroughSuspectedCount}`,
        `wallClampCount: ${capture.wallClampCount}`,
        '',
        '## Recent Spikes',
    ];
    const spikeLines = capture.spikeSamples.map((sample) => JSON.stringify(sample));
    const frameLines = capture.frameSamples.map((sample) => JSON.stringify(sample));
    const reportText = [
        ...header,
        ...(spikeLines.length > 0 ? spikeLines : ['(none)']),
        '',
        '## Rolling Frame Samples',
        ...(frameLines.length > 0 ? frameLines : ['(none)']),
        '',
    ].join('\n');
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gt-diag-${new Date(nowMs).toISOString().replace(/[:.]/g, '-')}.log`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

const createContactEpisodeState = (): ContactEpisodeState => ({
    active: false,
    hadCollisionEvent: false,
    initialRelativeZ: 0,
    minDistanceMeters: Number.POSITIVE_INFINITY,
    opponentId: null,
    passThroughSuspected: false,
    startedAtMs: 0,
});

export const useDiagnostics = (
    sessionRef: React.RefObject<RaceSession>,
    cameraMetricsRef: React.RefObject<CameraFrameMetrics>,
    wallClampCountRef: React.RefObject<number>,
) => {
    const { camera } = useThree();
    const enabledRef = useRef(false);
    const verboseRef = useRef(false);
    const captureRef = useRef<DiagCaptureState>(createDiagCaptureState());
    const lastLogAtMsRef = useRef(0);
    const lastSnapshotSeqRef = useRef(-1);
    const lastSpikeWarnAtMsRef = useRef(0);
    const spikeCountRef = useRef(0);
    const lastCollisionEventLoggedAtMsRef = useRef<number | null>(null);
    const lastCollisionFlipStartedLoggedAtMsRef = useRef<number | null>(null);
    const lastCollisionOpponentFlipStartedLoggedAtMsRef = useRef<number | null>(null);
    const lastCollisionSnapshotFlipLoggedAtMsRef = useRef<number | null>(null);
    const contactEpisodeRef = useRef<ContactEpisodeState>(createContactEpisodeState());
    const maxFrameDtMsSinceLogRef = useRef(0);
    const longFrameCountSinceLogRef = useRef(0);
    const maxFrameGapMsSinceLogRef = useRef(0);
    const longFrameGapCountSinceLogRef = useRef(0);
    const lastFrameAtMsRef = useRef(0);
    const longTaskCountRef = useRef(0);
    const longTaskMaxMsRef = useRef(0);

    useEffect(() => {
        enabledRef.current = parseDiagnosticsFlag();
        verboseRef.current = parseDiagnosticsVerboseFlag();
        captureRef.current = createDiagCaptureState();
        contactEpisodeRef.current = createContactEpisodeState();
        maxFrameDtMsSinceLogRef.current = 0;
        longFrameCountSinceLogRef.current = 0;
        maxFrameGapMsSinceLogRef.current = 0;
        longFrameGapCountSinceLogRef.current = 0;
        lastFrameAtMsRef.current = 0;
        longTaskCountRef.current = 0;
        longTaskMaxMsRef.current = 0;
        lastCollisionEventLoggedAtMsRef.current = null;
        lastCollisionFlipStartedLoggedAtMsRef.current = null;
        lastCollisionOpponentFlipStartedLoggedAtMsRef.current = null;
        lastCollisionSnapshotFlipLoggedAtMsRef.current = null;

        const debugWindow = window as Window & {
            __GT_DEBUG__?: { getState: () => GTDebugState };
            __GT_DIAG__?: {
                clearReport: () => void;
                disable: () => void;
                downloadReport: () => void;
                enable: () => void;
                getSummary: () => {
                    collisionFrameSampleCount: number;
                    longFrameGapCount: number;
                    longTaskCount: number;
                    longTaskMaxMs: number;
                    maxFrameGapMs: number;
                };
                setVerbose: (verbose: boolean) => void;
            };
        };

        debugWindow.__GT_DEBUG__ = {
            getState: () => {
                const session = sessionRef.current;
                return {
                    connectionStatus: session.connectionStatus,
                    isRunning: session.isRunning,
                    localCarX: session.localCar?.position.x ?? null,
                    localCarZ: session.localCar?.position.z ?? null,
                    opponentCount: session.opponents.size,
                    roomId: session.networkManager?.roomId ?? null,
                    speedKph: useHudStore.getState().speedKph,
                };
            },
        };
        debugWindow.__GT_DIAG__ = {
            clearReport: () => {
                captureRef.current = createDiagCaptureState();
                spikeCountRef.current = 0;
                contactEpisodeRef.current = createContactEpisodeState();
                maxFrameDtMsSinceLogRef.current = 0;
                longFrameCountSinceLogRef.current = 0;
                maxFrameGapMsSinceLogRef.current = 0;
                longFrameGapCountSinceLogRef.current = 0;
                lastFrameAtMsRef.current = 0;
                longTaskCountRef.current = 0;
                longTaskMaxMsRef.current = 0;
                lastCollisionEventLoggedAtMsRef.current = null;
                lastCollisionFlipStartedLoggedAtMsRef.current = null;
                lastCollisionOpponentFlipStartedLoggedAtMsRef.current = null;
                lastCollisionSnapshotFlipLoggedAtMsRef.current = null;
                console.info('[diag] cleared report buffer');
            },
            disable: () => {
                enabledRef.current = false;
                window.localStorage.setItem('gt-diag', 'false');
                console.info('[diag] disabled');
            },
            downloadReport: () => downloadReport(captureRef.current),
            enable: () => {
                enabledRef.current = true;
                window.localStorage.setItem('gt-diag', 'true');
                console.info('[diag] enabled');
            },
            getSummary: () => {
                const capture = captureRef.current;
                const collisionFrameSampleCount = capture.frameSamples.reduce((count, frame) => {
                    return frame.collisionEventAgeMs === null ? count : count + 1;
                }, 0);
                return {
                    collisionFrameSampleCount,
                    longFrameGapCount: capture.longFrameGapCount,
                    longTaskCount: capture.longTaskCount,
                    longTaskMaxMs: Number(capture.longTaskMaxMs.toFixed(2)),
                    maxFrameGapMs: Number(capture.frameGapMaxMs.toFixed(2)),
                };
            },
            setVerbose: (verbose: boolean) => {
                verboseRef.current = verbose;
                window.localStorage.setItem('gt-diag-verbose', verbose ? 'true' : 'false');
                console.info(verbose ? '[diag] verbose enabled' : '[diag] verbose disabled');
            },
        };

        if (enabledRef.current) {
            console.info('[diag] enabled via ?diag=1 or localStorage gt-diag=true');
        }

        let longTaskObserver: PerformanceObserver | null = null;
        try {
            if (typeof PerformanceObserver !== 'undefined') {
                const supported = PerformanceObserver.supportedEntryTypes ?? [];
                if (supported.includes('longtask')) {
                    longTaskObserver = new PerformanceObserver((list) => {
                        for (const entry of list.getEntries()) {
                            const durationMs = entry.duration;
                            longTaskCountRef.current += 1;
                            longTaskMaxMsRef.current = Math.max(longTaskMaxMsRef.current, durationMs);
                            if (verboseRef.current) {
                                console.warn('[diag][longtask]', {
                                    durationMs: Number(durationMs.toFixed(2)),
                                    startTimeMs: Number(entry.startTime.toFixed(2)),
                                });
                            }
                        }
                    });
                    longTaskObserver.observe({ entryTypes: ['longtask'] });
                }
            }
        } catch {
            // Ignore unsupported performance observer environments.
        }

        return () => {
            longTaskObserver?.disconnect();
            delete debugWindow.__GT_DEBUG__;
            delete debugWindow.__GT_DIAG__;
        };
    }, [sessionRef]);

    useEffect(() => {
        cameraMetricsRef.current.lastCameraPosition.copy(camera.position);
    }, [camera, cameraMetricsRef]);

    useFrame((_, dt) => {
        if (!enabledRef.current) {
            return;
        }

        const session = sessionRef.current;
        const localCar = session.localCar;
        if (!localCar) {
            return;
        }

        const nowMs = Date.now();
        const frameDtMs = dt * 1000;
        const lastFrameAtMs = lastFrameAtMsRef.current;
        const frameGapMs = lastFrameAtMs > 0 ? nowMs - lastFrameAtMs : frameDtMs;
        lastFrameAtMsRef.current = nowMs;
        maxFrameDtMsSinceLogRef.current = Math.max(maxFrameDtMsSinceLogRef.current, frameDtMs);
        maxFrameGapMsSinceLogRef.current = Math.max(maxFrameGapMsSinceLogRef.current, frameGapMs);
        if (frameDtMs >= LONG_FRAME_THRESHOLD_MS) {
            longFrameCountSinceLogRef.current += 1;
        }
        if (frameGapMs >= LONG_FRAME_GAP_THRESHOLD_MS) {
            longFrameGapCountSinceLogRef.current += 1;
            const nearCollision =
                session.lastCollisionEventAtMs !== null &&
                nowMs - session.lastCollisionEventAtMs <= 3_000;
            const visibilityState = document.visibilityState;
            if (verboseRef.current && (nearCollision || visibilityState !== 'visible')) {
                console.warn('[diag][frame-gap]', {
                    frameDtMs: Number(frameDtMs.toFixed(2)),
                    frameGapMs: Number(frameGapMs.toFixed(2)),
                    tMs: nowMs,
                    visibilityState,
                });
            }
        }
        const instantaneousFps = dt > 0 ? Math.round(1 / dt) : 0;
        const capture = captureRef.current;
        const cm = cameraMetricsRef.current;
        const correction = session.lastCorrection;
        const localSnapshot = session.latestLocalSnapshot;
        let nearestOpponentDistanceMeters: number | null = null;
        let nearestOpponentId: string | null = null;
        let nearestOpponentRelativeZ: number | null = null;

        for (const [opponentId, opponentCar] of session.opponents) {
            const dx = opponentCar.position.x - localCar.position.x;
            const dz = opponentCar.position.z - localCar.position.z;
            const distance = Math.hypot(dx, dz);
            if (nearestOpponentDistanceMeters === null || distance < nearestOpponentDistanceMeters) {
                nearestOpponentDistanceMeters = distance;
                nearestOpponentId = opponentId;
                nearestOpponentRelativeZ = dz;
            }
        }

        const contactEpisode = contactEpisodeRef.current;
        const nearestDistance = nearestOpponentDistanceMeters;
        const isContactActive =
            nearestDistance !== null && nearestDistance <= CONTACT_DISTANCE_THRESHOLD_METERS;
        if (isContactActive && nearestOpponentId && nearestDistance !== null) {
            if (!contactEpisode.active || contactEpisode.opponentId !== nearestOpponentId) {
                contactEpisode.active = true;
                contactEpisode.startedAtMs = nowMs;
                contactEpisode.opponentId = nearestOpponentId;
                contactEpisode.minDistanceMeters = nearestDistance;
                contactEpisode.initialRelativeZ = nearestOpponentRelativeZ ?? 0;
                contactEpisode.passThroughSuspected = false;
                contactEpisode.hadCollisionEvent = false;
            } else {
                contactEpisode.minDistanceMeters = Math.min(
                    contactEpisode.minDistanceMeters,
                    nearestDistance,
                );
            }

            if (
                session.lastCollisionEventAtMs !== null &&
                session.lastCollisionEventAtMs >= contactEpisode.startedAtMs
            ) {
                contactEpisode.hadCollisionEvent = true;
            }

            const currentRelativeZ = nearestOpponentRelativeZ ?? 0;
            const crossedThroughOpponent =
                Math.abs(contactEpisode.initialRelativeZ) > 0.01 &&
                Math.abs(currentRelativeZ) > 0.01 &&
                Math.sign(currentRelativeZ) !== Math.sign(contactEpisode.initialRelativeZ);

            if (
                crossedThroughOpponent &&
                contactEpisode.minDistanceMeters <= PASS_THROUGH_DISTANCE_THRESHOLD_METERS &&
                !contactEpisode.hadCollisionEvent
            ) {
                contactEpisode.passThroughSuspected = true;
            }
        } else if (contactEpisode.active) {
            if (contactEpisode.passThroughSuspected) {
                capture.passThroughSuspectedCount += 1;
                if (verboseRef.current) {
                    console.warn('[diag][pass-through-suspected]', {
                        minDistanceMeters: Number(contactEpisode.minDistanceMeters.toFixed(3)),
                        opponentId: contactEpisode.opponentId,
                        startedAtMs: contactEpisode.startedAtMs,
                    });
                }
            }
            contactEpisode.active = false;
            contactEpisode.hadCollisionEvent = false;
            contactEpisode.initialRelativeZ = 0;
            contactEpisode.minDistanceMeters = Number.POSITIVE_INFINITY;
            contactEpisode.opponentId = null;
            contactEpisode.passThroughSuspected = false;
            contactEpisode.startedAtMs = 0;
        }

        const contactAgeMs =
            contactEpisode.active && contactEpisode.startedAtMs > 0
                ? nowMs - contactEpisode.startedAtMs
                : null;
        const lastSnapshotAgeMs =
            session.lastSnapshotReceivedAtMs === null ? null : nowMs - session.lastSnapshotReceivedAtMs;
        const collisionEventAgeMs =
            session.lastCollisionEventAtMs === null ? null : nowMs - session.lastCollisionEventAtMs;
        const collisionDriveLockRemainingMs =
            session.localCollisionDriveLockUntilMs === null
                ? null
                : Math.max(0, session.localCollisionDriveLockUntilMs - nowMs);
        const collisionEventServerLagMs =
            session.lastCollisionEventAtMs !== null && session.lastCollisionEventServerTimeMs !== null
                ? Math.max(0, session.lastCollisionEventAtMs - session.lastCollisionEventServerTimeMs)
                : null;
        const collisionEventToFlipStartMs =
            session.lastCollisionEventAtMs !== null && session.lastCollisionFlipStartedAtMs !== null
                ? Math.max(0, session.lastCollisionFlipStartedAtMs - session.lastCollisionEventAtMs)
                : null;
        const collisionEventToOpponentFlipStartMs =
            session.lastCollisionEventAtMs !== null && session.lastCollisionOpponentFlipStartedAtMs !== null
                ? Math.max(0, session.lastCollisionOpponentFlipStartedAtMs - session.lastCollisionEventAtMs)
                : null;
        const collisionEventToSnapshotFlipMs =
            session.lastCollisionEventAtMs !== null && session.lastCollisionSnapshotFlipSeenAtMs !== null
                ? Math.max(0, session.lastCollisionSnapshotFlipSeenAtMs - session.lastCollisionEventAtMs)
                : null;
        const collisionContactToEventMs =
            contactEpisode.active &&
            contactEpisode.startedAtMs > 0 &&
            session.lastCollisionEventAtMs !== null &&
            session.lastCollisionEventAtMs >= contactEpisode.startedAtMs
                ? Math.max(0, session.lastCollisionEventAtMs - contactEpisode.startedAtMs)
                : null;
        const earliestFlipStartAtMs = [session.lastCollisionFlipStartedAtMs, session.lastCollisionOpponentFlipStartedAtMs]
            .filter((value): value is number => value !== null)
            .reduce<number | null>((minValue, value) => {
                if (minValue === null || value < minValue) {
                    return value;
                }
                return minValue;
            }, null);
        const collisionContactToFlipStartMs =
            contactEpisode.active &&
            contactEpisode.startedAtMs > 0 &&
            earliestFlipStartAtMs !== null &&
            earliestFlipStartAtMs >= contactEpisode.startedAtMs
                ? Math.max(0, earliestFlipStartAtMs - contactEpisode.startedAtMs)
                : null;
        const collisionHardSnapRemainingMs =
            session.localCollisionHardSnapUntilMs === null
                ? null
                : Math.max(0, session.localCollisionHardSnapUntilMs - nowMs);

        if (nowMs - lastLogAtMsRef.current >= DIAGNOSTIC_LOG_INTERVAL_MS) {
            lastLogAtMsRef.current = nowMs;
            const frameDtMaxMs = maxFrameDtMsSinceLogRef.current;
            const longFrameCount = longFrameCountSinceLogRef.current;
            const frameGapMaxMs = maxFrameGapMsSinceLogRef.current;
            const longFrameGapCount = longFrameGapCountSinceLogRef.current;
            maxFrameDtMsSinceLogRef.current = 0;
            longFrameCountSinceLogRef.current = 0;
            maxFrameGapMsSinceLogRef.current = 0;
            longFrameGapCountSinceLogRef.current = 0;

            const localSpeedKph = Math.round(
                Math.max(
                    0,
                    localSnapshot?.speed !== undefined
                        ? localSnapshot.speed * 3.6
                        : localCar.getSpeed() * 3.6,
                ),
            );
            const snapshotSpeedKph = Math.round(Math.max(0, (localSnapshot?.speed ?? 0) * 3.6));

            capture.framesCaptured += 1;
            capture.fpsSampleCount += 1;
            capture.fpsSum += instantaneousFps;
            capture.fpsMin = Math.min(capture.fpsMin, instantaneousFps);
            capture.fpsMax = Math.max(capture.fpsMax, instantaneousFps);
            capture.frameDtMaxMs = Math.max(capture.frameDtMaxMs, frameDtMaxMs);
            capture.longFrameCount += longFrameCount;
            capture.frameGapMaxMs = Math.max(capture.frameGapMaxMs, frameGapMaxMs);
            capture.longFrameGapCount += longFrameGapCount;
            capture.longTaskCount = longTaskCountRef.current;
            capture.longTaskMaxMs = Math.max(capture.longTaskMaxMs, longTaskMaxMsRef.current);
            capture.speedKphMax = Math.max(capture.speedKphMax, localSpeedKph);
            capture.wallClampCount = wallClampCountRef.current;
            capture.correctionPositionErrorMaxMeters = Math.max(
                capture.correctionPositionErrorMaxMeters,
                correction?.positionError ?? 0,
            );
            if (lastSnapshotAgeMs !== null) {
                capture.snapshotAgeCount += 1;
                capture.snapshotAgeSumMs += lastSnapshotAgeMs;
                capture.snapshotAgeMaxMs = Math.max(capture.snapshotAgeMaxMs, lastSnapshotAgeMs);
            }

            const frameSample: DiagFrameSample = {
                cameraJumpMeters: Number(cm.cameraJumpMeters.toFixed(4)),
                collisionContactToEventMs,
                collisionContactToFlipStartMs,
                collisionDriveLockRemainingMs,
                collisionEventAgeMs,
                collisionEventServerLagMs,
                collisionEventToOpponentFlipStartMs,
                collisionEventToFlipStartMs,
                collisionEventToSnapshotFlipMs,
                collisionHardSnapRemainingMs,
                contactAgeMs,
                contactOpponentId: contactEpisode.active ? contactEpisode.opponentId : null,
                contactPassThroughSuspected: contactEpisode.active && contactEpisode.passThroughSuspected,
                correctionMode: correction?.mode ?? 'none',
                correctionPositionError: Number((correction?.positionError ?? 0).toFixed(4)),
                fps: instantaneousFps,
                frameGapMs: Number(frameGapMs.toFixed(2)),
                frameDtMaxMs: Number(frameDtMaxMs.toFixed(2)),
                longFrameCount,
                raceEventProcessingMs:
                    session.lastRaceEventProcessingMs === null
                        ? null
                        : Number(session.lastRaceEventProcessingMs.toFixed(2)),
                nearestOpponentDistanceMeters:
                    nearestOpponentDistanceMeters === null ? null : Number(nearestOpponentDistanceMeters.toFixed(4)),
                nearestOpponentRelativeZ:
                    nearestOpponentRelativeZ === null ? null : Number(nearestOpponentRelativeZ.toFixed(4)),
                snapshotProcessingMs:
                    session.lastSnapshotProcessingMs === null
                        ? null
                        : Number(session.lastSnapshotProcessingMs.toFixed(2)),
                playerX: Number(localCar.position.x.toFixed(4)),
                playerZ: Number(localCar.position.z.toFixed(4)),
                speedKph: localSpeedKph,
                tMs: nowMs,
                visibilityState: document.visibilityState,
            };
            capture.frameSamples.push(frameSample);
            if (capture.frameSamples.length > DIAG_MAX_FRAME_SAMPLES) {
                capture.frameSamples.shift();
            }

            if (session.latestLocalSnapshotSeq !== lastSnapshotSeqRef.current) {
                lastSnapshotSeqRef.current = session.latestLocalSnapshotSeq ?? -1;
                if (enabledRef.current && verboseRef.current) {
                    console.debug('[diag][snapshot]', {
                        lastProcessedInputSeq: localSnapshot?.lastProcessedInputSeq ?? null,
                        seq: lastSnapshotSeqRef.current,
                        serverSpeedKph: snapshotSpeedKph,
                        snapshotAgeMs: lastSnapshotAgeMs,
                    });
                }
            }

            if (enabledRef.current && verboseRef.current) {
                console.debug('[diag][frame]', {
                    cameraMotionMeters: Number(cm.cameraMotionMeters.toFixed(4)),
                    cameraJumpMeters: Number(cm.cameraJumpMeters.toFixed(4)),
                    collisionContactToEventMs,
                    collisionContactToFlipStartMs,
                    collisionDriveLockRemainingMs,
                    collisionEventAgeMs,
                    collisionEventServerLagMs,
                    collisionEventToOpponentFlipStartMs,
                    collisionEventToFlipStartMs,
                    collisionEventToSnapshotFlipMs,
                    collisionHardSnapRemainingMs,
                    contactAgeMs,
                    contactOpponentId: contactEpisode.active ? contactEpisode.opponentId : null,
                    contactPassThroughSuspected: contactEpisode.active && contactEpisode.passThroughSuspected,
                    correctionInputLead: correction?.inputLead ?? 0,
                    correctionMode: correction?.mode ?? 'none',
                    correctionPositionApplied: Number((correction?.appliedPositionDelta ?? 0).toFixed(4)),
                    correctionPositionError: Number((correction?.positionError ?? 0).toFixed(4)),
                    correctionSeq: correction?.sequence ?? null,
                    correctionYawError: Number((correction?.yawError ?? 0).toFixed(4)),
                    frameDtMs: Number(frameDtMs.toFixed(2)),
                    fps: instantaneousFps,
                    nearestOpponentDistanceMeters:
                        nearestOpponentDistanceMeters === null ? null : Number(nearestOpponentDistanceMeters.toFixed(4)),
                    nearestOpponentRelativeZ:
                        nearestOpponentRelativeZ === null ? null : Number(nearestOpponentRelativeZ.toFixed(4)),
                    localSpeedKph,
                    playerRotationY: Number(localCar.rotationY.toFixed(4)),
                    playerX: Number(localCar.position.x.toFixed(4)),
                    playerZ: Number(localCar.position.z.toFixed(4)),
                    snapshotAgeMs: lastSnapshotAgeMs,
                    snapshotSpeedKph,
                    spikeCount: spikeCountRef.current,
                    wallClampCount: wallClampCountRef.current,
                });
            }

            if (
                verboseRef.current &&
                session.lastCollisionEventAtMs !== null &&
                session.lastCollisionEventAtMs !== lastCollisionEventLoggedAtMsRef.current
            ) {
                lastCollisionEventLoggedAtMsRef.current = session.lastCollisionEventAtMs;
                console.debug('[diag][collision-event]', {
                    atMs: session.lastCollisionEventAtMs,
                    flippedPlayerId: session.lastCollisionFlippedPlayerId,
                    serverLagMs: collisionEventServerLagMs,
                });
            }

            if (
                verboseRef.current &&
                session.lastCollisionSnapshotFlipSeenAtMs !== null &&
                session.lastCollisionSnapshotFlipSeenAtMs !== lastCollisionSnapshotFlipLoggedAtMsRef.current
            ) {
                lastCollisionSnapshotFlipLoggedAtMsRef.current = session.lastCollisionSnapshotFlipSeenAtMs;
                console.debug('[diag][collision-snapshot-flip]', {
                    atMs: session.lastCollisionSnapshotFlipSeenAtMs,
                    fromEventMs: collisionEventToSnapshotFlipMs,
                });
            }

            if (
                verboseRef.current &&
                session.lastCollisionFlipStartedAtMs !== null &&
                session.lastCollisionFlipStartedAtMs !== lastCollisionFlipStartedLoggedAtMsRef.current
            ) {
                lastCollisionFlipStartedLoggedAtMsRef.current = session.lastCollisionFlipStartedAtMs;
                console.debug('[diag][collision-flip-start]', {
                    atMs: session.lastCollisionFlipStartedAtMs,
                    fromEventMs: collisionEventToFlipStartMs,
                });
            }

            if (
                verboseRef.current &&
                session.lastCollisionOpponentFlipStartedAtMs !== null
            ) {
                if (session.lastCollisionOpponentFlipStartedAtMs !== lastCollisionOpponentFlipStartedLoggedAtMsRef.current) {
                    lastCollisionOpponentFlipStartedLoggedAtMsRef.current = session.lastCollisionOpponentFlipStartedAtMs;
                    console.debug('[diag][collision-opponent-flip-start]', {
                        atMs: session.lastCollisionOpponentFlipStartedAtMs,
                        fromEventMs: collisionEventToOpponentFlipStartMs,
                        flippedPlayerId: session.lastCollisionFlippedPlayerId,
                    });
                }
            }
        }

        const isShakeSpike =
            cm.cameraJumpMeters >= SHAKE_SPIKE_CAMERA_JUMP_METERS ||
            instantaneousFps <= SHAKE_SPIKE_FPS_THRESHOLD;

        if (
            nowMs >= session.shakeSpikeGraceUntilMs &&
            isShakeSpike &&
            nowMs - lastSpikeWarnAtMsRef.current >= SHAKE_SPIKE_WARN_INTERVAL_MS
        ) {
            lastSpikeWarnAtMsRef.current = nowMs;
            spikeCountRef.current += 1;

            const spike: DiagSpikeSample = {
                cameraJumpMeters: Number(cm.cameraJumpMeters.toFixed(4)),
                cameraMotionMeters: Number(cm.cameraMotionMeters.toFixed(4)),
                correctionMode: correction?.mode ?? 'none',
                correctionPositionError: Number((correction?.positionError ?? 0).toFixed(4)),
                fps: instantaneousFps,
                playerX: Number(localCar.position.x.toFixed(2)),
                playerZ: Number(localCar.position.z.toFixed(2)),
                snapshotAgeMs: lastSnapshotAgeMs,
                tMs: nowMs,
            };

            capture.spikeCount += 1;
            capture.spikeSamples.push(spike);
            if (capture.spikeSamples.length > DIAG_MAX_SPIKE_SAMPLES) {
                capture.spikeSamples.shift();
            }

            if (verboseRef.current) {
                console.warn('[diag][shake-spike]', {
                    ...spike,
                    correctionInputLead: correction?.inputLead ?? 0,
                    wallClampCount: wallClampCountRef.current,
                });
            }
        }
    });
};
