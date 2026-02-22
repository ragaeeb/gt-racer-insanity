import type { JoinRoomPayload, PlayerState, PlayerStateUpdate, ServerSnapshotPayload } from '@/shared/network/types';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import { serverConfig } from '@/server/config';
import { RoomSimulation } from '@/server/sim/roomSimulation';

export type Room = {
    id: string;
    lastUpdateAtByPlayer: Map<string, number>;
    playerSelections: Map<string, { colorId: string; vehicleId: string }>;
    seed: number;
    players: Map<string, PlayerState>;
    simulation: RoomSimulation | null;
};

type RandomSeedGenerator = () => number;
type RandomSpawnGenerator = () => number;

type JoinRoomResult = {
    created: boolean;
    player: PlayerState;
    room: Room;
};

type AuthorityGuardrails = {
    maxMovementSpeedPerSecond: number;
    maxPositionDeltaPerTick: number;
    maxRotationDeltaPerTick: number;
};

type RoomStoreRuntimeOptions = {
    defaultTrackId: string;
    protocolV2Required: boolean;
    simulationTickHz: number;
    totalLaps: number;
    useServerSimulation: boolean;
};

type JoinRoomOptions = Pick<JoinRoomPayload, 'protocolVersion' | 'selectedColorId' | 'selectedVehicleId'>;

export type RoomSnapshotEnvelope = {
    roomId: string;
    snapshot: ServerSnapshotPayload;
};

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(value, max));
};

const normalizeAngleDelta = (current: number, target: number) => {
    return Math.atan2(Math.sin(target - current), Math.cos(target - current));
};

const sanitizePlayerName = (playerName: string) => {
    const trimmed = playerName.trim();
    if (trimmed.length === 0) {
        return 'Player';
    }
    return trimmed.slice(0, 24);
};

export class RoomStore {
    private rooms = new Map<string, Room>();
    private readonly runtimeOptions: RoomStoreRuntimeOptions;

    constructor(
        private readonly seedGenerator: RandomSeedGenerator = () => Math.floor(Math.random() * 0xffffffff),
        private readonly spawnGenerator: RandomSpawnGenerator = () => (Math.random() - 0.5) * 10,
        private readonly authorityGuardrails: AuthorityGuardrails = {
            maxMovementSpeedPerSecond: serverConfig.maxMovementSpeedPerSecond,
            maxPositionDeltaPerTick: serverConfig.maxPositionDeltaPerTick,
            maxRotationDeltaPerTick: serverConfig.maxRotationDeltaPerTick,
        },
        runtimeOptions: Partial<RoomStoreRuntimeOptions> = {}
    ) {
        this.runtimeOptions = {
            defaultTrackId: runtimeOptions.defaultTrackId ?? serverConfig.defaultTrackId,
            protocolV2Required: runtimeOptions.protocolV2Required ?? serverConfig.protocolV2Required,
            simulationTickHz: runtimeOptions.simulationTickHz ?? serverConfig.simulationTickHz,
            totalLaps: runtimeOptions.totalLaps ?? serverConfig.defaultTotalLaps,
            useServerSimulation: runtimeOptions.useServerSimulation ?? serverConfig.serverSimV2,
        };
    }

    private shouldUseSimulation = (joinOptions: JoinRoomOptions) => {
        return (
            this.runtimeOptions.useServerSimulation ||
            this.runtimeOptions.protocolV2Required ||
            joinOptions.protocolVersion === PROTOCOL_V2
        );
    };

    private createRoomSimulation = (roomId: string, seed: number) => {
        return new RoomSimulation({
            roomId,
            seed,
            tickHz: this.runtimeOptions.simulationTickHz,
            totalLaps: this.runtimeOptions.totalLaps,
            trackId: this.runtimeOptions.defaultTrackId,
        });
    };

