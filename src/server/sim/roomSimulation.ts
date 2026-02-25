import { getHazardManifestById } from '@/shared/game/hazard/hazardManifest';
import { getPowerupManifestById } from '@/shared/game/powerup/powerupManifest';
import { DEFAULT_TRACK_WIDTH_METERS, getTrackManifestById } from '@/shared/game/track/trackManifest';
import type { ClientInputFrame } from '@/shared/network/inputFrame';
import type { ServerSnapshotPayload } from '@/shared/network/snapshot';
import type { AbilityActivatePayload, RaceEventPayload } from '@/shared/network/types';
import { PLAYER_COLLIDER_HALF_WIDTH_METERS } from '@/shared/physics/constants';
import { applyAbilityActivation } from './abilitySystem';
import { CollisionManager } from './collisionManager';
import { applyDriveStep, drainStartedCollisions, syncPlayerMotionFromRigidBody } from './collisionSystem';
import { tickStatusEffects } from './effectSystem';
import { applyHazardTriggers, type HazardTrigger } from './hazardSystem';
import { InputQueue } from './inputQueue';
import { PlayerManager } from './playerManager';
import { applyPowerupTriggers, type PowerupTrigger } from './powerupSystem';
import { RaceProgressTracker } from './raceProgressTracker';
import { createRapierWorld } from './rapierWorld';
import { buildServerSnapshot } from './snapshotBuilder';
import { buildTrackColliders } from './trackColliderBuilder';
import type { ActiveHazard, ActivePowerup, SimRoomState } from './types';

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

const POWERUP_PICKUP_RADIUS = 4;
const HAZARD_CAR_HALF_LENGTH = 2;

export class RoomSimulation {
    private readonly dtSeconds: number;
    private readonly inputQueue = new InputQueue();
    private readonly state: SimRoomState;
    private readonly rapierContext;
    private readonly playerManager: PlayerManager;
    private readonly collisionManager: CollisionManager;
    private readonly progressTracker: RaceProgressTracker;
    private readonly cooldownStore = new Map<string, number>();
    private readonly abilityActivationQueue: AbilityActivationEnvelope[] = [];
    private readonly hazardTriggerQueue: HazardTrigger[] = [];
    private readonly powerupTriggerQueue: PowerupTrigger[] = [];
    private readonly trackManifest;
    private readonly trackBoundaryX: number;
    private readonly totalTrackLengthMeters: number;
    private obstacleColliderHandles = new Set<number>();

