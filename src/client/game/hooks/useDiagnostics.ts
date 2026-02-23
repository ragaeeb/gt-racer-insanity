import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraFrameMetrics } from '@/client/game/hooks/useCameraFollow';
import type { RaceSession } from '@/client/game/hooks/types';
import { useHudStore } from '@/client/game/state/hudStore';
import type { ConnectionStatus } from '@/shared/network/types';

type DiagFrameSample = {
    cameraJumpMeters: number;
    correctionMode: string;
    correctionPositionError: number;
    fps: number;
    playerX: number;
    playerZ: number;
    speedKph: number;
    tMs: number;
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

const DIAGNOSTIC_LOG_INTERVAL_MS = 250;
const DIAG_MAX_FRAME_SAMPLES = 200;
const DIAG_MAX_SPIKE_SAMPLES = 40;
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

    useEffect(() => {
        enabledRef.current = parseDiagnosticsFlag();
        verboseRef.current = parseDiagnosticsVerboseFlag();
        captureRef.current = createDiagCaptureState();

        const debugWindow = window as Window & {
            __GT_DEBUG__?: { getState: () => GTDebugState };
            __GT_DIAG__?: {
                clearReport: () => void;
                disable: () => void;
                downloadReport: () => void;
                enable: () => void;
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
        };

        if (enabledRef.current) {
            console.info('[diag] enabled via ?diag=1 or localStorage gt-diag=true');
        }

        return () => {
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
        const instantaneousFps = dt > 0 ? Math.round(1 / dt) : 0;
        const capture = captureRef.current;
        const cm = cameraMetricsRef.current;
        const correction = session.lastCorrection;
        const localSnapshot = session.latestLocalSnapshot;
        const lastSnapshotAgeMs =
            session.lastSnapshotReceivedAtMs === null ? null : nowMs - session.lastSnapshotReceivedAtMs;

        if (nowMs - lastLogAtMsRef.current >= DIAGNOSTIC_LOG_INTERVAL_MS) {
            lastLogAtMsRef.current = nowMs;

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
                correctionMode: correction?.mode ?? 'none',
                correctionPositionError: Number((correction?.positionError ?? 0).toFixed(4)),
                fps: instantaneousFps,
                playerX: Number(localCar.position.x.toFixed(4)),
                playerZ: Number(localCar.position.z.toFixed(4)),
                speedKph: localSpeedKph,
                tMs: nowMs,
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
                    correctionInputLead: correction?.inputLead ?? 0,
                    correctionMode: correction?.mode ?? 'none',
                    correctionPositionApplied: Number((correction?.appliedPositionDelta ?? 0).toFixed(4)),
                    correctionPositionError: Number((correction?.positionError ?? 0).toFixed(4)),
                    correctionSeq: correction?.sequence ?? null,
                    correctionYawError: Number((correction?.yawError ?? 0).toFixed(4)),
                    fps: instantaneousFps,
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