    private ensureSimulation = (room: Room, joinOptions: JoinRoomOptions) => {
        if (room.simulation || !this.shouldUseSimulation(joinOptions)) {
            return;
        }

        room.simulation = this.createRoomSimulation(room.id, room.seed);

        for (const existingPlayer of room.players.values()) {
            const selection = room.playerSelections.get(existingPlayer.id) ?? { colorId: 'red', vehicleId: 'sport' };
            const simPlayer = room.simulation.joinPlayer(
                existingPlayer.id,
                existingPlayer.name,
                selection.vehicleId,
                selection.colorId
            );
            existingPlayer.x = simPlayer.motion.positionX;
            existingPlayer.y = 0;
            existingPlayer.z = simPlayer.motion.positionZ;
            existingPlayer.rotationY = simPlayer.motion.rotationY;
        }
    };

    public joinRoom = (
        roomId: string,
        playerId: string,
        playerName: string,
        joinOptions: JoinRoomOptions = {}
    ): JoinRoomResult => {
        let room = this.rooms.get(roomId);
        const created = !room;

        if (!room) {
            const seed = this.seedGenerator();
            room = {
                id: roomId,
                lastUpdateAtByPlayer: new Map(),
                playerSelections: new Map(),
                players: new Map(),
                seed,
                simulation: this.shouldUseSimulation(joinOptions) ? this.createRoomSimulation(roomId, seed) : null,
            };
            this.rooms.set(roomId, room);
        } else {
            this.ensureSimulation(room, joinOptions);
        }

        room.playerSelections.set(playerId, {
            colorId: joinOptions.selectedColorId ?? 'red',
            vehicleId: joinOptions.selectedVehicleId ?? 'sport',
        });

        const sanitizedName = sanitizePlayerName(playerName);
        const player = {
            id: playerId,
            name: sanitizedName,
            rotationY: 0,
            x: this.spawnGenerator(),
            y: 0,
            z: 0,
        } satisfies PlayerState;

        room.players.set(playerId, player);
        room.lastUpdateAtByPlayer.set(playerId, Date.now());

        if (room.simulation) {
            const simPlayer = room.simulation.joinPlayer(
                playerId,
                sanitizedName,
                joinOptions.selectedVehicleId ?? 'sport',
                joinOptions.selectedColorId ?? 'red'
            );
            player.x = simPlayer.motion.positionX;
            player.y = 0;
            player.z = simPlayer.motion.positionZ;
            player.rotationY = simPlayer.motion.rotationY;
        }

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

        if (room.simulation) {
            const simulationPlayer = room.simulation.toLegacyPlayerState(playerId);
            if (simulationPlayer) {
                room.players.set(playerId, simulationPlayer);
            }
            return simulationPlayer;
        }

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
        room.playerSelections.delete(playerId);
        room.simulation?.removePlayer(playerId);
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

    public queueInputFrame = (roomId: string, playerId: string, frame: Parameters<RoomSimulation['queueInputFrame']>[1]) => {
        const room = this.rooms.get(roomId);
        if (!room?.simulation) {
            return false;
        }

        room.simulation.queueInputFrame(playerId, frame);
        return true;
    };

    public stepSimulations = (nowMs = Date.now()) => {
        for (const room of this.rooms.values()) {
            if (!room.simulation) continue;
            room.simulation.step(nowMs);

            for (const playerId of room.players.keys()) {
                const playerState = room.simulation.toLegacyPlayerState(playerId);
                if (!playerState) continue;
                room.players.set(playerId, playerState);
            }
        }
    };

    public buildSimulationSnapshots = (nowMs = Date.now()): RoomSnapshotEnvelope[] => {
        const snapshots: RoomSnapshotEnvelope[] = [];

        for (const room of this.rooms.values()) {
            if (!room.simulation || room.players.size === 0) continue;
            snapshots.push({
                roomId: room.id,
                snapshot: room.simulation.buildSnapshot(nowMs),
            });
        }

        return snapshots;
    };
}
