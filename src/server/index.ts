import { Server as Engine } from '@socket.io/bun-engine';
import { Server } from 'socket.io';
import { isInputFramePayload } from '@/shared/network/inputFrame';
import { coerceProtocolVersion, PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import type {
    AbilityActivatePayload,
    JoinRoomPayload,
    ProtocolVersion,
    PlayerStateUpdate,
    UpdateStatePayload,
} from '@/shared/network/types';
import { serverConfig } from '@/server/config';
import { RoomStore } from '@/server/roomStore';

const roomStore = new RoomStore();

const getPayloadBytes = (payload: unknown) => {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
};

const isString = (value: unknown): value is string => {
    return typeof value === 'string';
};

const isFiniteNumber = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value);
};

const isPlayerStateUpdate = (value: unknown): value is PlayerStateUpdate => {
    if (!value || typeof value !== 'object') return false;

    const payload = value as Record<string, unknown>;
    return (
        isFiniteNumber(payload.x) &&
        isFiniteNumber(payload.y) &&
        isFiniteNumber(payload.z) &&
        isFiniteNumber(payload.rotationY)
    );
};

const isUpdateStatePayload = (value: unknown): value is UpdateStatePayload => {
    if (!value || typeof value !== 'object') return false;

    const payload = value as Record<string, unknown>;
    return isString(payload.roomId) && isPlayerStateUpdate(payload.state);
};

const isJoinRoomPayload = (value: unknown): value is JoinRoomPayload => {
    if (!value || typeof value !== 'object') return false;

    const payload = value as Record<string, unknown>;
    const protocolVersion = payload.protocolVersion;
    const selectedColorId = payload.selectedColorId;
    const selectedVehicleId = payload.selectedVehicleId;

    return (
        isString(payload.roomId) &&
        isString(payload.playerName) &&
        (protocolVersion === undefined || isString(protocolVersion)) &&
        (selectedColorId === undefined || isString(selectedColorId)) &&
        (selectedVehicleId === undefined || isString(selectedVehicleId))
    );
};

const isAbilityActivatePayload = (value: unknown): value is AbilityActivatePayload => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;

    return (
        isString(payload.roomId) &&
        isString(payload.abilityId) &&
        isFiniteNumber(payload.seq) &&
        (payload.targetPlayerId === null || isString(payload.targetPlayerId))
    );
};

const corsOrigin =
    serverConfig.allowedOrigins.length > 0
        ? serverConfig.allowedOrigins
        : serverConfig.nodeEnv === 'production'
          ? []
          : '*';

const resolveCorsAllowOrigin = (requestOrigin: string | null) => {
    if (corsOrigin === '*') {
        return '*';
    }

    if (!requestOrigin) {
        return null;
    }

    return corsOrigin.includes(requestOrigin) ? requestOrigin : null;
};

const io = new Server({
    cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST'],
    },
});

const engine = new Engine({
    cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST'],
    },
    path: '/socket.io/',
});

io.bind(engine);

const simulationIntervalMs = 1000 / Math.max(serverConfig.simulationTickHz, 1);
const snapshotIntervalMs = 1000 / Math.max(serverConfig.snapshotTickHz, 1);

setInterval(() => {
    roomStore.stepSimulations(Date.now());
}, simulationIntervalMs);

setInterval(() => {
    const snapshots = roomStore.buildSimulationSnapshots(Date.now());
    for (const { roomId, snapshot } of snapshots) {
        io.to(roomId).volatile.emit('server_snapshot', {
            roomId,
            snapshot,
        });
    }
}, snapshotIntervalMs);

