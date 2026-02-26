import type { CarMotionState } from '@/shared/game/carPhysics';
import type { DriftContext } from '@/shared/game/vehicle/driftConfig';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import type { ClientInputFrame, InputFrameControlState } from '@/shared/network/inputFrame';
import type { PlayerRaceProgress, RaceState, StatusEffectInstance } from '@/shared/network/snapshot';
import type { RaceEventPayload } from '@/shared/network/types';

export type SimPlayerState = {
    activeEffects: StatusEffectInstance[];
    colorId: string;
    driftContext: DriftContext;
    id: string;
    inputState: InputFrameControlState;
    /** Whether the player is currently on the ground (set by groundSnapSystem). */
    isGrounded: boolean;
    lastHitByProjectileAtMs?: number;
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

export type ActiveDeployable = {
    id: number;
    ownerId: string;
    kind: 'oil-slick';
    position: { x: number; z: number };
    radius: number;
    lifetimeTicks: number;
    remainingTicks: number;
    triggered: boolean;
};

export type ActiveProjectile = {
    id: number;
    ownerId: string;
    targetId: string | null;
    position: { x: number; z: number };
    velocity: { x: number; z: number };
    ttlTicks: number;
    speed: number;
};

export type SimRoomState = {
    activePowerups: ActivePowerup[];
    activeProjectiles: ActiveProjectile[];
    activeDeployables: ActiveDeployable[];
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
