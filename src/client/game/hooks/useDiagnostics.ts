import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { computeCollisionTimings } from '@/client/game/hooks/diagnostics/computeCollisionTimings';
import {
    ACTIVE_COLLISION_WINDOW_MS,
    createDiagCaptureState,
    DIAG_MAX_FRAME_SAMPLES,
    DIAG_MAX_SPIKE_SAMPLES,
    DIAGNOSTIC_LOG_INTERVAL_MS,
    type DiagCaptureState,
    type GTDebugState,
    LONG_FRAME_GAP_THRESHOLD_MS,
    LONG_FRAME_THRESHOLD_MS,
    type NearestOpponent,
    SHAKE_SPIKE_CAMERA_JUMP_METERS,
    SHAKE_SPIKE_FPS_THRESHOLD,
    SHAKE_SPIKE_WARN_INTERVAL_MS,
} from '@/client/game/hooks/diagnostics/types';
import { useContactEpisodeTracker } from '@/client/game/hooks/diagnostics/useContactEpisodeTracker';
import { useLongTaskObserver } from '@/client/game/hooks/diagnostics/useLongTaskObserver';
import type { RaceSession } from '@/client/game/hooks/types';
import type { CameraFrameMetrics } from '@/client/game/hooks/useCameraFollow';
import { useHudStore } from '@/client/game/state/hudStore';

const parseDiagnosticsFlag = () => {
    if (typeof window === 'undefined') {
        return false;
    }
    const searchParams = new URLSearchParams(window.location.search);
    const queryFlag = searchParams.get('diag');
    if (queryFlag === '1' || queryFlag === 'true') {
        return true;
    }
    const localStorageFlag = window.localStorage.getItem('gt-diag');
    return localStorageFlag === '1' || localStorageFlag === 'true';
};

const parseDiagnosticsVerboseFlag = () => {
    if (typeof window === 'undefined') {
        return false;
    }
    const searchParams = new URLSearchParams(window.location.search);
    const queryFlag = searchParams.get('diagVerbose');
    if (queryFlag === '1' || queryFlag === 'true') {
        return true;
    }
    const localStorageFlag = window.localStorage.getItem('gt-diag-verbose');
    return localStorageFlag === '1' || localStorageFlag === 'true';
};

