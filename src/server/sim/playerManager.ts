import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import { syncPlayerMotionFromRigidBody } from '@/server/sim/collisionSystem';
import type { createRapierWorld } from '@/server/sim/rapierWorld';
import type { SimPlayerState } from '@/server/sim/types';
import { getElevationAtZ } from '@/shared/game/track/elevationHelpers';
import type { TrackSegmentManifest } from '@/shared/game/track/trackManifest';
import { createInitialRaceProgress } from '@/shared/game/track/raceProgress';
import { createInitialDriftContext } from '@/shared/game/vehicle/driftConfig';
import { getVehicleClassManifestById, type VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import {
    PLAYER_COLLIDER_HALF_HEIGHT_METERS,
    PLAYER_COLLIDER_HALF_LENGTH_METERS,
    PLAYER_COLLIDER_HALF_WIDTH_METERS,
} from '@/shared/physics/constants';

type RapierContext = ReturnType<typeof createRapierWorld>;

export const getSpawnPositionX = (playerIndex: number) => playerIndex * 4 - 6;
export const getSpawnPositionZ = (playerIndex: number) => -(Math.floor(playerIndex / 4) * 6);

/**
 * Manages the lifecycle of SimPlayerState entries and their associated Rapier
 * rigid bodies / colliders. Operates directly on the shared `players` Map so
 * the room state object remains the canonical source of truth.
 */
export class PlayerManager {
    readonly rigidBodyById = new Map<string, RigidBody>();
    readonly colliderById = new Map<string, Collider>();
    readonly colliderHandleToPlayerId = new Map<number, string>();

    constructor(
        private readonly players: Map<string, SimPlayerState>,
        private readonly rapierContext: RapierContext,
        private readonly trackBoundaryX: number,
        private readonly trackSegments: TrackSegmentManifest[],
    ) {}

    private getSpawnPositionY = (spawnZ: number): number => {
        return getElevationAtZ(this.trackSegments, spawnZ) + PLAYER_COLLIDER_HALF_HEIGHT_METERS;
    };

    private createRigidBody(playerId: string, vehicleId: VehicleClassId, playerIndex: number): void {
        const vehicleClass = getVehicleClassManifestById(vehicleId);
        const { rapier, world } = this.rapierContext;
        const spawnZ = getSpawnPositionZ(playerIndex);

        const rigidBodyDesc = rapier.RigidBodyDesc.dynamic()
            .setCanSleep(false)
            .setCcdEnabled(true)
            .setLinearDamping(2.5)
            .setAngularDamping(4)
            .setTranslation(getSpawnPositionX(playerIndex), this.getSpawnPositionY(spawnZ), spawnZ);

        const rigidBody = world.createRigidBody(rigidBodyDesc);
        rigidBody.setEnabledRotations(false, true, false, true);
        // Y translation enabled for ground-snap elevation support (M5-Elevation).
        rigidBody.setEnabledTranslations(true, true, true, true);
        rigidBody.setAdditionalMass(Math.max(vehicleClass.physics.collisionMass, 1), true);

        const colliderDesc = rapier.ColliderDesc.cuboid(
            PLAYER_COLLIDER_HALF_WIDTH_METERS,
            PLAYER_COLLIDER_HALF_HEIGHT_METERS,
            PLAYER_COLLIDER_HALF_LENGTH_METERS,
        )
            .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS | rapier.ActiveEvents.CONTACT_FORCE_EVENTS)
            .setFriction(0.8)
            .setRestitution(0.45);

        const collider = world.createCollider(colliderDesc, rigidBody);
        this.rigidBodyById.set(playerId, rigidBody);
        this.colliderById.set(playerId, collider);
        this.colliderHandleToPlayerId.set(collider.handle, playerId);
    }

    private removeRigidBody(playerId: string): void {
        const collider = this.colliderById.get(playerId);
        if (collider) {
            this.colliderHandleToPlayerId.delete(collider.handle);
        }

        const rigidBody = this.rigidBodyById.get(playerId);
        if (rigidBody) {
            this.rapierContext.world.removeRigidBody(rigidBody);
        }

        this.colliderById.delete(playerId);
        this.rigidBodyById.delete(playerId);
    }

    joinPlayer(
        playerId: string,
        playerName: string,
        vehicleId: string,
        colorId: string,
        playerIndex: number,
    ): SimPlayerState {
        if (this.players.has(playerId)) {
            this.removePlayer(playerId);
        }
        const normalizedVehicleId = (vehicleId || 'sport') as VehicleClassId;
        const spawnZ = getSpawnPositionZ(playerIndex);
        const spawnY = this.getSpawnPositionY(spawnZ);
        this.createRigidBody(playerId, normalizedVehicleId, playerIndex);
        const rigidBody = this.rigidBodyById.get(playerId);

        const player: SimPlayerState = {
            activeEffects: [],
            colorId: colorId || 'red',
            driftContext: createInitialDriftContext(),
            id: playerId,
            inputState: { boost: false, brake: false, handbrake: false, steering: 0, throttle: 0 },
            isGrounded: true,
            lastProcessedInputSeq: -1,
            motion: {
                positionX: getSpawnPositionX(playerIndex),
                positionY: spawnY,
                positionZ: spawnZ,
                rotationY: 0,
                speed: 0,
            },
            name: playerName,
            progress: { ...createInitialRaceProgress() },
            vehicleId: normalizedVehicleId,
        };

        if (rigidBody) {
            syncPlayerMotionFromRigidBody(player, rigidBody, this.trackBoundaryX);
        }

        this.players.set(playerId, player);
        return player;
    }

    removePlayer(playerId: string): void {
        this.players.delete(playerId);
        this.removeRigidBody(playerId);
    }

    /**
     * Resets a player's motion, progress, and rigid body to the spawn position
     * for the given slot index. Call this during race restart.
     */
    resetPlayerForRestart(player: SimPlayerState, playerIndex: number): void {
        const spawnZ = getSpawnPositionZ(playerIndex);
        const spawnY = this.getSpawnPositionY(spawnZ);
        player.activeEffects = [];
        player.driftContext = createInitialDriftContext();
        player.inputState = { boost: false, brake: false, handbrake: false, steering: 0, throttle: 0 };
        player.isGrounded = true;
        player.lastProcessedInputSeq = -1;
        player.motion = {
            positionX: getSpawnPositionX(playerIndex),
            positionY: spawnY,
            positionZ: spawnZ,
            rotationY: 0,
            speed: 0,
        };
        player.progress = { ...createInitialRaceProgress() };

        const rigidBody = this.rigidBodyById.get(player.id);
        if (rigidBody) {
            rigidBody.setTranslation(
                { x: getSpawnPositionX(playerIndex), y: spawnY, z: spawnZ },
                true,
            );
            rigidBody.setRotation({ w: 1, x: 0, y: 0, z: 0 }, true);
            rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
            syncPlayerMotionFromRigidBody(player, rigidBody, this.trackBoundaryX);
        }
    }
}
