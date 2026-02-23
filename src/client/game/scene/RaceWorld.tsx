import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clientConfig } from '@/client/app/config';
import { NetworkManager } from '@/client/network/NetworkManager';
import { CAR_MODEL_CATALOG } from '@/client/game/assets/carModelCatalog';
import { Car, type CarAssets } from '@/client/game/entities/Car';
import { SceneEnvironment } from '@/client/game/scene/environment/SceneEnvironment';
import {
    DEFAULT_SCENE_ENVIRONMENT_ID,
    getSceneEnvironmentProfile,
    getSceneEnvironmentProfileIdForTrackTheme,
} from '@/client/game/scene/environment/sceneEnvironmentProfiles';
import { useHudStore } from '@/client/game/state/hudStore';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';
import { InputManager } from '@/client/game/systems/InputManager';
import {
    createInterpolationBuffer,
    pushInterpolationSample,
    sampleInterpolationBuffer,
    type InterpolationBuffer,
} from '@/client/game/systems/interpolationSystem';
import {
    createBoundsFromCenterAndSize,
    intersectsAxisAlignedBounds,
    toAxisAlignedBounds,
} from '@/client/game/systems/obstacleCollisionSystem';
import { resolveSteeringInput, resolveThrottleInput } from '@/client/game/systems/inputFrameControls';
import { TrackManager } from '@/client/game/systems/TrackManager';
import { playerIdToHue } from '@/shared/game/playerColor';
import { getTrackManifestById } from '@/shared/game/track/trackManifest';
import { playerIdToVehicleIndex } from '@/shared/game/playerVehicle';
import { getVehicleClassManifestById } from '@/shared/game/vehicle/vehicleClassManifest';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import type {
    ConnectionStatus,
    PlayerState,
    RaceState,
    SnapshotPlayerState,
} from '@/shared/network/types';

