import type { ServerSnapshotPayload, SnapshotHazardState, SnapshotPlayerState, SnapshotPowerupState } from '@/shared/network/snapshot';
import type { SimRoomState } from '@/server/sim/types';

const toSnapshotPlayerState = (player: SimRoomState['players'] extends Map<string, infer U> ? U : never): SnapshotPlayerState => {
    return {
        activeEffects: player.activeEffects,
        colorId: player.colorId,
        driftAngle: player.driftContext.driftAngle,
        driftBoostTier: player.driftContext.boostTier,
        driftState: player.driftContext.state,
        id: player.id,
        lastProcessedInputSeq: player.lastProcessedInputSeq,
        name: player.name,
        progress: player.progress,
        rotationY: player.motion.rotationY,
        speed: player.motion.speed,
        vehicleId: player.vehicleId,
        x: player.motion.positionX,
        y: 0,
        z: player.motion.positionZ,
    };
};

export const buildServerSnapshot = (roomState: SimRoomState, serverTimeMs: number): ServerSnapshotPayload => {
    roomState.snapshotSeq += 1;

    const players = Array.from(roomState.players.values()).map((player) => toSnapshotPlayerState(player));

    players.sort((a, b) => {
        if (a.progress.lap !== b.progress.lap) {
            return b.progress.lap - a.progress.lap;
        }
        return b.progress.distanceMeters - a.progress.distanceMeters;
    });

    roomState.raceState.playerOrder = players.map((player) => player.id);

    const powerups: SnapshotPowerupState[] = roomState.activePowerups.map((p) => ({
        id: p.id,
        isActive: p.collectedAtMs === null,
        powerupId: p.powerupId,
        x: p.position.x,
        z: p.position.z,
    }));

    const hazards: SnapshotHazardState[] = roomState.hazards.map((h) => ({
        hazardId: h.hazardId,
        id: h.id,
        x: h.position.x,
        z: h.position.z,
    }));

    return {
        hazards,
        players,
        powerups,
        raceState: roomState.raceState,
        roomId: roomState.roomId,
        seq: roomState.snapshotSeq,
        serverTimeMs,
    };
};
