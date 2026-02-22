import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { playerIdToHue } from '../../../shared/game/playerColor';
import type { ConnectionStatus, PlayerState } from '../../../shared/network/types';
import { NetworkManager } from '../../network/NetworkManager';
import { Car, type CarAssets } from '../entities/Car';
import { InputManager } from '../systems/InputManager';
import { TrackManager } from '../systems/TrackManager';

type RaceWorldProps = {
    onConnectionStatusChange: (status: ConnectionStatus) => void;
    resetNonce: number;
    onScoreChange: (score: number) => void;
    onGameOverChange: (isGameOver: boolean) => void;
};

type GTDebugState = {
    isRunning: boolean;
    localCarZ: number | null;
    connectionStatus: ConnectionStatus;
    roomId: string | null;
    score: number;
};

const NETWORK_TICK_RATE_SECONDS = 1 / 20;
const TRACK_BOUNDARY_X = 38;

export const RaceWorld = ({
    onConnectionStatusChange,
    resetNonce,
    onScoreChange,
    onGameOverChange,
}: RaceWorldProps) => {
    const { scene, camera } = useThree();

    const inputManager = useMemo(() => new InputManager(), []);

    const dirLightRef = useRef<THREE.DirectionalLight>(null);

    const networkManagerRef = useRef<NetworkManager | null>(null);
    const trackManagerRef = useRef<TrackManager | null>(null);
    const localCarRef = useRef<Car | null>(null);
    const opponentsRef = useRef<Map<string, Car>>(new Map());

    const audioListenerRef = useRef<THREE.AudioListener | null>(null);
    const carModelGltf = useLoader(GLTFLoader, '/car.glb');
    const engineAudioBuffer = useLoader(THREE.AudioLoader, '/engine.mp3');
    const accelerateAudioBuffer = useLoader(THREE.AudioLoader, '/accelerate.mp3');
    const carAssets = useMemo<CarAssets>(
        () => ({
            accelerate: accelerateAudioBuffer,
            carModel: carModelGltf.scene,
            engine: engineAudioBuffer,
        }),
        [accelerateAudioBuffer, carModelGltf, engineAudioBuffer]
    );

    const isRunningRef = useRef(false);
    const connectionStatusRef = useRef<ConnectionStatus>('connecting');
    const scoreRef = useRef(0);
    const networkUpdateTimerRef = useRef(0);

    const carBoundingBoxRef = useRef(new THREE.Box3());
    const obstacleBoundingBoxRef = useRef(new THREE.Box3());

    const cameraOffsetRef = useRef(new THREE.Vector3());
    const desiredCameraPositionRef = useRef(new THREE.Vector3());
    const lookTargetRef = useRef(new THREE.Vector3());
    const lookAheadRef = useRef(new THREE.Vector3(0, 0, 10));
    const rotatedLookAheadRef = useRef(new THREE.Vector3());
    const worldUpRef = useRef(new THREE.Vector3(0, 1, 0));

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
                localCarZ: localCarRef.current?.position.z ?? null,
                roomId: networkManagerRef.current?.roomId ?? null,
                score: scoreRef.current,
            }),
        };

        return () => {
            delete debugWindow.__GT_DEBUG__;
        };
    }, []);

    useEffect(() => {
        scene.background = new THREE.Color(0x111111);
        scene.fog = new THREE.Fog(0x111111, 20, 200);
    }, [scene]);

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
        const networkManager = new NetworkManager();
        networkManagerRef.current = networkManager;

        const unsubscribeConnectionStatus = networkManager.onConnectionStatus((status) => {
            connectionStatusRef.current = status;
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

            const opponentCar = new Car(
                scene,
                null,
                playerIdToHue(player.id),
                audioListenerRef.current ?? undefined,
                carAssets
            );

            opponentCar.isLocalPlayer = false;
            opponentCar.position.set(player.x, player.y, player.z);
            opponentCar.rotationY = player.rotationY;
            opponentCar.targetPosition.set(player.x, player.y, player.z);
            opponentCar.targetRotationY = player.rotationY;

            opponentsRef.current.set(player.id, opponentCar);
        };

        const removeOpponent = (playerId: string) => {
            const opponentCar = opponentsRef.current.get(playerId);
            if (!opponentCar) return;

            opponentCar.dispose();
            opponentsRef.current.delete(playerId);
        };

        networkManager.onRoomJoined((seed, players) => {
            trackManagerRef.current?.dispose();
            trackManagerRef.current = new TrackManager(scene, seed);

            clearCars();

            const socketId = networkManager.getSocketId();
            for (const player of players) {
                if (player.id === socketId) {
                    localCarRef.current = new Car(
                        scene,
                        inputManager,
                        playerIdToHue(player.id),
                        audioListenerRef.current ?? undefined,
                        carAssets
                    );
                    localCarRef.current.position.set(player.x, player.y, player.z);
                    localCarRef.current.rotationY = player.rotationY;
                    continue;
                }

                createOpponent(player);
            }

            scoreRef.current = 0;
            networkUpdateTimerRef.current = 0;
            onScoreChange(0);
            onGameOverChange(false);
            isRunningRef.current = true;
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

        return () => {
            isRunningRef.current = false;
            trackManagerRef.current?.dispose();
            trackManagerRef.current = null;
            clearCars();
            unsubscribeConnectionStatus();
            connectionStatusRef.current = 'disconnected';
            onConnectionStatusChange('disconnected');
            networkManager.disconnect();
            networkManagerRef.current = null;
        };
    }, [carAssets, inputManager, onConnectionStatusChange, onGameOverChange, onScoreChange, scene]);

    useEffect(() => {
        if (resetNonce === 0) return;

        const localCar = localCarRef.current;
        const trackManager = trackManagerRef.current;

        if (!localCar || !trackManager) return;

        localCar.reset();
        trackManager.reset();

        networkManagerRef.current?.emitState(0, 0, 0, 0);

        scoreRef.current = 0;
        networkUpdateTimerRef.current = 0;
        onScoreChange(0);
        onGameOverChange(false);
        isRunningRef.current = true;
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

        networkUpdateTimerRef.current += dt;
        if (networkUpdateTimerRef.current >= NETWORK_TICK_RATE_SECONDS) {
            networkManager.emitState(
                localCar.position.x,
                localCar.position.y,
                localCar.position.z,
                localCar.rotationY
            );
            networkUpdateTimerRef.current = 0;
        }

        trackManager.update(localCar.position.z);

        const dirLight = dirLightRef.current;
        if (dirLight) {
            dirLight.position.x = localCar.position.x + 20;
            dirLight.position.z = localCar.position.z + 20;
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

        carBoundingBoxRef.current.setFromObject(localCar.mesh);
        for (const obstacle of trackManager.getActiveObstacles()) {
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

        const score = Math.floor(localCar.position.z);
        if (score > scoreRef.current) {
            scoreRef.current = score;
            onScoreChange(score);
        }
    });

    return (
        <>
            <ambientLight intensity={0.5} />
            <directionalLight
                ref={dirLightRef}
                castShadow
                color={0x00ffcc}
                intensity={1.5}
                position={[20, 40, 20]}
                shadow-mapSize-height={2048}
                shadow-mapSize-width={2048}
                shadow-camera-bottom={-100}
                shadow-camera-left={-100}
                shadow-camera-right={100}
                shadow-camera-top={100}
            />
        </>
    );
};
