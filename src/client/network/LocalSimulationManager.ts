import { sanitizeClientInputFrame } from '@/shared/network/inputFrame';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import type {
    AbilityActivatePayload,
    ClientInputFrame,
    ConnectionStatus,
    JoinErrorPayload,
    PlayerState,
    RaceEventPayload,
    RoomJoinedPayload,
} from '@/shared/network/types';
import { RoomSimulation } from '@/server/sim/roomSimulation';
import { getAbilityManifestById } from '@/shared/game/ability/abilityManifest';
import { getNextTrackId, getTrackManifestById } from '@/shared/game/track/trackManifest';
import type {
    OnConnectionStatusCallback,
    OnJoinErrorCallback,
    OnPlayerJoinedCallback,
    OnPlayerLeftCallback,
    OnRaceEventCallback,
    OnRoomJoinedCallback,
    OnServerSnapshotCallback,
    RealtimeTransport,
    RealtimeTransportOptions,
} from './realtimeTransport';

const DEFAULT_SIMULATION_TICK_HZ = 60;
const DEFAULT_SNAPSHOT_TICK_HZ = 20;
const LOCAL_PLAYER_ID = 'local-player';

const toPlayerState = (snapshotPlayer: {
    id: string;
    name: string;
    rotationY: number;
    x: number;
    y: number;
    z: number;
}): PlayerState => ({
    id: snapshotPlayer.id,
    name: snapshotPlayer.name,
    rotationY: snapshotPlayer.rotationY,
    x: snapshotPlayer.x,
    y: snapshotPlayer.y,
    z: snapshotPlayer.z,
});

const isTargetRequiredAbility = (abilityId: string) => {
    const ability = getAbilityManifestById(abilityId);
    if (!ability) {
        return false;
    }
    return ability.targeting !== 'self';
};

export class LocalSimulationManager implements RealtimeTransport {
    public roomId: string;
    public readonly playerName: string;

    private readonly protocolVersion;
    private readonly selectedVehicleId: string;
    private readonly selectedColorId: string;
    private readonly selectedTrackId: string;
    private readonly debugSpeedMultiplier: number;
    private readonly seed: number;
    private readonly simulationTickIntervalMs: number;
    private readonly snapshotTickIntervalMs: number;
    private simulation: RoomSimulation | null = null;
    private simulationTimer: ReturnType<typeof setInterval> | null = null;
    private snapshotTimer: ReturnType<typeof setInterval> | null = null;
    private currentStatus: ConnectionStatus = 'connecting';
    private hasJoinedRoom = false;
    private lastRoomJoinedPayload: RoomJoinedPayload | null = null;
    private disposed = false;

    private readonly connectionStatusCallbacks = new Set<OnConnectionStatusCallback>();
    private readonly joinErrorCallbacks = new Set<OnJoinErrorCallback>();
    private readonly roomJoinedCallbacks = new Set<OnRoomJoinedCallback>();
    private readonly playerJoinedCallbacks = new Set<OnPlayerJoinedCallback>();
    private readonly playerLeftCallbacks = new Set<OnPlayerLeftCallback>();
    private readonly snapshotCallbacks = new Set<OnServerSnapshotCallback>();
    private readonly raceEventCallbacks = new Set<OnRaceEventCallback>();

    constructor(playerName: string, roomId: string, options: RealtimeTransportOptions = {}) {
        this.roomId = roomId;
        this.playerName = playerName;
        this.protocolVersion = options.protocolVersion ?? PROTOCOL_V2;
        this.selectedVehicleId = options.selectedVehicleId ?? 'sport';
        this.selectedColorId = options.selectedColorId ?? 'red';
        this.selectedTrackId = getTrackManifestById(options.selectedTrackId ?? 'sunset-loop').id;
        this.debugSpeedMultiplier = options.debugSpeedMultiplier ?? 1;
        this.seed = Math.floor(Math.random() * 0xffffffff);
        this.simulationTickIntervalMs = 1000 / DEFAULT_SIMULATION_TICK_HZ;
        this.snapshotTickIntervalMs = 1000 / DEFAULT_SNAPSHOT_TICK_HZ;

        this.emitConnectionStatus('connecting');
        setTimeout(() => {
            if (this.disposed) {
                return;
            }
            this.bootstrapSimulation(this.selectedTrackId, true);
        }, 0);
    }

