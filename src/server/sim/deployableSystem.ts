import type { CombatTuning } from '@/shared/game/tuning/gameplayTuning';
import type { HazardTrigger } from './hazardSystem';
import type { ActiveDeployable, SimPlayerState } from './types';

const FINISH_ZONE_BLOCK_DISTANCE_METERS = 50;

let nextDeployableId = 1;

export const resetDeployableIdCounter = () => {
    nextDeployableId = 1;
};

export const spawnDeployable = (
    kind: ActiveDeployable['kind'],
    player: SimPlayerState,
    existingDeployables: ActiveDeployable[],
    lifetimeTicks: number,
    tuning: CombatTuning,
    totalTrackLengthMeters = Number.POSITIVE_INFINITY,
): ActiveDeployable | null => {
    if (existingDeployables.length >= tuning.deployableMaxPerRoom) {
        return null;
    }

    let playerCount = 0;
    for (const d of existingDeployables) {
        if (d.ownerId === player.id) {
            playerCount++;
        }
    }
    if (playerCount >= tuning.deployableMaxPerPlayer) {
        return null;
    }

    if (
        Number.isFinite(totalTrackLengthMeters) &&
        player.progress.distanceMeters >= totalTrackLengthMeters - FINISH_ZONE_BLOCK_DISTANCE_METERS
    ) {
        return null;
    }

    const forwardX = Math.sin(player.motion.rotationY);
    const forwardZ = Math.cos(player.motion.rotationY);

    return {
        id: nextDeployableId++,
        kind,
        lifetimeTicks,
        ownerId: player.id,
        position: {
            x: player.motion.positionX - forwardX * tuning.deployableOilSlickSpawnDistance,
            z: player.motion.positionZ - forwardZ * tuning.deployableOilSlickSpawnDistance,
        },
        radius: tuning.deployableOilSlickRadius,
        remainingTicks: lifetimeTicks,
        triggered: false,
    };
};

export const updateDeployables = (deployables: ActiveDeployable[], ticksPassed = 1) => {
    for (let i = deployables.length - 1; i >= 0; i -= 1) {
        const deployable = deployables[i];
        deployable.remainingTicks -= ticksPassed;
        if (deployable.remainingTicks <= 0 || deployable.triggered) {
            deployables.splice(i, 1);
        }
    }
};

export const checkDeployableCollisions = (
    deployables: ActiveDeployable[],
    players: Iterable<SimPlayerState>,
    tuning: CombatTuning,
): HazardTrigger[] => {
    const triggers: HazardTrigger[] = [];

    for (const deployable of deployables) {
        if (deployable.triggered || deployable.kind !== 'oil-slick') {
            continue;
        }

        const triggerRadiusSq = deployable.radius * deployable.radius;
        for (const player of players) {
            if (player.id === deployable.ownerId) {
                continue;
            }

            const dx = player.motion.positionX - deployable.position.x;
            const dz = player.motion.positionZ - deployable.position.z;
            const distSq = dx * dx + dz * dz;

            if (distSq <= triggerRadiusSq) {
                deployable.triggered = true;
                triggers.push({
                    effectDurationMs: tuning.deployableOilSlickEffectDurationMs,
                    effectType: 'slowed',
                    hazardId: 'oil-slick',
                    playerId: player.id,
                });
                break;
            }
        }
    }

    return triggers;
};
