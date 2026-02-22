import { io, Socket } from 'socket.io-client';
import type {
    AbilityActivatePayload,
    ClientInputFrame,
    ConnectionStatus,
    JoinRoomPayload,
    PlayerState,
    ProtocolVersion,
    RaceEventPayload,
    RoomJoinedPayload,
    ServerSnapshotEventPayload,
    ServerSnapshotPayload,
    UpdateStatePayload,
} from '@/shared/network/types';
import { clientConfig } from '@/client/app/config';
import { sanitizeClientInputFrame } from '@/shared/network/inputFrame';
import { PROTOCOL_V1, PROTOCOL_V2 } from '@/shared/network/protocolVersion';

type NetworkManagerOptions = {
    gameplayV2?: boolean;
    protocolVersion?: ProtocolVersion;
    selectedColorId?: string;
    selectedVehicleId?: string;
};

export type OnRoomJoinedCallback = (seed: number, players: PlayerState[], payload: RoomJoinedPayload) => void;
export type OnPlayerJoinedCallback = (player: PlayerState) => void;
export type OnPlayerLeftCallback = (playerId: string) => void;
export type OnPlayerMovedCallback = (player: PlayerState) => void;
export type OnConnectionStatusCallback = (status: ConnectionStatus) => void;
export type OnServerSnapshotCallback = (payload: ServerSnapshotPayload) => void;
export type OnRaceEventCallback = (payload: RaceEventPayload) => void;

export const shouldEmitByInterval = (nowMs: number, lastEmitAtMs: number, intervalMs: number) => {
    return nowMs - lastEmitAtMs >= intervalMs;
};

export const buildSequencedInputFrame = (
    frame: Omit<ClientInputFrame, 'protocolVersion' | 'roomId'> & Partial<Pick<ClientInputFrame, 'protocolVersion' | 'roomId'>>,
    roomId: string,
    protocolVersion: ProtocolVersion
) => {
    return sanitizeClientInputFrame({
        ...frame,
        controls: frame.controls,
        protocolVersion: frame.protocolVersion ?? protocolVersion,
        roomId: frame.roomId ?? roomId,
    });
};

export class NetworkManager {
    private socket: Socket;
    private readonly connectionStatusCallbacks = new Set<OnConnectionStatusCallback>();
    private readonly minLegacyStateEmitIntervalMs: number;
    private readonly minInputFrameEmitIntervalMs: number;
    private lastStateEmitAt = 0;
    private lastInputFrameEmitAt = 0;
    private readonly gameplayV2: boolean;
    private readonly protocolVersion: ProtocolVersion;
    private readonly selectedVehicleId: string;
    private readonly selectedColorId: string;
    public roomId: string;
    public readonly playerName: string;

    constructor(playerName: string, roomId: string, options: NetworkManagerOptions = {}) {
        this.roomId = roomId;
        this.playerName = playerName;
        this.gameplayV2 = options.gameplayV2 ?? clientConfig.gameplayV2;
        this.protocolVersion =
            options.protocolVersion ??
            (this.gameplayV2 || clientConfig.protocolV2Required ? PROTOCOL_V2 : PROTOCOL_V1);
        this.selectedVehicleId = options.selectedVehicleId ?? 'sport';
        this.selectedColorId = options.selectedColorId ?? 'red';

        this.minLegacyStateEmitIntervalMs = 1000 / clientConfig.outboundTickRateHz;
        this.minInputFrameEmitIntervalMs = 1000 / clientConfig.inputFrameRateHz;

        this.socket = io(clientConfig.serverUrl, {
            reconnection: true,
            reconnectionAttempts: Infinity,
        });

        this.socket.on('connect', () => {
            this.emitConnectionStatus('connected');
            console.log(`Connected to server as ${this.socket.id}`);
            const payload: JoinRoomPayload = {
                playerName: this.playerName,
                protocolVersion: this.protocolVersion,
                roomId: this.roomId,
                selectedColorId: this.selectedColorId,
                selectedVehicleId: this.selectedVehicleId,
            };
            this.socket.emit('join_room', payload);
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

    public onPlayerMoved(callback: OnPlayerMovedCallback) {
        this.socket.on('player_moved', callback);
    }

    public onConnectionStatus(callback: OnConnectionStatusCallback) {
        this.connectionStatusCallbacks.add(callback);
        callback(this.socket.connected ? 'connected' : 'connecting');

        return () => {
            this.connectionStatusCallbacks.delete(callback);
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
    }

    public emitState(x: number, y: number, z: number, rotationY: number) {
        if (!this.socket.connected) return;

        const now = Date.now();
        if (!shouldEmitByInterval(now, this.lastStateEmitAt, this.minLegacyStateEmitIntervalMs)) return;
        this.lastStateEmitAt = now;

        const payload: UpdateStatePayload = {
            roomId: this.roomId,
            state: { x, y, z, rotationY }
        };

        this.socket.emit('update_state', payload);
    }

    public emitInputFrame(frame: Omit<ClientInputFrame, 'protocolVersion' | 'roomId'> & Partial<Pick<ClientInputFrame, 'protocolVersion' | 'roomId'>>) {
        if (!this.socket.connected || (!this.gameplayV2 && !clientConfig.protocolV2Required)) return;

        const now = Date.now();
        if (!shouldEmitByInterval(now, this.lastInputFrameEmitAt, this.minInputFrameEmitIntervalMs)) return;
        this.lastInputFrameEmitAt = now;

        const sanitizedFrame = buildSequencedInputFrame(frame, this.roomId, this.protocolVersion);

        this.socket.emit('input_frame', {
            frame: sanitizedFrame,
            roomId: this.roomId,
        });
    }

    public emitAbilityActivate(payload: Omit<AbilityActivatePayload, 'roomId'>) {
        if (!this.socket.connected || (!this.gameplayV2 && !clientConfig.protocolV2Required)) return;
        this.socket.emit('ability_activate', {
            ...payload,
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
    }
}