io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);
    let lastUpdateStateAtMs = 0;
    let lastInputFrameAtMs = 0;
    const minimumLegacyTickIntervalMs = 1000 / Math.max(serverConfig.maxInboundTickRateHz, 1);
    const minimumInputTickIntervalMs = 1000 / Math.max(serverConfig.maxInputRateHz, 1);

    socket.on('join_room', (rawJoinRoom: unknown) => {
        let roomId = '';
        let playerName = 'Player';
        let protocolVersion: ProtocolVersion = PROTOCOL_V2;
        let selectedVehicleId: string | undefined;
        let selectedColorId: string | undefined;

        if (isString(rawJoinRoom)) {
            roomId = rawJoinRoom.trim();
            protocolVersion = PROTOCOL_V2;
        } else if (isJoinRoomPayload(rawJoinRoom)) {
            if (getPayloadBytes(rawJoinRoom) > serverConfig.maxJoinRoomPayloadBytes) return;
            roomId = rawJoinRoom.roomId.trim();
            playerName = rawJoinRoom.playerName;
            protocolVersion = coerceProtocolVersion(rawJoinRoom.protocolVersion);
            selectedVehicleId = rawJoinRoom.selectedVehicleId;
            selectedColorId = rawJoinRoom.selectedColorId;
        } else {
            return;
        }

        if (roomId.length === 0 || roomId.length > 16) return;
        if (serverConfig.protocolV2Required && protocolVersion !== PROTOCOL_V2) return;

        socket.join(roomId);

        const { created, player, room } = roomStore.joinRoom(roomId, socket.id, playerName, {
            protocolVersion,
            selectedColorId,
            selectedVehicleId,
        });
        if (created) {
            console.log(`[Room ${roomId}] Created with seed ${room.seed}`);
        }

        socket.emit('room_joined', {
            localPlayerId: socket.id,
            players: Array.from(room.players.values()),
            protocolVersion,
            seed: room.seed,
            snapshot: room.simulation ? room.simulation.buildSnapshot(Date.now()) : undefined,
        });

        socket.to(roomId).emit('player_joined', player);
        console.log(`[Room ${roomId}] Player ${socket.id} joined.`);
    });

    socket.on('input_frame', (data: unknown) => {
        if (!isInputFramePayload(data)) return;
        if (getPayloadBytes(data) > serverConfig.maxInputFramePayloadBytes) return;

        const nowMs = Date.now();
        if (nowMs - lastInputFrameAtMs < minimumInputTickIntervalMs) return;
        lastInputFrameAtMs = nowMs;

        roomStore.queueInputFrame(data.roomId, socket.id, data.frame);
    });

    socket.on('ability_activate', (data: unknown) => {
        if (!isAbilityActivatePayload(data)) return;
        io.to(data.roomId).emit('race_event', {
            kind: 'race_started',
            playerId: data.targetPlayerId,
            roomId: data.roomId,
            serverTimeMs: Date.now(),
        });
    });

    socket.on('update_state', (data: unknown) => {
        if (!isUpdateStatePayload(data)) return;
        if (getPayloadBytes(data) > serverConfig.maxUpdateStatePayloadBytes) return;

        const nowMs = Date.now();
        if (nowMs - lastUpdateStateAtMs < minimumLegacyTickIntervalMs) return;
        lastUpdateStateAtMs = nowMs;

        const storedPlayer = roomStore.updatePlayerState(data.roomId, socket.id, data.state, nowMs);
        if (!storedPlayer) return;

        socket.volatile.to(data.roomId).emit('player_moved', storedPlayer);
    });

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            if (roomId === socket.id) continue;

            const { removed, roomDeleted } = roomStore.removePlayerFromRoom(roomId, socket.id);
            if (!removed) continue;

            socket.to(roomId).emit('player_left', socket.id);
            console.log(`[Room ${roomId}] Player ${socket.id} left.`);

            if (roomDeleted) {
                console.log(`[Room ${roomId}] Deleted (empty).`);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] Player disconnected: ${socket.id}`);
    });
});

const bunEngineHandler = engine.handler();
const PORT = serverConfig.port;

Bun.serve({
    port: PORT,
    idleTimeout: 30,
    fetch: (request, server) => {
        const requestOrigin = request.headers.get('origin');
        const allowOrigin = resolveCorsAllowOrigin(requestOrigin);
        const corsHeaders = new Headers();
        if (allowOrigin) {
            corsHeaders.set('Access-Control-Allow-Origin', allowOrigin);
        }

        if (request.method === 'OPTIONS') {
            const optionsHeaders = new Headers(corsHeaders);
            optionsHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
            optionsHeaders.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

            return new Response(null, {
                headers: optionsHeaders,
                status: 204,
            });
        }

        const { pathname } = new URL(request.url);

        if (pathname === '/socket.io' || pathname === '/socket.io/' || pathname.startsWith('/socket.io/')) {
            return engine.handleRequest(request, server);
        }

        if (pathname === '/health') {
            return Response.json(
                {
                    ok: true,
                    rooms: roomStore.getRoomCount(),
                    serverSimV2: serverConfig.serverSimV2,
                },
                {
                    headers: new Headers(corsHeaders),
                }
            );
        }

        return new Response('Socket.IO Bun server is running', {
            headers: new Headers(corsHeaders),
        });
    },
    websocket: bunEngineHandler.websocket,
});

console.log(`Socket.IO Bun server listening on 0.0.0.0:${PORT}`);
