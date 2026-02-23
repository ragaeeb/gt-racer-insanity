import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import { advanceRaceProgress, createInitialRaceProgress } from '@/shared/game/track/raceProgress';
import { getTrackManifestById } from '@/shared/game/track/trackManifest';
import { getVehicleClassManifestById, type VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import type { AbilityActivatePayload, RaceEventPayload } from '@/shared/network/types';
import type { ClientInputFrame } from '@/shared/network/inputFrame';
import type { ServerSnapshotPayload } from '@/shared/network/snapshot';
import { applyAbilityActivation } from '@/server/sim/abilitySystem';
import { applyDriveStep, drainStartedPlayerCollisions, syncPlayerMotionFromRigidBody } from '@/server/sim/collisionSystem';
import { tickStatusEffects } from '@/server/sim/effectSystem';
import { applyHazardTriggers, type HazardTrigger } from '@/server/sim/hazardSystem';
import { InputQueue } from '@/server/sim/inputQueue';
import { applyPowerupTriggers, type PowerupTrigger } from '@/server/sim/powerupSystem';
import { createRapierWorld } from '@/server/sim/rapierWorld';
import { buildServerSnapshot } from '@/server/sim/snapshotBuilder';
import { buildTrackColliders } from '@/server/sim/trackColliderBuilder';
import type { SimPlayerState, SimRoomState } from '@/server/sim/types';

type RoomSimulationOptions = {
    roomId: string;
    seed: number;
    tickHz: number;
    totalLaps: number;
    trackId: string;
};

type AbilityActivationEnvelope = {
    playerId: string;
    payload: Omit<AbilityActivatePayload, 'roomId'>;
};

const getSpawnPositionX = (playerIndex: number) => {
    return playerIndex * 4 - 6;
};

const getSpawnPositionZ = (playerIndex: number) => {
    return -(Math.floor(playerIndex / 4) * 6);
};

const PLAYER_PROGRESS_FORWARD_OFFSET_METERS = 2.2;

const toRaceEvent = (
    roomId: string,
    kind: RaceEventPayload['kind'],
    nowMs: number,
    playerId: string | null,
    metadata?: Record<string, number | string | null>
): RaceEventPayload => {
    return {
        kind,
        metadata,
        playerId,
        roomId,
        serverTimeMs: nowMs,
    };
};

export class RoomSimulation {
    private readonly dtSeconds: number;
    private readonly inputQueue = new InputQueue();
    private readonly state: SimRoomState;
    private readonly rapierContext;
    private readonly playerRigidBodyById = new Map<string, RigidBody>();
    private readonly playerColliderById = new Map<string, Collider>();
    private readonly playerIdByColliderHandle = new Map<number, string>();
    private readonly cooldownStore = new Map<string, number>();
    private readonly abilityActivationQueue: AbilityActivationEnvelope[] = [];
    private readonly hazardTriggerQueue: HazardTrigger[] = [];
    private readonly powerupTriggerQueue: PowerupTrigger[] = [];
    private readonly trackManifest;
    private readonly totalTrackLengthMeters: number;

    constructor(options: RoomSimulationOptions) {
        this.dtSeconds = 1 / Math.max(options.tickHz, 1);
        this.rapierContext = createRapierWorld(this.dtSeconds);
        this.trackManifest = getTrackManifestById(options.trackId);

        const trackColliders = buildTrackColliders(this.rapierContext.rapier, this.rapierContext.world, {
            totalLaps: options.totalLaps,
            trackId: options.trackId,
        });
        this.totalTrackLengthMeters = trackColliders.totalTrackLengthMeters;

        this.state = {
            players: new Map(),
            raceEvents: [],
            raceState: {
                endedAtMs: null,
                playerOrder: [],
                startedAtMs: Date.now(),
                status: 'running',
                totalLaps: options.totalLaps,
                trackId: options.trackId,
                winnerPlayerId: null,
            },
            roomId: options.roomId,
            seed: options.seed,
            snapshotSeq: 0,
        };
    }

    private createPlayerRigidBody = (playerId: string, vehicleId: VehicleClassId, playerIndex: number) => {
        const vehicleClass = getVehicleClassManifestById(vehicleId);

        const rigidBodyDesc = this.rapierContext.rapier.RigidBodyDesc.dynamic()
            .setCanSleep(false)
            .setCcdEnabled(true)
            .setLinearDamping(2.5)
            .setAngularDamping(4)
            .setTranslation(getSpawnPositionX(playerIndex), 0.45, getSpawnPositionZ(playerIndex));

        const rigidBody = this.rapierContext.world.createRigidBody(rigidBodyDesc);
        rigidBody.setEnabledRotations(false, true, false, true);
        rigidBody.setEnabledTranslations(true, false, true, true);
        rigidBody.setAdditionalMass(Math.max(vehicleClass.physics.collisionMass, 1), true);

        const colliderDesc = this.rapierContext.rapier.ColliderDesc.cuboid(1.1, 0.5, 2.2)
            .setActiveEvents(this.rapierContext.rapier.ActiveEvents.COLLISION_EVENTS)
            .setFriction(1.25)
            .setRestitution(0.05);

        const collider = this.rapierContext.world.createCollider(colliderDesc, rigidBody);
        this.playerRigidBodyById.set(playerId, rigidBody);
        this.playerColliderById.set(playerId, collider);
        this.playerIdByColliderHandle.set(collider.handle, playerId);
    };

    private removePlayerRigidBody = (playerId: string) => {
        const collider = this.playerColliderById.get(playerId);
        if (collider) {
            this.playerIdByColliderHandle.delete(collider.handle);
            this.rapierContext.world.removeCollider(collider, true);
        }

        const rigidBody = this.playerRigidBodyById.get(playerId);
        if (rigidBody) {
            this.rapierContext.world.removeRigidBody(rigidBody);
        }

        this.playerColliderById.delete(playerId);
        this.playerRigidBodyById.delete(playerId);
    };

    private pushRaceEvent = (event: RaceEventPayload) => {
        this.state.raceEvents.push(event);
    };

    private processAbilityQueue = (nowMs: number) => {
        while (this.abilityActivationQueue.length > 0) {
            const queuedActivation = this.abilityActivationQueue.shift();
            if (!queuedActivation) {
                continue;
            }

            const resolved = applyAbilityActivation(
                this.state.players,
                queuedActivation.playerId,
                queuedActivation.payload,
                nowMs,
                this.cooldownStore
            );

            if (!resolved.applied) {
                continue;
            }

            this.pushRaceEvent(
                toRaceEvent(this.state.roomId, 'ability_activated', nowMs, resolved.sourcePlayerId, {
                    abilityId: resolved.abilityId,
                    targetPlayerId: resolved.targetPlayerId,
                })
            );
        }
    };

    private processHazardQueue = (nowMs: number) => {
        if (this.hazardTriggerQueue.length === 0) {
            return;
        }

        const triggers = this.hazardTriggerQueue.splice(0, this.hazardTriggerQueue.length);
        applyHazardTriggers(this.state.players, triggers, nowMs);

        for (const trigger of triggers) {
            this.pushRaceEvent(
                toRaceEvent(this.state.roomId, 'hazard_triggered', nowMs, trigger.playerId, {
                    effectType: trigger.effectType,
                })
            );
        }
    };

    private processPowerupQueue = (nowMs: number) => {
        if (this.powerupTriggerQueue.length === 0) {
            return;
        }

        const triggers = this.powerupTriggerQueue.splice(0, this.powerupTriggerQueue.length);
        applyPowerupTriggers(this.state.players, triggers, nowMs);

        for (const trigger of triggers) {
            this.pushRaceEvent(
                toRaceEvent(this.state.roomId, 'powerup_collected', nowMs, trigger.playerId, {
                    powerupType: trigger.powerupType,
                })
            );
        }
    };

    private updateRaceProgress = (player: SimPlayerState, nowMs: number) => {
        const previousProgress = player.progress;
        const previousLap = previousProgress.lap;
        const previousDistance = previousProgress.distanceMeters;

        const clampedDistance = Math.max(0, Math.min(this.totalTrackLengthMeters, player.motion.positionZ));
        const nextDistance = Math.max(previousDistance, clampedDistance);
        const progressUpdate = advanceRaceProgress(
            previousProgress,
            previousDistance,
            nextDistance,
            this.trackManifest,
            nowMs
        );

        player.progress = progressUpdate.progress;
        const hasWrappedAllLaps = player.progress.lap >= this.state.raceState.totalLaps;
        const isOnFinalLap = player.progress.lap >= this.state.raceState.totalLaps - 1;
        const reachedRaceEndByFrontBumper =
            player.motion.positionZ + PLAYER_PROGRESS_FORWARD_OFFSET_METERS >= this.totalTrackLengthMeters;
        const hasClearedFinalCheckpoint =
            player.progress.checkpointIndex >= this.trackManifest.checkpoints.length - 1;

        if (!hasWrappedAllLaps && isOnFinalLap && hasClearedFinalCheckpoint && reachedRaceEndByFrontBumper) {
            player.progress.distanceMeters = this.totalTrackLengthMeters;
            player.progress.lap = this.state.raceState.totalLaps;
        }

        const hasFinishedRace = player.progress.lap >= this.state.raceState.totalLaps;

        if (player.progress.lap > previousLap) {
            this.pushRaceEvent(
                toRaceEvent(this.state.roomId, 'lap_completed', nowMs, player.id, {
                    lap: player.progress.lap,
                })
            );
        }

        if (hasFinishedRace && player.progress.finishedAtMs === null) {
            player.progress.finishedAtMs = nowMs;
            this.pushRaceEvent(
                toRaceEvent(this.state.roomId, 'player_finished', nowMs, player.id, {
                    lap: player.progress.lap,
                })
            );

            if (!this.state.raceState.winnerPlayerId) {
                this.state.raceState.winnerPlayerId = player.id;
                this.state.raceState.status = 'finished';
                this.state.raceState.endedAtMs = nowMs;

                this.pushRaceEvent(toRaceEvent(this.state.roomId, 'race_finished', nowMs, player.id));
            }
        }
    };

    public joinPlayer = (playerId: string, playerName: string, vehicleId: string, colorId: string) => {
        const playerIndex = this.state.players.size;
        const normalizedVehicleId = (vehicleId || 'sport') as VehicleClassId;

        this.createPlayerRigidBody(playerId, normalizedVehicleId, playerIndex);
        const rigidBody = this.playerRigidBodyById.get(playerId);

        const initialPlayer: SimPlayerState = {
            activeEffects: [],
            colorId: colorId || 'red',
            id: playerId,
            inputState: {
                boost: false,
                brake: false,
                handbrake: false,
                steering: 0,
                throttle: 0,
            },
            lastProcessedInputSeq: -1,
            motion: {
                positionX: getSpawnPositionX(playerIndex),
                positionZ: getSpawnPositionZ(playerIndex),
                rotationY: 0,
                speed: 0,
            },
            name: playerName,
            progress: {
                ...createInitialRaceProgress(),
            },
            vehicleId: normalizedVehicleId,
        };

        if (rigidBody) {
            syncPlayerMotionFromRigidBody(initialPlayer, rigidBody);
        }

        this.state.players.set(playerId, initialPlayer);

        if (this.state.players.size >= 2 && this.state.raceState.playerOrder.length === 0) {
            this.pushRaceEvent(toRaceEvent(this.state.roomId, 'race_started', Date.now(), null));
        }

        return initialPlayer;
    };

    public removePlayer = (playerId: string) => {
        this.state.players.delete(playerId);
        this.inputQueue.clearPlayer(playerId);
        this.removePlayerRigidBody(playerId);
    };

    public queueInputFrame = (playerId: string, frame: ClientInputFrame) => {
        this.inputQueue.enqueue(playerId, frame);
    };

    public queueAbilityActivation = (
        playerId: string,
        payload: Omit<AbilityActivatePayload, 'roomId'>
    ) => {
        this.abilityActivationQueue.push({
            payload,
            playerId,
        });
    };

    public queueHazardTrigger = (trigger: HazardTrigger) => {
        this.hazardTriggerQueue.push(trigger);
    };

    public queuePowerupTrigger = (trigger: PowerupTrigger) => {
        this.powerupTriggerQueue.push(trigger);
    };

    public restartRace = (nowMs: number) => {
        let playerIndex = 0;
        for (const player of this.state.players.values()) {
            player.activeEffects = [];
            player.inputState = {
                boost: false,
                brake: false,
                handbrake: false,
                steering: 0,
                throttle: 0,
            };
            player.lastProcessedInputSeq = -1;
            player.motion = {
                positionX: getSpawnPositionX(playerIndex),
                positionZ: getSpawnPositionZ(playerIndex),
                rotationY: 0,
                speed: 0,
            };
            player.progress = {
                ...createInitialRaceProgress(),
            };

            const rigidBody = this.playerRigidBodyById.get(player.id);
            if (rigidBody) {
                rigidBody.setTranslation(
                    {
                        x: getSpawnPositionX(playerIndex),
                        y: 0.45,
                        z: getSpawnPositionZ(playerIndex),
                    },
                    true
                );
                rigidBody.setRotation(
                    {
                        w: 1,
                        x: 0,
                        y: 0,
                        z: 0,
                    },
                    true
                );
                rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
                rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
                syncPlayerMotionFromRigidBody(player, rigidBody);
            }

            this.inputQueue.clearPlayer(player.id);
            playerIndex += 1;
        }

        this.abilityActivationQueue.length = 0;
        this.hazardTriggerQueue.length = 0;
        this.powerupTriggerQueue.length = 0;
        this.cooldownStore.clear();
        this.state.raceEvents.length = 0;

        this.state.raceState.status = 'running';
        this.state.raceState.winnerPlayerId = null;
        this.state.raceState.endedAtMs = null;
        this.state.raceState.startedAtMs = nowMs;
        this.state.raceState.playerOrder = [];

        if (this.state.players.size >= 2) {
            this.pushRaceEvent(toRaceEvent(this.state.roomId, 'race_started', nowMs, null));
        }
    };

    public step = (nowMs: number) => {
        if (this.state.players.size === 0) {
            return;
        }

        for (const player of this.state.players.values()) {
            const frame = this.inputQueue.consumeLatestAfter(player.id, player.lastProcessedInputSeq);
            if (frame) {
                player.inputState = frame.controls;
                player.lastProcessedInputSeq = frame.seq;
            }

            tickStatusEffects(player, nowMs);

            const rigidBody = this.playerRigidBodyById.get(player.id);
            if (!rigidBody) {
                continue;
            }

            applyDriveStep({
                dtSeconds: this.dtSeconds,
                player,
                rigidBody,
            });
        }

        this.rapierContext.world.step(this.rapierContext.eventQueue);

        for (const player of this.state.players.values()) {
            const rigidBody = this.playerRigidBodyById.get(player.id);
            if (!rigidBody) {
                continue;
            }

            syncPlayerMotionFromRigidBody(player, rigidBody);
            this.updateRaceProgress(player, nowMs);
        }

        const collisionPairs = drainStartedPlayerCollisions(
            this.rapierContext.eventQueue,
            this.playerIdByColliderHandle
        );
        for (const pair of collisionPairs) {
            this.pushRaceEvent(
                toRaceEvent(this.state.roomId, 'collision_bump', nowMs, pair.firstPlayerId, {
                    againstPlayerId: pair.secondPlayerId,
                })
            );
        }

        this.processAbilityQueue(nowMs);
        this.processHazardQueue(nowMs);
        this.processPowerupQueue(nowMs);
    };

    public buildSnapshot = (nowMs: number): ServerSnapshotPayload => {
        return buildServerSnapshot(this.state, nowMs);
    };

    public drainRaceEvents = () => {
        if (this.state.raceEvents.length === 0) {
            return [];
        }

        return this.state.raceEvents.splice(0, this.state.raceEvents.length);
    };

    public toLegacyPlayerState = (playerId: string) => {
        const player = this.state.players.get(playerId);
        if (!player) {
            return null;
        }

        return {
            id: player.id,
            name: player.name,
            rotationY: player.motion.rotationY,
            x: player.motion.positionX,
            y: 0,
            z: player.motion.positionZ,
        };
    };

    public getPlayers = () => {
        return this.state.players;
    };
}