    private emitConnectionStatus = (status: ConnectionStatus) => {
        this.currentStatus = status;
        for (const callback of this.connectionStatusCallbacks) {
            callback(status);
        }
    };

    private bootstrapSimulation = (trackId: string, emitRoomJoinedEvent: boolean) => {
        const manifest = getTrackManifestById(trackId);
        this.simulation = new RoomSimulation({
            roomId: this.roomId,
            seed: this.seed,
            tickHz: DEFAULT_SIMULATION_TICK_HZ,
            totalLaps: manifest.totalLaps,
            trackId: manifest.id,
        });

        const nowMs = Date.now();
        this.simulation.joinPlayer(
            LOCAL_PLAYER_ID,
            this.playerName,
            this.selectedVehicleId,
            this.selectedColorId,
            nowMs,
            this.debugSpeedMultiplier,
        );

        const snapshot = this.simulation.buildSnapshot(nowMs);
        const payload: RoomJoinedPayload = {
            localPlayerId: LOCAL_PLAYER_ID,
            players: snapshot.players.map(toPlayerState),
            protocolVersion: this.protocolVersion,
            seed: this.seed,
            snapshot,
        };

        this.lastRoomJoinedPayload = payload;
        this.hasJoinedRoom = true;
        this.emitConnectionStatus('connected');
        if (emitRoomJoinedEvent) {
            this.emitRoomJoined(payload);
        }

        this.startLoops();
    };

    private startLoops = () => {
        if (!this.simulation) {
            return;
        }
        this.stopLoops();

        this.simulationTimer = setInterval(() => {
            if (!this.simulation || this.disposed) {
                return;
            }
            const nowMs = Date.now();
            this.simulation.step(nowMs);
            const raceEvents = this.simulation.drainRaceEvents();
            for (const event of raceEvents) {
                this.emitRaceEvent(event);
            }
        }, this.simulationTickIntervalMs);

        this.snapshotTimer = setInterval(() => {
            if (!this.simulation || this.disposed) {
                return;
            }
            const snapshot = this.simulation.buildSnapshot(Date.now());
            this.emitSnapshot(snapshot);
        }, this.snapshotTickIntervalMs);
    };

    private stopLoops = () => {
        if (this.simulationTimer) {
            clearInterval(this.simulationTimer);
            this.simulationTimer = null;
        }
        if (this.snapshotTimer) {
            clearInterval(this.snapshotTimer);
            this.snapshotTimer = null;
        }
    };

    private emitRoomJoined = (payload: RoomJoinedPayload) => {
        for (const callback of this.roomJoinedCallbacks) {
            callback(payload.seed, payload.players, payload);
        }
    };

    private emitSnapshot = (snapshot: Parameters<OnServerSnapshotCallback>[0]) => {
        for (const callback of this.snapshotCallbacks) {
            callback(snapshot);
        }
    };

    private emitRaceEvent = (event: RaceEventPayload) => {
        for (const callback of this.raceEventCallbacks) {
            callback(event);
        }
    };

    private emitJoinError = (payload: JoinErrorPayload) => {
        for (const callback of this.joinErrorCallbacks) {
            callback(payload);
        }
    };

    public onRoomJoined = (callback: OnRoomJoinedCallback) => {
        this.roomJoinedCallbacks.add(callback);
        if (this.lastRoomJoinedPayload) {
            callback(
                this.lastRoomJoinedPayload.seed,
                this.lastRoomJoinedPayload.players,
                this.lastRoomJoinedPayload,
            );
        }
    };

    public onPlayerJoined = (callback: OnPlayerJoinedCallback) => {
        this.playerJoinedCallbacks.add(callback);
    };

    public onPlayerLeft = (callback: OnPlayerLeftCallback) => {
        this.playerLeftCallbacks.add(callback);
    };

    public onConnectionStatus = (callback: OnConnectionStatusCallback) => {
        this.connectionStatusCallbacks.add(callback);
        callback(this.currentStatus);
        return () => {
            this.connectionStatusCallbacks.delete(callback);
        };
    };

