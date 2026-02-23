import type * as THREE from 'three';
import type { Car, CarAssets } from '@/client/game/entities/Car';
import type { InputManager } from '@/client/game/systems/InputManager';
import type { InterpolationBuffer } from '@/client/game/systems/interpolationSystem';
import type { SceneryManager } from '@/client/game/systems/SceneryManager';
import type { TrackManager } from '@/client/game/systems/TrackManager';
import type { NetworkManager } from '@/client/network/NetworkManager';
import type { ConnectionStatus, RaceState, SnapshotPlayerState } from '@/shared/network/types';

export type CarModelVariant = {
    scene: THREE.Group;
    yawOffsetRadians: number;
};

export type InterpolationState = {
    rotationY: number;
    x: number;
    y: number;
    z: number;
};

export type CorrectionMode = 'hard' | 'none' | 'soft';

export type CorrectionSnapshot = {
    appliedPositionDelta: number;
    inputLead: number;
    mode: CorrectionMode;
    positionError: number;
    sequence: number;
    yawError: number;
};

export type RaceSession = {
    activeTrackId: string;
    connectionStatus: ConnectionStatus;
    cruiseLatchActive: boolean;
    hasLocalAuthoritativeTarget: boolean;
    inputManager: InputManager;
    isRunning: boolean;
    lastCorrection: CorrectionSnapshot | null;
    lastReconciledSnapshotSeq: number | null;
    lastSnapshotReceivedAtMs: number | null;
    latestLocalSnapshot: SnapshotPlayerState | null;
    latestLocalSnapshotSeq: number | null;
    localCar: Car | null;
    localInputSequence: number;
    networkManager: NetworkManager | null;
    networkUpdateTimer: number;
    opponentInterpolationBuffers: Map<string, InterpolationBuffer<InterpolationState>>;
    opponents: Map<string, Car>;
    sceneryManager: SceneryManager | null;
    shakeSpikeGraceUntilMs: number;
    trackManager: TrackManager | null;
};

export type RaceWorldCallbacks = {
    onConnectionStatusChange: (status: ConnectionStatus) => void;
    onGameOverChange: (isGameOver: boolean) => void;
    onRaceStateChange: (state: RaceState | null) => void;
};

export type CarAssetsBundle = {
    assets: CarAssets;
    modelVariants: CarModelVariant[];
};
