import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clientConfig } from '@/client/app/config';
import { CAR_MODEL_CATALOG } from '@/client/game/assets/carModelCatalog';
import { useHudStore } from '@/client/game/state/hudStore';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';
import {
    createInterpolationBuffer,
    pushInterpolationSample,
    sampleInterpolationBuffer,
    type InterpolationBuffer,
} from '@/client/game/systems/interpolationSystem';
import { reconcileMotionState } from '@/client/game/systems/reconciliationSystem';
import { playerIdToHue } from '@/shared/game/playerColor';
import { playerIdToVehicleIndex } from '@/shared/game/playerVehicle';
import { PROTOCOL_V1, PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import type { ConnectionStatus, PlayerState, SnapshotPlayerState } from '@/shared/network/types';
import { NetworkManager } from '@/client/network/NetworkManager';
import { Car, type CarAssets } from '@/client/game/entities/Car';
import { RacePhysicsWorld } from '@/client/game/scene/RacePhysicsWorld';
import { SceneEnvironment } from '@/client/game/scene/environment/SceneEnvironment';
import {
    DEFAULT_SCENE_ENVIRONMENT_ID,
    getSceneEnvironmentProfile,
} from '@/client/game/scene/environment/sceneEnvironmentProfiles';
import { InputManager } from '@/client/game/systems/InputManager';
import { TrackManager } from '@/client/game/systems/TrackManager';

type RaceWorldProps = {
    cruiseControlEnabled: boolean;
    onConnectionStatusChange: (status: ConnectionStatus) => void;
    resetNonce: number;
    onScoreChange: (score: number) => void;
    onGameOverChange: (isGameOver: boolean) => void;
    playerName: string;
    roomId: string;
};

type GTDebugState = {
    isRunning: boolean;
    localCarZ: number | null;
    localCarX: number | null;
    opponentCount: number;
    connectionStatus: ConnectionStatus;
    roomId: string | null;
    score: number;
};

const NETWORK_TICK_RATE_SECONDS = 1 / 20;
const TRACK_BOUNDARY_X = 38;
const MINIMUM_CAR_SEPARATION = 3.2;
const ACTIVE_SCENE_ENVIRONMENT = getSceneEnvironmentProfile(DEFAULT_SCENE_ENVIRONMENT_ID);
const GAMEPLAY_V2_ENABLED = clientConfig.gameplayV2 || clientConfig.protocolV2Required;

type OpponentInterpolationState = {
    rotationY: number;
    x: number;
    y: number;
    z: number;
};

export const RaceWorld = ({
    cruiseControlEnabled,
    onConnectionStatusChange,
    resetNonce,
    onScoreChange,
    onGameOverChange,
    playerName,
    roomId,
}: RaceWorldProps) => {
    const { scene, camera } = useThree();

    const inputManager = useMemo(() => new InputManager(), []);

    const dirLightRef = useRef<THREE.DirectionalLight>(null);

    const networkManagerRef = useRef<NetworkManager | null>(null);
    const trackManagerRef = useRef<TrackManager | null>(null);
    const currentTrackLengthRef = useRef(900);
    const localCarRef = useRef<Car | null>(null);
    const opponentsRef = useRef<Map<string, Car>>(new Map());
    const opponentInterpolationBuffersRef = useRef<Map<string, InterpolationBuffer<OpponentInterpolationState>>>(new Map());
    const localInputSequenceRef = useRef(0);
    const latestLocalSnapshotRef = useRef<SnapshotPlayerState | null>(null);

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
    const scoreRef = useRef(0);
    const networkUpdateTimerRef = useRef(0);

    const carBoundingBoxRef = useRef(new THREE.Box3());
    const carCollisionCenterRef = useRef(new THREE.Vector3());
    const carCollisionSizeRef = useRef(new THREE.Vector3(2.4, 1.8, 4.8));
    const obstacleBoundingBoxRef = useRef(new THREE.Box3());

    const cameraOffsetRef = useRef(new THREE.Vector3());
    const desiredCameraPositionRef = useRef(new THREE.Vector3());
    const lookTargetRef = useRef(new THREE.Vector3());
    const lookAheadRef = useRef(new THREE.Vector3(0, 0, 10));
    const rotatedLookAheadRef = useRef(new THREE.Vector3());
    const worldUpRef = useRef(new THREE.Vector3(0, 1, 0));
    const previousFramePositionRef = useRef(new THREE.Vector3());

    useEffect(() => {
        const debugWindow = window as Window & {
            __GT_DEBUG__?: {
                getState: () => GTDebugState;
            };
        };

        debugWindow.__GT_DEBUG__ = {
            getState: () => ({
                isRunning: isRunningRef.current,
                connectionStatus: connectionStatusRef.current,
                localCarX: localCarRef.current?.position.x ?? null,
                localCarZ: localCarRef.current?.position.z ?? null,
                opponentCount: opponentsRef.current.size,
                roomId: networkManagerRef.current?.roomId ?? null,
                score: scoreRef.current,
            }),
        };

        return () => {
            delete debugWindow.__GT_DEBUG__;
        };
    }, []);

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
            gameplayV2: GAMEPLAY_V2_ENABLED,
            protocolVersion: GAMEPLAY_V2_ENABLED ? PROTOCOL_V2 : PROTOCOL_V1,
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
        };

        const createOpponent = (player: PlayerState) => {
            if (opponentsRef.current.has(player.id)) return;
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
            opponentInterpolationBuffersRef.current.set(player.id, createInterpolationBuffer<OpponentInterpolationState>());
        };

        const removeOpponent = (playerId: string) => {
            const opponentCar = opponentsRef.current.get(playerId);
            if (!opponentCar) return;

            opponentCar.dispose();
            opponentsRef.current.delete(playerId);
            opponentInterpolationBuffersRef.current.delete(playerId);
        };

        networkManager.onRoomJoined((seed, players, roomJoinedPayload) => {
            trackManagerRef.current?.dispose();
            trackManagerRef.current = new TrackManager(scene, seed);
            currentTrackLengthRef.current = trackManagerRef.current.getTrackLengthMeters();

            clearCars();

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
                    localCarRef.current.position.set(player.x, player.y, player.z);
                    localCarRef.current.rotationY = player.rotationY;
                    localCarRef.current.targetPosition.set(player.x, player.y, player.z);
                    localCarRef.current.targetRotationY = player.rotationY;
                    previousFramePositionRef.current.copy(localCarRef.current.position);
                    continue;
                }

                createOpponent(player);
            }

            scoreRef.current = 0;
            localInputSequenceRef.current = 0;
            latestLocalSnapshotRef.current = null;
            networkUpdateTimerRef.current = 0;
            onScoreChange(0);
            onGameOverChange(false);
            isRunningRef.current = true;
            useHudStore.getState().setSpeedKph(0);
        });

        networkManager.onPlayerJoined((player) => {
            if (player.id === networkManager.getSocketId()) return;
            createOpponent(player);
        });

        networkManager.onPlayerLeft((playerId) => {
            removeOpponent(playerId);
        });

        networkManager.onPlayerMoved((player) => {
            const opponentCar = opponentsRef.current.get(player.id);
            if (!opponentCar) return;

            opponentCar.targetPosition.set(player.x, player.y, player.z);
            opponentCar.targetRotationY = player.rotationY;
        });

        networkManager.onServerSnapshot((snapshot) => {
            useRuntimeStore.getState().applySnapshot(snapshot);
            const localPlayerId = useRuntimeStore.getState().localPlayerId;
            if (!localPlayerId) return;

            const localSnapshotPlayer = snapshot.players.find((player) => player.id === localPlayerId) ?? null;
            latestLocalSnapshotRef.current = localSnapshotPlayer;

            for (const snapshotPlayer of snapshot.players) {
                if (snapshotPlayer.id === localPlayerId) {
                    continue;
                }

                if (!opponentsRef.current.has(snapshotPlayer.id)) {
                    createOpponent(snapshotPlayer);
                }

                const interpolationBuffer = opponentInterpolationBuffersRef.current.get(snapshotPlayer.id);
                if (!interpolationBuffer) continue;

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
        });

        return () => {
            isRunningRef.current = false;
            trackManagerRef.current?.dispose();
            trackManagerRef.current = null;
            clearCars();
            unsubscribeConnectionStatus();
            connectionStatusRef.current = 'disconnected';
            onConnectionStatusChange('disconnected');
            useRuntimeStore.getState().setConnectionStatus('disconnected');
            useRuntimeStore.getState().setLocalPlayerId(null);
            networkManager.disconnect();
            networkManagerRef.current = null;
        };
    }, [
        carAssets,
        carModelVariants,
        inputManager,
        onConnectionStatusChange,
        onGameOverChange,
        onScoreChange,
        scene,
        playerName,
        roomId,
    ]);

    useEffect(() => {
        if (resetNonce === 0) return;

        const localCar = localCarRef.current;
        const trackManager = trackManagerRef.current;

        if (!localCar || !trackManager) return;

        localCar.reset();
        trackManager.reset();
        currentTrackLengthRef.current = trackManager.getTrackLengthMeters();

        if (!GAMEPLAY_V2_ENABLED) {
            networkManagerRef.current?.emitState(0, 0, 0, 0);
        }

        scoreRef.current = 0;
        localInputSequenceRef.current = 0;
        latestLocalSnapshotRef.current = null;
        networkUpdateTimerRef.current = 0;
        onScoreChange(0);
        onGameOverChange(false);
        isRunningRef.current = true;
        previousFramePositionRef.current.copy(localCar.position);
        useHudStore.getState().setSpeedKph(0);
    }, [onGameOverChange, onScoreChange, resetNonce]);

    const setGameOver = () => {
        if (!isRunningRef.current) return;
        isRunningRef.current = false;
        onGameOverChange(true);
    };

    useFrame((_, dt) => {
        if (!isRunningRef.current) return;

        const localCar = localCarRef.current;
        const trackManager = trackManagerRef.current;
        const networkManager = networkManagerRef.current;

        if (!localCar || !trackManager || !networkManager) return;

        localCar.update(dt);
        opponentsRef.current.forEach((opponentCar) => opponentCar.update(dt));

        for (const opponentCar of opponentsRef.current.values()) {
            const deltaX = localCar.position.x - opponentCar.position.x;
            const deltaZ = localCar.position.z - opponentCar.position.z;
            const distance = Math.hypot(deltaX, deltaZ);
            if (distance >= MINIMUM_CAR_SEPARATION) continue;

            if (distance > 0.0001) {
                const pushDistance = (MINIMUM_CAR_SEPARATION - distance) * 0.5;
                localCar.position.x += (deltaX / distance) * pushDistance;
                localCar.position.z += (deltaZ / distance) * pushDistance;
            } else {
                localCar.position.z -= MINIMUM_CAR_SEPARATION * 0.5;
            }

            localCar.mesh.position.copy(localCar.position);
        }

        const frameDistance = previousFramePositionRef.current.distanceTo(localCar.position);
        previousFramePositionRef.current.copy(localCar.position);
        const measuredSpeedKph = dt > 0 ? (frameDistance / dt) * 3.6 : 0;
        useHudStore.getState().setSpeedKph(Math.max(0, measuredSpeedKph));

        if (GAMEPLAY_V2_ENABLED) {
            const nowMs = Date.now();
            for (const [playerId, opponentCar] of opponentsRef.current) {
                const interpolationBuffer = opponentInterpolationBuffersRef.current.get(playerId);
                if (!interpolationBuffer) continue;

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

                if (!interpolatedState) continue;

                opponentCar.targetPosition.set(interpolatedState.x, interpolatedState.y, interpolatedState.z);
                opponentCar.targetRotationY = interpolatedState.rotationY;
            }

            const localSnapshot = latestLocalSnapshotRef.current;
            if (localSnapshot) {
                const reconciliation = reconcileMotionState(
                    {
                        positionX: localCar.position.x,
                        positionZ: localCar.position.z,
                        rotationY: localCar.rotationY,
                        speed: 0,
                    },
                    {
                        positionX: localSnapshot.x,
                        positionZ: localSnapshot.z,
                        rotationY: localSnapshot.rotationY,
                        speed: localSnapshot.speed,
                    },
                    {
                        positionThreshold: clientConfig.reconciliationPositionThreshold,
                        yawThresholdRadians: clientConfig.reconciliationYawThresholdRadians,
                    }
                );

                if (reconciliation.wasCorrected) {
                    localCar.position.x = reconciliation.correctedState.positionX;
                    localCar.position.z = reconciliation.correctedState.positionZ;
                    localCar.rotationY = reconciliation.correctedState.rotationY;
                    localCar.mesh.position.copy(localCar.position);
                    localCar.mesh.rotation.y = localCar.rotationY;
                }
            }
        }

        networkUpdateTimerRef.current += dt;
        if (networkUpdateTimerRef.current >= NETWORK_TICK_RATE_SECONDS) {
            if (GAMEPLAY_V2_ENABLED) {
                const isUpPressed =
                    inputManager.isKeyPressed('KeyW') || inputManager.isKeyPressed('ArrowUp');
                const isDownPressed =
                    inputManager.isKeyPressed('KeyS') || inputManager.isKeyPressed('ArrowDown');
                const isLeftPressed =
                    inputManager.isKeyPressed('KeyA') || inputManager.isKeyPressed('ArrowLeft');
                const isRightPressed =
                    inputManager.isKeyPressed('KeyD') || inputManager.isKeyPressed('ArrowRight');

                localInputSequenceRef.current += 1;
                networkManager.emitInputFrame({
                    ackSnapshotSeq: useRuntimeStore.getState().lastAckedSnapshotSeq,
                    controls: {
                        boost: inputManager.isKeyPressed('Space'),
                        brake: isDownPressed,
                        handbrake: inputManager.isPrecisionOverrideActive(),
                        steering: (isRightPressed ? 1 : 0) + (isLeftPressed ? -1 : 0),
                        throttle: (isUpPressed ? 1 : 0) + (isDownPressed ? -1 : 0),
                    },
                    cruiseControlEnabled: inputManager.isCruiseControlEnabled(),
                    precisionOverrideActive: inputManager.isPrecisionOverrideActive(),
                    protocolVersion: PROTOCOL_V2,
                    seq: localInputSequenceRef.current,
                    timestampMs: Date.now(),
                });
            } else {
                networkManager.emitState(
                    localCar.position.x,
                    localCar.position.y,
                    localCar.position.z,
                    localCar.rotationY
                );
            }
            networkUpdateTimerRef.current = 0;
        }

        trackManager.update(localCar.position.z);

        const dirLight = dirLightRef.current;
        if (dirLight) {
            dirLight.position.x = localCar.position.x + ACTIVE_SCENE_ENVIRONMENT.sunLight.followOffset[0];
            dirLight.position.y = localCar.position.y + ACTIVE_SCENE_ENVIRONMENT.sunLight.followOffset[1];
            dirLight.position.z = localCar.position.z + ACTIVE_SCENE_ENVIRONMENT.sunLight.followOffset[2];
            dirLight.target = localCar.mesh;
        }

        cameraOffsetRef.current.set(0, 30, -30);
        cameraOffsetRef.current.applyAxisAngle(worldUpRef.current, localCar.rotationY);
        desiredCameraPositionRef.current.copy(localCar.position).add(cameraOffsetRef.current);
        camera.position.lerp(desiredCameraPositionRef.current, 0.1);

        lookTargetRef.current.copy(localCar.position);
        rotatedLookAheadRef.current.copy(lookAheadRef.current);
        rotatedLookAheadRef.current.applyAxisAngle(worldUpRef.current, localCar.rotationY);
        lookTargetRef.current.add(rotatedLookAheadRef.current);
        camera.lookAt(lookTargetRef.current);

        carCollisionCenterRef.current.set(
            localCar.position.x,
            localCar.position.y + carCollisionSizeRef.current.y * 0.5,
            localCar.position.z
        );
        carBoundingBoxRef.current.setFromCenterAndSize(
            carCollisionCenterRef.current,
            carCollisionSizeRef.current
        );
        for (const obstacle of trackManager.getActiveObstacles()) {
            obstacle.updateWorldMatrix(true, false);
            obstacleBoundingBoxRef.current.setFromObject(obstacle);
            if (carBoundingBoxRef.current.intersectsBox(obstacleBoundingBoxRef.current)) {
                setGameOver();
                return;
            }
        }

        if (localCar.position.x < -TRACK_BOUNDARY_X || localCar.position.x > TRACK_BOUNDARY_X) {
            setGameOver();
            return;
        }

        if (localCar.position.z >= trackManager.getRaceDistanceMeters()) {
            setGameOver();
            return;
        }

        const score = GAMEPLAY_V2_ENABLED
            ? Math.floor(latestLocalSnapshotRef.current?.progress.distanceMeters ?? localCar.position.z)
            : Math.floor(localCar.position.z);
        if (score > scoreRef.current) {
            scoreRef.current = score;
            onScoreChange(score);
        }
    });

    return (
        <>
            <SceneEnvironment profileId={ACTIVE_SCENE_ENVIRONMENT.id} sunLightRef={dirLightRef} />
            {GAMEPLAY_V2_ENABLED ? (
                <RacePhysicsWorld
                    trackLength={currentTrackLengthRef.current}
                    trackWidth={TRACK_BOUNDARY_X * 2}
                />
            ) : null}
        </>
    );
};
