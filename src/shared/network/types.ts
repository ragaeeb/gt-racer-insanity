export type PlayerState = {
    id: string;
    x: number;
    y: number;
    z: number;
    rotationY: number;
};

export type PlayerStateUpdate = Omit<PlayerState, 'id'>;

export type RoomJoinedPayload = {
    seed: number;
    players: PlayerState[];
};

export type UpdateStatePayload = {
    roomId: string;
    state: PlayerStateUpdate;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
