import type { ProtocolVersion } from '@/shared/network/protocolVersion';
import type {
    AbilityActivatePayload,
    ClientInputFrame,
    ConnectionStatus,
    JoinErrorPayload,
    PlayerState,
    RaceEventPayload,
    RoomJoinedPayload,
    ServerSnapshotPayload,
} from '@/shared/network/types';

export type RealtimeTransportOptions = {
    debugSpeedMultiplier?: number;
    protocolVersion?: ProtocolVersion;
    selectedColorId?: string;
    selectedTrackId?: string;
    selectedVehicleId?: string;
};

export type OnRoomJoinedCallback = (seed: number, players: PlayerState[], payload: RoomJoinedPayload) => void;
export type OnPlayerJoinedCallback = (player: PlayerState) => void;
export type OnPlayerLeftCallback = (playerId: string) => void;
export type OnConnectionStatusCallback = (status: ConnectionStatus) => void;
export type OnServerSnapshotCallback = (payload: ServerSnapshotPayload) => void;
export type OnRaceEventCallback = (payload: RaceEventPayload) => void;
export type OnJoinErrorCallback = (payload: JoinErrorPayload) => void;

export type RealtimeTransport = {
    readonly playerName: string;
    roomId: string;
    disconnect: () => void;
    emitAbilityActivate: (payload: Omit<AbilityActivatePayload, 'roomId'>) => void;
    emitInputFrame: (
        frame: Omit<ClientInputFrame, 'protocolVersion' | 'roomId'> &
            Partial<Pick<ClientInputFrame, 'protocolVersion' | 'roomId'>>,
    ) => void;
    emitRestartRace: (advanceLevel?: boolean) => void;
    forceFinishRaceForTesting?: () => boolean;
    getSocketId: () => string | null;
    onConnectionStatus: (callback: OnConnectionStatusCallback) => () => void;
    onJoinError: (callback: OnJoinErrorCallback) => () => void;
    onPlayerJoined: (callback: OnPlayerJoinedCallback) => void;
    onPlayerLeft: (callback: OnPlayerLeftCallback) => void;
    onRaceEvent: (callback: OnRaceEventCallback) => () => void;
    onRoomJoined: (callback: OnRoomJoinedCallback) => void;
    onServerSnapshot: (callback: OnServerSnapshotCallback) => void;
};