    constructor(options: RoomSimulationOptions) {
        this.dtSeconds = 1 / Math.max(options.tickHz, 1);
        this.rapierContext = createRapierWorld(this.dtSeconds);
        this.trackManifest = getTrackManifestById(options.trackId);
        this.trackBoundaryX = DEFAULT_TRACK_WIDTH_METERS * 0.5 - PLAYER_COLLIDER_HALF_WIDTH_METERS;

        const trackColliders = buildTrackColliders(this.rapierContext.rapier, this.rapierContext.world, {
            seed: options.seed,
            totalLaps: options.totalLaps,
            trackId: options.trackId,
        });
        this.totalTrackLengthMeters = trackColliders.totalTrackLengthMeters;
        this.obstacleColliderHandles = trackColliders.obstacleColliderHandles;

        this.state = {
            activePowerups: this.buildActivePowerups(options.totalLaps),
            hazards: this.buildHazards(options.totalLaps),
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

        this.playerManager = new PlayerManager(this.state.players, this.rapierContext, this.trackBoundaryX);
        this.collisionManager = new CollisionManager(
            this.state.players,
            this.playerManager.rigidBodyById,
            this.pushRaceEvent,
            options.roomId,
        );
        this.progressTracker = new RaceProgressTracker(options.roomId, this.trackManifest, this.totalTrackLengthMeters);
    }

    // Exposed for diagnostics / test access (tests type-assert on this name).
    get playerRigidBodyById() {
        return this.playerManager.rigidBodyById;
    }

    private buildActivePowerups = (totalLaps: number): ActivePowerup[] => {
        const powerups: ActivePowerup[] = [];
        const lapLength = this.trackManifest.lengthMeters;
        for (let lap = 0; lap < totalLaps; lap++) {
            const zOffset = lap * lapLength;
            for (const spawn of this.trackManifest.powerupSpawns) {
                powerups.push({
                    collectedAtMs: null,
                    id: `${spawn.id}-lap${lap}`,
                    position: { x: spawn.x, z: spawn.z + zOffset },
                    powerupId: spawn.powerupId,
                    respawnAtMs: null,
                });
            }
        }
        return powerups;
    };

    private buildHazards = (totalLaps: number): ActiveHazard[] => {
        const hazards: ActiveHazard[] = [];
        const lapLength = this.trackManifest.lengthMeters;
        for (let lap = 0; lap < totalLaps; lap++) {
            const zOffset = lap * lapLength;
            for (const spawn of this.trackManifest.hazardSpawns) {
                hazards.push({
                    hazardId: spawn.hazardId,
                    id: `${spawn.id}-lap${lap}`,
                    position: { x: spawn.x, z: spawn.z + zOffset },
                });
            }
        }
        return hazards;
    };

    private checkPowerupCollisions = (nowMs: number) => {
        for (const powerup of this.state.activePowerups) {
            if (powerup.collectedAtMs !== null) {
                if (powerup.respawnAtMs !== null && nowMs >= powerup.respawnAtMs) {
                    powerup.collectedAtMs = null;
                    powerup.respawnAtMs = null;
                }
                continue;
            }

            const manifest = getPowerupManifestById(powerup.powerupId);
            if (!manifest) {
                continue;
            }

            for (const player of this.state.players.values()) {
                const dx = player.motion.positionX - powerup.position.x;
                const dz = player.motion.positionZ - powerup.position.z;
                if (Math.sqrt(dx * dx + dz * dz) < POWERUP_PICKUP_RADIUS) {
                    powerup.collectedAtMs = nowMs;
                    powerup.respawnAtMs = nowMs + manifest.respawnMs;
                    this.powerupTriggerQueue.push({ playerId: player.id, powerupType: manifest.type });
                    break;
                }
            }
        }
    };

    private checkHazardCollisions = (_nowMs: number) => {
        for (const hazard of this.state.hazards) {
            const manifest = getHazardManifestById(hazard.hazardId);
            if (!manifest) {
                continue;
            }

            for (const player of this.state.players.values()) {
                if (player.activeEffects.some((e) => e.effectType === manifest.statusEffectId)) {
                    continue;
                }

                const dx = player.motion.positionX - hazard.position.x;
                const dz = player.motion.positionZ - hazard.position.z;
                if (Math.sqrt(dx * dx + dz * dz) < manifest.collisionRadius + HAZARD_CAR_HALF_LENGTH) {
                    this.hazardTriggerQueue.push({
                        applyFlipOnHit: manifest.applyFlipOnHit,
                        effectDurationMs: manifest.statusEffectDurationMs,
                        effectType: manifest.statusEffectId,
                        hazardId: manifest.id,
                        playerId: player.id,
                    });
                }
            }
        }
    };

    private pushRaceEvent = (event: RaceEventPayload) => {
        this.state.raceEvents.push(event);
    };

    private processAbilityQueue = (nowMs: number) => {
        if (this.abilityActivationQueue.length === 0) {
            return;
        }

        const queuedActivations = this.abilityActivationQueue.splice(0);
        for (const queuedActivation of queuedActivations) {
            const resolved = applyAbilityActivation(
                this.state.players,
                queuedActivation.playerId,
                queuedActivation.payload,
                nowMs,
                this.cooldownStore,
            );
            if (!resolved.applied) {
                continue;
            }

            this.pushRaceEvent({
                kind: 'ability_activated',
                metadata: {
                    abilityId: resolved.abilityId,
                    targetPlayerId: resolved.targetPlayerId,
                },
                playerId: resolved.sourcePlayerId,
                roomId: this.state.roomId,
                serverTimeMs: nowMs,
            });
        }
    };

    private processHazardQueue = (nowMs: number) => {
        if (this.hazardTriggerQueue.length === 0) {
            return;
        }

        const triggers = this.hazardTriggerQueue.splice(0);
        applyHazardTriggers(this.state.players, triggers, nowMs);

        for (const trigger of triggers) {
            this.pushRaceEvent({
                kind: 'hazard_triggered',
                metadata: {
                    effectType: trigger.effectType,
                    flippedPlayerId: trigger.applyFlipOnHit ? trigger.playerId : null,
                    hazardId: trigger.hazardId ?? null,
                },
                playerId: trigger.playerId,
                roomId: this.state.roomId,
                serverTimeMs: nowMs,
            });
        }
    };

    private processPowerupQueue = (nowMs: number) => {
        if (this.powerupTriggerQueue.length === 0) {
            return;
        }

        const triggers = this.powerupTriggerQueue.splice(0);
        applyPowerupTriggers(this.state.players, triggers, nowMs);

        for (const trigger of triggers) {
            this.pushRaceEvent({
                kind: 'powerup_collected',
                metadata: { powerupType: trigger.powerupType },
                playerId: trigger.playerId,
                roomId: this.state.roomId,
                serverTimeMs: nowMs,
            });
        }
    };

    public joinPlayer = (
        playerId: string,
        playerName: string,
        vehicleId: string,
        colorId: string,
        nowMs = Date.now(),
    ) => {
        const playerIndex = this.state.players.size;
        const player = this.playerManager.joinPlayer(playerId, playerName, vehicleId, colorId, playerIndex);

        if (this.state.players.size >= 2 && this.state.raceState.playerOrder.length === 0) {
            this.pushRaceEvent({
                kind: 'race_started',
                metadata: undefined,
                playerId: null,
                roomId: this.state.roomId,
                serverTimeMs: nowMs,
            });
        }

        return player;
    };

    public removePlayer = (playerId: string) => {
        this.playerManager.removePlayer(playerId);
        this.inputQueue.clearPlayer(playerId);
        this.collisionManager.clearForPlayer(playerId);
    };

    public queueInputFrame = (playerId: string, frame: ClientInputFrame) => {
        this.inputQueue.enqueue(playerId, frame);
    };

    public queueAbilityActivation = (playerId: string, payload: Omit<AbilityActivatePayload, 'roomId'>) => {
        this.abilityActivationQueue.push({ payload, playerId });
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
            this.playerManager.resetPlayerForRestart(player, playerIndex);
            this.inputQueue.clearPlayer(player.id);
            playerIndex += 1;
        }

        this.abilityActivationQueue.length = 0;
        this.hazardTriggerQueue.length = 0;
        this.collisionManager.resetForRestart();
        this.powerupTriggerQueue.length = 0;
        this.cooldownStore.clear();
        this.state.raceEvents.length = 0;

        this.state.activePowerups = this.buildActivePowerups(this.state.raceState.totalLaps);
        this.state.hazards = this.buildHazards(this.state.raceState.totalLaps);

        this.state.raceState.status = 'running';
        this.state.raceState.winnerPlayerId = null;
        this.state.raceState.endedAtMs = null;
        this.state.raceState.startedAtMs = nowMs;
        this.state.raceState.playerOrder = [];

        if (this.state.players.size >= 2) {
            this.pushRaceEvent({
                kind: 'race_started',
                metadata: undefined,
                playerId: null,
                roomId: this.state.roomId,
                serverTimeMs: nowMs,
            });
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

            const rigidBody = this.playerManager.rigidBodyById.get(player.id);
            if (!rigidBody) {
                continue;
            }

            if (nowMs < this.collisionManager.getDriveRecoveryUntilMs(player.id)) {
                continue;
            }

            applyDriveStep({ dtSeconds: this.dtSeconds, player, rigidBody });
        }

        this.rapierContext.world.step(this.rapierContext.eventQueue);

        for (const player of this.state.players.values()) {
            const rigidBody = this.playerManager.rigidBodyById.get(player.id);
            if (!rigidBody) {
                continue;
            }

            syncPlayerMotionFromRigidBody(player, rigidBody, this.trackBoundaryX);
            this.progressTracker.updateProgress(player, this.state.raceState, nowMs, this.pushRaceEvent);
        }

        const collisionResult = drainStartedCollisions(
            this.rapierContext.eventQueue,
            this.playerManager.colliderHandleToPlayerId,
            this.obstacleColliderHandles,
        );

        this.collisionManager.processBumpCollisions(
            collisionResult.startedPlayerPairs,
            collisionResult.endedPlayerPairs,
            nowMs,
        );

        const obstacleTriggers = this.collisionManager.processObstacleHits(collisionResult.obstacleHits, nowMs);
        for (const trigger of obstacleTriggers) {
            this.hazardTriggerQueue.push(trigger);
        }

        this.checkHazardCollisions(nowMs);
        this.checkPowerupCollisions(nowMs);
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
        return this.state.raceEvents.splice(0);
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
