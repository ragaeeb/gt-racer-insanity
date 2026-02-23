import type { CarMotionState } from '@/shared/game/carPhysics';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import type { ClientInputFrame, InputFrameControlState } from '@/shared/network/inputFrame';
import type { RaceEventPayload } from '@/shared/network/types';
import type { PlayerRaceProgress, RaceState, StatusEffectInstance } from '@/shared/network/snapshot';

export type SimPlayerState = {
    activeEffects: StatusEffectInstance[];
    colorId: string;
    id: string;
    inputState: InputFrameControlState;
    lastProcessedInputSeq: number;
    motion: CarMotionState;
    name: string;
    progress: PlayerRaceProgress;
    vehicleId: VehicleClassId;
};

export type ActivePowerup = {
    collectedAtMs: number | null;
    id: string;
    position: { x: number; z: number };
    powerupId: string;
    respawnAtMs: number | null;
};

export type ActiveHazard = {
    hazardId: string;
    id: string;
    position: { x: number; z: number };
};

export type SimRoomState = {
    activePowerups: ActivePowerup[];
    hazards: ActiveHazard[];
    players: Map<string, SimPlayerState>;
    raceEvents: RaceEventPayload[];
    raceState: RaceState;
    roomId: string;
    seed: number;
    snapshotSeq: number;
};

export type QueuedInputFrame = {
    frame: ClientInputFrame;
    playerId: string;
};