    public onJoinError = (callback: OnJoinErrorCallback) => {
        this.joinErrorCallbacks.add(callback);
        return () => {
            this.joinErrorCallbacks.delete(callback);
        };
    };

    public onServerSnapshot = (callback: OnServerSnapshotCallback) => {
        this.snapshotCallbacks.add(callback);
    };

    public onRaceEvent = (callback: OnRaceEventCallback) => {
        this.raceEventCallbacks.add(callback);
        return () => {
            this.raceEventCallbacks.delete(callback);
        };
    };

    public emitInputFrame = (
        frame: Omit<ClientInputFrame, 'protocolVersion' | 'roomId'> &
            Partial<Pick<ClientInputFrame, 'protocolVersion' | 'roomId'>>,
    ) => {
        if (!this.simulation || !this.hasJoinedRoom) {
            return;
        }

        const sanitizedFrame = sanitizeClientInputFrame({
            ...frame,
            protocolVersion: frame.protocolVersion ?? this.protocolVersion,
            roomId: frame.roomId ?? this.roomId,
        });
        this.simulation.queueInputFrame(LOCAL_PLAYER_ID, sanitizedFrame);
    };

    public emitAbilityActivate = (payload: Omit<AbilityActivatePayload, 'roomId'>) => {
        if (!this.simulation || !this.hasJoinedRoom) {
            return;
        }

        if (isTargetRequiredAbility(payload.abilityId)) {
            this.emitRaceEvent({
                kind: 'ability_rejected',
                metadata: {
                    abilityId: payload.abilityId,
                    reason: 'no_target',
                    vehicleId: this.selectedVehicleId,
                },
                playerId: LOCAL_PLAYER_ID,
                roomId: this.roomId,
                serverTimeMs: Date.now(),
            });
            return;
        }

        this.simulation.queueAbilityActivation(LOCAL_PLAYER_ID, payload);
    };

    public emitRestartRace = (advanceLevel = false) => {
        if (!this.simulation) {
            return;
        }

        const nowMs = Date.now();
        if (advanceLevel) {
            const snapshot = this.simulation.buildSnapshot(nowMs);
            if (snapshot.raceState.status !== 'finished') {
                this.emitSnapshot(snapshot);
                return;
            }

            const nextTrackId = getNextTrackId(snapshot.raceState.trackId);
            this.bootstrapSimulation(nextTrackId, false);
            if (this.simulation) {
                this.emitSnapshot(this.simulation.buildSnapshot(nowMs));
            }
            return;
        }

        this.simulation.restartRace(nowMs);
        this.emitSnapshot(this.simulation.buildSnapshot(nowMs));
    };

    public forceFinishRaceForTesting = () => {
        if (!this.simulation) {
            return false;
        }

        const nowMs = Date.now();
        const forced = this.simulation.forceFinishRaceForTesting(nowMs, LOCAL_PLAYER_ID);
        if (!forced) {
            return false;
        }

        const raceEvents = this.simulation.drainRaceEvents();
        for (const event of raceEvents) {
            this.emitRaceEvent(event);
        }
        this.emitSnapshot(this.simulation.buildSnapshot(nowMs));
        return true;
    };

    public getSocketId = () => {
        return this.hasJoinedRoom ? LOCAL_PLAYER_ID : null;
    };

    public disconnect = () => {
        this.disposed = true;
        this.stopLoops();
        this.simulation = null;
        this.hasJoinedRoom = false;
        this.lastRoomJoinedPayload = null;
        this.emitConnectionStatus('disconnected');
        this.connectionStatusCallbacks.clear();
        this.joinErrorCallbacks.clear();
        this.roomJoinedCallbacks.clear();
        this.playerJoinedCallbacks.clear();
        this.playerLeftCallbacks.clear();
        this.snapshotCallbacks.clear();
        this.raceEventCallbacks.clear();
    };

    // Test helper for deterministic assertions.
    public __emitJoinErrorForTesting = (payload: JoinErrorPayload) => {
        this.emitJoinError(payload);
    };
}
