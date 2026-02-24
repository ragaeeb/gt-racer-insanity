import { useCallback, useEffect, useRef, useState } from 'react';
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
import { getAbilityManifestById } from '@/shared/game/ability/abilityManifest';
import { getVehicleClassManifestById, vehicleManifestToPhysicsConfig } from '@/shared/game/vehicle/vehicleClassManifest';
import {
    DEFAULT_SCENE_ENVIRONMENT_ID,
    type SceneEnvironmentProfileId,
    getSceneEnvironmentProfileIdForTrackTheme,
} from '@/client/game/scene/environment/sceneEnvironmentProfiles';
import { useAbilityFxStore } from '@/client/game/state/abilityFxStore';
import { useHudStore } from '@/client/game/state/hudStore';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import type { PlayerState, ServerSnapshotPayload } from '@/shared/network/types';
import {
    CLIENT_DRIVE_LOCK_FLIPPED_MS,
    CLIENT_DRIVE_LOCK_STUNNED_MS,
    CLIENT_HARD_SNAP_MS,
} from '@/shared/game/collisionConfig';
import type { PendingSpikeShot } from '@/client/game/state/abilityFxStore';

const SHAKE_SPIKE_GRACE_PERIOD_MS = 1800;
const LOCAL_COLLISION_HARD_SNAP_WINDOW_MS = 3_500;

