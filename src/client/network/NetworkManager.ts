import { io, type Socket } from 'socket.io-client';
import { clientConfig } from '@/client/app/config';
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
} from '@/client/network/realtimeTransport';
import { sanitizeClientInputFrame } from '@/shared/network/inputFrame';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import type {
    AbilityActivatePayload,
    ClientInputFrame,
    ConnectionStatus,
    JoinErrorPayload,
    JoinRoomPayload,
    ProtocolVersion,
    RoomJoinedPayload,
    ServerSnapshotPayload,
    ServerSnapshotEventPayload,
} from '@/shared/network/types';

export const shouldEmitByInterval = (nowMs: number, lastEmitAtMs: number, intervalMs: number) => {
    return nowMs - lastEmitAtMs >= intervalMs;
};

export const buildSequencedInputFrame = (
    frame: Omit<ClientInputFrame, 'protocolVersion' | 'roomId'> &
        Partial<Pick<ClientInputFrame, 'protocolVersion' | 'roomId'>>,
    roomId: string,
    protocolVersion: ProtocolVersion,
) => {
    return sanitizeClientInputFrame({
        ...frame,
        controls: frame.controls,
        protocolVersion: frame.protocolVersion ?? protocolVersion,
        roomId: frame.roomId ?? roomId,
    });
};

export class NetworkManager implements RealtimeTransport {
    private socket: Socket;
    private readonly connectionStatusCallbacks = new Set<OnConnectionStatusCallback>();
    private readonly joinErrorCallbacks = new Set<OnJoinErrorCallback>();
    private readonly minInputFrameEmitIntervalMs: number;
    private lastInputFrameEmitAt = 0;
    private readonly protocolVersion: ProtocolVersion;
    private readonly debugSpeedMultiplier: number;
    private readonly selectedVehicleId: string;
    private readonly selectedColorId: string;
    private readonly selectedTrackId?: string;
    private pendingRestartRaceRequest: { advanceLevel: boolean } | null = null;
    public roomId: string;
    public readonly playerName: string;

    constructor(playerName: string, roomId: string, options: RealtimeTransportOptions = {}) {
        this.roomId = roomId;
        this.playerName = playerName;
        this.protocolVersion = options.protocolVersion ?? PROTOCOL_V2;
        this.debugSpeedMultiplier = options.debugSpeedMultiplier ?? 1;
        this.selectedVehicleId = options.selectedVehicleId ?? 'sport';
        this.selectedColorId = options.selectedColorId ?? 'red';
        this.selectedTrackId = options.selectedTrackId;

        this.minInputFrameEmitIntervalMs = 1000 / clientConfig.inputFrameRateHz;

        this.socket = io(clientConfig.serverUrl, {
            reconnection: true,
            reconnectionAttempts: Infinity,
        });

        this.socket.on('connect', () => {
            this.emitConnectionStatus('connected');
            console.log(`Connected to server as ${this.socket.id}`);
            const payload: JoinRoomPayload = {
                debugSpeedMultiplier: this.debugSpeedMultiplier,
                playerName: this.playerName,
                protocolVersion: this.protocolVersion,
                roomId: this.roomId,
                selectedColorId: this.selectedColorId,
                selectedTrackId: this.selectedTrackId,
                selectedVehicleId: this.selectedVehicleId,
            };
            this.socket.emit('join_room', payload);

            if (this.pendingRestartRaceRequest) {
                this.socket.emit('restart_race', {
                    advanceLevel: this.pendingRestartRaceRequest.advanceLevel,
                    roomId: this.roomId,
                });
                this.pendingRestartRaceRequest = null;
            }
        });

        this.socket.on('disconnect', () => {
            this.emitConnectionStatus('disconnected');
        });

        this.socket.io.on('reconnect_attempt', () => {
            this.emitConnectionStatus('reconnecting');
        });

        this.socket.io.on('reconnect_error', () => {
            this.emitConnectionStatus('reconnecting');
        });

        this.socket.on('join_error', (payload: JoinErrorPayload) => {
            this.emitConnectionStatus('disconnected');
            for (const callback of this.joinErrorCallbacks) {
                callback(payload);
            }
        });

        this.emitConnectionStatus('connecting');
    }

    private emitConnectionStatus(status: ConnectionStatus) {
        for (const callback of this.connectionStatusCallbacks) {
            callback(status);
        }
    }

    public onRoomJoined(callback: OnRoomJoinedCallback) {
        this.socket.on('room_joined', (data: RoomJoinedPayload) => {
            callback(data.seed, data.players, data);
        });
    }

    public onPlayerJoined(callback: OnPlayerJoinedCallback) {
        this.socket.on('player_joined', callback);
    }

    public onPlayerLeft(callback: OnPlayerLeftCallback) {
        this.socket.on('player_left', callback);
    }

    public onConnectionStatus(callback: OnConnectionStatusCallback) {
        this.connectionStatusCallbacks.add(callback);
        callback(this.socket.connected ? 'connected' : 'connecting');

        return () => {
            this.connectionStatusCallbacks.delete(callback);
        };
    }

    public onJoinError(callback: OnJoinErrorCallback) {
        this.joinErrorCallbacks.add(callback);
        return () => {
            this.joinErrorCallbacks.delete(callback);
        };
    }

    public onServerSnapshot(callback: OnServerSnapshotCallback) {
        this.socket.on('server_snapshot', (payload: ServerSnapshotEventPayload | ServerSnapshotPayload) => {
            if ('snapshot' in payload) {
                callback(payload.snapshot);
                return;
            }
            callback(payload);
        });
    }

    public onRaceEvent(callback: OnRaceEventCallback) {
        this.socket.on('race_event', callback);
        return () => {
            this.socket.off('race_event', callback);
        };
    }

    public emitInputFrame(
        frame: Omit<ClientInputFrame, 'protocolVersion' | 'roomId'> &
            Partial<Pick<ClientInputFrame, 'protocolVersion' | 'roomId'>>,
    ) {
        if (!this.socket.connected) {
            return;
        }

        const now = Date.now();
        if (!shouldEmitByInterval(now, this.lastInputFrameEmitAt, this.minInputFrameEmitIntervalMs)) {
            return;
        }
        this.lastInputFrameEmitAt = now;

        const sanitizedFrame = buildSequencedInputFrame(frame, this.roomId, this.protocolVersion);

        this.socket.emit('input_frame', {
            frame: sanitizedFrame,
            roomId: this.roomId,
        });
    }

    public emitAbilityActivate(payload: Omit<AbilityActivatePayload, 'roomId'>) {
        if (!this.socket.connected) {
            return;
        }
        this.socket.emit('ability_activate', {
            ...payload,
            roomId: this.roomId,
        });
    }

    public emitRestartRace(advanceLevel = false) {
        if (!this.socket.connected) {
            this.pendingRestartRaceRequest = { advanceLevel };
            return;
        }
        this.pendingRestartRaceRequest = null;
        this.socket.emit('restart_race', {
            advanceLevel,
            roomId: this.roomId,
        });
    }

    public getSocketId() {
        return this.socket.id ?? null;
    }

    public disconnect() {
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.connectionStatusCallbacks.clear();
        this.joinErrorCallbacks.clear();
    }
}