const downloadReport = (capture: DiagCaptureState) => {
    const nowMs = Date.now();
    const durationMs = Math.max(1, nowMs - capture.sessionStartedAtMs);
    const averageFps = capture.fpsSampleCount > 0 ? capture.fpsSum / capture.fpsSampleCount : 0;
    const snapshotAgeAverageMs = capture.snapshotAgeCount > 0 ? capture.snapshotAgeSumMs / capture.snapshotAgeCount : 0;
    const fpsMin = capture.fpsSampleCount > 0 ? capture.fpsMin : 0;
    const drawCallsAvg = capture.drawCallsSampleCount > 0 ? capture.drawCallsSum / capture.drawCallsSampleCount : 0;
    const header = [
        '# GT Racer Diagnostic Report',
        `generatedAt: ${new Date(nowMs).toISOString()}`,
        `sessionDurationMs: ${durationMs}`,
        `framesCaptured: ${capture.framesCaptured}`,
        `spikeCount: ${capture.spikeCount}`,
        `fpsAvg: ${averageFps.toFixed(2)}`,
        `fpsMin: ${fpsMin.toFixed(2)}`,
        `fpsMax: ${capture.fpsMax.toFixed(2)}`,
        `drawCallsAvg: ${drawCallsAvg.toFixed(2)}`,
        `drawCallsMax: ${capture.drawCallsMax}`,
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
    const spikeLines = capture.spikeSamples.map((s) => JSON.stringify(s));
    const frameLines = capture.frameSamples.map((s) => JSON.stringify(s));
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

export const useDiagnostics = (
    sessionRef: React.RefObject<RaceSession>,
    cameraMetricsRef: React.RefObject<CameraFrameMetrics>,
    wallClampCountRef: React.RefObject<number>,
) => {
    const { camera, gl } = useThree();
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
    const maxFrameDtMsSinceLogRef = useRef(0);
    const longFrameCountSinceLogRef = useRef(0);
    const maxFrameGapMsSinceLogRef = useRef(0);
    const longFrameGapCountSinceLogRef = useRef(0);
    const lastFrameAtMsRef = useRef(0);

    // Focused sub-hooks
    const { longTaskCountRef, longTaskMaxMsRef, reset: resetLongTasks } = useLongTaskObserver(verboseRef);
    const contactEpisodeTracker = useContactEpisodeTracker();

    const resetAllRefs = () => {
        captureRef.current = createDiagCaptureState();
        spikeCountRef.current = 0;
        contactEpisodeTracker.reset();
        lastLogAtMsRef.current = 0;
        lastSnapshotSeqRef.current = -1;
        lastSpikeWarnAtMsRef.current = 0;
        maxFrameDtMsSinceLogRef.current = 0;
        longFrameCountSinceLogRef.current = 0;
        maxFrameGapMsSinceLogRef.current = 0;
        longFrameGapCountSinceLogRef.current = 0;
        lastFrameAtMsRef.current = 0;
        resetLongTasks();
        lastCollisionEventLoggedAtMsRef.current = null;
        lastCollisionFlipStartedLoggedAtMsRef.current = null;
        lastCollisionOpponentFlipStartedLoggedAtMsRef.current = null;
        lastCollisionSnapshotFlipLoggedAtMsRef.current = null;
    };

    useEffect(() => {
        enabledRef.current = parseDiagnosticsFlag();
        verboseRef.current = parseDiagnosticsVerboseFlag();
        resetAllRefs();

        const debugWindow = window as Window & {
            __GT_DEBUG__?: { getState: () => GTDebugState };
            __GT_DIAG__?: {
                clearReport: () => void;
                disable: () => void;
                downloadReport: () => void;
                enable: () => void;
                getSummary: () => {
                    collisionFrameSampleCount: number;
                    drawCallsAvg: number;
                    drawCallsMax: number;
                    longFrameGapCount: number;
                    longTaskCount: number;
                    longTaskMaxMs: number;
                    maxFrameGapMs: number;
                };
                setVerbose: (verbose: boolean) => void;
            };
        };

        debugWindow.__GT_DEBUG__ = {
            getState: (): GTDebugState => {
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
                resetAllRefs();
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
                    return frame.collisionEventAgeMs !== null && frame.collisionEventAgeMs <= ACTIVE_COLLISION_WINDOW_MS
                        ? count + 1
                        : count;
                }, 0);
                return {
                    collisionFrameSampleCount,
                    drawCallsAvg: capture.drawCallsSampleCount > 0
                        ? Math.round(capture.drawCallsSum / capture.drawCallsSampleCount)
                        : 0,
                    drawCallsMax: capture.drawCallsMax,
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

        return () => {
            delete debugWindow.__GT_DEBUG__;
            delete debugWindow.__GT_DIAG__;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

        // Frame timing accumulation
        maxFrameDtMsSinceLogRef.current = Math.max(maxFrameDtMsSinceLogRef.current, frameDtMs);
        maxFrameGapMsSinceLogRef.current = Math.max(maxFrameGapMsSinceLogRef.current, frameGapMs);
        if (frameDtMs >= LONG_FRAME_THRESHOLD_MS) {
            longFrameCountSinceLogRef.current += 1;
        }
        if (frameGapMs >= LONG_FRAME_GAP_THRESHOLD_MS) {
            longFrameGapCountSinceLogRef.current += 1;
            const nearCollision =
                session.lastCollisionEventAtMs !== null && nowMs - session.lastCollisionEventAtMs <= 3_000;
            if (verboseRef.current && (nearCollision || document.visibilityState !== 'visible')) {
                console.warn('[diag][frame-gap]', {
                    frameDtMs: Number(frameDtMs.toFixed(2)),
                    frameGapMs: Number(frameGapMs.toFixed(2)),
                    tMs: nowMs,
                    visibilityState: document.visibilityState,
                });
            }
        }

        const instantaneousFps = dt > 0 ? Math.round(1 / dt) : 0;
        const capture = captureRef.current;
        const cm = cameraMetricsRef.current;
        const correction = session.lastCorrection;
        const localSnapshot = session.latestLocalSnapshot;

        // Draw call tracking (per frame)
        const drawCalls = gl.info.render.calls;
        capture.drawCallsMax = Math.max(capture.drawCallsMax, drawCalls);
        capture.drawCallsSampleCount += 1;
        capture.drawCallsSum += drawCalls;

        // Find nearest opponent
        let nearest: NearestOpponent | null = null;
        for (const [opponentId, opponentCar] of session.opponents) {
            const dx = opponentCar.position.x - localCar.position.x;
            const dz = opponentCar.position.z - localCar.position.z;
            const distance = Math.hypot(dx, dz);
            if (nearest === null || distance < nearest.distanceMeters) {
                nearest = { distanceMeters: distance, id: opponentId, relativeZ: dz };
            }
        }

        // Advance contact episode state machine
        const episodeUpdate = contactEpisodeTracker.update(nearest, session, nowMs);
        if (episodeUpdate.newPassThroughDetected) {
            capture.passThroughSuspectedCount += 1;
            if (verboseRef.current) {
                console.warn('[diag][pass-through-suspected]', {
                    minDistanceMeters: Number(episodeUpdate.detectedMinDistanceMeters.toFixed(3)),
                    opponentId: episodeUpdate.detectedOpponentId,
                    startedAtMs: nowMs,
                });
            }
        }

        const episode = contactEpisodeTracker.episodeRef.current;
        const timings = computeCollisionTimings(session, episode, nowMs);
        const contactAgeMs = episode.active && episode.startedAtMs > 0 ? nowMs - episode.startedAtMs : null;
        const lastSnapshotAgeMs =
            session.lastSnapshotReceivedAtMs === null ? null : nowMs - session.lastSnapshotReceivedAtMs;

        // Periodic frame sample capture and verbose logging
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
                Math.max(0, localSnapshot?.speed !== undefined ? localSnapshot.speed * 3.6 : localCar.getSpeed() * 3.6),
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
            const longTaskCountSinceLog = Math.max(0, longTaskCountRef.current - capture.longTaskCount);
            capture.longTaskCount += longTaskCountSinceLog;
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

            capture.frameSamples.push({
                cameraJumpMeters: Number(cm.cameraJumpMeters.toFixed(4)),
                ...timings,
                contactAgeMs,
                contactOpponentId: episode.active ? episode.opponentId : null,
                contactPassThroughSuspected: episode.active && episode.passThroughSuspected,
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
                nearestOpponentDistanceMeters: nearest === null ? null : Number(nearest.distanceMeters.toFixed(4)),
                nearestOpponentRelativeZ: nearest === null ? null : Number(nearest.relativeZ.toFixed(4)),
                snapshotProcessingMs:
                    session.lastSnapshotProcessingMs === null
                        ? null
                        : Number(session.lastSnapshotProcessingMs.toFixed(2)),
                playerX: Number(localCar.position.x.toFixed(4)),
                playerZ: Number(localCar.position.z.toFixed(4)),
                speedKph: localSpeedKph,
                tMs: nowMs,
                visibilityState: document.visibilityState,
            });
            if (capture.frameSamples.length > DIAG_MAX_FRAME_SAMPLES) {
                capture.frameSamples.shift();
            }

            if (session.latestLocalSnapshotSeq !== lastSnapshotSeqRef.current) {
                lastSnapshotSeqRef.current = session.latestLocalSnapshotSeq ?? -1;
                if (verboseRef.current) {
                    console.debug('[diag][snapshot]', {
                        lastProcessedInputSeq: localSnapshot?.lastProcessedInputSeq ?? null,
                        seq: lastSnapshotSeqRef.current,
                        serverSpeedKph: snapshotSpeedKph,
                        snapshotAgeMs: lastSnapshotAgeMs,
                    });
                }
            }

            if (verboseRef.current) {
                console.debug('[diag][frame]', {
                    cameraMotionMeters: Number(cm.cameraMotionMeters.toFixed(4)),
                    cameraJumpMeters: Number(cm.cameraJumpMeters.toFixed(4)),
                    ...timings,
                    contactAgeMs,
                    contactOpponentId: episode.active ? episode.opponentId : null,
                    contactPassThroughSuspected: episode.active && episode.passThroughSuspected,
                    correctionInputLead: correction?.inputLead ?? 0,
                    correctionMode: correction?.mode ?? 'none',
                    correctionPositionApplied: Number((correction?.appliedPositionDelta ?? 0).toFixed(4)),
                    correctionPositionError: Number((correction?.positionError ?? 0).toFixed(4)),
                    correctionSeq: correction?.sequence ?? null,
                    correctionYawError: Number((correction?.yawError ?? 0).toFixed(4)),
                    frameDtMs: Number(frameDtMs.toFixed(2)),
                    fps: instantaneousFps,
                    nearestOpponentDistanceMeters: nearest === null ? null : Number(nearest.distanceMeters.toFixed(4)),
                    nearestOpponentRelativeZ: nearest === null ? null : Number(nearest.relativeZ.toFixed(4)),
                    localSpeedKph,
                    playerRotationY: Number(localCar.rotationY.toFixed(4)),
                    playerX: Number(localCar.position.x.toFixed(4)),
                    playerZ: Number(localCar.position.z.toFixed(4)),
                    snapshotAgeMs: lastSnapshotAgeMs,
                    snapshotSpeedKph,
                    spikeCount: spikeCountRef.current,
                    wallClampCount: wallClampCountRef.current,
                });

                if (
                    session.lastCollisionEventAtMs !== null &&
                    session.lastCollisionEventAtMs !== lastCollisionEventLoggedAtMsRef.current
                ) {
                    lastCollisionEventLoggedAtMsRef.current = session.lastCollisionEventAtMs;
                    console.debug('[diag][collision-event]', {
                        atMs: session.lastCollisionEventAtMs,
                        flippedPlayerId: session.lastCollisionFlippedPlayerId,
                        serverLagMs: timings.collisionEventServerLagMs,
                    });
                }

                if (
                    session.lastCollisionSnapshotFlipSeenAtMs !== null &&
                    session.lastCollisionSnapshotFlipSeenAtMs !== lastCollisionSnapshotFlipLoggedAtMsRef.current
                ) {
                    lastCollisionSnapshotFlipLoggedAtMsRef.current = session.lastCollisionSnapshotFlipSeenAtMs;
                    console.debug('[diag][collision-snapshot-flip]', {
                        atMs: session.lastCollisionSnapshotFlipSeenAtMs,
                        fromEventMs: timings.collisionEventToSnapshotFlipMs,
                    });
                }

                if (
                    session.lastCollisionFlipStartedAtMs !== null &&
                    session.lastCollisionFlipStartedAtMs !== lastCollisionFlipStartedLoggedAtMsRef.current
                ) {
                    lastCollisionFlipStartedLoggedAtMsRef.current = session.lastCollisionFlipStartedAtMs;
                    console.debug('[diag][collision-flip-start]', {
                        atMs: session.lastCollisionFlipStartedAtMs,
                        fromEventMs: timings.collisionEventToFlipStartMs,
                    });
                }

                if (
                    session.lastCollisionOpponentFlipStartedAtMs !== null &&
                    session.lastCollisionOpponentFlipStartedAtMs !==
                        lastCollisionOpponentFlipStartedLoggedAtMsRef.current
                ) {
                    lastCollisionOpponentFlipStartedLoggedAtMsRef.current =
                        session.lastCollisionOpponentFlipStartedAtMs;
                    console.debug('[diag][collision-opponent-flip-start]', {
                        atMs: session.lastCollisionOpponentFlipStartedAtMs,
                        fromEventMs: timings.collisionEventToOpponentFlipStartMs,
                        flippedPlayerId: session.lastCollisionFlippedPlayerId,
                    });
                }
            }
        }

        // Shake spike detection
        const isShakeSpike =
            cm.cameraJumpMeters >= SHAKE_SPIKE_CAMERA_JUMP_METERS || instantaneousFps <= SHAKE_SPIKE_FPS_THRESHOLD;

        if (
            nowMs >= session.shakeSpikeGraceUntilMs &&
            isShakeSpike &&
            nowMs - lastSpikeWarnAtMsRef.current >= SHAKE_SPIKE_WARN_INTERVAL_MS
        ) {
            lastSpikeWarnAtMsRef.current = nowMs;
            spikeCountRef.current += 1;

            const spike = {
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
