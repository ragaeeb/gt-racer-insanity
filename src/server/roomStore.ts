import { serverConfig } from '@/server/config';
import type { HazardTrigger } from '@/server/sim/hazardSystem';
import type { PowerupTrigger } from '@/server/sim/powerupSystem';
import { RoomSimulation } from '@/server/sim/roomSimulation';
import { getTrackManifestById, getTrackManifestIds, isTrackId, type TrackId } from '@/shared/game/track/trackManifest';
import type {
    AbilityActivatePayload,
    JoinRoomPayload,
    PlayerState,
    RaceEventPayload,
    ServerSnapshotPayload,
} from '@/shared/network/types';

export type Room = {
    id: string;
    playerSelections: Map<string, { colorId: string; vehicleId: string }>;
    players: Map<string, PlayerState>;
    seed: number;
    simulation: RoomSimulation;
    trackId: TrackId;
};

type RandomSeedGenerator = () => number;

type JoinRoomResult = {
    created: boolean;
    player: PlayerState;
    room: Room;
};

type RoomStoreRuntimeOptions = {
    defaultTrackId: string;
    simulationTickHz: number;
    totalLaps: number;
};

type JoinRoomOptions = Pick<JoinRoomPayload, 'selectedColorId' | 'selectedTrackId' | 'selectedVehicleId'>;

export type RoomSnapshotEnvelope = {
    roomId: string;
    snapshot: ServerSnapshotPayload;
};

export type RoomRaceEventEnvelope = {
    event: RaceEventPayload;
    roomId: string;
};

const sanitizePlayerName = (playerName: string) => {
    const trimmed = playerName.trim();
    if (trimmed.length === 0) {
        return 'Player';
    }
    return trimmed.slice(0, 24);
};

const toPlayerState = (snapshotPlayer: ServerSnapshotPayload['players'][number]): PlayerState => {
    return {
        id: snapshotPlayer.id,
        name: snapshotPlayer.name,
        rotationY: snapshotPlayer.rotationY,
        x: snapshotPlayer.x,
        y: snapshotPlayer.y,
        z: snapshotPlayer.z,
    };
};

export class RoomStore {
    private rooms = new Map<string, Room>();
    private readonly runtimeOptions: RoomStoreRuntimeOptions;

    constructor(
        private readonly seedGenerator: RandomSeedGenerator = () => Math.floor(Math.random() * 0xffffffff),
        runtimeOptions: Partial<RoomStoreRuntimeOptions> = {},
    ) {
        this.runtimeOptions = {
            defaultTrackId: runtimeOptions.defaultTrackId ?? serverConfig.defaultTrackId,
            simulationTickHz: runtimeOptions.simulationTickHz ?? serverConfig.simulationTickHz,
            totalLaps: runtimeOptions.totalLaps ?? serverConfig.defaultTotalLaps,
        };
    }

    private createRoom = (roomId: string, selectedTrackId?: string): Room => {
        const seed = this.seedGenerator();
        const trackId = this.resolveTrackId(seed, selectedTrackId);

        return {
            id: roomId,
            playerSelections: new Map(),
            players: new Map(),
            seed,
            simulation: new RoomSimulation({
                roomId,
                seed,
                tickHz: this.runtimeOptions.simulationTickHz,
                totalLaps: this.runtimeOptions.totalLaps,
                trackId,
            }),
            trackId,
        };
    };

    private resolveTrackId = (seed: number, selectedTrackId?: string): TrackId => {
        if (selectedTrackId && isTrackId(selectedTrackId)) {
            return selectedTrackId;
        }

        const configuredTrackId = this.runtimeOptions.defaultTrackId.trim().toLowerCase();

        if (isTrackId(configuredTrackId)) {
            return configuredTrackId;
        }

        if (configuredTrackId.length > 0 && configuredTrackId !== 'auto' && configuredTrackId !== 'rotation') {
            const trackIds = getTrackManifestIds();
            const manifest = getTrackManifestById(configuredTrackId);
            if (!manifest || trackIds.length === 0) {
                console.warn(
                    `[RoomStore] Unknown defaultTrackId "${configuredTrackId}" and no track manifests available; falling back to "sunset-loop"`,
                );
                return 'sunset-loop';
            }
            console.warn(`[RoomStore] Unknown defaultTrackId "${configuredTrackId}"; falling back to "${manifest.id}"`);
            return manifest.id;
        }

        const trackIds = getTrackManifestIds();
        if (trackIds.length === 0) {
            return 'sunset-loop';
        }

        const selectedIndex = Math.abs(seed) % trackIds.length;
        return trackIds[selectedIndex];
    };

