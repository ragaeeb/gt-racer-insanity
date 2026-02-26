import { DEFAULT_TRACK_WIDTH_METERS, getTrackManifestById } from '@/shared/game/track/trackManifest';
import { DEFAULT_GAMEPLAY_TUNING } from '@/shared/game/tuning/gameplayTuning';
import type { ClientInputFrame } from '@/shared/network/inputFrame';
import type { ServerSnapshotPayload } from '@/shared/network/snapshot';
import type { AbilityActivatePayload, RaceEventPayload } from '@/shared/network/types';
import { PLAYER_COLLIDER_HALF_WIDTH_METERS } from '@/shared/physics/constants';
import { CollisionManager } from './collisionManager';
import type { HazardTrigger } from './hazardSystem';
import { InputQueue } from './inputQueue';
import { PlayerManager } from './playerManager';
import type { PowerupTrigger } from './powerupSystem';
import { stepAllProjectiles } from './projectileSystem';
import { RaceProgressTracker } from './raceProgressTracker';
import { createRapierWorld } from './rapierWorld';
import { checkHazardCollisions, checkPowerupCollisions } from './simProximityChecks';
import {
    type AbilityActivationEnvelope,
    processAbilityQueue,
    processDeployableInputs,
    processDeployables,
    processHazardQueue,
    processPowerupQueue,
} from './simQueueProcessors';
import { buildActivePowerups, buildHazards, buildInitialRaceState } from './simStateBuilder';
import { type SimTickContext, stepCollisionResponse, stepPhysicsAndProgress, stepPlayerDrive } from './simStepPhases';
import { buildServerSnapshot } from './snapshotBuilder';
import { buildTrackColliders } from './trackColliderBuilder';
import type { SimRoomState } from './types';

type RoomSimulationOptions = {
    roomId: string;
    seed: number;
    tickHz: number;
    totalLaps: number;
    trackId: string;
};

const TICK_OVERRUN_THRESHOLD_MS = 5;
const BASELINE_SIMULATION_TICK_HZ = 60;

export class RoomSimulation {
    private readonly dtSeconds: number;
    private readonly inputQueue = new InputQueue();
    private readonly state: SimRoomState;
    private readonly rapierContext;
    private readonly playerManager: PlayerManager;
    private readonly collisionManager: CollisionManager;
    private readonly progressTracker: RaceProgressTracker;
    private readonly cooldownStore = new Map<string, number>();
    private readonly contactForcesByPair = new Map<string, number>();
    private readonly abilityActivationQueue: AbilityActivationEnvelope[] = [];
    private readonly hazardTriggerQueue: HazardTrigger[] = [];
    private readonly powerupTriggerQueue: PowerupTrigger[] = [];
    private readonly trackManifest;
    private readonly trackBoundaryX: number;
    private readonly totalTrackLengthMeters: number;
    private readonly combatTuning = DEFAULT_GAMEPLAY_TUNING.combat;
    private readonly deployInputPressedByPlayerId = new Map<string, boolean>();
    private readonly deployableLifetimeTicks: number;
    private readonly isTrackFlat: boolean;
    private obstacleColliderHandles = new Set<number>();
    private tickMetrics = { lastTickDurationMs: 0, tickDurationMaxMs: 0, tickOverrunCount: 0 };

    constructor(options: RoomSimulationOptions) {
        const simulationTickHz = Math.max(options.tickHz, 1);
        this.dtSeconds = 1 / simulationTickHz;
        this.rapierContext = createRapierWorld(this.dtSeconds);
        this.trackManifest = getTrackManifestById(options.trackId);
        this.trackBoundaryX = DEFAULT_TRACK_WIDTH_METERS * 0.5 - PLAYER_COLLIDER_HALF_WIDTH_METERS;
        this.deployableLifetimeTicks = Math.max(
            1,
            Math.round(
                (this.combatTuning.deployableOilSlickLifetimeTicks / BASELINE_SIMULATION_TICK_HZ) * simulationTickHz,
            ),
        );

        const trackColliders = buildTrackColliders(this.rapierContext.rapier, this.rapierContext.world, {
            seed: options.seed,
            totalLaps: options.totalLaps,
            trackId: options.trackId,
        });
        this.totalTrackLengthMeters = trackColliders.totalTrackLengthMeters;
        this.obstacleColliderHandles = trackColliders.obstacleColliderHandles;
        this.isTrackFlat = this.trackManifest.segments.every(
            (seg) =>
                (seg.elevationStartM ?? 0) === 0 && (seg.elevationEndM ?? 0) === 0 && (seg.bankAngleDeg ?? 0) === 0,
        );

        this.state = {
            activePowerups: buildActivePowerups(options.totalLaps, this.trackManifest),
            activeProjectiles: [],
            activeDeployables: [],
            hazards: buildHazards(options.totalLaps, this.trackManifest),
            players: new Map(),
            raceEvents: [],
            raceState: buildInitialRaceState(options),
            roomId: options.roomId,
            seed: options.seed,
            snapshotSeq: 0,
        };

        this.playerManager = new PlayerManager(
            this.state.players,
            this.rapierContext,
            this.trackBoundaryX,
            this.trackManifest.segments,
        );
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

    private pushRaceEvent = (event: RaceEventPayload) => {
        this.state.raceEvents.push(event);
    };

    private buildTickContext = (): SimTickContext => ({
        collisionManager: this.collisionManager,
        contactForcesByPair: this.contactForcesByPair,
        dtSeconds: this.dtSeconds,
        hazardTriggerQueue: this.hazardTriggerQueue,
        inputQueue: this.inputQueue,
        isTrackFlat: this.isTrackFlat,
        obstacleColliderHandles: this.obstacleColliderHandles,
        playerManager: this.playerManager,
        progressTracker: this.progressTracker,
        pushRaceEvent: this.pushRaceEvent,
        rapierContext: this.rapierContext,
        state: this.state,
        trackBoundaryX: this.trackBoundaryX,
    });

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

        this.deployInputPressedByPlayerId.set(player.id, false);
        return player;
    };

