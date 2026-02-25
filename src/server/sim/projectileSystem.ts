import type { CombatTuning } from '@/shared/game/tuning/gameplayTuning';
import type { RaceEventPayload } from '@/shared/network/types';
import { applyStatusEffectToPlayer } from './effectSystem';
import type { ActiveProjectile, SimPlayerState, SimRoomState } from './types';

export type StepProjectileResult = 'flying' | 'hit' | 'expired';

let nextProjectileId = 1;

/** Reset the ID counter — useful for deterministic tests. */
export const resetProjectileIdCounter = () => {
    nextProjectileId = 1;
};

/**
 * Find the nearest opponent to the `owner` from the players map.
 * Returns null if there are no opponents.
 */
const findNearestOpponent = (
    owner: SimPlayerState,
    players: Map<string, SimPlayerState>,
    nowMs: number,
    immunityMs: number,
): SimPlayerState | null => {
    let nearest: SimPlayerState | null = null;
    let minDistSq = Infinity;

    for (const candidate of players.values()) {
        if (candidate.id === owner.id) {
            continue;
        }

        const timeSinceLastHit = nowMs - (candidate.lastHitByProjectileAtMs ?? 0);
        if (timeSinceLastHit < immunityMs) {
            continue;
        }

        const dx = candidate.motion.positionX - owner.motion.positionX;
        const dz = candidate.motion.positionZ - owner.motion.positionZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDistSq) {
            minDistSq = distSq;
            nearest = candidate;
        }
    }

    return nearest;
};

/**
 * Create a new homing EMP projectile aimed at the nearest opponent.
 * Returns null if no opponent exists or caps are exceeded.
 */
export const createProjectile = (
    owner: SimPlayerState,
    players: Map<string, SimPlayerState>,
    existingProjectiles: ActiveProjectile[],
    config: CombatTuning,
    nowMs: number,
    preferredTarget?: string,
): ActiveProjectile | null => {
    // Check per-player cap
    const ownerProjectileCount = existingProjectiles.filter((p) => p.ownerId === owner.id).length;
    if (ownerProjectileCount >= config.projectileMaxPerPlayer) {
        return null;
    }

    // Check per-room cap
    if (existingProjectiles.length >= config.projectileMaxPerRoom) {
        return null;
    }

    let target = preferredTarget ? players.get(preferredTarget) : undefined;
    if (target) {
        const timeSinceLastHit = nowMs - (target.lastHitByProjectileAtMs ?? 0);
        if (timeSinceLastHit < config.projectileHitImmunityMs) {
            target = undefined;
        }
    }

    const nearestOpponent = target || findNearestOpponent(owner, players, nowMs, config.projectileHitImmunityMs);
    if (!nearestOpponent) {
        return null;
    }

    // Initial velocity: owner's forward direction * projectile speed
    const forwardX = Math.sin(owner.motion.rotationY);
    const forwardZ = Math.cos(owner.motion.rotationY);

    return {
        id: nextProjectileId++,
        ownerId: owner.id,
        targetId: nearestOpponent.id,
        position: { x: owner.motion.positionX, z: owner.motion.positionZ },
        velocity: { x: forwardX * config.projectileSpeed, z: forwardZ * config.projectileSpeed },
        ttlTicks: config.projectileTtlTicks,
        speed: config.projectileSpeed,
    };
};

/**
 * Step a single projectile using proportional navigation homing.
 *
 * Returns:
 * - `'expired'` if TTL has been exhausted
 * - `'hit'`     if the projectile is within hit radius of its target
 * - `'flying'`  otherwise (still in flight)
 */
export const stepProjectile = (
    projectile: ActiveProjectile,
    players: Map<string, SimPlayerState>,
    dtSeconds: number,
    config: CombatTuning,
): StepProjectileResult => {
    projectile.ttlTicks -= 1;
    if (projectile.ttlTicks <= 0) {
        return 'expired';
    }

    const target = projectile.targetId ? players.get(projectile.targetId) : null;
    if (target) {
        const toTargetX = target.motion.positionX - projectile.position.x;
        const toTargetZ = target.motion.positionZ - projectile.position.z;
        const dist = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ);

        // Hit detection — check before steering
        if (dist <= config.projectileHitRadius) {
            return 'hit';
        }

        // Proportional navigation steering
        const dirX = toTargetX / dist;
        const dirZ = toTargetZ / dist;

        const currentSpeed = Math.sqrt(projectile.velocity.x ** 2 + projectile.velocity.z ** 2);
        const currentDirX = projectile.velocity.x / (currentSpeed + 0.001);
        const currentDirZ = projectile.velocity.z / (currentSpeed + 0.001);

        // 2D cross product for turn direction
        const cross = currentDirX * dirZ - currentDirZ * dirX;
        const dot = currentDirX * dirX + currentDirZ * dirZ;
        const signedAngleToTarget = Math.atan2(cross, dot);
        const maxTurn = config.projectileTurnRate * dtSeconds;
        const clampedTurn = Math.max(-maxTurn, Math.min(maxTurn, signedAngleToTarget));

        // Rotate velocity vector
        const cos = Math.cos(clampedTurn);
        const sin = Math.sin(clampedTurn);
        const newVelX = currentDirX * cos - currentDirZ * sin;
        const newVelZ = currentDirX * sin + currentDirZ * cos;

        // Normalise to constant speed
        const newSpeed = Math.sqrt(newVelX * newVelX + newVelZ * newVelZ);
        projectile.velocity.x = (newVelX / newSpeed) * config.projectileSpeed;
        projectile.velocity.z = (newVelZ / newSpeed) * config.projectileSpeed;
    }

    // Advance position
    projectile.position.x += projectile.velocity.x * dtSeconds;
    projectile.position.z += projectile.velocity.z * dtSeconds;

    return 'flying';
};

/**
 * Step all active projectiles in the room.
 *
 * Handles:
 * - Proportional navigation steering per projectile
 * - Hit detection & stunned effect application
 * - TTL expiry removal
 * - Race event emission on hits
 */
export const stepAllProjectiles = (
    state: SimRoomState,
    dtSeconds: number,
    nowMs: number,
    config: CombatTuning,
    pushRaceEvent: (event: RaceEventPayload) => void,
): void => {
    const toRemove: number[] = [];

    for (let i = 0; i < state.activeProjectiles.length; i++) {
        const proj = state.activeProjectiles[i];
        const result = stepProjectile(proj, state.players, dtSeconds, config);

        if (result === 'hit') {
            const target = proj.targetId ? state.players.get(proj.targetId) : null;
            if (target) {
                applyStatusEffectToPlayer(target, 'stunned', nowMs, 1, config.stunnedEffectDurationMs);
                target.lastHitByProjectileAtMs = nowMs;

                pushRaceEvent({
                    kind: 'projectile_hit',
                    metadata: {
                        effectType: 'stunned',
                        projectileId: proj.id,
                        targetPlayerId: target.id,
                    },
                    playerId: target.id,
                    roomId: state.roomId,
                    serverTimeMs: nowMs,
                });
            }
            toRemove.push(i);
        } else if (result === 'expired') {
            toRemove.push(i);
        }
    }

    // Remove in reverse order to maintain indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
        state.activeProjectiles.splice(toRemove[i], 1);
    }
};
