import { io, Socket } from 'socket.io-client';
import type {
    ConnectionStatus,
    PlayerState,
    RoomJoinedPayload,
    UpdateStatePayload,
} from '@/shared/network/types';
import { clientConfig } from '@/client/app/config';

export type OnRoomJoinedCallback = (seed: number, players: PlayerState[]) => void;
export type OnPlayerJoinedCallback = (player: PlayerState) => void;
export type OnPlayerLeftCallback = (playerId: string) => void;
export type OnPlayerMovedCallback = (player: PlayerState) => void;
export type OnConnectionStatusCallback = (status: ConnectionStatus) => void;

export class NetworkManager {
    private socket: Socket;
    private readonly connectionStatusCallbacks = new Set<OnConnectionStatusCallback>();
    private readonly minEmitIntervalMs: number;
    private lastStateEmitAt = 0;
    public roomId: string;

    constructor() {
        // Find room ID in URL, or generate one and update URL
        const urlParams = new URLSearchParams(window.location.search);
        let room = urlParams.get('room');

        if (!room) {
            room = Math.random().toString(36).substring(2, 8).toUpperCase();
            window.history.replaceState({}, '', `?room=${room}`);
        }
        this.roomId = room;

        this.minEmitIntervalMs = 1000 / clientConfig.outboundTickRateHz;

        this.socket = io(clientConfig.serverUrl, {
            reconnection: true,
            reconnectionAttempts: Infinity,
        });

        this.socket.on('connect', () => {
            this.emitConnectionStatus('connected');
            console.log(`Connected to server as ${this.socket.id}`);
            this.socket.emit('join_room', this.roomId);
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
            callback(data.seed, data.players);
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

    public emitState(x: number, y: number, z: number, rotationY: number) {
        if (!this.socket.connected) return;

        const now = Date.now();
        if (now - this.lastStateEmitAt < this.minEmitIntervalMs) return;
        this.lastStateEmitAt = now;

        const payload: UpdateStatePayload = {
            roomId: this.roomId,
            state: { x, y, z, rotationY }
        };

        this.socket.emit('update_state', payload);
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