    public removePlayer = (playerId: string) => {
        this.playerManager.removePlayer(playerId);
        this.inputQueue.clearPlayer(playerId);
        this.collisionManager.clearForPlayer(playerId);
        this.deployInputPressedByPlayerId.delete(playerId);
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
            this.deployInputPressedByPlayerId.set(player.id, false);
            playerIndex += 1;
        }

        this.abilityActivationQueue.length = 0;
        this.hazardTriggerQueue.length = 0;
        this.collisionManager.resetForRestart();
        this.powerupTriggerQueue.length = 0;
        this.cooldownStore.clear();
        this.state.raceEvents.length = 0;
        this.state.activePowerups = buildActivePowerups(this.state.raceState.totalLaps, this.trackManifest);
        this.state.hazards = buildHazards(this.state.raceState.totalLaps, this.trackManifest);
        this.state.activeProjectiles.length = 0;
        this.state.activeDeployables.length = 0;

        const freshRaceState = buildInitialRaceState({
            roomId: this.state.roomId,
            seed: this.state.seed,
            tickHz: 1 / this.dtSeconds,
            totalLaps: this.state.raceState.totalLaps,
            trackId: this.state.raceState.trackId,
        });
        Object.assign(this.state.raceState, freshRaceState, { startedAtMs: nowMs });

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

        const tickStart = performance.now();
        const ctx = this.buildTickContext();

        stepPlayerDrive(ctx, nowMs);
        processDeployableInputs(
            this.state.players,
            this.state.activeDeployables,
            this.deployInputPressedByPlayerId,
            this.deployableLifetimeTicks,
            this.combatTuning,
            this.totalTrackLengthMeters,
        );
        stepAllProjectiles(this.state, this.dtSeconds, nowMs, this.combatTuning, this.pushRaceEvent);
        stepPhysicsAndProgress(ctx, nowMs);
        stepCollisionResponse(ctx, nowMs);
        checkHazardCollisions(this.state.hazards, this.state.players, this.hazardTriggerQueue);
        checkPowerupCollisions(this.state.activePowerups, this.state.players, this.powerupTriggerQueue, nowMs);
        processAbilityQueue(
            this.abilityActivationQueue,
            this.state.players,
            this.state.activeProjectiles,
            this.cooldownStore,
            this.combatTuning,
            this.state.roomId,
            this.pushRaceEvent,
            nowMs,
        );
        processDeployables(
            this.state.activeDeployables,
            this.state.players,
            this.combatTuning,
            this.hazardTriggerQueue,
        );
        processHazardQueue(this.hazardTriggerQueue, this.state.players, this.state.roomId, this.pushRaceEvent, nowMs);
        processPowerupQueue(this.powerupTriggerQueue, this.state.players, this.state.roomId, this.pushRaceEvent, nowMs);

        const tickDuration = performance.now() - tickStart;
        this.tickMetrics.lastTickDurationMs = tickDuration;
        this.tickMetrics.tickDurationMaxMs = Math.max(this.tickMetrics.tickDurationMaxMs, tickDuration);
        if (tickDuration > TICK_OVERRUN_THRESHOLD_MS) {
            this.tickMetrics.tickOverrunCount += 1;
        }
    };

    public buildSnapshot = (nowMs: number): ServerSnapshotPayload => buildServerSnapshot(this.state, nowMs);

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
            y: player.motion.positionY,
            z: player.motion.positionZ,
        };
    };

    public getPlayers = () => this.state.players;

    public getTickMetrics = () => ({ ...this.tickMetrics });
}
