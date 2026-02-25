import { useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { MixStateManager } from '@/client/game/audio/mixStateManager';
import { Car } from '@/client/game/entities/Car';
import type { CarAssetsBundle, InterpolationState, RaceSession } from '@/client/game/hooks/types';
import {
    DEFAULT_SCENE_ENVIRONMENT_ID,
    getSceneEnvironmentProfileIdForTrackTheme,
    type SceneEnvironmentProfileId,
} from '@/client/game/scene/environment/sceneEnvironmentProfiles';
import type { PendingSpikeShot } from '@/client/game/state/abilityFxStore';
import { useAbilityFxStore } from '@/client/game/state/abilityFxStore';
import { useHudStore } from '@/client/game/state/hudStore';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';
import { createInterpolationBuffer, pushInterpolationSample } from '@/client/game/systems/interpolationSystem';
import { triggerCameraShake } from '@/client/game/systems/cameraShake';
import { SceneryManager } from '@/client/game/systems/SceneryManager';
import { TrackManager } from '@/client/game/systems/TrackManager';
import { colorIdToHSL, vehicleClassToModelIndex } from '@/client/game/vehicleSelections';
import { NetworkManager } from '@/client/network/NetworkManager';
import { getAbilityManifestById } from '@/shared/game/ability/abilityManifest';
import { DEFAULT_CAR_PHYSICS_CONFIG } from '@/shared/game/carPhysics';
import {
    CLIENT_DRIVE_LOCK_FLIPPED_MS,
    CLIENT_DRIVE_LOCK_STUNNED_MS,
    CLIENT_HARD_SNAP_MS,
    LOCAL_COLLISION_HARD_SNAP_WINDOW_MS,
} from '@/shared/game/collisionConfig';
import { playerIdToHue } from '@/shared/game/playerColor';
import { playerIdToVehicleIndex } from '@/shared/game/playerVehicle';
import { DEFAULT_TRACK_WIDTH_METERS, getTrackManifestById } from '@/shared/game/track/trackManifest';
import {
    getVehicleClassManifestById,
    vehicleManifestToPhysicsConfig,
} from '@/shared/game/vehicle/vehicleClassManifest';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import type {
    ConnectionStatus,
    PlayerState,
    RaceEventPayload,
    RaceState,
    ServerSnapshotPayload,
} from '@/shared/network/types';
import { seededRandom } from '@/shared/utils/prng';

const SHAKE_SPIKE_GRACE_PERIOD_MS = 1800;
const COLLISION_SHAKE_BASE_INTENSITY = 0.12;
const COLLISION_SHAKE_FLIP_BONUS = 0.2;
const COLLISION_SHAKE_STUN_BONUS = 0.15;
const COLLISION_SHAKE_MAX_FORCE = 1_000;
const COLLISION_SHAKE_MAX_RELATIVE_SPEED_MPS = 25;
const COLLISION_FORCE_METADATA_KEYS = [
    'contactForceMagnitude',
    'forceMagnitude',
    'impactForceMagnitude',
    'impactForce',
] as const;

const clamp01 = (value: number) => {
    return Math.min(1, Math.max(0, value));
};

const resolveCollisionForceMagnitude = (metadata: RaceEventPayload['metadata']) => {
    if (!metadata) {
        return null;
    }

    for (const key of COLLISION_FORCE_METADATA_KEYS) {
        const rawValue = metadata[key];
        if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0) {
            return rawValue;
        }
        if (typeof rawValue === 'string') {
            const parsedValue = Number(rawValue);
            if (Number.isFinite(parsedValue) && parsedValue >= 0) {
                return parsedValue;
            }
        }
    }

    return null;
};

const getSnapshotSpeedMps = (snapshot: ServerSnapshotPayload | null, playerId: string | null) => {
    if (!snapshot || !playerId) {
        return null;
    }
    const player = snapshot.players.find((candidate) => candidate.id === playerId);
    if (!player) {
        return null;
    }
    return Math.abs(player.speed);
};

type CollisionShakeIntensityParams = {
    event: RaceEventPayload;
    localIsFlipped: boolean;
    localIsStunned: boolean;
    localPlayerId: string;
    session: RaceSession;
    snapshot: ServerSnapshotPayload | null;
};

