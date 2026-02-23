import type { ClientInputFrame, InputFramePayload, InputFrameControlState } from '@/shared/network/inputFrame';
import type {
    CheckpointState,
    PlayerRaceProgress,
    RaceState,
    ServerSnapshotPayload,
    SnapshotPlayerState,
    StatusEffectInstance,
} from '@/shared/network/snapshot';
import type { ProtocolVersion } from '@/shared/network/protocolVersion';

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
    selectedVehicleId?: string;
};

export type RoomJoinedPayload = {
    localPlayerId?: string;
    players: PlayerState[];
    protocolVersion?: ProtocolVersion;
    seed: number;
    snapshot?: ServerSnapshotPayload;
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
    | 'hazard_triggered'
    | 'powerup_collected'
    | 'collision_bump';

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
