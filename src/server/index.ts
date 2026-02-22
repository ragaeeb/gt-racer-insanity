import { Server as Engine } from '@socket.io/bun-engine';
import { Server } from 'socket.io';
import type { PlayerStateUpdate, UpdateStatePayload } from '../shared/network/types';
import { serverConfig } from './config';
import { RoomStore } from './roomStore';

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

const corsOrigin =
    serverConfig.allowedOrigins.length > 0
        ? serverConfig.allowedOrigins
        : serverConfig.nodeEnv === 'production'
          ? []
          : '*';

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

io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);
    let lastUpdateStateAtMs = 0;
    const minimumTickIntervalMs = 1000 / Math.max(serverConfig.maxInboundTickRateHz, 1);

    socket.on('join_room', (rawRoomId: unknown) => {
        if (!isString(rawRoomId)) return;
        if (getPayloadBytes(rawRoomId) > serverConfig.maxJoinRoomPayloadBytes) return;

        const roomId = rawRoomId.trim();
        if (roomId.length === 0 || roomId.length > 16) return;

        socket.join(roomId);

        const { created, player, room } = roomStore.joinRoom(roomId, socket.id);
        if (created) {
            console.log(`[Room ${roomId}] Created with seed ${room.seed}`);
        }

        socket.emit('room_joined', {
            players: Array.from(room.players.values()),
            seed: room.seed,
        });

        socket.to(roomId).emit('player_joined', player);
        console.log(`[Room ${roomId}] Player ${socket.id} joined.`);
    });

    socket.on('update_state', (data: unknown) => {
        if (!isUpdateStatePayload(data)) return;
        if (getPayloadBytes(data) > serverConfig.maxUpdateStatePayloadBytes) return;

        const nowMs = Date.now();
        if (nowMs - lastUpdateStateAtMs < minimumTickIntervalMs) return;
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
        const { pathname } = new URL(request.url);

        if (pathname === '/socket.io' || pathname === '/socket.io/' || pathname.startsWith('/socket.io/')) {
            return engine.handleRequest(request, server);
        }

        if (pathname === '/health') {
            return Response.json({
                ok: true,
                rooms: roomStore.getRoomCount(),
            });
        }

        return new Response('Socket.IO Bun server is running');
    },
    websocket: bunEngineHandler.websocket,
});

console.log(`Socket.IO Bun server listening on 0.0.0.0:${PORT}`);