const computeCollisionShakeIntensity = ({
    event,
    localIsFlipped,
    localIsStunned,
    localPlayerId,
    session,
    snapshot,
}: CollisionShakeIntensityParams) => {
    const forceMagnitude = resolveCollisionForceMagnitude(event.metadata);
    let intensity = 0;

    if (forceMagnitude !== null) {
        intensity = clamp01(forceMagnitude / COLLISION_SHAKE_MAX_FORCE);
    } else {
        const againstPlayerId =
            typeof event.metadata?.againstPlayerId === 'string' ? event.metadata.againstPlayerId : null;
        const counterpartPlayerId = event.playerId === localPlayerId ? againstPlayerId : event.playerId;
        const localSpeedMps =
            getSnapshotSpeedMps(snapshot, localPlayerId) ??
            Math.abs(session.latestLocalSnapshot?.speed ?? session.localCar?.getSpeed() ?? 0);
        const counterpartSpeedMps = getSnapshotSpeedMps(snapshot, counterpartPlayerId);
        const relativeSpeedMps =
            counterpartSpeedMps === null ? localSpeedMps : Math.abs(localSpeedMps - counterpartSpeedMps);
        intensity = clamp01(relativeSpeedMps / COLLISION_SHAKE_MAX_RELATIVE_SPEED_MPS);
    }

    intensity = Math.max(intensity, COLLISION_SHAKE_BASE_INTENSITY);
    if (localIsFlipped) {
        intensity += COLLISION_SHAKE_FLIP_BONUS;
    }
    if (localIsStunned) {
        intensity += COLLISION_SHAKE_STUN_BONUS;
    }

    return clamp01(intensity);
};

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
    onConnectionStatusChange: (status: ConnectionStatus) => void;
    onGameOverChange: (isGameOver: boolean) => void;
    onRaceStateChange: (state: RaceState | null) => void;
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
    onConnectionStatusChange,
    onGameOverChange,
    onRaceStateChange,
    playerName,
    resetNonce,
    roomId,
    selectedColorId,
    selectedVehicleId,
    sessionRef,
}: UseNetworkConnectionParams) => {
    const { scene } = useThree();
    const [sceneEnvironmentId, setSceneEnvironmentId] =
        useState<SceneEnvironmentProfileId>(DEFAULT_SCENE_ENVIRONMENT_ID);
    const opponentFlipAppliedAtByPlayerIdRef = useRef(new Map<string, number>());
    const mixStateManagerRef = useRef<MixStateManager | null>(null);
    const session = sessionRef.current;

    const applyTrackPresentation = (trackId: string) => {
        const trackManifest = getTrackManifestById(trackId);
        session.activeTrackId = trackManifest.id;
        setSceneEnvironmentId(getSceneEnvironmentProfileIdForTrackTheme(trackManifest.themeId));
        useHudStore.getState().setTrackLabel(trackManifest.label);
        return trackManifest.id;
    };

    const clearCars = () => {
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
    };

    const createOpponent = (player: PlayerState, snapshotPlayer?: { colorId?: string; vehicleId?: string }) => {
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
        session.opponentInterpolationBuffers.set(player.id, createInterpolationBuffer<InterpolationState>());
    };

    const removeOpponent = (playerId: string) => {
        const opponentCar = session.opponents.get(playerId);
        if (!opponentCar) {
            return;
        }

        opponentCar.dispose();
        session.opponents.delete(playerId);
        session.opponentInterpolationBuffers.delete(playerId);
        opponentFlipAppliedAtByPlayerIdRef.current.delete(playerId);
    };

    const resetSessionState = () => {
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
    };

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
            onConnectionStatusChange(status);
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
            onRaceStateChange(null);
            onGameOverChange(false);
            session.isRunning = true;
            useHudStore.getState().setSpeedKph(0);

            // Mix state: entering lobby/pre-race phase
            const audioContext = audioListenerRef.current?.context;
            if (audioContext) {
                if (!mixStateManagerRef.current) {
                    mixStateManagerRef.current = new MixStateManager(audioContext);
                }
                mixStateManagerRef.current.setPhase('pre-race');

                // Wire all cars to the mix state manager for race-phase-based audio
                session.localCar?.setMixStateManager(mixStateManagerRef.current);
                session.opponents.forEach((opponentCar) => {
                    opponentCar.setMixStateManager(mixStateManagerRef.current!);
                });
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
                            const narrowedTargetPlayerId = typeof targetPlayerId === 'string' ? targetPlayerId : null;
                            const pendingSpikeShot = buildSpikeShotFxPayload(
                                snapshot,
                                typeof sourcePlayerId === 'string' ? sourcePlayerId : null,
                                narrowedTargetPlayerId,
                                Date.now(),
                            );
                            if (pendingSpikeShot) {
                                useAbilityFxStore.getState().addPendingSpikeShot(pendingSpikeShot);
                            }
                            if (narrowedTargetPlayerId !== null && narrowedTargetPlayerId === localPlayerId) {
                                useHudStore.getState().showToast('SLOWED!', 'warning');
                            }
                        }
                    }
                    return;
                }

                if (event.kind === 'collision_bump') {
                    const againstPlayerId =
                        typeof event.metadata?.againstPlayerId === 'string' ? event.metadata.againstPlayerId : null;
                    const flippedPlayerId =
                        typeof event.metadata?.flippedPlayerId === 'string' ? event.metadata.flippedPlayerId : null;
                    const stunnedPlayerId =
                        typeof event.metadata?.stunnedPlayerId === 'string' ? event.metadata.stunnedPlayerId : null;
                    const rammerPlayerId =
                        typeof event.metadata?.rammerPlayerId === 'string' ? event.metadata.rammerPlayerId : null;
                    const rammerDriveLockMs =
                        typeof event.metadata?.rammerDriveLockMs === 'number' ? event.metadata.rammerDriveLockMs : 0;
                    const isLocalInvolved =
                        localPlayerId !== null &&
                        (event.playerId === localPlayerId ||
                            againstPlayerId === localPlayerId ||
                            flippedPlayerId === localPlayerId ||
                            stunnedPlayerId === localPlayerId ||
                            rammerPlayerId === localPlayerId);
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
                        localIsFlipped || localIsStunned ? LOCAL_COLLISION_HARD_SNAP_WINDOW_MS : CLIENT_HARD_SNAP_MS;

                    const nowMs = Date.now();
                    if (isLocalInvolved) {
                        if (localPlayerId !== null) {
                            const shakeIntensity = computeCollisionShakeIntensity({
                                event,
                                localIsFlipped,
                                localIsStunned,
                                localPlayerId,
                                session,
                                snapshot: useRuntimeStore.getState().latestSnapshot,
                            });
                            triggerCameraShake(shakeIntensity);
                        }

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

                if (event.kind === 'race_started') {
                    mixStateManagerRef.current?.setPhase('racing');
                    return;
                }

                if (event.kind === 'powerup_collected') {
                    useHudStore.getState().showToast('SPEED BOOST!', 'success');
                } else if (event.kind === 'hazard_triggered') {
                    const effectType = event.metadata?.effectType;
                    const flippedPlayerId =
                        typeof event.metadata?.flippedPlayerId === 'string' ? event.metadata.flippedPlayerId : null;
                    if (effectType === 'flat_tire') {
                        useHudStore.getState().showToast('FLAT TIRE!', 'error');
                    } else if (effectType === 'stunned') {
                        useHudStore.getState().showToast('STUNNED!', 'warning');
                    } else if (effectType === 'slowed') {
                        useHudStore.getState().showToast('SLOWED!', 'warning');
                    }

                    if (flippedPlayerId) {
                        if (flippedPlayerId === localPlayerId) {
                            session.localCar?.triggerFlip();
                        } else {
                            session.opponents.get(flippedPlayerId)?.triggerFlip();
                        }
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
                onRaceStateChange(snapshot.raceState);

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
                    onGameOverChange(true);
                    session.localCar?.fadeOutAudio();
                    for (const [, opponent] of session.opponents) {
                        opponent.fadeOutAudio();
                    }
                    mixStateManagerRef.current?.setPhase('post-race');
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
            onConnectionStatusChange('disconnected');
            onRaceStateChange(null);
            useRuntimeStore.getState().setConnectionStatus('disconnected');
            useRuntimeStore.getState().setLocalPlayerId(null);
            networkManager.disconnect();
            session.networkManager = null;
            mixStateManagerRef.current?.dispose();
            mixStateManagerRef.current = null;
        };
    }, [
        audioListenerRef,
        carAssetsBundle,
        onConnectionStatusChange,
        onGameOverChange,
        onRaceStateChange,
        playerName,
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
        onRaceStateChange(null);
        onGameOverChange(false);
        session.isRunning = true;
        useHudStore.getState().setSpeedKph(0);
        session.shakeSpikeGraceUntilMs = Date.now() + SHAKE_SPIKE_GRACE_PERIOD_MS;
    }, [onGameOverChange, onRaceStateChange, resetNonce, session]);

    return sceneEnvironmentId;
};
