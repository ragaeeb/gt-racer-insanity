import { Server as Engine } from '@socket.io/bun-engine';
import { Server } from 'socket.io';
import { serverConfig } from '@/server/config';
import { RoomStore } from '@/server/roomStore';
import { isTrackId } from '@/shared/game/track/trackManifest';
import { isInputFramePayload } from '@/shared/network/inputFrame';
import { coerceProtocolVersion, PROTOCOL_V2 } from '@/shared/network/protocolVersion';
import type { AbilityActivatePayload, JoinErrorPayload, JoinRoomPayload } from '@/shared/network/types';

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

const isJoinRoomPayload = (value: unknown): value is JoinRoomPayload => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const payload = value as Record<string, unknown>;
    const protocolVersion = payload.protocolVersion;
    const selectedColorId = payload.selectedColorId;
    const selectedTrackId = payload.selectedTrackId;
    const selectedVehicleId = payload.selectedVehicleId;

    return (
        isString(payload.roomId) &&
        isString(payload.playerName) &&
        (protocolVersion === undefined || isString(protocolVersion)) &&
        (selectedColorId === undefined || isString(selectedColorId)) &&
        (selectedTrackId === undefined || isString(selectedTrackId)) &&
        (selectedVehicleId === undefined || isString(selectedVehicleId))
    );
};

const isAbilityActivatePayload = (value: unknown): value is AbilityActivatePayload => {
    if (!value || typeof value !== 'object') {
        return false;
    }

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
    const nowMs = Date.now();
    const raceEvents = roomStore.stepSimulations(nowMs);
    for (const { event, roomId } of raceEvents) {
        io.to(roomId).emit('race_event', event);
    }
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
    let lastInputFrameAtMs = 0;
    const minimumInputTickIntervalMs = 1000 / Math.max(serverConfig.maxInputRateHz, 1);
    const emitJoinError = (payload: JoinErrorPayload) => {
        socket.emit('join_error', payload);
    };

    socket.on('join_room', (rawJoinRoom: unknown) => {
        let roomId = '';
        let playerName = 'Player';
        let selectedVehicleId: string | undefined;
        let selectedColorId: string | undefined;
        let selectedTrackId: string | undefined;

        if (isString(rawJoinRoom)) {
            roomId = rawJoinRoom.trim();
        } else if (isJoinRoomPayload(rawJoinRoom)) {
            if (getPayloadBytes(rawJoinRoom) > serverConfig.maxJoinRoomPayloadBytes) {
                emitJoinError({
                    message: 'Join payload exceeded max size.',
                    reason: 'payload_too_large',
                });
                return;
            }

            roomId = rawJoinRoom.roomId.trim();
            playerName = rawJoinRoom.playerName;
            selectedVehicleId = rawJoinRoom.selectedVehicleId;
            selectedColorId = rawJoinRoom.selectedColorId;
            selectedTrackId = rawJoinRoom.selectedTrackId;

            if (selectedTrackId !== undefined && !isTrackId(selectedTrackId)) {
                selectedTrackId = undefined;
            }

            if (coerceProtocolVersion(rawJoinRoom.protocolVersion) !== PROTOCOL_V2) {
                emitJoinError({
                    message: 'Client/server protocol mismatch.',
                    reason: 'unsupported_protocol',
                });
                return;
            }
        } else {
            emitJoinError({
                message: 'Join payload format is invalid.',
                reason: 'invalid_payload',
            });
            return;
        }

        if (roomId.length === 0 || roomId.length > 16) {
            emitJoinError({
                message: 'Room ID must be 1-16 characters.',
                reason: 'invalid_room_id',
            });
            return;
        }

        socket.join(roomId);

        const { created, player, room } = roomStore.joinRoom(roomId, socket.id, playerName, {
            selectedColorId,
            selectedTrackId,
            selectedVehicleId,
        });

        if (created) {
            console.log(`[Room ${roomId}] Created with seed ${room.seed}`);
        }

        const snapshot = roomStore.buildRoomSnapshot(roomId, Date.now());
        socket.emit('room_joined', {
            localPlayerId: socket.id,
            players:
                snapshot?.players.map((snapshotPlayer) => ({
                    id: snapshotPlayer.id,
                    name: snapshotPlayer.name,
                    rotationY: snapshotPlayer.rotationY,
                    x: snapshotPlayer.x,
                    y: snapshotPlayer.y,
                    z: snapshotPlayer.z,
                })) ?? Array.from(room.players.values()),
            protocolVersion: PROTOCOL_V2,
            seed: room.seed,
            snapshot: snapshot ?? undefined,
        });

        socket.to(roomId).emit('player_joined', player);
        console.log(`[Room ${roomId}] Player ${socket.id} joined.`);
    });

    socket.on('input_frame', (data: unknown) => {
        if (!isInputFramePayload(data)) {
            return;
        }

        if (getPayloadBytes(data) > serverConfig.maxInputFramePayloadBytes) {
            return;
        }

        const nowMs = Date.now();
        if (nowMs - lastInputFrameAtMs < minimumInputTickIntervalMs) {
            return;
        }
        lastInputFrameAtMs = nowMs;

        roomStore.queueInputFrame(data.roomId, socket.id, data.frame);
    });

    socket.on('ability_activate', (data: unknown) => {
        if (!isAbilityActivatePayload(data)) {
            return;
        }

        roomStore.queueAbilityActivation(data.roomId, socket.id, {
            abilityId: data.abilityId,
            seq: data.seq,
            targetPlayerId: data.targetPlayerId,
        });
    });

    socket.on('restart_race', (data: unknown) => {
        if (!data || typeof data !== 'object') {
            return;
        }

        const payload = data as Record<string, unknown>;
        if (!isString(payload.roomId)) {
            return;
        }

        const roomId = payload.roomId;
        if (!socket.rooms.has(roomId)) {
            return;
        }

        const nowMs = Date.now();
        const roomSnapshot = roomStore.buildRoomSnapshot(roomId, nowMs);
        if (!roomSnapshot || roomSnapshot.raceState.status !== 'finished') {
            return;
        }

        const restarted = roomStore.restartRoomRace(roomId, nowMs);
        if (!restarted) {
            return;
        }

        const snapshot = roomStore.buildRoomSnapshot(roomId, nowMs);
        if (snapshot) {
            io.to(roomId).emit('server_snapshot', {
                roomId,
                snapshot,
            });
        }
    });

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            if (roomId === socket.id) {
                continue;
            }

            const { removed, roomDeleted } = roomStore.removePlayerFromRoom(roomId, socket.id);
            if (!removed) {
                continue;
            }

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
                    protocolVersion: PROTOCOL_V2,
                    rooms: roomStore.getRoomCount(),
                    simulation: 'authoritative-v2',
                    simulationTickHz: serverConfig.simulationTickHz,
                    snapshotTickHz: serverConfig.snapshotTickHz,
                },
                {
                    headers: new Headers(corsHeaders),
                },
            );
        }

        return new Response('Socket.IO Bun server is running', {
            headers: new Headers(corsHeaders),
        });
    },
    websocket: bunEngineHandler.websocket,
});

console.log(`Socket.IO Bun server listening on 0.0.0.0:${PORT}`);