    private syncRoomPlayersFromSnapshot = (room: Room, snapshot: ServerSnapshotPayload) => {
        room.players.clear();
        for (const snapshotPlayer of snapshot.players) {
            room.players.set(snapshotPlayer.id, toPlayerState(snapshotPlayer));
        }
    };

    public joinRoom = (
        roomId: string,
        playerId: string,
        playerName: string,
        joinOptions: JoinRoomOptions = {},
    ): JoinRoomResult => {
        let room = this.rooms.get(roomId);
        const created = !room;

        if (!room) {
            room = this.createRoom(roomId, joinOptions.selectedTrackId);
            this.rooms.set(roomId, room);
        }

        room.playerSelections.set(playerId, {
            colorId: joinOptions.selectedColorId ?? 'red',
            vehicleId: joinOptions.selectedVehicleId ?? 'sport',
        });

        const sanitizedName = sanitizePlayerName(playerName);
        const simulationPlayer = room.simulation.joinPlayer(
            playerId,
            sanitizedName,
            joinOptions.selectedVehicleId ?? 'sport',
            joinOptions.selectedColorId ?? 'red',
            Date.now(),
        );

        const player = {
            id: simulationPlayer.id,
            name: simulationPlayer.name,
            rotationY: simulationPlayer.motion.rotationY,
            x: simulationPlayer.motion.positionX,
            y: 0,
            z: simulationPlayer.motion.positionZ,
        } satisfies PlayerState;

        room.players.set(playerId, player);

        return { created, player, room };
    };

    public removePlayerFromRoom = (roomId: string, playerId: string): { removed: boolean; roomDeleted: boolean } => {
        const room = this.rooms.get(roomId);
        if (!room) {
            return { removed: false, roomDeleted: false };
        }

        const removed = room.players.delete(playerId);
        room.playerSelections.delete(playerId);

        if (!removed) {
            return { removed: false, roomDeleted: false };
        }

        room.simulation.removePlayer(playerId);

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

    public queueInputFrame = (
        roomId: string,
        playerId: string,
        frame: Parameters<RoomSimulation['queueInputFrame']>[1],
    ) => {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }

        room.simulation.queueInputFrame(playerId, frame);
        return true;
    };

    public queueAbilityActivation = (
        roomId: string,
        playerId: string,
        payload: Omit<AbilityActivatePayload, 'roomId'>,
    ) => {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }

        room.simulation.queueAbilityActivation(playerId, payload);
        return true;
    };

    public queueHazardTrigger = (roomId: string, trigger: HazardTrigger) => {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }

        room.simulation.queueHazardTrigger(trigger);
        return true;
    };

    public queuePowerupTrigger = (roomId: string, trigger: PowerupTrigger) => {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }

        room.simulation.queuePowerupTrigger(trigger);
        return true;
    };

    public restartRoomRace = (roomId: string, nowMs = Date.now()) => {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }

        room.simulation.restartRace(nowMs);
        const snapshot = room.simulation.buildSnapshot(nowMs);
        this.syncRoomPlayersFromSnapshot(room, snapshot);
        return true;
    };

    public stepSimulations = (nowMs = Date.now()): RoomRaceEventEnvelope[] => {
        const events: RoomRaceEventEnvelope[] = [];

        for (const room of this.rooms.values()) {
            room.simulation.step(nowMs);

            const roomEvents = room.simulation.drainRaceEvents();
            for (const event of roomEvents) {
                events.push({
                    event,
                    roomId: room.id,
                });
            }
        }

        return events;
    };

    public buildSimulationSnapshots = (nowMs = Date.now()): RoomSnapshotEnvelope[] => {
        const snapshots: RoomSnapshotEnvelope[] = [];

        for (const room of this.rooms.values()) {
            if (room.players.size === 0) {
                continue;
            }

            const snapshot = room.simulation.buildSnapshot(nowMs);
            this.syncRoomPlayersFromSnapshot(room, snapshot);
            snapshots.push({
                roomId: room.id,
                snapshot,
            });
        }

        return snapshots;
    };

    public buildRoomSnapshot = (roomId: string, nowMs = Date.now()): ServerSnapshotPayload | null => {
        const room = this.rooms.get(roomId);
        if (!room) {
            return null;
        }

        const snapshot = room.simulation.buildSnapshot(nowMs);
        this.syncRoomPlayersFromSnapshot(room, snapshot);
        return snapshot;
    };
}
