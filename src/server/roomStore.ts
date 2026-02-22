import type { PlayerState, PlayerStateUpdate } from '@/shared/network/types';
import { serverConfig } from '@/server/config';

export type Room = {
    id: string;
    lastUpdateAtByPlayer: Map<string, number>;
    seed: number;
    players: Map<string, PlayerState>;
};

type RandomSeedGenerator = () => number;
type RandomSpawnGenerator = () => number;

type JoinRoomResult = {
    room: Room;
    player: PlayerState;
    created: boolean;
};

type AuthorityGuardrails = {
    maxMovementSpeedPerSecond: number;
    maxPositionDeltaPerTick: number;
    maxRotationDeltaPerTick: number;
};

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(value, max));
};

const normalizeAngleDelta = (current: number, target: number) => {
    return Math.atan2(Math.sin(target - current), Math.cos(target - current));
};

export class RoomStore {
    private rooms = new Map<string, Room>();

    constructor(
        private readonly seedGenerator: RandomSeedGenerator = () => Math.floor(Math.random() * 0xffffffff),
        private readonly spawnGenerator: RandomSpawnGenerator = () => (Math.random() - 0.5) * 10,
        private readonly authorityGuardrails: AuthorityGuardrails = {
            maxMovementSpeedPerSecond: serverConfig.maxMovementSpeedPerSecond,
            maxPositionDeltaPerTick: serverConfig.maxPositionDeltaPerTick,
            maxRotationDeltaPerTick: serverConfig.maxRotationDeltaPerTick,
        }
    ) {}

    public joinRoom = (roomId: string, playerId: string): JoinRoomResult => {
        let room = this.rooms.get(roomId);
        const created = !room;

        if (!room) {
            room = {
                id: roomId,
                lastUpdateAtByPlayer: new Map(),
                players: new Map(),
                seed: this.seedGenerator(),
            };
            this.rooms.set(roomId, room);
        }

        const player: PlayerState = {
            id: playerId,
            x: this.spawnGenerator(),
            y: 0,
            z: 0,
            rotationY: 0,
        };

        room.players.set(playerId, player);
        room.lastUpdateAtByPlayer.set(playerId, Date.now());

        return { created, player, room };
    };

    public updatePlayerState = (
        roomId: string,
        playerId: string,
        state: PlayerStateUpdate,
        nowMs = Date.now()
    ): PlayerState | null => {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        const storedPlayer = room.players.get(playerId);
        if (!storedPlayer) return null;

        const previousUpdateAt = room.lastUpdateAtByPlayer.get(playerId) ?? nowMs;
        const dtSeconds = clamp((nowMs - previousUpdateAt) / 1000, 1 / 120, 0.35);

        const deltaX = state.x - storedPlayer.x;
        const deltaY = state.y - storedPlayer.y;
        const deltaZ = state.z - storedPlayer.z;
        const requestedPositionDelta = Math.hypot(deltaX, deltaY, deltaZ);

        const maxDistanceBySpeed = this.authorityGuardrails.maxMovementSpeedPerSecond * dtSeconds;
        const maxPositionDelta = Math.min(
            this.authorityGuardrails.maxPositionDeltaPerTick,
            maxDistanceBySpeed
        );
        const positionScale =
            requestedPositionDelta > maxPositionDelta && requestedPositionDelta > 0
                ? maxPositionDelta / requestedPositionDelta
                : 1;

        storedPlayer.x += deltaX * positionScale;
        storedPlayer.y += deltaY * positionScale;
        storedPlayer.z += deltaZ * positionScale;

        const rotationDelta = normalizeAngleDelta(storedPlayer.rotationY, state.rotationY);
        const clampedRotationDelta = clamp(
            rotationDelta,
            -this.authorityGuardrails.maxRotationDeltaPerTick,
            this.authorityGuardrails.maxRotationDeltaPerTick
        );
        storedPlayer.rotationY += clampedRotationDelta;

        room.lastUpdateAtByPlayer.set(playerId, nowMs);

        return storedPlayer;
    };

    public removePlayerFromRoom = (
        roomId: string,
        playerId: string
    ): { removed: boolean; roomDeleted: boolean } => {
        const room = this.rooms.get(roomId);
        if (!room) {
            return { removed: false, roomDeleted: false };
        }

        const removed = room.players.delete(playerId);
        room.lastUpdateAtByPlayer.delete(playerId);
        if (!removed) {
            return { removed: false, roomDeleted: false };
        }

        if (room.players.size === 0) {
            this.rooms.delete(roomId);
            return { removed: true, roomDeleted: true };
        }

        return { removed: true, roomDeleted: false };
    };

    public getRoom = (roomId: string): Room | null => {
        return this.rooms.get(roomId) ?? null;
    };

    public getRoomCount = () => {
        return this.rooms.size;
    };
}
