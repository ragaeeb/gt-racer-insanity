import {
    DEFAULT_CAR_PHYSICS_CONFIG,
    stepCarMotion,
    type CarControlState,
    type CarPhysicsConfig,
} from '@/shared/game/carPhysics';
import { advanceRaceProgress, createInitialRaceProgress } from '@/shared/game/track/raceProgress';
import { getTrackManifestById } from '@/shared/game/track/trackManifest';
import { getVehicleClassManifestById, type VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import type { ClientInputFrame } from '@/shared/network/inputFrame';
import type { ServerSnapshotPayload } from '@/shared/network/snapshot';
import { InputQueue } from '@/server/sim/inputQueue';
import { buildServerSnapshot } from '@/server/sim/snapshotBuilder';
import type { SimPlayerState, SimRoomState } from '@/server/sim/types';
import { tickStatusEffects } from '@/server/sim/effectSystem';

type RoomSimulationOptions = {
    roomId: string;
    seed: number;
    tickHz: number;
    totalLaps: number;
    trackId: string;
};

const DEFAULT_CONTROLS: CarControlState = {
    isDown: false,
    isLeft: false,
    isRight: false,
    isUp: false,
};

const mapInputFrameToControls = (frame: ClientInputFrame | null): CarControlState => {
    if (!frame) {
        return DEFAULT_CONTROLS;
    }

    return {
        isDown: frame.controls.throttle < -0.05 || frame.controls.brake || frame.controls.handbrake,
        isLeft: frame.controls.steering < -0.1,
        isRight: frame.controls.steering > 0.1,
        isUp: frame.controls.throttle > 0.05 && !frame.controls.brake,
    };
};

const toPhysicsConfig = (vehicleId: VehicleClassId): CarPhysicsConfig => {
    const vehicleClass = getVehicleClassManifestById(vehicleId);
    return {
        acceleration: vehicleClass.physics.acceleration,
        deceleration: Math.max(8, vehicleClass.physics.acceleration * 0.5),
        friction: vehicleClass.physics.friction,
        maxForwardSpeed: vehicleClass.physics.maxForwardSpeed,
        maxReverseSpeed: vehicleClass.physics.maxReverseSpeed,
        minTurnSpeed: vehicleClass.physics.minTurnSpeed,
        turnSpeed: vehicleClass.physics.turnSpeed,
    };
};

const getSpawnX = (playerIndex: number) => {
    return playerIndex * 4 - 6;
};

export class RoomSimulation {
    private readonly dtSeconds: number;
    private readonly inputQueue = new InputQueue();
    private readonly state: SimRoomState;

    constructor(options: RoomSimulationOptions) {
        this.dtSeconds = 1 / Math.max(options.tickHz, 1);
        this.state = {
            players: new Map(),
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

    public joinPlayer = (playerId: string, playerName: string, vehicleId: string, colorId: string) => {
        const playerIndex = this.state.players.size;
        const normalizedVehicleId = (vehicleId || 'sport') as VehicleClassId;
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
                positionX: getSpawnX(playerIndex),
                positionZ: 0,
                rotationY: 0,
                speed: 0,
            },
            name: playerName,
            progress: {
                ...createInitialRaceProgress(),
            },
            vehicleId: normalizedVehicleId,
        };

        this.state.players.set(playerId, initialPlayer);
        return initialPlayer;
    };

    public removePlayer = (playerId: string) => {
        this.state.players.delete(playerId);
        this.inputQueue.clearPlayer(playerId);
    };

    public queueInputFrame = (playerId: string, frame: ClientInputFrame) => {
        this.inputQueue.enqueue(playerId, frame);
    };

    public step = (nowMs: number) => {
        const trackManifest = getTrackManifestById(this.state.raceState.trackId);

        for (const player of this.state.players.values()) {
            const frame = this.inputQueue.consumeLatestAfter(player.id, player.lastProcessedInputSeq);
            if (frame) {
                player.inputState = frame.controls;
                player.lastProcessedInputSeq = frame.seq;
            }

            tickStatusEffects(player, nowMs);

            const controls = mapInputFrameToControls(frame);
            const physicsConfig = toPhysicsConfig(player.vehicleId);
            const previousX = player.motion.positionX;
            const previousZ = player.motion.positionZ;

            player.motion = stepCarMotion(player.motion, controls, this.dtSeconds, physicsConfig);

            const deltaDistance = Math.hypot(
                player.motion.positionX - previousX,
                player.motion.positionZ - previousZ
            );

            const previousDistanceMeters = player.progress.distanceMeters;
            const updatedProgress = advanceRaceProgress(
                player.progress,
                previousDistanceMeters,
                previousDistanceMeters + deltaDistance,
                trackManifest,
                nowMs
            );
            player.progress = updatedProgress.progress;

            if (updatedProgress.shouldFinish && player.progress.finishedAtMs === null) {
                player.progress.finishedAtMs = nowMs;
                if (!this.state.raceState.winnerPlayerId) {
                    this.state.raceState.winnerPlayerId = player.id;
                    this.state.raceState.status = 'finished';
                    this.state.raceState.endedAtMs = nowMs;
                }
            }
        }
    };

    public buildSnapshot = (nowMs: number): ServerSnapshotPayload => {
        return buildServerSnapshot(this.state, nowMs);
    };

    public toLegacyPlayerState = (playerId: string) => {
        const player = this.state.players.get(playerId);
        if (!player) return null;
        return {
            id: player.id,
            name: player.name,
            rotationY: player.motion.rotationY,
            x: player.motion.positionX,
            y: 0,
            z: player.motion.positionZ,
        };
    };

    public getTrackId = () => {
        return this.state.raceState.trackId;
    };

    public getPlayers = () => {
        return this.state.players;
    };

    public getDefaultCarPhysics = () => {
        return DEFAULT_CAR_PHYSICS_CONFIG;
    };
}
