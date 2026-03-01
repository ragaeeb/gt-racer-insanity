import type { ClientInputFrame, InputFrameControlState, InputFramePayload } from '@/shared/network/inputFrame';
import type { ProtocolVersion } from '@/shared/network/protocolVersion';
import type {
    CheckpointState,
    PlayerRaceProgress,
    RaceState,
    ServerSnapshotPayload,
    SnapshotPlayerState,
    StatusEffectInstance,
} from '@/shared/network/snapshot';

export type PlayerState = {
    id: string;
    name: string;
    rotationY: number;
    x: number;
    y: number;
    z: number;
};

export type JoinRoomPayload = {
    playerName: string;
    protocolVersion?: ProtocolVersion;
    roomId: string;
    selectedColorId?: string;
    selectedTrackId?: string;
    selectedVehicleId?: string;
};

export type RoomJoinedPayload = {
    localPlayerId?: string;
    players: PlayerState[];
    protocolVersion?: ProtocolVersion;
    seed: number;
    snapshot?: ServerSnapshotPayload;
};

export type JoinErrorReason = 'invalid_payload' | 'payload_too_large' | 'unsupported_protocol' | 'invalid_room_id';

export type JoinErrorPayload = {
    message?: string;
    reason: JoinErrorReason;
};

export type AbilityActivatePayload = {
    abilityId: string;
    roomId: string;
    seq: number;
    targetPlayerId: string | null;
};

export type RaceEventKind =
    | 'countdown_started'
    | 'race_started'
    | 'lap_completed'
    | 'player_finished'
    | 'race_finished'
    | 'ability_activated'
    | 'ability_rejected'
    | 'hazard_triggered'
    | 'powerup_collected'
    | 'collision_bump'
    | 'projectile_hit';

export type RaceEventPayload = {
    kind: RaceEventKind;
    metadata?: Record<string, number | string | null>;
    playerId: string | null;
    roomId: string;
    serverTimeMs: number;
};

export type ServerSnapshotEventPayload = {
    roomId: string;
    snapshot: ServerSnapshotPayload;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type {
    CheckpointState,
    ClientInputFrame,
    InputFrameControlState,
    InputFramePayload,
    PlayerRaceProgress,
    ProtocolVersion,
    RaceState,
    ServerSnapshotPayload,
    SnapshotPlayerState,
    StatusEffectInstance,
};