type RaceWorldProps = {
    cruiseControlEnabled: boolean;
    onConnectionStatusChange: (status: ConnectionStatus) => void;
    onGameOverChange: (isGameOver: boolean) => void;
    onRaceStateChange: (state: RaceState | null) => void;
    playerName: string;
    resetNonce: number;
    roomId: string;
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

type OpponentInterpolationState = {
    rotationY: number;
    x: number;
    y: number;
    z: number;
};

const NETWORK_TICK_RATE_SECONDS = 1 / 20;
const DIAGNOSTIC_LOG_INTERVAL_MS = 250;
const SHAKE_SPIKE_CAMERA_JUMP_METERS = 1.5;
const SHAKE_SPIKE_FPS_THRESHOLD = 45;
const SHAKE_SPIKE_WARN_INTERVAL_MS = 1000;
const SHAKE_SPIKE_GRACE_PERIOD_MS = 1800;
const TRACK_WIDTH_METERS = 76;
const PLAYER_COLLIDER_HALF_WIDTH_METERS = 1.1;
const LOCAL_TRACK_BOUNDARY_X_METERS = TRACK_WIDTH_METERS * 0.5 - PLAYER_COLLIDER_HALF_WIDTH_METERS;

type CorrectionMode = 'deferred' | 'hard' | 'none' | 'soft';

type DiagFrameSample = {
    cameraJumpMeters: number;
    correctionMode: CorrectionMode;
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
    correctionMode: CorrectionMode;
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

const DIAG_MAX_FRAME_SAMPLES = 200;
const DIAG_MAX_SPIKE_SAMPLES = 40;

const createDiagCaptureState = (): DiagCaptureState => {
    return {
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
    };
};

export const RaceWorld = ({
    cruiseControlEnabled,
    onConnectionStatusChange,
    onGameOverChange,
    onRaceStateChange,
    playerName,
    resetNonce,
    roomId,
}: RaceWorldProps) => {
    const { scene, camera } = useThree();

    const inputManager = useMemo(() => new InputManager(), []);
    const dirLightRef = useRef<THREE.DirectionalLight>(null);

    const networkManagerRef = useRef<NetworkManager | null>(null);
    const trackManagerRef = useRef<TrackManager | null>(null);
    const activeTrackIdRef = useRef(getTrackManifestById('sunset-loop').id);
    const hasLocalAuthoritativeTargetRef = useRef(false);
    const localCarRef = useRef<Car | null>(null);
    const localInterpolationBufferRef = useRef<InterpolationBuffer<OpponentInterpolationState>>(
        createInterpolationBuffer<OpponentInterpolationState>()
    );
    const opponentsRef = useRef<Map<string, Car>>(new Map());
    const opponentInterpolationBuffersRef = useRef<Map<string, InterpolationBuffer<OpponentInterpolationState>>>(new Map());
    const localInputSequenceRef = useRef(0);
    const cruiseLatchActiveRef = useRef(false);
    const latestLocalSnapshotRef = useRef<SnapshotPlayerState | null>(null);
    const latestLocalSnapshotSeqRef = useRef<number | null>(null);
    const lastReconciledSnapshotSeqRef = useRef<number | null>(null);
    const diagnosticsEnabledRef = useRef(false);
    const diagnosticsVerboseConsoleRef = useRef(false);
    const lastSnapshotReceivedAtMsRef = useRef<number | null>(null);
    const diagCaptureRef = useRef<DiagCaptureState>(createDiagCaptureState());
    const lastCorrectionRef = useRef<{
        appliedPositionDelta: number;
        inputLead: number;
        mode: CorrectionMode;
        positionError: number;
        sequence: number;
        yawError: number;
    } | null>(null);
    const shakeSpikeGraceUntilMsRef = useRef(0);
    const diagnosticsRef = useRef({
        cameraMotionMeters: 0,
        correctionCount: 0,
        correctionDeferredCount: 0,
        correctionHardCount: 0,
        correctionSoftCount: 0,
        lastWallClampX: 0,
        lastCameraJumpMeters: 0,
        lastCameraPosition: new THREE.Vector3(),
        lastFps: 0,
        lastLogAtMs: 0,
        lastSnapshotSeq: -1,
        lastSpikeWarnAtMs: 0,
        spikeCount: 0,
        wallClampCount: 0,
    });

    const audioListenerRef = useRef<THREE.AudioListener | null>(null);
    const carModelGltfs = useLoader(
        GLTFLoader,
        CAR_MODEL_CATALOG.map((carModel) => carModel.modelPath)
    ) as GLTF[];
    const engineAudioBuffer = useLoader(THREE.AudioLoader, '/engine.mp3');
    const accelerateAudioBuffer = useLoader(THREE.AudioLoader, '/accelerate.mp3');
    const drivingAudioBuffer = useLoader(THREE.AudioLoader, '/driving-loop.wav');
    const brakeAudioBuffer = useLoader(THREE.AudioLoader, '/brake.mp3');
    const carModelVariants = useMemo(() => {
        return carModelGltfs.map((carModelGltf, index) => ({
            scene: carModelGltf.scene,
            yawOffsetRadians: CAR_MODEL_CATALOG[index]?.modelYawOffsetRadians ?? 0,
        }));
    }, [carModelGltfs]);
    const carAssets = useMemo<CarAssets>(
        () => ({
            accelerate: accelerateAudioBuffer,
            brake: brakeAudioBuffer,
            driving: drivingAudioBuffer,
            engine: engineAudioBuffer,
        }),
        [accelerateAudioBuffer, brakeAudioBuffer, drivingAudioBuffer, engineAudioBuffer]
    );

    const isRunningRef = useRef(false);
    const connectionStatusRef = useRef<ConnectionStatus>('connecting');
    const networkUpdateTimerRef = useRef(0);
    const [sceneEnvironmentId, setSceneEnvironmentId] = useState(DEFAULT_SCENE_ENVIRONMENT_ID);
    const activeSceneEnvironment = useMemo(
        () => getSceneEnvironmentProfile(sceneEnvironmentId),
        [sceneEnvironmentId]
    );

    const cameraOffsetRef = useRef(new THREE.Vector3());
    const desiredCameraPositionRef = useRef(new THREE.Vector3());
    const lookTargetRef = useRef(new THREE.Vector3());
    const lookAheadRef = useRef(new THREE.Vector3(0, 0, 10));
    const rotatedLookAheadRef = useRef(new THREE.Vector3());
    const worldUpRef = useRef(new THREE.Vector3(0, 1, 0));
    const cameraDeltaRef = useRef(new THREE.Vector3());
    const carBoundingBoxRef = useRef(new THREE.Box3());
    const obstacleBoundingBoxRef = useRef(new THREE.Box3());
    const carCollisionCenterRef = useRef(new THREE.Vector3());
    const carCollisionSizeRef = useRef(new THREE.Vector3(2.4, 1.8, 4.8));

    const applyTrackPresentation = useCallback((trackId: string) => {
        const trackManifest = getTrackManifestById(trackId);
        activeTrackIdRef.current = trackManifest.id;
        setSceneEnvironmentId(getSceneEnvironmentProfileIdForTrackTheme(trackManifest.themeId));
        useHudStore.getState().setTrackLabel(trackManifest.label);
        return trackManifest.id;
    }, []);

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

    useEffect(() => {
        diagnosticsEnabledRef.current = parseDiagnosticsFlag();
        diagnosticsVerboseConsoleRef.current = parseDiagnosticsVerboseFlag();
        diagCaptureRef.current = createDiagCaptureState();

        const debugWindow = window as Window & {
            __GT_DEBUG__?: {
                getState: () => GTDebugState;
            };
            __GT_DIAG__?: {
                clearReport: () => void;
                disable: () => void;
                downloadReport: () => void;
                enable: () => void;
            };
        };

        debugWindow.__GT_DEBUG__ = {
            getState: () => ({
                connectionStatus: connectionStatusRef.current,
                isRunning: isRunningRef.current,
                localCarX: localCarRef.current?.position.x ?? null,
                localCarZ: localCarRef.current?.position.z ?? null,
                opponentCount: opponentsRef.current.size,
                roomId: networkManagerRef.current?.roomId ?? null,
                speedKph: useHudStore.getState().speedKph,
            }),
        };
        debugWindow.__GT_DIAG__ = {
            clearReport: () => {
                diagCaptureRef.current = createDiagCaptureState();
                console.info('[diag] cleared report buffer');
            },
            disable: () => {
                diagnosticsEnabledRef.current = false;
                window.localStorage.setItem('gt-diag', 'false');
                console.info('[diag] disabled');
            },
            downloadReport: () => {
                const capture = diagCaptureRef.current;
                const nowMs = Date.now();
                const durationMs = Math.max(1, nowMs - capture.sessionStartedAtMs);
                const averageFps = capture.fpsSampleCount > 0 ? capture.fpsSum / capture.fpsSampleCount : 0;
                const snapshotAgeAverageMs =
                    capture.snapshotAgeCount > 0
                        ? capture.snapshotAgeSumMs / capture.snapshotAgeCount
                        : 0;
                const fpsMin =
                    capture.fpsSampleCount > 0
                        ? capture.fpsMin
                        : 0;
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
                const spikeLines = capture.spikeSamples.map((sample) => {
                    return JSON.stringify({
                        cameraJumpMeters: sample.cameraJumpMeters,
                        cameraMotionMeters: sample.cameraMotionMeters,
                        correctionMode: sample.correctionMode,
                        correctionPositionError: sample.correctionPositionError,
                        fps: sample.fps,
                        playerX: sample.playerX,
                        playerZ: sample.playerZ,
                        snapshotAgeMs: sample.snapshotAgeMs,
                        tMs: sample.tMs,
                    });
                });
                const frameLines = capture.frameSamples.map((sample) => {
                    return JSON.stringify(sample);
                });
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
            },
            enable: () => {
                diagnosticsEnabledRef.current = true;
                window.localStorage.setItem('gt-diag', 'true');
                console.info('[diag] enabled');
            },
        };

        if (diagnosticsEnabledRef.current) {
            console.info('[diag] enabled via ?diag=1 or localStorage gt-diag=true');
        }

        return () => {
            delete debugWindow.__GT_DEBUG__;
            delete debugWindow.__GT_DIAG__;
        };
    }, []);

    useEffect(() => {
        diagnosticsRef.current.lastCameraPosition.copy(camera.position);
    }, [camera]);

    useEffect(() => {
        inputManager.setCruiseControlEnabled(cruiseControlEnabled);
    }, [cruiseControlEnabled, inputManager]);

    useEffect(() => {
        return () => {
            inputManager.dispose();
        };
    }, [inputManager]);

    useEffect(() => {
        const listener = new THREE.AudioListener();
        camera.add(listener);
        audioListenerRef.current = listener;

        const resumeAudio = () => {
            if (listener.context.state === 'suspended') {
                void listener.context.resume();
            }
        };

        window.addEventListener('keydown', resumeAudio, { once: true });
        window.addEventListener('click', resumeAudio, { once: true });

        return () => {
            camera.remove(listener);
            audioListenerRef.current = null;
            window.removeEventListener('keydown', resumeAudio);
            window.removeEventListener('click', resumeAudio);
        };
    }, [camera]);

    useEffect(() => {
        const networkManager = new NetworkManager(playerName, roomId, {
            protocolVersion: PROTOCOL_V2,
        });
        networkManagerRef.current = networkManager;

        const unsubscribeConnectionStatus = networkManager.onConnectionStatus((status) => {
            connectionStatusRef.current = status;
            useRuntimeStore.getState().setConnectionStatus(status);
            onConnectionStatusChange(status);
        });

        const clearCars = () => {
            if (localCarRef.current) {
                localCarRef.current.dispose();
                localCarRef.current = null;
            }

            opponentsRef.current.forEach((opponentCar) => {
                opponentCar.dispose();
            });
            opponentsRef.current.clear();
            opponentInterpolationBuffersRef.current.clear();
        };

        const createOpponent = (player: PlayerState) => {
            if (opponentsRef.current.has(player.id)) {
                return;
            }

            const modelIndex = playerIdToVehicleIndex(player.id, carModelVariants.length);
            const modelVariant = carModelVariants[modelIndex];

            const opponentCar = new Car(
                scene,
                null,
                playerIdToHue(player.id),
                audioListenerRef.current ?? undefined,
                carAssets,
                modelVariant.scene,
                modelVariant.yawOffsetRadians,
                player.name
            );

            opponentCar.isLocalPlayer = false;
            opponentCar.position.set(player.x, player.y, player.z);
            opponentCar.rotationY = player.rotationY;
            opponentCar.targetPosition.set(player.x, player.y, player.z);
            opponentCar.targetRotationY = player.rotationY;

            opponentsRef.current.set(player.id, opponentCar);
            opponentInterpolationBuffersRef.current.set(
                player.id,
                createInterpolationBuffer<OpponentInterpolationState>()
            );
        };

        const removeOpponent = (playerId: string) => {
            const opponentCar = opponentsRef.current.get(playerId);
            if (!opponentCar) {
                return;
            }

            opponentCar.dispose();
            opponentsRef.current.delete(playerId);
            opponentInterpolationBuffersRef.current.delete(playerId);
        };

        networkManager.onRoomJoined((seed, players, roomJoinedPayload) => {
            shakeSpikeGraceUntilMsRef.current = Date.now() + SHAKE_SPIKE_GRACE_PERIOD_MS;
            const snapshotTrackId = roomJoinedPayload.snapshot?.raceState.trackId ?? activeTrackIdRef.current;
            const selectedTrackId = applyTrackPresentation(snapshotTrackId);
            trackManagerRef.current?.dispose();
            trackManagerRef.current = new TrackManager(scene, seed, selectedTrackId);

            clearCars();
            localInterpolationBufferRef.current = createInterpolationBuffer<OpponentInterpolationState>();

            const socketId = roomJoinedPayload.localPlayerId ?? networkManager.getSocketId();
            useRuntimeStore.getState().setLocalPlayerId(socketId);

            for (const player of players) {
                if (player.id === socketId) {
                    const modelIndex = playerIdToVehicleIndex(player.id, carModelVariants.length);
                    const modelVariant = carModelVariants[modelIndex];
                    localCarRef.current = new Car(
                        scene,
                        inputManager,
                        playerIdToHue(player.id),
                        audioListenerRef.current ?? undefined,
                        carAssets,
                        modelVariant.scene,
                        modelVariant.yawOffsetRadians,
                        player.name
                    );
                    // Local visuals follow the authoritative stream; input is still sent over the network.
                    localCarRef.current.isLocalPlayer = false;
                    localCarRef.current.position.set(player.x, player.y, player.z);
                    localCarRef.current.rotationY = player.rotationY;
                    localCarRef.current.targetPosition.set(player.x, player.y, player.z);
                    localCarRef.current.targetRotationY = player.rotationY;
                    continue;
                }

                createOpponent(player);
            }

            localInputSequenceRef.current = 0;
            cruiseLatchActiveRef.current = false;
            latestLocalSnapshotRef.current = null;
            latestLocalSnapshotSeqRef.current = null;
            lastReconciledSnapshotSeqRef.current = null;
            hasLocalAuthoritativeTargetRef.current = false;
            lastCorrectionRef.current = null;
            networkUpdateTimerRef.current = 0;
            onRaceStateChange(null);
            onGameOverChange(false);
            isRunningRef.current = true;
            useHudStore.getState().setSpeedKph(0);
            diagnosticsRef.current.lastCameraPosition.copy(camera.position);
        });

        networkManager.onPlayerJoined((player) => {
            if (player.id === networkManager.getSocketId()) {
                return;
            }

            createOpponent(player);
        });

        networkManager.onPlayerLeft((playerId) => {
            removeOpponent(playerId);
        });

        networkManager.onServerSnapshot((snapshot) => {
            useRuntimeStore.getState().applySnapshot(snapshot);
            onRaceStateChange(snapshot.raceState);

            if (snapshot.raceState.trackId !== activeTrackIdRef.current) {
                const nextTrackId = applyTrackPresentation(snapshot.raceState.trackId);
                if (trackManagerRef.current) {
                    trackManagerRef.current.setTrack(nextTrackId);
                }
            }

            const localPlayerId = useRuntimeStore.getState().localPlayerId;
            if (!localPlayerId) {
                return;
            }

            const localSnapshotPlayer = snapshot.players.find((player) => player.id === localPlayerId) ?? null;
            latestLocalSnapshotRef.current = localSnapshotPlayer;
            latestLocalSnapshotSeqRef.current = localSnapshotPlayer ? snapshot.seq : null;
            lastSnapshotReceivedAtMsRef.current = Date.now();

            const localCar = localCarRef.current;
            if (localCar && localSnapshotPlayer) {
                pushInterpolationSample(localInterpolationBufferRef.current, {
                    sequence: snapshot.seq,
                    state: {
                        rotationY: localSnapshotPlayer.rotationY,
                        x: localSnapshotPlayer.x,
                        y: localSnapshotPlayer.y,
                        z: localSnapshotPlayer.z,
                    },
                    timeMs: snapshot.serverTimeMs,
                });
                localCar.targetPosition.set(localSnapshotPlayer.x, localSnapshotPlayer.y, localSnapshotPlayer.z);
                localCar.targetRotationY = localSnapshotPlayer.rotationY;
                if (!hasLocalAuthoritativeTargetRef.current) {
                    hasLocalAuthoritativeTargetRef.current = true;
                    localCar.position.copy(localCar.targetPosition);
                    localCar.rotationY = localCar.targetRotationY;
                    localCar.mesh.position.copy(localCar.position);
                    localCar.mesh.rotation.y = localCar.rotationY;
                }
            }

            for (const snapshotPlayer of snapshot.players) {
                if (snapshotPlayer.id === localPlayerId) {
                    continue;
                }

                if (!opponentsRef.current.has(snapshotPlayer.id)) {
                    createOpponent(snapshotPlayer);
                }

                const interpolationBuffer = opponentInterpolationBuffersRef.current.get(snapshotPlayer.id);
                if (!interpolationBuffer) {
                    continue;
                }

                pushInterpolationSample(interpolationBuffer, {
                    sequence: snapshot.seq,
                    state: {
                        rotationY: snapshotPlayer.rotationY,
                        x: snapshotPlayer.x,
                        y: snapshotPlayer.y,
                        z: snapshotPlayer.z,
                    },
                    timeMs: snapshot.serverTimeMs,
                });
            }

            if (localSnapshotPlayer) {
                const racePosition = snapshot.raceState.playerOrder.indexOf(localSnapshotPlayer.id);
                useHudStore.getState().setLap(localSnapshotPlayer.progress.lap + 1);
                useHudStore.getState().setPosition(racePosition >= 0 ? racePosition + 1 : 1);
                useHudStore
                    .getState()
                    .setActiveEffectIds(localSnapshotPlayer.activeEffects.map((effect) => effect.effectType));
            }

            if (snapshot.raceState.status === 'finished' && isRunningRef.current) {
                isRunningRef.current = false;
                onGameOverChange(true);
            }
        });

        return () => {
            isRunningRef.current = false;
            trackManagerRef.current?.dispose();
            trackManagerRef.current = null;
            clearCars();
            unsubscribeConnectionStatus();
            connectionStatusRef.current = 'disconnected';
            onConnectionStatusChange('disconnected');
            onRaceStateChange(null);
            useRuntimeStore.getState().setConnectionStatus('disconnected');
            useRuntimeStore.getState().setLocalPlayerId(null);
            networkManager.disconnect();
            networkManagerRef.current = null;
        };
    }, [
        applyTrackPresentation,
        carAssets,
        carModelVariants,
        camera,
        inputManager,
        onConnectionStatusChange,
        onGameOverChange,
        onRaceStateChange,
        playerName,
        roomId,
        scene,
    ]);

    useEffect(() => {
        if (resetNonce === 0) {
            return;
        }

        const localCar = localCarRef.current;
        const trackManager = trackManagerRef.current;

        if (!localCar || !trackManager) {
            return;
        }

        const networkManager = networkManagerRef.current;
        networkManager?.emitRestartRace();

        localCar.reset();
        trackManager.reset();
        localInterpolationBufferRef.current = createInterpolationBuffer<OpponentInterpolationState>();

        localInputSequenceRef.current = 0;
        cruiseLatchActiveRef.current = false;
        latestLocalSnapshotRef.current = null;
        latestLocalSnapshotSeqRef.current = null;
        lastReconciledSnapshotSeqRef.current = null;
        hasLocalAuthoritativeTargetRef.current = false;
        lastCorrectionRef.current = null;
        networkUpdateTimerRef.current = 0;
        onRaceStateChange(null);
        onGameOverChange(false);
        isRunningRef.current = true;
        useHudStore.getState().setSpeedKph(0);
        shakeSpikeGraceUntilMsRef.current = Date.now() + SHAKE_SPIKE_GRACE_PERIOD_MS;
        diagnosticsRef.current.lastCameraPosition.copy(camera.position);
    }, [camera, onGameOverChange, onRaceStateChange, resetNonce]);

    useFrame((_, dt) => {
        const localCar = localCarRef.current;
        const trackManager = trackManagerRef.current;
        const networkManager = networkManagerRef.current;

        if (!localCar || !trackManager || !networkManager) {
            return;
        }

        const localSnapshot = latestLocalSnapshotRef.current;
        const nowMs = Date.now();

        const localInterpolatedState = sampleInterpolationBuffer(
            localInterpolationBufferRef.current,
            nowMs - clientConfig.interpolationDelayMs,
            (from, to, alpha) => ({
                rotationY: from.rotationY + (to.rotationY - from.rotationY) * alpha,
                x: from.x + (to.x - from.x) * alpha,
                y: from.y + (to.y - from.y) * alpha,
                z: from.z + (to.z - from.z) * alpha,
            })
        );
        if (localInterpolatedState) {
            localCar.targetPosition.set(localInterpolatedState.x, localInterpolatedState.y, localInterpolatedState.z);
            localCar.targetRotationY = localInterpolatedState.rotationY;
        } else if (localSnapshot) {
            localCar.targetPosition.set(localSnapshot.x, localSnapshot.y, localSnapshot.z);
            localCar.targetRotationY = localSnapshot.rotationY;
        }
        localCar.update(dt);

        if (isRunningRef.current) {
            const clampedX = THREE.MathUtils.clamp(
                localCar.position.x,
                -LOCAL_TRACK_BOUNDARY_X_METERS,
                LOCAL_TRACK_BOUNDARY_X_METERS
            );
            if (Math.abs(clampedX - localCar.position.x) > 0.0001) {
                localCar.position.x = clampedX;
                localCar.mesh.position.x = clampedX;
                diagnosticsRef.current.wallClampCount += 1;
                diagnosticsRef.current.lastWallClampX = clampedX;
            }
        }

        for (const [playerId, opponentCar] of opponentsRef.current) {
            const interpolationBuffer = opponentInterpolationBuffersRef.current.get(playerId);
            if (!interpolationBuffer) {
                continue;
            }

            const interpolatedState = sampleInterpolationBuffer(
                interpolationBuffer,
                nowMs - clientConfig.interpolationDelayMs,
                (from, to, alpha) => ({
                    rotationY: from.rotationY + (to.rotationY - from.rotationY) * alpha,
                    x: from.x + (to.x - from.x) * alpha,
                    y: from.y + (to.y - from.y) * alpha,
                    z: from.z + (to.z - from.z) * alpha,
                })
            );

            if (!interpolatedState) {
                continue;
            }

            opponentCar.targetPosition.set(interpolatedState.x, interpolatedState.y, interpolatedState.z);
            opponentCar.targetRotationY = interpolatedState.rotationY;
        }

        opponentsRef.current.forEach((opponentCar) => opponentCar.update(dt));

        if (localSnapshot) {
            const snapshotSeq = latestLocalSnapshotSeqRef.current;
            if (snapshotSeq !== null && snapshotSeq !== lastReconciledSnapshotSeqRef.current) {
                lastReconciledSnapshotSeqRef.current = snapshotSeq;
                const inputLead = Math.max(
                    0,
                    localInputSequenceRef.current - Math.max(localSnapshot.lastProcessedInputSeq, 0)
                );
                const positionError = Math.hypot(localCar.position.x - localSnapshot.x, localCar.position.z - localSnapshot.z);
                const yawError = Math.abs(
                    Math.atan2(
                        Math.sin(localSnapshot.rotationY - localCar.rotationY),
                        Math.cos(localSnapshot.rotationY - localCar.rotationY)
                    )
                );
                lastCorrectionRef.current = {
                    appliedPositionDelta: 0,
                    inputLead,
                    mode: 'none',
                    positionError,
                    sequence: snapshotSeq,
                    yawError,
                };
            }
            useHudStore.getState().setSpeedKph(Math.max(0, localSnapshot.speed * 3.6));
        } else {
            useHudStore
                .getState()
                .setSpeedKph(Math.max(0, localCar.position.distanceTo(localCar.targetPosition) * 36));
        }

        if (isRunningRef.current) {
            carCollisionCenterRef.current.set(
                localCar.position.x,
                localCar.position.y + 0.9,
                localCar.position.z
            );
            carBoundingBoxRef.current.setFromCenterAndSize(
                carCollisionCenterRef.current,
                carCollisionSizeRef.current
            );
            const carBounds = createBoundsFromCenterAndSize(
                carCollisionCenterRef.current,
                carCollisionSizeRef.current
            );

            const obstacles = trackManager.getActiveObstacles();
            for (const obstacle of obstacles) {
                obstacleBoundingBoxRef.current.setFromObject(obstacle);
                const obstacleBounds = toAxisAlignedBounds(obstacleBoundingBoxRef.current);
                if (!intersectsAxisAlignedBounds(carBounds, obstacleBounds)) {
                    continue;
                }

                isRunningRef.current = false;
                onGameOverChange(true);
                break;
            }

            networkUpdateTimerRef.current += dt;
            if (networkUpdateTimerRef.current >= NETWORK_TICK_RATE_SECONDS) {
                const isUpPressed = inputManager.isKeyPressed('KeyW') || inputManager.isKeyPressed('ArrowUp');
                const isDownPressed = inputManager.isKeyPressed('KeyS') || inputManager.isKeyPressed('ArrowDown');
                const isLeftPressed = inputManager.isKeyPressed('KeyA') || inputManager.isKeyPressed('ArrowLeft');
                const isRightPressed = inputManager.isKeyPressed('KeyD') || inputManager.isKeyPressed('ArrowRight');
                const isPrecisionOverrideActive = inputManager.isPrecisionOverrideActive();
                const currentSpeed = localSnapshot?.speed ?? 0;
                const maxForwardSpeed =
                    getVehicleClassManifestById(localSnapshot?.vehicleId ?? 'sport').physics.maxForwardSpeed;
                const throttleInput = resolveThrottleInput({
                    cruiseControlEnabled: inputManager.isCruiseControlEnabled(),
                    currentSpeed,
                    isDownPressed,
                    isPrecisionOverrideActive,
                    isUpPressed,
                    maxForwardSpeed,
                    previousCruiseLatchActive: cruiseLatchActiveRef.current,
                });
                cruiseLatchActiveRef.current = throttleInput.cruiseLatchActive;

                localInputSequenceRef.current += 1;
                networkManager.emitInputFrame({
                    ackSnapshotSeq: useRuntimeStore.getState().lastAckedSnapshotSeq,
                    controls: {
                        boost: inputManager.isKeyPressed('Space'),
                        brake: false,
                        handbrake: isPrecisionOverrideActive,
                        steering: resolveSteeringInput({
                            isLeftPressed,
                            isRightPressed,
                        }),
                        throttle: throttleInput.throttle,
                    },
                    cruiseControlEnabled: inputManager.isCruiseControlEnabled(),
                    precisionOverrideActive: isPrecisionOverrideActive,
                    protocolVersion: PROTOCOL_V2,
                    seq: localInputSequenceRef.current,
                    timestampMs: nowMs,
                });
                networkUpdateTimerRef.current = 0;
            }
        }

        trackManager.update(localCar.position.z);

        const dirLight = dirLightRef.current;
        if (dirLight) {
            dirLight.position.x = localCar.position.x + activeSceneEnvironment.sunLight.followOffset[0];
            dirLight.position.y = localCar.position.y + activeSceneEnvironment.sunLight.followOffset[1];
            dirLight.position.z = localCar.position.z + activeSceneEnvironment.sunLight.followOffset[2];
            dirLight.target = localCar.mesh;
        }

        cameraOffsetRef.current.set(0, 30, -30);
        cameraOffsetRef.current.applyAxisAngle(worldUpRef.current, localCar.rotationY);
        desiredCameraPositionRef.current.copy(localCar.position).add(cameraOffsetRef.current);
        cameraDeltaRef.current.subVectors(desiredCameraPositionRef.current, camera.position);
        diagnosticsRef.current.lastCameraJumpMeters = cameraDeltaRef.current.length();
        diagnosticsRef.current.cameraMotionMeters = camera.position.distanceTo(diagnosticsRef.current.lastCameraPosition);
        diagnosticsRef.current.lastCameraPosition.copy(camera.position);
        camera.position.lerp(desiredCameraPositionRef.current, 0.1);

        lookTargetRef.current.copy(localCar.position);
        rotatedLookAheadRef.current.copy(lookAheadRef.current);
        rotatedLookAheadRef.current.applyAxisAngle(worldUpRef.current, localCar.rotationY);
        lookTargetRef.current.add(rotatedLookAheadRef.current);
        camera.lookAt(lookTargetRef.current);

        const now = Date.now();
        if (now - diagnosticsRef.current.lastLogAtMs >= DIAGNOSTIC_LOG_INTERVAL_MS) {
            diagnosticsRef.current.lastLogAtMs = now;
            const capture = diagCaptureRef.current;
            const lastSnapshotAgeMs =
                lastSnapshotReceivedAtMsRef.current === null
                    ? null
                    : now - lastSnapshotReceivedAtMsRef.current;
            const correction = lastCorrectionRef.current;
            const instantaneousFps = dt > 0 ? Math.round(1 / dt) : 0;
            diagnosticsRef.current.lastFps = instantaneousFps;
            const localSpeedKph = Math.round(
                Math.max(
                    0,
                    localSnapshot?.speed !== undefined
                        ? localSnapshot.speed * 3.6
                        : localCar.position.distanceTo(localCar.targetPosition) * 36
                )
            );
            const snapshotSpeedKph = Math.round(Math.max(0, (localSnapshot?.speed ?? 0) * 3.6));
            capture.framesCaptured += 1;
            capture.fpsSampleCount += 1;
            capture.fpsSum += instantaneousFps;
            capture.fpsMin = Math.min(capture.fpsMin, instantaneousFps);
            capture.fpsMax = Math.max(capture.fpsMax, instantaneousFps);
            capture.speedKphMax = Math.max(capture.speedKphMax, localSpeedKph);
            capture.wallClampCount = diagnosticsRef.current.wallClampCount;
            capture.correctionPositionErrorMaxMeters = Math.max(
                capture.correctionPositionErrorMaxMeters,
                correction?.positionError ?? 0
            );
            if (lastSnapshotAgeMs !== null) {
                capture.snapshotAgeCount += 1;
                capture.snapshotAgeSumMs += lastSnapshotAgeMs;
                capture.snapshotAgeMaxMs = Math.max(capture.snapshotAgeMaxMs, lastSnapshotAgeMs);
            }
            const frameSample: DiagFrameSample = {
                cameraJumpMeters: Number(diagnosticsRef.current.lastCameraJumpMeters.toFixed(4)),
                correctionMode: correction?.mode ?? 'none',
                correctionPositionError: Number((correction?.positionError ?? 0).toFixed(4)),
                fps: instantaneousFps,
                playerX: Number(localCar.position.x.toFixed(4)),
                playerZ: Number(localCar.position.z.toFixed(4)),
                speedKph: localSpeedKph,
                tMs: now,
            };
            capture.frameSamples.push(frameSample);
            if (capture.frameSamples.length > DIAG_MAX_FRAME_SAMPLES) {
                capture.frameSamples.shift();
            }

            if (latestLocalSnapshotSeqRef.current !== diagnosticsRef.current.lastSnapshotSeq) {
                diagnosticsRef.current.lastSnapshotSeq = latestLocalSnapshotSeqRef.current ?? -1;
                if (diagnosticsEnabledRef.current && diagnosticsVerboseConsoleRef.current) {
                    console.debug('[diag][snapshot]', {
                        lastProcessedInputSeq: localSnapshot?.lastProcessedInputSeq ?? null,
                        seq: diagnosticsRef.current.lastSnapshotSeq,
                        serverSpeedKph: snapshotSpeedKph,
                        snapshotAgeMs: lastSnapshotAgeMs,
                    });
                }
            }

            if (diagnosticsEnabledRef.current && diagnosticsVerboseConsoleRef.current) {
                console.debug('[diag][frame]', {
                    cameraMotionMeters: Number(diagnosticsRef.current.cameraMotionMeters.toFixed(4)),
                    cameraJumpMeters: Number(diagnosticsRef.current.lastCameraJumpMeters.toFixed(4)),
                    correctionCount: diagnosticsRef.current.correctionCount,
                    correctionDeferredCount: diagnosticsRef.current.correctionDeferredCount,
                    correctionHardCount: diagnosticsRef.current.correctionHardCount,
                    correctionInputLead: correction?.inputLead ?? 0,
                    correctionMode: correction?.mode ?? 'none',
                    correctionPositionApplied: Number((correction?.appliedPositionDelta ?? 0).toFixed(4)),
                    correctionPositionError: Number((correction?.positionError ?? 0).toFixed(4)),
                    correctionSeq: correction?.sequence ?? null,
                    correctionSoftCount: diagnosticsRef.current.correctionSoftCount,
                    correctionYawError: Number((correction?.yawError ?? 0).toFixed(4)),
                    fps: instantaneousFps,
                    localSpeedKph,
                    playerRotationY: Number(localCar.rotationY.toFixed(4)),
                    playerX: Number(localCar.position.x.toFixed(4)),
                    playerZ: Number(localCar.position.z.toFixed(4)),
                    snapshotAgeMs: lastSnapshotAgeMs,
                    snapshotSpeedKph,
                    spikeCount: diagnosticsRef.current.spikeCount,
                    wallClampCount: diagnosticsRef.current.wallClampCount,
                });
            }
        }

        const instantaneousFps = dt > 0 ? Math.round(1 / dt) : 0;
        const isShakeSpike =
            diagnosticsRef.current.lastCameraJumpMeters >= SHAKE_SPIKE_CAMERA_JUMP_METERS ||
            instantaneousFps <= SHAKE_SPIKE_FPS_THRESHOLD;
        if (
            nowMs >= shakeSpikeGraceUntilMsRef.current &&
            isShakeSpike &&
            nowMs - diagnosticsRef.current.lastSpikeWarnAtMs >= SHAKE_SPIKE_WARN_INTERVAL_MS
        ) {
            diagnosticsRef.current.lastSpikeWarnAtMs = nowMs;
            diagnosticsRef.current.spikeCount += 1;
            const spike: DiagSpikeSample = {
                cameraJumpMeters: Number(diagnosticsRef.current.lastCameraJumpMeters.toFixed(4)),
                cameraMotionMeters: Number(diagnosticsRef.current.cameraMotionMeters.toFixed(4)),
                correctionMode: lastCorrectionRef.current?.mode ?? 'none',
                correctionPositionError: Number((lastCorrectionRef.current?.positionError ?? 0).toFixed(4)),
                fps: instantaneousFps,
                playerX: Number(localCar.position.x.toFixed(2)),
                playerZ: Number(localCar.position.z.toFixed(2)),
                snapshotAgeMs:
                    lastSnapshotReceivedAtMsRef.current === null
                        ? null
                        : nowMs - lastSnapshotReceivedAtMsRef.current,
                tMs: nowMs,
            };
            const capture = diagCaptureRef.current;
            capture.spikeCount += 1;
            capture.spikeSamples.push(spike);
            if (capture.spikeSamples.length > DIAG_MAX_SPIKE_SAMPLES) {
                capture.spikeSamples.shift();
            }
            if (diagnosticsVerboseConsoleRef.current) {
                console.warn('[diag][shake-spike]', {
                    ...spike,
                    correctionInputLead: lastCorrectionRef.current?.inputLead ?? 0,
                    wallClampCount: diagnosticsRef.current.wallClampCount,
                    wallClampX: Number(diagnosticsRef.current.lastWallClampX.toFixed(4)),
                });
            }
        }
    });

    return (
        <>
            <SceneEnvironment profileId={sceneEnvironmentId} sunLightRef={dirLightRef} />
        </>
    );
};
