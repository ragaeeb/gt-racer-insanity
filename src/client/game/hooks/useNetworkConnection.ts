import { useCallback, useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { Car } from '@/client/game/entities/Car';
import type { CarAssetsBundle, InterpolationState, RaceSession, RaceWorldCallbacks } from '@/client/game/hooks/types';
import {
    createInterpolationBuffer,
    pushInterpolationSample,
} from '@/client/game/systems/interpolationSystem';
import { SceneryManager } from '@/client/game/systems/SceneryManager';
import { TrackManager } from '@/client/game/systems/TrackManager';
import { NetworkManager } from '@/client/network/NetworkManager';
import { playerIdToHue } from '@/shared/game/playerColor';
import { playerIdToVehicleIndex } from '@/shared/game/playerVehicle';
import { colorIdToHSL, vehicleClassToModelIndex } from '@/client/game/vehicleSelections';
import { DEFAULT_CAR_PHYSICS_CONFIG } from '@/shared/game/carPhysics';
import { DEFAULT_TRACK_WIDTH_METERS, getTrackManifestById } from '@/shared/game/track/trackManifest';
import { seededRandom } from '@/shared/utils/prng';
import { getVehicleClassManifestById, vehicleManifestToPhysicsConfig } from '@/shared/game/vehicle/vehicleClassManifest';
import {
    DEFAULT_SCENE_ENVIRONMENT_ID,
    type SceneEnvironmentProfileId,
    getSceneEnvironmentProfileIdForTrackTheme,
} from '@/client/game/scene/environment/sceneEnvironmentProfiles';
import { useHudStore } from '@/client/game/state/hudStore';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import type { PlayerState } from '@/shared/network/types';

const SHAKE_SPIKE_GRACE_PERIOD_MS = 1800;

type UseNetworkConnectionParams = {
    audioListenerRef: React.RefObject<THREE.AudioListener | null>;
    carAssetsBundle: CarAssetsBundle;
    callbacks: RaceWorldCallbacks;
    playerName: string;
    resetNonce: number;
    roomId: string;
    selectedColorId: string;
    selectedVehicleId: string;
    sessionRef: React.RefObject<RaceSession>;
};

export const useNetworkConnection = ({
    audioListenerRef,
    carAssetsBundle,
    callbacks,
    playerName,
    resetNonce,
    roomId,
    selectedColorId,
    selectedVehicleId,
    sessionRef,
}: UseNetworkConnectionParams) => {
    const { scene, camera } = useThree();
    const [sceneEnvironmentId, setSceneEnvironmentId] = useState<SceneEnvironmentProfileId>(DEFAULT_SCENE_ENVIRONMENT_ID);
    const session = sessionRef.current;

    const applyTrackPresentation = useCallback((trackId: string) => {
        const trackManifest = getTrackManifestById(trackId);
        session.activeTrackId = trackManifest.id;
        setSceneEnvironmentId(getSceneEnvironmentProfileIdForTrackTheme(trackManifest.themeId));
        useHudStore.getState().setTrackLabel(trackManifest.label);
        return trackManifest.id;
    }, [session]);

    const clearCars = useCallback(() => {
        if (session.localCar) {
            session.localCar.dispose();
            session.localCar = null;
        }

        session.opponents.forEach((opponentCar) => {
            opponentCar.dispose();
        });
        session.opponents.clear();
        session.opponentInterpolationBuffers.clear();
    }, [session]);

    const createOpponent = useCallback((player: PlayerState, snapshotPlayer?: { colorId?: string; vehicleId?: string }) => {
        if (session.opponents.has(player.id)) {
            return;
        }

        const { modelVariants, assets } = carAssetsBundle;
        const modelIndex = snapshotPlayer?.vehicleId
            ? vehicleClassToModelIndex(snapshotPlayer.vehicleId)
            : playerIdToVehicleIndex(player.id, modelVariants.length);
        const modelVariant = modelVariants[modelIndex] ?? modelVariants[0];
        const hsl = snapshotPlayer?.colorId
            ? colorIdToHSL(snapshotPlayer.colorId)
            : { h: playerIdToHue(player.id), s: 1.0, l: 0.5 };

        const opponentCar = new Car(
            scene,
            null,
            hsl,
            audioListenerRef.current ?? undefined,
            assets,
            modelVariant.scene,
            modelVariant.yawOffsetRadians,
            player.name,
        );

        opponentCar.isLocalPlayer = false;
        opponentCar.position.set(player.x, player.y, player.z);
        opponentCar.rotationY = player.rotationY;
        opponentCar.targetPosition.set(player.x, player.y, player.z);
        opponentCar.targetRotationY = player.rotationY;

        session.opponents.set(player.id, opponentCar);
        session.opponentInterpolationBuffers.set(
            player.id,
            createInterpolationBuffer<InterpolationState>(),
        );
    }, [audioListenerRef, carAssetsBundle, scene, session]);

    const removeOpponent = useCallback((playerId: string) => {
        const opponentCar = session.opponents.get(playerId);
        if (!opponentCar) {
            return;
        }

        opponentCar.dispose();
        session.opponents.delete(playerId);
        session.opponentInterpolationBuffers.delete(playerId);
    }, [session]);

    const resetSessionState = useCallback(() => {
        session.localInputSequence = 0;
        session.cruiseLatchActive = false;
        session.latestLocalSnapshot = null;
        session.latestLocalSnapshotSeq = null;
        session.lastReconciledSnapshotSeq = null;
        session.hasLocalAuthoritativeTarget = false;
        session.lastCorrection = null;
        session.networkUpdateTimer = 0;
    }, [session]);

    useEffect(() => {
        const { modelVariants, assets } = carAssetsBundle;
        const networkManager = new NetworkManager(playerName, roomId, {
            protocolVersion: PROTOCOL_V2,
            selectedColorId,
            selectedVehicleId,
        });
        session.networkManager = networkManager;

        const unsubscribeConnectionStatus = networkManager.onConnectionStatus((status) => {
            session.connectionStatus = status;
            useRuntimeStore.getState().setConnectionStatus(status);
            callbacks.onConnectionStatusChange(status);
        });

        networkManager.onRoomJoined((seed, players, roomJoinedPayload) => {
            session.shakeSpikeGraceUntilMs = Date.now() + SHAKE_SPIKE_GRACE_PERIOD_MS;
            const snapshotTrackId = roomJoinedPayload.snapshot?.raceState.trackId ?? session.activeTrackId;
            const selectedTrackId = applyTrackPresentation(snapshotTrackId);
            session.trackManager?.dispose();
            session.trackManager = new TrackManager(scene, seed, selectedTrackId);

            session.sceneryManager?.dispose();
            const trackManifest = getTrackManifestById(selectedTrackId);
            const totalTrackLength = trackManifest.lengthMeters * trackManifest.totalLaps;
            session.sceneryManager = new SceneryManager(
                scene,
                seededRandom(seed + 7919),
                DEFAULT_TRACK_WIDTH_METERS,
                totalTrackLength,
                trackManifest.themeId,
            );
            session.sceneryManager.build();

            clearCars();

            const socketId = roomJoinedPayload.localPlayerId ?? networkManager.getSocketId();
            useRuntimeStore.getState().setLocalPlayerId(socketId);

            const snapshotPlayers = roomJoinedPayload.snapshot?.players;
            for (const player of players) {
                if (player.id === socketId) {
                    const localModelIndex = vehicleClassToModelIndex(selectedVehicleId);
                    const localModelVariant = modelVariants[localModelIndex] ?? modelVariants[0];
                    const localVehicleManifest = getVehicleClassManifestById(selectedVehicleId);
                    const localPhysicsConfig = vehicleManifestToPhysicsConfig(
                        localVehicleManifest.physics,
                        DEFAULT_CAR_PHYSICS_CONFIG.deceleration,
                    );
                    session.localCar = new Car(
                        scene,
                        session.inputManager,
                        colorIdToHSL(selectedColorId),
                        audioListenerRef.current ?? undefined,
                        assets,
                        localModelVariant.scene,
                        localModelVariant.yawOffsetRadians,
                        player.name,
                        localPhysicsConfig,
                    );
                    session.localCar.isLocalPlayer = true;
                    session.localCar.position.set(player.x, player.y, player.z);
                    session.localCar.rotationY = player.rotationY;
                    session.localCar.targetPosition.set(player.x, player.y, player.z);
                    session.localCar.targetRotationY = player.rotationY;
                    continue;
                }

                const sp = snapshotPlayers?.find((s) => s.id === player.id);
                createOpponent(player, sp);
            }

            resetSessionState();
            callbacks.onRaceStateChange(null);
            callbacks.onGameOverChange(false);
            session.isRunning = true;
            useHudStore.getState().setSpeedKph(0);
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

        networkManager.onRaceEvent((event) => {
            const localPlayerId = useRuntimeStore.getState().localPlayerId;
            if (event.playerId !== localPlayerId) return;

            if (event.kind === 'powerup_collected') {
                useHudStore.getState().showToast('SPEED BOOST!', 'success');
            } else if (event.kind === 'hazard_triggered') {
                const effectType = event.metadata?.effectType;
                if (effectType === 'flat_tire') {
                    useHudStore.getState().showToast('FLAT TIRE!', 'error');
                } else if (effectType === 'stunned') {
                    useHudStore.getState().showToast('STUNNED!', 'warning');
                } else if (effectType === 'slowed') {
                    useHudStore.getState().showToast('SLOWED!', 'warning');
                }
            }
        });

        networkManager.onServerSnapshot((snapshot) => {
            useRuntimeStore.getState().applySnapshot(snapshot);
            callbacks.onRaceStateChange(snapshot.raceState);

            if (snapshot.raceState.trackId !== session.activeTrackId) {
                const nextTrackId = applyTrackPresentation(snapshot.raceState.trackId);
                if (session.trackManager) {
                    session.trackManager.setTrack(nextTrackId);
                }
            }

            if (session.trackManager) {
                session.trackManager.syncPowerups(snapshot.powerups);
                session.trackManager.syncHazards(snapshot.hazards);
            }

            const localPlayerId = useRuntimeStore.getState().localPlayerId;
            if (!localPlayerId) {
                return;
            }

            const localSnapshotPlayer = snapshot.players.find((player) => player.id === localPlayerId) ?? null;
            session.latestLocalSnapshot = localSnapshotPlayer;
            session.latestLocalSnapshotSeq = localSnapshotPlayer ? snapshot.seq : null;
            session.lastSnapshotReceivedAtMs = Date.now();

            const localCar = session.localCar;
            if (localCar && localSnapshotPlayer) {
                localCar.targetPosition.set(localSnapshotPlayer.x, localSnapshotPlayer.y, localSnapshotPlayer.z);
                localCar.targetRotationY = localSnapshotPlayer.rotationY;
                if (!session.hasLocalAuthoritativeTarget) {
                    session.hasLocalAuthoritativeTarget = true;
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

                if (!session.opponents.has(snapshotPlayer.id)) {
                    createOpponent(snapshotPlayer, snapshotPlayer);
                }

                const interpolationBuffer = session.opponentInterpolationBuffers.get(snapshotPlayer.id);
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

            if (snapshot.raceState.status === 'finished' && session.isRunning) {
                session.isRunning = false;
                callbacks.onGameOverChange(true);
                session.localCar?.fadeOutAudio();
                for (const [, opponent] of session.opponents) {
                    opponent.fadeOutAudio();
                }
            }
        });

        return () => {
            session.isRunning = false;
            session.trackManager?.dispose();
            session.trackManager = null;
            session.sceneryManager?.dispose();
            session.sceneryManager = null;
            clearCars();
            unsubscribeConnectionStatus();
            session.connectionStatus = 'disconnected';
            callbacks.onConnectionStatusChange('disconnected');
            callbacks.onRaceStateChange(null);
            useRuntimeStore.getState().setConnectionStatus('disconnected');
            useRuntimeStore.getState().setLocalPlayerId(null);
            networkManager.disconnect();
            session.networkManager = null;
        };
    }, [
        applyTrackPresentation,
        audioListenerRef,
        carAssetsBundle,
        callbacks,
        camera,
        clearCars,
        createOpponent,
        playerName,
        removeOpponent,
        resetSessionState,
        roomId,
        scene,
        selectedColorId,
        selectedVehicleId,
        session,
    ]);

    useEffect(() => {
        if (resetNonce === 0) {
            return;
        }

        const localCar = session.localCar;
        const trackManager = session.trackManager;

        if (!localCar || !trackManager) {
            return;
        }

        session.networkManager?.emitRestartRace();

        localCar.reset();
        trackManager.reset();

        resetSessionState();
        callbacks.onRaceStateChange(null);
        callbacks.onGameOverChange(false);
        session.isRunning = true;
        useHudStore.getState().setSpeedKph(0);
        session.shakeSpikeGraceUntilMs = Date.now() + SHAKE_SPIKE_GRACE_PERIOD_MS;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera not used in reset logic
    }, [callbacks, resetNonce, resetSessionState, session]);

    return sceneEnvironmentId;
};
