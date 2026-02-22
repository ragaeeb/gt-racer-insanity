export type PlayerState = {
    id: string;
    name: string;
    x: number;
    y: number;
    z: number;
    rotationY: number;
};

export type PlayerStateUpdate = Pick<PlayerState, 'x' | 'y' | 'z' | 'rotationY'>;

export type JoinRoomPayload = {
    playerName: string;
    roomId: string;
};

export type RoomJoinedPayload = {
    seed: number;
    players: PlayerState[];
};

export type UpdateStatePayload = {
    roomId: string;
    state: PlayerStateUpdate;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