export const buildSpikeShotFxPayload = (
    snapshot: ServerSnapshotPayload | null,
    sourcePlayerId: string | null,
    targetPlayerId: string | null,
    triggeredAtMs: number,
): PendingSpikeShot | null => {
    if (!snapshot || !sourcePlayerId || !targetPlayerId) {
        return null;
    }

    const source = snapshot.players.find((player) => player.id === sourcePlayerId);
    const target = snapshot.players.find((player) => player.id === targetPlayerId);
    if (!source || !target) {
        return null;
    }

    return {
        sourceX: source.x,
        sourceZ: source.z,
        targetX: target.x,
        targetZ: target.z,
        triggeredAtMs,
    };
};

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
    const opponentFlipAppliedAtByPlayerIdRef = useRef(new Map<string, number>());
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
        opponentFlipAppliedAtByPlayerIdRef.current.clear();
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
        opponentFlipAppliedAtByPlayerIdRef.current.delete(playerId);
    }, [session]);

    const resetSessionState = useCallback(() => {
        session.localInputSequence = 0;
        session.cruiseLatchActive = false;
        session.lastCollisionEventAtMs = null;
        session.lastCollisionEventServerTimeMs = null;
        session.lastCollisionFlippedPlayerId = null;
        session.lastCollisionFlipStartedAtMs = null;
        session.lastCollisionOpponentFlipStartedAtMs = null;
        session.lastCollisionSnapshotFlipSeenAtMs = null;
        session.lastRaceEventProcessingMs = null;
        session.lastSnapshotProcessingMs = null;
        session.localCollisionDriveLockUntilMs = null;
        session.localCollisionHardSnapUntilMs = null;
        session.latestLocalSnapshot = null;
        session.latestLocalSnapshotSeq = null;
        session.lastReconciledSnapshotSeq = null;
        session.hasLocalAuthoritativeTarget = false;
        session.lastCorrection = null;
        session.networkUpdateTimer = 0;
        opponentFlipAppliedAtByPlayerIdRef.current.clear();
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
            session.roomSeed = seed;
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
        });

        networkManager.onPlayerLeft((playerId) => {
            removeOpponent(playerId);
        });

        const unsubscribeRaceEvent = networkManager.onRaceEvent((event) => {
            const startedAtMs = performance.now();
            try {
            const localPlayerId = useRuntimeStore.getState().localPlayerId;

            if (event.kind === 'ability_activated') {
                const abilityId = event.metadata?.abilityId;
                if (typeof abilityId === 'string') {
                    if (event.playerId === localPlayerId) {
                        const ability = getAbilityManifestById(abilityId);
                        if (ability) {
                            useHudStore
                                .getState()
                                .setAbilityReadyAtMs(abilityId, Date.now() + ability.baseCooldownMs);
                        }
                    }

                    if (abilityId === 'spike-shot') {
                        const snapshot = useRuntimeStore.getState().latestSnapshot;
                        const sourcePlayerId = event.playerId;
                        const targetPlayerId = event.metadata?.targetPlayerId;
                        const pendingSpikeShot = buildSpikeShotFxPayload(
                            snapshot,
                            typeof sourcePlayerId === 'string' ? sourcePlayerId : null,
                            typeof targetPlayerId === 'string' ? targetPlayerId : null,
                            Date.now(),
                        );
                        if (pendingSpikeShot) {
                            useAbilityFxStore.getState().addPendingSpikeShot(pendingSpikeShot);
                        }
                        if (targetPlayerId === localPlayerId) {
                            useHudStore.getState().showToast('SLOWED!', 'warning');
                        }
                    }
                }
                return;
            }

            if (event.kind === 'collision_bump') {
                const againstPlayerId =
                    typeof event.metadata?.againstPlayerId === 'string'
                        ? event.metadata.againstPlayerId
                        : null;
                const flippedPlayerId =
                    typeof event.metadata?.flippedPlayerId === 'string'
                        ? event.metadata.flippedPlayerId
                        : null;
                const stunnedPlayerId =
                    typeof event.metadata?.stunnedPlayerId === 'string'
                        ? event.metadata.stunnedPlayerId
                        : null;
                const rammerPlayerId =
                    typeof event.metadata?.rammerPlayerId === 'string'
                        ? event.metadata.rammerPlayerId
                        : null;
                const rammerDriveLockMs =
                    typeof event.metadata?.rammerDriveLockMs === 'number'
                        ? event.metadata.rammerDriveLockMs
                        : 0;
                const isLocalInvolved = localPlayerId !== null && (
                    event.playerId === localPlayerId ||
                    againstPlayerId === localPlayerId ||
                    flippedPlayerId === localPlayerId ||
                    stunnedPlayerId === localPlayerId ||
                    rammerPlayerId === localPlayerId
                );
                const localIsFlipped = localPlayerId !== null && flippedPlayerId === localPlayerId;
                const localIsStunned = localPlayerId !== null && stunnedPlayerId === localPlayerId;
                const localIsRammer = localPlayerId !== null && rammerPlayerId === localPlayerId;
                // Flipped players already get authoritative correction + effect-based movement suppression.
                // A long client-side drive lock here causes visible "freeze then jump" on the victim screen.
                const localCollisionDriveLockMs = Math.max(
                    localIsFlipped ? CLIENT_DRIVE_LOCK_FLIPPED_MS : 0,
                    localIsStunned && !localIsFlipped ? CLIENT_DRIVE_LOCK_STUNNED_MS : 0,
                    localIsRammer ? rammerDriveLockMs : 0,
                );
                const localCollisionHardSnapMs =
                    localIsFlipped || localIsStunned
                        ? Math.max(CLIENT_HARD_SNAP_MS, LOCAL_COLLISION_HARD_SNAP_WINDOW_MS)
                        : CLIENT_HARD_SNAP_MS;

                const nowMs = Date.now();
                if (isLocalInvolved) {
                    session.lastCollisionEventAtMs = nowMs;
                    session.lastCollisionEventServerTimeMs = event.serverTimeMs;
                    session.lastCollisionFlippedPlayerId = flippedPlayerId;
                    session.lastCollisionFlipStartedAtMs = null;
                    session.lastCollisionOpponentFlipStartedAtMs = null;
                    session.lastCollisionSnapshotFlipSeenAtMs = null;
                    session.localCollisionHardSnapUntilMs = nowMs + localCollisionHardSnapMs;

                    if (localCollisionDriveLockMs > 0) {
                        session.localCollisionDriveLockUntilMs = nowMs + localCollisionDriveLockMs;
                        session.localCar?.applyCollisionDriveLock(localCollisionDriveLockMs);
                    } else {
                        session.localCollisionDriveLockUntilMs = null;
                    }
                }

                if (flippedPlayerId) {
                    if (flippedPlayerId === localPlayerId) {
                        const startedLocalFlip = session.localCar?.triggerFlip() ?? false;
                        if (startedLocalFlip) {
                            session.lastCollisionFlipStartedAtMs = nowMs;
                        }
                    } else {
                        const startedOpponentFlip = session.opponents.get(flippedPlayerId)?.triggerFlip() ?? false;
                        if (startedOpponentFlip && isLocalInvolved) {
                            session.lastCollisionOpponentFlipStartedAtMs = nowMs;
                        }
                    }
                }
                return;
            }

            if (event.playerId !== localPlayerId) {
                return;
            }

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
            } finally {
                session.lastRaceEventProcessingMs = performance.now() - startedAtMs;
            }
        });

        networkManager.onServerSnapshot((snapshot) => {
            const startedAtMs = performance.now();
            try {
            useRuntimeStore.getState().applySnapshot(snapshot);
            callbacks.onRaceStateChange(snapshot.raceState);

            if (snapshot.raceState.trackId !== session.activeTrackId) {
                const nextTrackId = applyTrackPresentation(snapshot.raceState.trackId);
                if (session.trackManager) {
                    session.trackManager.setTrack(nextTrackId);
                }
                session.sceneryManager?.dispose();
                const nextManifest = getTrackManifestById(nextTrackId);
                session.sceneryManager = new SceneryManager(
                    scene,
                    seededRandom(session.roomSeed + 7919),
                    DEFAULT_TRACK_WIDTH_METERS,
                    nextManifest.lengthMeters * nextManifest.totalLaps,
                    nextManifest.themeId,
                );
                session.sceneryManager.build();
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

                const opponentCar = session.opponents.get(snapshotPlayer.id);
                if (opponentCar) {
                    const flippedEffect = snapshotPlayer.activeEffects.find((e) => e.effectType === 'flipped');
                    const appliedAtMs = flippedEffect?.appliedAtMs ?? null;
                    const previousAppliedAtMs =
                        opponentFlipAppliedAtByPlayerIdRef.current.get(snapshotPlayer.id) ?? null;

                    if (appliedAtMs !== null) {
                        if (appliedAtMs !== previousAppliedAtMs) {
                            const startedOpponentFlip = opponentCar.triggerFlip();
                            if (
                                startedOpponentFlip &&
                                session.lastCollisionEventAtMs !== null &&
                                session.lastCollisionFlippedPlayerId === snapshotPlayer.id &&
                                session.lastCollisionOpponentFlipStartedAtMs === null
                            ) {
                                session.lastCollisionOpponentFlipStartedAtMs = Date.now();
                            }
                            opponentFlipAppliedAtByPlayerIdRef.current.set(snapshotPlayer.id, appliedAtMs);
                        }
                    } else {
                        opponentFlipAppliedAtByPlayerIdRef.current.delete(snapshotPlayer.id);
                    }
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
            } finally {
                session.lastSnapshotProcessingMs = performance.now() - startedAtMs;
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
            unsubscribeRaceEvent();
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
